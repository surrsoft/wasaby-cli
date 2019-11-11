const logger = require('./util/logger');
const ModulesMap = require('./util/modulesMap');
const xml = require('./util/xml');
const Git = require('./util/git');

const fs = require('fs-extra');
const path = require('path');
const pMap = require('p-map');
const Base = require('./base');



const BROWSER_SUFFIX = '_browser';
const NODE_SUFFIX = '_node';
const PARALLEL_TEST_COUNT = 2;
const DEFAULT_PORT = 10026;

let getReportTemplate = () => {
   return {
      testsuite: {
         $: {
            errors: '1',
            failures: '1',
            name: 'Mocha Tests',
            tests: '1'
         },
         testcase: []
      }
   };
};

let getErrorTestCase = (name, details) => {
   return {
      $: {
         classname: `[${name}]: Test runtime error`,
         name: 'Some test has not been run, see details',
         time: '0'
      },
      failure: details
   };
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
   async prepareReport() {
      let promisArray = [];

      logger.log('Подготовка отчетов');
      this._testReports.forEach((filePath, name) => {
         if (fs.existsSync(filePath)) {
            let errorText = '';
            if (this._testErrors[name]) {
               errorText = this._testErrors[name].join('<br/>');
            }
            let readPromise = xml.readXmlFile(filePath).then((result) => {
               if (result.testsuite && result.testsuite.testcase) {
                  result.testsuite.testcase.forEach((item) => {
                     item.$.classname = `[${name}]: ${item.$.classname}`;
                  });
               } else {
                  result = {
                     testsuite: {
                        testcase: []
                     }
                  };
               }

               if (errorText) {
                  result.testsuite.testcase.push(getErrorTestCase(name, errorText));
               }

               xml.writeXmlFile(filePath, result);
            }).catch(error => {
               logger.log(error);
            });

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
            this._createReport(pathToReport);
         }
      });
      if (error.length > 0) {
         logger.log(`Сгенерированы отчеты с ошибками: ${error.join(', ')}`);
      }
      logger.log('Проверка пройдена успешно');
   }

   /**
    * Создает отчет юнит тестов
    * @param {String} pathToFile - путь до отчета
    * @private
    */
   _createReport(pathToFile) {
      xml.writeXmlFile(pathToFile, getReportTemplate());
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
      let cfg = {...testConfig};
      const fullName = name + (suffix || '');
      const workspace = path.relative(process.cwd(), this._workspace);
      cfg.url = {...cfg.url};
      cfg.url.port = this._portsMap[name];
      cfg.tests = testModules;
      cfg.root = path.relative(process.cwd(), this._resources);
      cfg.htmlCoverageReport = cfg.htmlCoverageReport.replace('${module}', fullName).replace('${workspace}', workspace);
      cfg.jsonCoverageReport = cfg.jsonCoverageReport.replace('${module}', fullName).replace('${workspace}', workspace);
      cfg.report = cfg.report.replace('${module}', fullName).replace('${workspace}', workspace);
      this._testReports.set(fullName, cfg.report);
      return cfg;
   }

   /**
    * Возвращает модули с юнит тестами
    * @param {String} name - название репозитория
    * @returns {Array}
    * @private
    */
   _getTestModules(name) {
      const modules = this._modulesMap.getTestModules(name);

      if (this._diff.has(name)) {
         const diff = this._diff.get(name);

         const filteredModules = modules.filter((name) => {
            const cfg = this._modulesMap.get(name);
            const checkModules = [name].concat(cfg.depends);

            return checkModules.some((dependModuleName) => {
               return diff.some(filePath => filePath.includes(dependModuleName + path.sep));
            });
         });

         return filteredModules.length > 0 ? filteredModules : modules;
      }

      return modules;
   }

   /**
    * Создает файл с конфигом для запуска юнит тестов
    * @param params
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
   async _startTest() {
      return  pMap(this._modulesMap.getTestList(), (name) => {
         const testModules = this._getTestModules(name);
         if (testModules.length > 0) {
            logger.log('Запуск тестов', name);
            return Promise.all([
               this._startNodeTest(name, testModules),
               this._startBrowserTest(name, testModules)
            ]);
         } else  {
            logger.log('Тесты не были запущены т.к. изменения не в модулях', name);
         }
      }, {
         concurrency: PARALLEL_TEST_COUNT
      });
   }

   /**
    * Запускает юниты под нодой
    * @param {String} name
    * @param {String} testModules
    * @returns {Promise<void>}
    * @private
    */
   async _startNodeTest(name, testModules) {
      try {
         if (!this._server) {
            const pathToConfig = this._getPathToTestConfig(name, false);

            await this._makeTestConfig({
               name: name,
               testModules: testModules,
               path: pathToConfig,
               isBrowser: false
            });

            await this._shell.execute(
               `node node_modules/saby-units/cli.js --isolated --report --config=${pathToConfig}`,
               process.cwd(),
               `test node ${name}`
            );
         }
      } catch (e) {
         this._testErrors[name + NODE_SUFFIX] = e;
      }
   }

   /**
    * запускает тесты в браузере
    * @param {String} name - название репозитория в конфиге
    * @return {Promise<void>}
    * @private
    */
   async _startBrowserTest(name, testModules) {
      let cfg = this._reposConfig[name];
      if (cfg.unitInBrowser) {
         const configPath = this._getPathToTestConfig(name, true);
         let cmd = '';
         const browserTestModules = testModules.filter((name) => !!this._modulesMap.get(name).testInBrowser);

         if (browserTestModules.length > 0) {
            await this._makeTestConfig({
               name: name,
               testModules: browserTestModules,
               path: configPath,
               isBrowser: true
            });

            if (this._server) {
               cmd = `node node_modules/saby-units/cli/server.js --config=${configPath}`;
            } else {
               cmd = `node node_modules/saby-units/cli.js --selenium --browser --report --config=${configPath}`;
            }

            try {
               logger.log('Запуск тестов в браузере', name);
               await this._shell.execute(
                   cmd,
                   process.cwd(),
                   `test browser ${name}`
               );
            } catch (e) {
               this._testErrors[name + BROWSER_SUFFIX] = e;
            }
            logger.log('тесты в браузере завершены', name);
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
         await this._checkDiff();
         this._setPorts();
         await this._startTest();
         await this.checkReport();
         await this.prepareReport();
         logger.log('Тестирование завершено');
      } catch (e) {
         throw e;
         throw new Error(`Тестирование завершено с ошибкой ${e}`);
      }
   }

   /**
    * Возвращает путь до конфига юнит тестов
    * @param {String} name название репозитрия
    * @param {Boolean} isBrowser - юниты в браузере
    * @returns {string}
    * @private
    */
   _getPathToTestConfig(name, isBrowser) {
      const browser = isBrowser ? '_browser' : '';
      return path.relative(
         process.cwd(),
         path.normalize(path.join( __dirname, '..', `testConfig_${name}${browser}.json`))
      );
   }

   /**
    * Проверяет
    * @returns {Promise<void>}
    * @private
    */
   async _checkDiff() {
      for (const name of this._testRep) {
         if (name !== 'all') {
            const git = new Git({
               path: this._modulesMap.getRepositoryPath(name),
               name: name
            });
            const branch = await git.getBranch();
            if (branch !== this._rc) {
               this._diff.set(name, await git.diff(branch, this._rc));
            }
         }
      }
   }

   /**
    * Распределяет порты по тестам
    * @private
    */
    _setPorts() {
      const ports = this._ports ? this._ports.split(',') : [];
      let defaultPort = DEFAULT_PORT;

      this._modulesMap.getTestList().forEach(name => {
         this._portsMap[name] = ports.shift() || defaultPort++;
      });
   }

}

module.exports = Test;
