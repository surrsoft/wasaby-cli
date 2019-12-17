const logger = require('./util/logger');
const ModulesMap = require('./util/modulesMap');
const xml = require('./xml/xml');
const Git = require('./util/git');

const fs = require('fs-extra');
const path = require('path');
const pMap = require('p-map');
const Base = require('./base');

const BROWSER_SUFFIX = '_browser';
const NODE_SUFFIX = '_node';
const PARALLEL_TEST_COUNT = 2;
const DEFAULT_PORT = 10026;
const TEST_TIMEOUT = 60*5*1000;
const _private = {

   /**
    * Возвращает шаблон xml файла
    * @returns {{testsuite: {$: {failures: string, tests: string, name: string, errors: string}, testcase: []}}}
    */
   getReportTemplate: () => ({
      testsuite: {
         $: {
            errors: '0',
            failures: '0',
            name: 'Mocha Tests',
            tests: '1'
         },
         testcase: []
      }
   }),

   /**
    * Возвращает шаблон тескейса для xml
    * @param {String} testName Название теста
    * @param {String} details Детализация ошибки
    * @returns {{$: {classname: string, name: string, time: string}, failure: *}}
    */
   getErrorTestCase: (testName, details) => ({
      $: {
         classname: `[${testName}]: Test runtime error`,
         name: 'Some test has not been run, see details',
         time: '0'
      },
      failure: details
   }),

   /**
    * Возвращает путь до конфига юнит тестов
    * @param {String} repName Название репозитрия
    * @param {Boolean} isBrowser - Юниты в браузере
    * @returns {string}
    * @private
    */
   getPathToTestConfig: (repName, isBrowser) => {
      const browser = isBrowser ? '_browser' : '';
      return path.relative(
         process.cwd(),
         path.normalize(path.join(__dirname, '..', `testConfig_${repName}${browser}.json`))
      );
   }
};

class Test extends Base {
   constructor(cfg) {
      super(cfg);
      this._testReports = new Map();
      this._resources = cfg.resources;
      this._ports = cfg.ports;
      this._reposConfig = cfg.reposConfig;
      this._workspace = cfg.workspace || cfg.workDir;
      this._testErrors = {};
      this._rc = cfg.rc;
      this._server = cfg.server;
      this._testRep = cfg.testRep;
      this._modulesMap = new ModulesMap({
         reposConfig: cfg.reposConfig,
         store: cfg.store,
         testRep: cfg.testRep,
         workDir: cfg.workDir,
         only: cfg.only
      });
      this._portsMap = {};
      this._diff = new Map();
   }

   /**
    * Дописывает в отчеты название репозитория
    */
   prepareReport() {
      let promisArray = [];

      logger.log('Подготовка отчетов');
      this._testReports.forEach((filePath, name) => {
         if (fs.existsSync(filePath)) {
            let errorText = '';
            if (this._testErrors[name]) {
               errorText = this._testErrors[name].join('<br/>');
            }
            let readPromise = xml.readXmlFile(filePath).then((xmlObject) => {
               let result = xmlObject;
               if (result.testsuite && result.testsuite.testcase) {
                  result.testsuite.testcase.forEach((item) => {
                     item.$.classname = `[${name}]: ${item.$.classname}`;
                  });
               } else {
                  result = {
                     $: { errors: '0' },
                     testsuite: {
                        testcase: []
                     }
                  };
               }
               //до выполнения задачи https://online.sbis.ru/opendoc.html?guid=2b75077c-2bd9-45c4-94e6-d257e6ce31e4
               //этим ошибкам верить нельзя, добавляем только если нет упавших юнитов
               if (errorText && xmlObject.testsuite.$.errors === '0') {
                  result.testsuite.testcase.push(_private.getErrorTestCase(name, errorText));
               }

               xml.writeXmlFile(filePath, result);
            }).catch(error => logger.error(error));

            promisArray.push(readPromise);
         }
      });
      return Promise.all(promisArray);
   }

   /**
    * Проверяет наличие отчетов по юнит тестам, если какого-то отчета нет кидает ошибку
    */
   checkReport() {
      let error = [];

      logger.log('Проверка существования отчетов');
      this._testReports.forEach((pathToReport, name) => {
         if (!fs.existsSync(pathToReport)) {
            error.push(name);
            xml.writeXmlFile(pathToReport, _private.getReportTemplate());
         }
      });
      if (error.length > 0) {
         logger.error(`Сгенерированы отчеты с ошибками: ${error.join(', ')}`);
      }
      logger.log('Проверка пройдена успешно');
   }

   /**
    * Возвращает конфиг юнит тестов на основе базового testConfig.base.json
    * @param {String} name - название репозитория
    * @param {String} suffix - browser/node
    * @param {Array} testModules - модули с юнит тестами
    * @private
    */
   _getTestConfig(name, suffix, testModules) {
      const testConfig = require('../testConfig.base.json');
      let cfg = { ...testConfig };
      const fullName = name + (suffix || '');
      const workspace = path.relative(process.cwd(), this._workspace);
      cfg.url = { ...cfg.url };
      cfg.url.port = this._portsMap[name];
      cfg.tests = testModules;
      cfg.root = path.relative(process.cwd(), this._resources);
      cfg.htmlCoverageReport = cfg.htmlCoverageReport.replace('{module}', fullName).replace('{workspace}', workspace);
      cfg.jsonCoverageReport = cfg.jsonCoverageReport.replace('{module}', fullName).replace('{workspace}', workspace);
      cfg.report = cfg.report.replace('{module}', fullName).replace('{workspace}', workspace);
      this._testReports.set(fullName, cfg.report);
      return cfg;
   }

