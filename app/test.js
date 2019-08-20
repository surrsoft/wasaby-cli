const fs = require('fs-extra');
const path = require('path');

class Test {
   constructor() {

   }
   /**
    * Возвращает список модулей содержащих юнит тесты
    * @return {Array}
    * @private
    */
   _getTestModules(name) {
      if (this._testModulesMap.has(name)) {
         let result = [];
         this._testModulesMap.get(name).forEach((moduleName) => {
            let cfg = this._modulesMap.get(moduleName);
            result = result.concat(cfg.depends || []);
            result.push(moduleName);
         });
      }
      return this._getModulesFromMap(name);
   }
   /**
    * Возвращает список репозиториев для тестирования
    * @param {string} name - Название репозитория в конфиге
    * @return {Array}
    * @private
    */
   _getTestList() {
      if (this._testList) {
         return this._testList;
      }
      let tests = [];
      if (!this._testRep.includes('all')) {
         this._testRep.forEach((testRep) => {
            let modules = this._getParentModules(this._getTestModules(testRep));
            tests.push(testRep);
            modules.forEach((name) => {
               let cfg = this._modulesMap.get(name);
               if (!tests.includes(cfg.rep)) {
                  tests.push(cfg.rep);
               }
            });
         });
      } else {
         tests = Object.keys(this._repos).filter((name) => {
            return !!this._repos[name].test;
         });
      }
      return this._testList = tests.filter((name) => {
         return !this._repos[name].onlyLoad
      });
   }

   _getModulesFromMap(repName) {
      let moduels = [];
      this._modulesMap.forEach(cfg => {
         if (cfg.rep == repName) {
            moduels.push(cfg.name);
         }
      });
      return moduels;
   }

   _getParentModules(modules) {
      let result = modules.slice();
      this._modulesMap.forEach(cfg => {
         if (!result.includes(cfg.name) && cfg.depends.some(dependName => result.includes(dependName))) {
            result.push(cfg.name);
         }
      });
      if (modules.length  !== result.length) {
         return this._getParentModules(result);
      }
      return result;
   }

   _getChildModules(modules, path) {
      let result = [];
      path = path || [];
      modules.forEach(name => {
         if (this._modulesMap.has(name) && !path.includes(name)) {
            let cfg = this._modulesMap.get(name);
            let depends = this._getChildModules(cfg.depends, path.concat([name]));
            result.push(name);
            result = result.concat(depends.filter((item) => !result.includes(item)));
         }
      });
      return result;
   }


   /**
    * Дописывает в отчеты название репозитория
    */
   prepareReport() {
      this.log('Подготовка отчетов');
      this._testReports.forEach((filePath, name) => {
         if (fs.existsSync(filePath)) {
            const parser = new xml2js.Parser();
            let xml_string = fs.readFileSync(filePath, "utf8");
            let errorText = '';
            if (this._testErrors[name]) {
               errorText = this._testErrors[name].join('<br/>');
            }
            parser.parseString(xml_string, (error, result) => {
               if (error === null) {
                  if (result.testsuite && result.testsuite.testcase) {
                     result.testsuite.testcase.forEach((item) => {
                        item.$.classname = `[${name}]: ${item.$.classname}`;
                     });
                  } else {
                     result = {
                        testsuite: {
                           testcase: []
                        }
                     }
                  }

                  if (errorText) {
                     result.testsuite.testcase.push(getErrorTestCase(name, errorText));
                  }

                  this._writeXmlFile(filePath, result);
               }
               else {
                  this.log(error);
               }
            });
         }
      });
   }

   /**
    * Проверяет наличие отчетов по юнит тестам, если какого-то отчета нет кидает ошибку
    */
   checkReport() {
      this.log('Проверка существования отчетов');
      let error = [];
      this._testReports.forEach((path, name) => {
         if (!fs.existsSync(path)) {
            error.push(name);
            this._createReport(path);
         }
      });
      if (error.length > 0) {
         this.log(`Сгенерированы отчеты с ошибками: ${error.join(', ')}`);
      }
      this.log('Проверка пройдена успешно');
   }

