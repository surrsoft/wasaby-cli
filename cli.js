const fs = require('fs-extra');
const xml2js = require('xml2js');
const shell = require('shelljs');
const CONFIG = 'config.json';
const path = require('path');
const reposStore = '_repos';
const builderConfigName = 'builderConfig.json';
const pMap = require('p-map');
const geniePath = 'tools/jinnee';
const resourcesPath = 'intest-ps/ui/resources';
//"C:\Program Files (x86)\SBISPlatformSDK_19500\tools\jinnee\jinnee-utility.exe"
const BROWSER_SUFFIX = '_browser';
const NODE_SUFFIX = '_node';

function walkDir(dir, callback, rootDir) {
   rootDir = rootDir || dir;
   fs.readdirSync(dir).forEach(f => {
      let dirPath = path.join(dir, f);
      let relativePath = path.relative(rootDir, dir);
      let isDirectory = fs.statSync(dirPath).isDirectory();
      isDirectory ? walkDir(dirPath, callback, rootDir) : callback(path.join(relativePath, f));
   });
};

let getReportTemplate = () => {
   return {
      testsuite:{
         $: {
            name:"Mocha Tests",
            tests:"1",
            failures:"1",
            errors:"1"
         },
         testcase: []
      }
   };
};

let getErrorTestCase = (name, details) => {
   return {
      $: {
         classname: `[${name}]: Test runtime error`,
         name: "Some test has not been run, see details",
         time: "0"
      },
      failure: details
   }
};

/**
 * Модуль для запуска юнит тестов
 * @class Cli
 * @author Ганшин Я.О.
 */
class Cli {
   constructor() {
      let config = this.readConfig();
      this._repos = config.repositories;


      this._testReports = new Map();
      this._argvOptions = this._getArgvOptions();
      this._workDir = this._argvOptions.workDir || path.join(process.cwd(), config.workDir);
      this._builderCache = this._argvOptions.builderCache || 'builder-json-cache';
      this._resources = path.join(this._workDir, resourcesPath);
      this._projectDir = this._argvOptions.projectDir;
      this._store = this._argvOptions.store || path.join(process.cwd(), config.store);
      this._testBranch = this._argvOptions.branch || this._argvOptions.rc || '';
      this._testRep = this._argvOptions.rep.split(',');
      this._workspace = this._argvOptions.workspace || './application';
      this._unitModules = [];
      this._testErrors = {};
      this._childProcessMap = [];
      this._rc = this._argvOptions.rc;
      this._modulesMap = new Map();
      this._withBuilder = false;
      this._testModulesMap = new Map();
      this._testList = undefined;
      this._builderCfg = path.join(process.cwd(), builderConfigName);
   }

   /**
    * Запускает сборку юнит тестов
    * @return {Promise<void>}
    */
   async run() {
      try {
         await this.initStore();
         await this.initWorkDir();
         await this.startTest();
         this.checkReport();
         this.prepareReport();
         this.log('Закончили тестирование');
      } catch(e) {
         await this._closeChildProcess();
         this.prepareReport();
         this.log(`Тестирование завершено с ошибкой ${e}`);
         throw e;
      }
   }