   /**
    * Возвращает модули с юнит тестами
    * @param {String} repName - название репозитория
    * @returns {Array}
    * @private
    */
   _getTestModules(repName) {
      const modules = this._modulesMap.getTestModules(repName);

      if (this._diff.has(repName)) {
         const diff = this._diff.get(repName);

         const filteredModules = modules.filter((moduleName) => {
            const cfg = this._modulesMap.get(moduleName);
            const checkModules = [moduleName].concat(cfg.depends);

            return checkModules.some(dependModuleName => (
               diff.some(filePath => filePath.includes(dependModuleName + path.sep))
            ));
         });

         return filteredModules.length > 0 ? filteredModules : modules;
      }

      return modules;
   }

   /**
    * Создает файл с конфигом для запуска юнит тестов
    * @param params - параметры для запуска юнит тестов
    * @returns {Promise<void>}
    * @private
    */
   async _makeTestConfig(params) {
      const cfg = this._getTestConfig(
         params.name,
         params.isBrowser ? BROWSER_SUFFIX : NODE_SUFFIX,
         params.testModules
      );
      await fs.outputFile(
         params.path,
         JSON.stringify(cfg, null, 4)
      );
   }

   /**
    * Запускает юнит тесты
    * @returns {Promise<[]>}
    * @private
    */
   _startTest() {
      // eslint-disable-next-line consistent-return
      return pMap(this._modulesMap.getTestList(), (name) => {
         const testModules = this._getTestModules(name);
         if (testModules.length > 0) {
            logger.log('Запуск тестов', name);
            return Promise.all([
               this._startNodeTest(name, testModules),
               this._startBrowserTest(name, testModules)
            ]);
         }
         logger.log('Тесты не были запущены т.к. изменения не в модулях', name);
      }, {
         concurrency: PARALLEL_TEST_COUNT
      });
   }

   /**
    * Запускает юниты под нодой
    * @param {String} repName - Название репозитория в конфиге
    * @param {Array} testModules - Список модулей с тестами
    * @return {Promise<void>}
    * @private
    */
   async _startNodeTest(repName, testModules) {
      try {
         if (!this._server) {
            const pathToConfig = _private.getPathToTestConfig(repName, false);

            await this._makeTestConfig({
               name: repName,
               testModules: testModules,
               path: pathToConfig,
               isBrowser: false
            });

            await this._shell.execute(
               `node node_modules/saby-units/cli.js --isolated --report --config=${pathToConfig}`,
               process.cwd(),
               {
                  processName: `test node ${repName}`,
                  timeout: TEST_TIMEOUT
               }
            );
         }
      } catch (e) {
         this._testErrors[repName + NODE_SUFFIX] = e;
      }
   }

   /**
    * Запускает тесты в браузере
    * @param {String} repName - Название репозитория в конфиге
    * @param {Array} testModules - Список модулей с тестами
    * @return {Promise<void>}
    * @private
    */
   async _startBrowserTest(repName, testModules) {
      let cfg = this._reposConfig[repName];
      if (cfg.unitInBrowser) {
         const configPath = _private.getPathToTestConfig(repName, true);
         const browserTestModules = testModules.filter(module => !!this._modulesMap.get(module).testInBrowser);
         let cmd = '';

         if (browserTestModules.length > 0) {
            await this._makeTestConfig({
               name: repName,
               testModules: browserTestModules,
               path: configPath,
               isBrowser: true
            });

            if (this._server) {
               cmd = `node node_modules/saby-units/cli/server.js --config=${configPath}`;
            } else {
               cmd = `node node_modules/saby-units/cli.js --browser --report --config=${configPath}`;
            }

            try {
               logger.log('Запуск тестов в браузере', repName);
               await this._shell.execute(
                  cmd,
                  process.cwd(),
                  {
                     processName: `test browser ${repName}`,
                     timeout: TEST_TIMEOUT
                  }
               );
            } catch (e) {
               this._testErrors[repName + BROWSER_SUFFIX] = e;
            }
            logger.log('тесты в браузере завершены', repName);
         }
      }
   }

   /**
    * Запускает тестирование
    * @return {Promise<void>}
    */
   async _run() {
      try {
         logger.log('Запуск тестов');
         await this._modulesMap.build();
         await this._setDiff();
         this._setPorts();
         await this._startTest();
         await this.checkReport();
         await this.prepareReport();
         logger.log('Тестирование завершено');
      } catch (e) {
         throw new Error(`Тестирование завершено с ошибкой ${e}`);
      }
   }

   /**
    * Проверяет diff в репозитории для запуска тестов только по измененным модулям
    * @returns {Promise<[]>}
    * @private
    */
   _setDiff() {
      const result = [];
      for (const name of this._testRep) {
         if (name !== 'all') {
            result.push(this._setDiffByRep(name));
         }
      }
      return Promise.all(result);
   }

   /**
    * Заполняет diff по репозиторию
    * @param repName Название репозитория
    * @returns {Promise<void>}
    * @private
    */
   async _setDiffByRep(repName) {
      const git = new Git({
         path: this._modulesMap.getRepositoryPath(repName),
         name: repName
      });
      const branch = await git.getBranch();
      if (branch !== this._rc) {
         this._diff.set(repName, await git.diff(branch, this._rc));
      }
   }

   /**
    * Распределяет порты по тестам
    * @private
    */
   _setPorts() {
      const ports = this._ports ? this._ports.split(',') : [];
      let defaultPort = DEFAULT_PORT;
      this._modulesMap.getTestList().forEach((name) => {
         this._portsMap[name] = ports.shift() || defaultPort++;
      });
   }
}

module.exports = Test;