   _createReport(path) {
      this._writeXmlFile(path, getReportTemplate());
   }



   _getTestConfig(name, suffix) {
      const testConfig = require('./testConfig.base.json');
      let cfg = Object.assign({}, testConfig);
      let fullName = name + (suffix||'');
      cfg.tests = this._testModulesMap.has(name) ? this._testModulesMap.get(name) : name + '_test';
      cfg.root = this._resources;
      cfg.htmlCoverageReport = cfg.htmlCoverageReport.replace('${module}', fullName).replace('${workspace}', this._workspace);
      cfg.jsonCoverageReport = cfg.jsonCoverageReport.replace('${module}', fullName).replace('${workspace}', this._workspace);
      cfg.report = cfg.report.replace('${module}', fullName).replace('${workspace}', this._workspace);
      this._testReports.set(fullName, cfg.report);
      return cfg;
   }
   /**
    * Создает конфиги для юнит тестов
    * @param {String} name - название репозитория в конфиге
    * @return {Promise<[any, ...]>}
    * @private
    */
   _makeTestConfig(name) {
      let defaultPort = 10025;
      let configPorts = this._argvOptions.ports ? this._argvOptions.ports.split(',') : [];
      return Promise.all(this._getTestList().map((name, i) => {
         return new Promise(resolve => {
            let cfg = this._getTestConfig(name, NODE_SUFFIX);
            fs.outputFileSync(`./testConfig_${name}.json`, JSON.stringify(cfg, null, 4));
            if (this._repos[name].unitInBrowser) {
               let cfg = this._getTestConfig(name, BROWSER_SUFFIX);
               cfg.url.port = configPorts.shift() || defaultPort++;
               fs.outputFileSync(`./testConfig_${name}InBrowser.json`, JSON.stringify(cfg, null, 4));
            }
            resolve();
         });
      }));
   }


   async _startNodeTest(name) {
      try {
         await this._execute(
            `node node_modules/saby-units/cli.js --isolated --report --config="./testConfig_${name}.json"`,
            __dirname,
            `test node ${name}`
         );
      } catch (e) {
         this._testErrors[name+NODE_SUFFIX] = e;
      }
   }
   /**
    * запускает тесты в браузере
    * @param {String} name - название репозитория в конфиге
    * @return {Promise<void>}
    * @private
    */
   async _startBrowserTest(name) {
      let cfg = this._repos[name];
      if (cfg.unitInBrowser) {
         this.log(`Запуск тестов в браузере`, name);
         try {
            await this._execute(
               `node node_modules/saby-units/cli.js --browser --report --config="./testConfig_${name}InBrowser.json"`,
               __dirname,
               `test browser ${name}`
            );
         } catch (e) {
            this._testErrors[name+BROWSER_SUFFIX] = e;
         }
         this.log(`тесты в браузере завершены`, name);
      }
   }
   async _setContents(value) {
      //if (fs.existsSync(path.join(this._resources, 'contents.json'))) {
      this.log(`Замена buildMode в contents на ${value} путь "${path.join(this._resources, 'contents.js')}"`, 'replace_contents');
      let contents = await fs.readJson(path.join(this._resources, 'contents.json'), "utf8");
      contents.buildMode = value;
      await fs.outputFile(`${path.join(this._resources, 'contents.js')}`, `contents=${JSON.stringify(contents)};`);
      await fs.outputFile(`${path.join(this._resources, 'contents.json')}`, JSON.stringify(contents));
      //}
   }
   /**
    * Запускает тестирование
    * @return {Promise<void>}
    */
   async startTest() {
      await this._setContents('debug');
      await this._makeTestConfig();
      await pMap(this._getTestList(), (name) => {
         this.log(`Запуск тестов`, name);
         return Promise.all([
            this._startNodeTest(name),
            this._startBrowserTest(name)
         ]);
      },{
         concurrency: 4
      });
      await this._setContents('release')
   }
}

module.exports = Test;