   /**
    * Возвращает список модулей содержащих юнит тесты
    * @return {Array}
    * @private
    */
   _getTestModules(name) {
      let result = [];
      this._testModulesMap.get(name).forEach((moduleName) => {
         let cfg = this._modulesMap.get(moduleName);
         result = result.concat(cfg.depends || []).filter((name) => {
            return !!this._modulesMap.get(name).forTests
         });
         result.push(moduleName);
      });
      return result;
   }
   /**
    * Возвращает список репозиториев для тестирования
    * @param {string} name - Название репозитория в конфиге
    * @return {Set}
    * @private
    */
   _getTestList() {
      if (this._testList) {
         return this._testList;
      }

      const tests = new Set();
      if (!this._testRep.includes('all')) {
         this._testRep.forEach((testRep) => {
            let modules = this._getParentModules(this._getTestModules(testRep));
            tests.add(testRep);
            modules.forEach((name) => {
               let cfg = this._modulesMap.get(name);
               tests.add(cfg.rep);
            });
         });
      } else {
         this._testModulesMap.forEach((modules, rep) => {
            tests.add(rep);
         });
      }
      return this._testList = tests;
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
         if (cfg.forTests && !result.includes(cfg.name) && cfg.depends.some(dependName => result.includes(dependName))) {
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
    * Записывает объект в xml файл
    * @param {string} filePath - Путь до файла
    * @param {Object} obj - Объект который надо записать
    * @private
    */
   _writeXmlFile(filePath, obj) {
      let builder = new xml2js.Builder();
      let xml = builder.buildObject(obj);
      fs.outputFileSync(filePath, xml);
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

   /**
    * Закрвыает все дочерние процессы
    * @return {Promise<void>}
    * @private
    */
   async _closeChildProcess() {
      await Promise.all(this._childProcessMap.map((process) => {
         return new Promise((resolve) => {
            process.on('close', () => {
               resolve();
            });
            process.withErrorKill = true;
            process.kill('SIGKILL');
         });
      }));
      this._childProcessMap = [];
   }

   /**
    * Возвращает конфиг
    * @return {any}
    */
   readConfig() {
      let data = fs.readFileSync(CONFIG);
      return JSON.parse(data);
   }

   /**
    * Возвращает опции командной строки
    * @private
    */
   _getArgvOptions() {
      let options = {};
      process.argv.slice(2).forEach(arg => {
         if (arg.startsWith('--')) {
            let argName = arg.substr(2);
            const [name, value] = argName.split('=', 2);
            options[name] = value === undefined ? true : value;
         }
      });

      if (!options.rep) {
         throw new Error('Параметр --rep не передан');
      }

      return options;
   }

   /**
    * возвращает набор интерфейсных модулей из репозитория
    * @param {String} name - название репозитория в конфиге
    * @return {Array}
    * @private
    */
   async _getModulesByRepName(name) {
      let allModules = this._findModulesInRepDir(name);
      let uiModules = await this._addToModulesMap(allModules);

      return uiModules;
   }

   /**
    * Ищет модули в репозитории по s3mod
    * @param {String} name - название репозитория в конфиге
    * @return {Array}
    * @private
    */
   _findModulesInRepDir(name) {
      let s3mods = [];
      walkDir(path.join(this._store, reposStore, name), (filePath) => {
         if (filePath.includes('.s3mod')) {
            let splitFilePath = filePath.split(path.sep);
            splitFilePath.splice(-1, 1);
            let modulePath = path.join.apply(path, splitFilePath);
            let moduleName = splitFilePath[splitFilePath.length - 1];
            s3mods.push({
               name: moduleName,
               rep: name,
               path: filePath,
               modulePath: modulePath
            });
         }
      });
      return s3mods;
   }

   _readXmlFile(filePath) {
      return new Promise((resolve, reject) => {
         const parser = new xml2js.Parser();
         let xml_string = fs.readFileSync(filePath, "utf8");
         parser.parseString(xml_string, (error, result) => {
            if (error === null) {
               resolve(result);
            }
            else {
               this.log(error);
               reject(error);
            }
         });
      });
   }

   async _addToModulesMap(modules) {
      let addedModules = [];
      await pMap(modules, (cfg) => {
         return this._readXmlFile(path.join(this._store, reposStore, cfg.rep, cfg.path)).then((xmlObj) => {
            if (!this._modulesMap.has(cfg.name) && xmlObj.ui_module && cfg.name !== 'Intest') {
               cfg.depends = [];
               if (xmlObj.ui_module.depends && xmlObj.ui_module.depends[0]) {
                  let depends = xmlObj.ui_module.depends[0];
                  if (depends.ui_module) {
                     depends.ui_module.forEach(function (item) {
                        cfg.depends.push(item.$.name);
                     })
                  }
                  if (depends.module) {
                     depends.module.forEach(function (item) {
                        cfg.depends.push(item.$.name);
                     })
                  }
               }
               if (xmlObj.ui_module.unit_test) {
                  let testModules = this._testModulesMap.get(cfg.rep) || [];
                  testModules.push(cfg.name);
                  this._testModulesMap.set(cfg.rep, testModules);
               }
               addedModules.push(cfg.modulePath);
               this._modulesMap.set(cfg.name, cfg);
            }
         })
      }, {
         concurrency: 4
      });
      return addedModules;
   }

   /**
    * Создает конфиг для билдера
    * @return {Promise<void>}
    * @private
    */
   _makeBuilderConfig() {
      let builderConfig = require('./builderConfig.base.json');
      let testList = new Set(this._getTestList());
      //удалить по этой задаче https://online.sbis.ru/opendoc.html?guid=79e5557f-b621-40bf-ae79-86b6fc5930b6
      testList.forEach((name) => {
         const cfg = this._repos[name];
         if (cfg.dependOn) {
            cfg.dependOn.forEach((name) => {
               testList.add(name);
            });
         }
      });
      testList.forEach((name) => {
         let modules = this._getChildModules(this._getModulesFromMap(name));
         modules = modules.concat((this._repos[name].modules || []).filter((modulePath) => {
            return fs.existsSync(path.join(this._store, name, 'module', this._getModuleNameByPath(modulePath)));
         }));

         modules.forEach((modulePath) => {
            const moduleName = this._getModuleNameByPath(modulePath);

            if (moduleName !== 'unit') {
               const isNameInConfig = builderConfig.modules.find((item) => (item.name == moduleName));
               let cfg = this._modulesMap.get(moduleName);
               let repName = cfg ? cfg.rep : name;
               if (!isNameInConfig) {
                  builderConfig.modules.push({
                     name: moduleName,
                     path: path.join(this._store, repName, 'module', moduleName)
                  })
               }
            }
         });

      });

      return fs.outputFile(`./${builderConfigName}`, JSON.stringify(builderConfig, null, 4));
   }

   /**
    * возвращает название модуля по пути
    * @param {String} path
    * @return {String}
    * @private
    */
   _getModuleNameByPath(path) {
      return path.includes('/') ? path.split('/').pop() : path.split('\\').pop();
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
      const testsConfig = [];

      for (const name of this._getTestList()) {
         testsConfig.push(new Promise(resolve => {
            let cfg = this._getTestConfig(name, NODE_SUFFIX);
            fs.outputFileSync(`./testConfig_${name}.json`, JSON.stringify(cfg, null, 4));
            if (this._repos[name].unitInBrowser) {
               let cfg = this._getTestConfig(name, BROWSER_SUFFIX);
               cfg.url.port = configPorts.shift() || defaultPort++;
               fs.outputFileSync(`./testConfig_${name}InBrowser.json`, JSON.stringify(cfg, null, 4));
            }
            resolve();
         }));
      }

      return Promise.all(testsConfig);
   }

   async _initWithBuilder() {
      await this._makeBuilderConfig();
      await this._execute(
         `node node_modules/gulp/bin/gulp.js --gulpfile=node_modules/sbis3-builder/gulpfile.js build --config=${this._builderCfg}`,
         __dirname,
         true,
         'builder'
      );
   }

   async readSrv() {
      //await copyProject()
      let srvPath = path.join(this._projectDir, 'InTestUI.s3srv');
      let srv = await this._readXmlFile(srvPath);
      let srvModules = [];
      srv.service.items[0].ui_module.forEach((item) => {
         if (this._modulesMap.has(item.$.name)) {
            let cfg = this._modulesMap.get(item.$.name);
            item.$.url = path.relative(this._projectDir, path.join(this._store, reposStore, cfg.rep, cfg.path));
            srvModules.push(cfg.name);
            cfg.srv = true;
            this._modulesMap.set(cfg.name, cfg);
         }
      });
      this._makeBuilderTestConfig();

      this._writeXmlFile(srvPath, srv);
   }

   _makeBuilderTestConfig() {
      let builderConfig = require('./builderConfig.base.json');
      this._getTestList().forEach((name) => {
         let testmodules = this._testModulesMap.get(name);
         testmodules.forEach((testModuleName) => {
            let cfg = this._modulesMap.get(testModuleName);
            let repName = cfg ? cfg.rep : name;
            builderConfig.modules.push({
               name: testModuleName,
               path: path.join(this._store, repName, 'module', testModuleName)
            })
         });

         let modules = this._getChildModules(this._getModulesFromMap(name));

         modules.forEach((modulePath) => {
            const moduleName = this._getModuleNameByPath(modulePath);
            const isNameInConfig = builderConfig.modules.find((item) => (item.name == moduleName));
            let cfg = this._modulesMap.get(moduleName);
            let repName = cfg ? cfg.rep : name;
            if (!isNameInConfig && !cfg.srv) {
               builderConfig.modules.push({
                  name: moduleName,
                  path: path.join(this._store, repName, 'module', moduleName)
               })
            }
         });
      });

      builderConfig.output = path.join(this._workDir, 'builder_test');
      return fs.outputFile(`${builderConfigName}`, JSON.stringify(builderConfig, null, 4));
   }

   _prepareDeployCfg(filePath) {
      let cfg_string = fs.readFileSync(filePath, "utf8");
      cfg_string = cfg_string.replace(/\{site_root\}/g, this._workDir);
      cfg_string = cfg_string.replace(/\{json_cache\}/g, this._builderCache);
      fs.outputFileSync(filePath, cfg_string);
   }

   async _initWithGenie() {
      this.readSrv();

      let sdkVersion = this._rc.replace('rc-', '').replace('.','');

      let genieFolder = '';
      let deploy = path.join(this._projectDir, 'InTest.s3deploy');
      let logs = path.join(this._workDir, 'logs');
      let project = path.join(this._projectDir, 'InTest.s3cld');
      let conf = path.join(this._projectDir, 'InTest.s3webconf');
      let genieCli = '';
      if (process.platform == 'win32') {
         let sdkPath = process.env['SBISPlatformSDK_' + sdkVersion];
         genieFolder = path.join(sdkPath, geniePath);
         genieCli = `"${path.join(genieFolder, 'jinnee-utility.exe')}" jinnee-dbg-stand-deployment300.dll`;
      } else  {
         let sdkPath = process.env['SDK'];
         process.env['SBISPlatformSDK_' + sdkVersion] = process.env['SDK'];
         genieFolder = path.join(this._workspace, 'jinnee');
         await this._execute(`7za x ${path.join(sdkPath,'tools','jinnee','jinnee.zip')} -o${genieFolder}`, __dirname);
         genieCli = `${path.join(genieFolder, 'jinnee-utility')} libjinnee-dbg-stand-deployment300.so`;
      }
      this._prepareDeployCfg(path.join(this._projectDir, 'InTest.s3deploy'));
      await this._execute(
         `${genieCli} --deploy_stand=${deploy} --logs_dir=${logs} --project=${project}`,
         genieFolder,
         'jinnee'
      );
      await this._execute(
         `node node_modules/gulp/bin/gulp.js --gulpfile=node_modules/sbis3-builder/gulpfile.js build --config=${this._builderCfg}`,
         __dirname,
         true,
         'builder'
      );
      fs.readdirSync(path.join(this._workDir, 'builder_test')).forEach(f => {
         let dirPath = path.join(this._workDir, 'builder_test', f);
         if (fs.statSync(dirPath).isDirectory()) {
            fs.ensureSymlink(dirPath, path.join(this._resources, f));
         }
      });
   }

   /**
    * инициализирует рабочую директорию: запускает билдер, копирует тесты
    * @return {Promise<void>}
    */
   async initWorkDir() {
      this.log(`Подготовка тестов`);
      await this._tslibInstall();
      try {
         if (this._withBuilder) {
            await this._initWithBuilder();
         } else {
            await this._initWithGenie();
         }
         this._copyUnit();
         await this._linkFolder();
         this.log(`Подготовка тестов завершена успешно`);
      } catch(e) {
         throw e;
         throw new Error(`Подготовка тестов завершена с ошибкой ${e}`);
      }
   }

   /**
    * копирует tslib
    * @private
    */
   async _tslibInstall() {
      let tslib = path.relative(process.cwd(), path.join(this._store, reposStore, 'ws', '/WS.Core/ext/tslib.js'));
      this.log(tslib, 'tslib_path')
      return this._execute(
         `node node_modules/saby-typescript/install.js --tslib=${tslib}`,
         __dirname,
         true,
         'typescriptInstall'
      );
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
      if (value === 'debug') {
         this._buildNumber = contents.buildnumber;
         contents.buildnumber = '';
      } else {
         contents.buildnumber = this._buildNumber;
      }
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

   /**
    * инициализация хранилища, клонирует необходимые рапозитории из гита, либо копирует из переданной папки
    * @return {Promise<void>}
    */
   async initStore() {
      // return Promise.all(Object.keys(this._repos).map((name) => {
      //    return this._getModulesByRepName(name);
      // }));

      this.log(`Инициализация хранилища`);
      try {
         //await fs.remove(this._workDir);
         //await fs.remove('builder-ui');
         await this._clearStore();
         await fs.mkdirs(path.join(this._store, reposStore));
         await Promise.all(Object.keys(this._repos).map((name) => {
            //return this.copy(name);
            if (!fs.existsSync(path.join(this._store, name))) {
               return this.initRepStore(name)
                  .then(
                     this.copy.bind(this, name)
                  );
            }
         }));
         this.log(`Инициализация хранилища завершена успешно`);
      } catch (e) {
         throw new Error(`Инициализация хранилища завершена с ошибкой ${e}`);
      }
   }

   async _clearStore() {
      if (fs.existsSync(this._store)) {
         return fs.readdir(this._store).then(folders => {
            return pMap(folders, (folder) => {
               if (folder !== reposStore) {
                  return fs.remove(path.join(this._store, folder));
               }
            }, {
               concurrency: 4
            })
         });
      }
   }
   /**
    * Создает симлинки в рабочей директории, после прогона билдера
    * @return {Promise<void>}
    * @private
    */
   async _linkFolder() {
      for (const name in this._repos) {
         if (this._repos[name].linkFolders) {
            for (const pathOriginal in this._repos[name].linkFolders) {
               const pathDir = path.join(this._store, reposStore, name, pathOriginal);
               const pathLink =  path.join(this._resources, this._repos[name].linkFolders[pathOriginal]);
               await fs.ensureSymlink(pathDir, pathLink);
            }
         }
      }
   }

   /**
    * создает симлинки для модулей
    * @param {String} name - название репозитория в конфиге
    * @return {Promise<[any, ...]>}
    */
   async copy(name) {
      let cfg = this._repos[name];
      let reposPath = path.join(this._store, reposStore, name);
      await fs.mkdirs(path.join(this._store, name));
      if (cfg.test) {
         let testPath = path.join(reposPath, cfg.test);
         if (fs.existsSync(testPath)) {
            await fs.ensureSymlink(path.join(reposPath, cfg.test), path.join(this._store, name, name + '_test'));
         }
      }
      const modules = await this._getModulesByRepName(name);

      if (this._testModulesMap.has(name)) {
         this._markModulesForTest(name);
      }

      return Promise.all(modules.map((module => {
         this.log(`копирование модуля ${name}/${module}`, name);
         if (this._getModuleNameByPath(module) == 'unit') {
            if (fs.existsSync(path.join(reposPath, module))) {
               this._unitModules.push(path.join(reposPath, module));
            }
         } else {
            return fs.ensureSymlink(path.join(reposPath, module), path.join(this._store, name, 'module', this._getModuleNameByPath(module))).catch((e) => {
               throw new Error(`Ошибка при копировании репозитория ${name/module}: ${e}`);
            });
         }
      })));
   }

   _markModulesForTest(name) {
      let modules = this._testModulesMap.get(name);
      modules.forEach((testModuleName) => {
         let cfg = this._modulesMap.get(testModuleName);
         cfg.depends.forEach((moduleName) => {
            let cfg = this._modulesMap.get(moduleName);
            if (cfg && cfg.rep === name) {
               cfg.forTests = true;
               this._modulesMap.set(moduleName, cfg);
            }
         });
      });
   }

   /**
    * переключает репозиторий на нужную ветку
    * @param {String} name - название репозитория в конфиге
    * @param {String} checkoutBranch - ветка на которую нужно переключиться
    * @return {Promise<void>}
    */
   async checkout(name, checkoutBranch) {
      let pathToRepos = path.join(this._store, reposStore, name);
      if (!checkoutBranch) {
         throw new Error(`Не удалось определить ветку для репозитория ${name}`);
      }
      try {
         this.log(`Переключение на ветку ${checkoutBranch}`, name);
         await this._execute(`git reset --hard HEAD`, pathToRepos, `git_reset ${name}`);
         await this._execute(`git clean -fdx`, pathToRepos, `git_clean ${name}`);
         await this._execute(`git fetch`, pathToRepos, `git_fetch ${name}`);
         await this._execute(`git checkout ${checkoutBranch}`, pathToRepos, `git_checkout ${name}`);
         if (checkoutBranch.includes('/') || checkoutBranch === this._rc) {
            await this._execute(`git pull`, pathToRepos, `git_pull ${name}`);
         }
      } catch (err) {
         if (/rc-.*00/.test(checkoutBranch)) {
            await this._execute(`git checkout ${checkoutBranch.replace('00', '10')}`, pathToRepos, `checkout ${name}`);
         } else {
            throw new Error(`Ошибка при переключение на ветку ${checkoutBranch} в репозитории ${name}: ${err}`);
         }
      }
      if (this._testRep.includes(name)) {
         this.log(`Попытка смержить ветку "${checkoutBranch}" с "${this._rc}"`, name);
         try {
            await this._execute(`git merge origin/${this._rc}`, pathToRepos, `git_merge ${name}`);
         } catch (e) {
            throw new Error(`При мерже "${checkoutBranch}" в "${this._rc}" произошел конфликт`);
         }
      }
   }

   /**
    * Клонирует репозиторий из гита
    * @param {String} name - название репозитория в конфиге
    * @return {Promise<*|string>}
    */
   async cloneRepToStore(name) {
      if (!fs.existsSync(path.join(this._store, reposStore, name))) {
         try {
            this.log(`git clone ${this._repos[name].url}`, name);
            await this._execute(`git clone ${this._repos[name].url} ${name}`, path.join(this._store, reposStore), `clone ${name}`);
         } catch (err) {
            throw new Error(`Ошибка при клонировании репозитория ${name}: ${err}`);
         }
      }
   }

   /**
    * Копирует репозиторий, если в параметрах запуска передали путь
    * @param {String} pathToOriginal
    * @param {String} name - название репозитория в конфиге
    * @return {Promise<void>}
    */
   async copyRepToStore(pathToOriginal, name) {
      try {
         this.log(`Копирование репозитория`, name);

         await fs.ensureSymlink(pathToOriginal, path.join(this._store, reposStore, name));
      } catch (err) {
         throw new Error(`Ошибка при копировании репозитория ${name}: ${err}`);
      }
   }

   /**
    * Инициализация хранилища, клонирует/копирует репозитории переключает на нужные ветки
    * @param {String} name - название репозитория в конфиге
    * @return {Promise<void>}
    */
   async initRepStore(name) {
      let branch = this._argvOptions[name] || this._rc;
      if (fs.existsSync(branch)) {
         return this.copyRepToStore(this._argvOptions[name], name);
      }
      await this.cloneRepToStore(name);
      return this.checkout(
         name,
         branch
      );
   }

   /**
    * Копирует юнит тесты
    * @private
    */
   _copyUnit() {
      this._unitModules.forEach((source) => {
         walkDir(source, (filePath) => {
            if (!filePath.includes('.test.')) {
               fs.copySync(path.join(source, filePath), path.join(this._resources, 'unit', filePath));
            }
         });
      });
   }

   /**
    * Выводит сообщение в лог
    * @param {String} message
    */
   log(message, name) {
      let date = new Date();
      let time = `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}:${date.getMilliseconds()}`;
      name = name ? ' '+name : '';
      console.log(`[${time}]${name}: ${message}`);
   }

   /**
    * Выполняет команду shell
    * @param {String} command - текст команды
    * @param {String} path - путь по которому надо выполнить команду
    * @param {Boolean} force - если true в случае ошибки вернет промис resolve
    * @param {String} processName - метка процесса в логах
    * @return {Promise<any>}
    * @private
    */
   _execute(command, path, force, processName) {
      if (typeof force == 'string') {
         processName = force;
         force = false;
      }
      let errors = [];
      return new Promise((resolve, reject) => {
         const cloneProcess = shell.exec(`cd ${path} && ${command}`, {
            silent: true,
            async: true
         });
         this._childProcessMap.push(cloneProcess);
         cloneProcess.stdout.on('data', (data) => {
            this.log(data, processName);
         });

         cloneProcess.stderr.on('data', (data) => {
            this.log(data, processName);
            errors.push(data);
         });

         cloneProcess.on('exit', (code) => {
            this._childProcessMap.splice(this._childProcessMap.indexOf(cloneProcess), 1);
            if (force || !code && !cloneProcess.withErrorKill) {
               resolve();
            } else {
               reject(errors);
            }
         });
      });
   };
}

module.exports = Cli;

if (require.main.filename === __filename) {
   //Если файл запущен напрямую запускаем тестирование
   let cli = new Cli();
   cli.run().catch((e) => {
      console.error(e);
      process.exit(2);
   })
}



