const fs = require('fs-extra');
const xml2js = require('xml2js');
const shell = require('shelljs');
const CONFIG = 'config.json';
const path = require('path');
const reposStore = '_repos';
const repModulesMap = new Map();
const builderConfigName = 'builderConfig.json';
const pMap = require('p-map');

function walkDir(dir, callback, rootDir) {
   rootDir = rootDir || dir;
   fs.readdirSync(dir).forEach(f => {
      let dirPath = path.join(dir, f);
      let relativePath = path.relative(rootDir, dir);
      let isDirectory = fs.statSync(dirPath).isDirectory();
      isDirectory ? walkDir(dirPath, callback, rootDir) : callback(path.join(relativePath, f));
   });
};

const reportNotExistsTemplate = {
   testsuite:{
      $: {
         name:"Mocha Tests",
         tests:"1",
         failures:"1",
         errors:"1"
      },
      testcase: [{
         $: {
            classname:"All tests",
            name:"Critical error report does not exists",
            time:"0"
         },
         failure: 'Critical error'
      }]
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
      this._store = config.store;
      this._workDir = config.workDir;
      this._testReports = new Map();
      this._argvOptions = this._getArgvOptions();
      this._testBranch = this._argvOptions.branch || this._argvOptions.rc || '';
      this._testRep = this._argvOptions.rep;
      this._unitModules = [];
      this._childProcessMap = [];
      this._rc = this._argvOptions.rc;
      this._modulesMap = new Map();
      this._dependTest = {};
      this._testList = undefined;
      if (!this._testRep) {
         throw new Error('Параметр --rep не передан');
      }
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
    * Возвращает список репозиториев для тестирования
    * @return {Array}
    * @private
    */
   _getTestList() {
      if (this._testList) {
         return this._testList;
      }

      let tests = [];
      if (this._testRep !== 'all') {
         tests = [this._testRep];
         let cfg = this._repos[this._testRep];
         let modules = this._getModulesWithDepend(this._getModulesFromMap(this._testRep));
         modules.forEach((name) => {
            let cfg = this._modulesMap.get(name);
            if (!tests.includes(cfg.rep)) {
               tests.push(cfg.rep);
            }
         });
      } else {
         tests = Object.keys(this._repos).filter((name) => {
            return !!this._repos[name].test;
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

   _getModulesWithDepend(modules) {
      let result = modules.slice();
      this._modulesMap.forEach(cfg => {
         if (!result.includes(cfg.name) && cfg.depends.some(dependName => result.includes(dependName))) {
            result.push(cfg.name);
         }
      });
      if (modules.length  !== result.length) {
         return this._getModulesWithDepend(result);
      }
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
            parser.parseString(xml_string, (error, result) => {
               if (error === null) {
                  result.testsuite.testcase.forEach((item) => {
                     item.$.classname = `[${name}]: ${item.$.classname}`;
                  });
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
            this._writeXmlFile(path, reportNotExistsTemplate)
         }
      });
      if (error.length > 0) {
         this.log(`Сгенерированы отчеты с ошибками: ${error.join(', ')}`);
      }
      this.log('Проверка пройдена успешно');
   }

   /**
    * Создает отчет с ошибкой
    * @param {String} path - путь до файла
    * @private
    */
   _createReport(path) {

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
      return options;
   }

   /**
    * возвращает набор интерфейсных модулей из репозитория
    * @param {String} name - название репозитория в конфиге
    * @return {Array}
    * @private
    */
   async _getModulesByRepName(name) {
      const cfg = this._repos[name];
      let allModules = this._findModulesInRepDir(name);
      let uiModules = await this._addToModulesMap(allModules);
      repModulesMap.set(name, uiModules);

      return uiModules.concat(cfg.modules || []);
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
            if (!this._modulesMap.has(cfg.name) && xmlObj.ui_module) {
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
      let testList = this._getTestList().slice();
      testList.forEach((name) => {
         builderConfig.modules.push({
            name: name + '_test',
            path: ['.', this._store, name, name + '_test'].join('/')
         });

         let modules = this._getModulesFromMap(name);
         modules = modules.concat(this._repos[name].modules || []);

         modules.forEach((modulePath) => {
            const moduleName = this._getModuleNameByPath(modulePath);
            if (moduleName !== 'unit') {
               const isNameInConfig = builderConfig.modules.find((item) => (item.name == moduleName));
               if (!isNameInConfig) {
                  builderConfig.modules.push({
                     name: moduleName,
                     path: ['.', this._store, name, 'module', moduleName].join('/')
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
      cfg.tests = name + '_test';

      cfg.htmlCoverageReport = cfg.htmlCoverageReport.replace('${module}', fullName);
      cfg.jsonCoverageReport = cfg.jsonCoverageReport.replace('${module}', fullName);
      cfg.report = cfg.report.replace('${module}', fullName );
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
            let cfg = this._getTestConfig(name, '_node');
            fs.outputFileSync(`./testConfig_${name}.json`, JSON.stringify(cfg, null, 4));
            if (this._repos[name].unitInBrowser) {
               let cfg = this._getTestConfig(name, '_browser');
               cfg.url.port = configPorts.shift() || defaultPort++;
               fs.outputFileSync(`./testConfig_${name}InBrowser.json`, JSON.stringify(cfg, null, 4));
            }
            resolve();
         });
      }));
   }

   /**
    * инициализирует рабочую директорию: запускает билдер, копирует тесты
    * @return {Promise<void>}
    */
   async initWorkDir() {
      this.log(`Подготовка тестов`);
      let pathToCfg = path.join(process.cwd(), 'builderConfig.json');
      try {
         await this._makeBuilderConfig();
         await this._execute(
            `node node_modules/gulp/bin/gulp.js --gulpfile=node_modules/sbis3-builder/gulpfile.js build --config=${pathToCfg}`,
            __dirname,
            true,
            'builder'
         );
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
   _tslibInstall() {
      return this._execute(
         `node node_modules/saby-typescript/install.js --tslib=application/WS.Core/ext/tslib.js`,
         __dirname,
         true,
         'typescriptInstall'
      );
   }

   /**
    * запускает тесты в браузере
    * @param {String} name - название репозитория в конфиге
    * @return {Promise<void>}
    * @private
    */
   async _startBrowserTest(name) {
      let cfg = this._repos[name];
      if (cfg.unitInBrowser && name !== 'engine') {
         this.log(`Запуск тестов в браузере`, name);
         await this._execute(
            `node node_modules/saby-units/cli.js --browser --report --config="./testConfig_${name}InBrowser.json"`,
            __dirname,
            true,
            `test browser ${name}`
         );
         this.log(`тесты в браузере завершены`, name);
      }
   }

   /**
    * Запускает тестирование
    * @return {Promise<void>}
    */
   async startTest() {
      await this._makeTestConfig();
      await this._tslibInstall();
      await pMap(this._getTestList(), (name) => {
         this.log(`Запуск тестов`, name);
         return Promise.all([
            this._execute(
               `node node_modules/saby-units/cli.js --isolated --report --config="./testConfig_${name}.json"`,
               __dirname,
               true,
               `test node ${name}`
            ),
            this._startBrowserTest(name)
         ]);
      },{
         concurrency: 4
      });
   }

   /**
    * инициализация хранилища, клонирует необходимые рапозитории из гита, либо копирует из переданной папки
    * @return {Promise<void>}
    */
   async initStore() {
      this.log(`Инициализация хранилища`);
      try {
         await fs.remove(this._workDir);
         await fs.remove('builder-ui');
         await fs.remove(this._store);
         await fs.mkdirs(path.join(this._store, reposStore));
         await Promise.all(Object.keys(this._repos).map((name) => {
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
               const pathLink =  path.join(this._workDir, this._repos[name].linkFolders[pathOriginal]);
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
         await fs.ensureSymlink(path.join(reposPath, cfg.test), path.join(this._store, name, name + '_test'));
      }
      const modules = await this._getModulesByRepName(name);

      return Promise.all(modules.map((module => {
         this.log(`копирование модуля ${name}/${module}`, name);
         if (this._getModuleNameByPath(module) == 'unit') {
            this._unitModules.push(path.join(reposPath, module));
         } else {
            return fs.ensureSymlink(path.join(reposPath, module), path.join(this._store, name, 'module', this._getModuleNameByPath(module))).catch((e) => {
               throw new Error(`Ошибка при копировании репозитория ${name}: ${e}`);
            });
         }
      })));
   }

   /**
    * переключает репозиторий на нужную ветку
    * @param {String} name - название репозитория в конфиге
    * @param {String} checkoutBranch - ветка на которую нужно переключиться
    * @param {String} pathToRepos - путь до репозитория
    * @return {Promise<void>}
    */
   async checkout(name, checkoutBranch, pathToRepos) {
      if (!checkoutBranch) {
         throw new Error(`Не удалось определить ветку для репозитория ${name}`);
      }
      try {
         this.log(`Переключение на ветку ${checkoutBranch}`, name);
         await this._execute(`git checkout ${checkoutBranch}`, pathToRepos, `checkout ${name}`);
      } catch (err) {
         throw new Error(`Ошибка при переключение на ветку ${checkoutBranch} в репозитории ${name}: ${e}`);
      }
      if (name === this._testRep) {
         this.log(`Попытка смержить ветку "${checkoutBranch}" с "${this._rc}"`, name);
         try {
            await this._execute(`git merge origin/${this._rc}`, pathToRepos, `merge ${name}`);
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
      try {
         this.log(`git clone ${this._repos[name].url}`, name);

         await this._execute(`git clone ${this._repos[name].url} ${name}`, path.join(this._store, reposStore), `clone ${name}`);

         return path.join(this._store, reposStore, name);
      } catch (err) {
         throw new Error(`Ошибка при клонировании репозитория ${name}: ${err}`);
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
      if (this._argvOptions[name]) {
         if (fs.existsSync(this._argvOptions[name])) {
            return this.copyRepToStore(this._argvOptions[name], name);
         } else {
            return this.checkout(
               name,
               this._argvOptions[name],
               await this.cloneRepToStore(name, this._argvOptions[name])
            );
         }
      } else {
         const branch = name === this._testRep ? this._testBranch : this._rc;
         return this.checkout(
            name,
            branch,
            await this.cloneRepToStore(name)
         );
      }
   }

   /**
    * Копирует юнит тесты
    * @private
    */
   _copyUnit() {
      this._unitModules.forEach((source) => {
         walkDir(source, (filePath) => {
            if (!filePath.includes('.test.')) {
               fs.copySync(path.join(source, filePath), path.join(this._workDir, 'unit', filePath));
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
         });

         cloneProcess.on('exit', (code) => {
            this._childProcessMap.splice(this._childProcessMap.indexOf(cloneProcess), 1);
            if (force || !code && !cloneProcess.withErrorKill) {
               resolve();
            } else {
               reject();
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



