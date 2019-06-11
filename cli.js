const fs = require('fs-extra');
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
      this._testReports = [];
      this._argvOptions = this._getArgvOptions();
      this._testBranch = this._argvOptions.branch || this._argvOptions.rc || '';
      this._testModule = this._argvOptions.rep;
      this._unitModules = [];
      this._childProcessMap = [];
      this._rc = this._argvOptions.rc;

      if (!this._testModule) {
         throw new Error('Параметр --rep не передан');
      }

      this._testList = this._getTestList(this._testModule);
   }

   /**
    * Возвращает список репозиториев для тестирования
    * @param {String} name - название репозитория в конфиге или all - в этом случае вернет все модули
    * @return {Array}
    * @private
    */
   _getTestList(name) {
      if (name !== 'all') {
         let tests = [name];
         let cfg = this._repos[name];

         if (cfg.dependTest) {
            tests = tests.concat(cfg.dependTest);
         }
         return tests;
      }
      return Object.keys(this._repos).filter((name) => {
         return !!this._repos[name].test;
      });
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
         this.log('Закончили тестирование');
      } catch(e) {
         await this._closeChildProcess();
         this.log(`Тестирование завершено с ошибкой ${e}`);
         throw new Error(e);
      }
   }

   /**
    * Проверяет наличие отчетов по юнит тестам, если какого-то отчета нет кидает ошибку
    */
   checkReport() {
      let error = [];
      this._testReports.forEach(path => {
         if (!fs.existsSync(path)) {
            error.push(path);
         }
      });
      if (error.length > 0) {
         throw new Error(`Отчеты отсутствуют тесты не прошли: ${error.join(', ')}`);
      }
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
   _getModulesByRepName(name) {
      if (repModulesMap.has(name)) {
         return repModulesMap.get(name);
      }

      const cfg = this._repos[name];
      let modules = this._findModulesInRepDir(name).concat(cfg.modules || []);
      repModulesMap.set(name, modules);

      return modules;
   }

   /**
    * Ищет модули в репозитории по s3mod
    * @param {String} name - название репозитория в конфиге
    * @return {Array}
    * @private
    */
   _findModulesInRepDir(name) {
      let s3mods = [];
      let modulesDir = this._repos[name].modulesDir || '';
      walkDir(path.join(this._store, reposStore, name, modulesDir), (filePath) => {
         if (filePath.includes('.s3mod')) {
            filePath = filePath.split(path.sep);
            filePath.splice(-1, 1);
            modulesDir && filePath.unshift(modulesDir);
            let modulePath = path.join.apply(path, filePath);
            if (!s3mods.includes(modulePath)) {
               s3mods.push(modulePath);
            }
         }
      });
      return s3mods;
   }

   /**
    * Создает конфиг для билдера
    * @return {Promise<void>}
    * @private
    */
   _makeBuilderConfig() {
      let builderConfig = require('./builderConfig.base.json');
      let testList = this._testList;
      testList.forEach((name) => {
         const cfg = this._repos[name];
         if (cfg.dependOn) {
            cfg.dependOn.forEach((name) => {
               if (!testList.includes(name)) {
                  testList.push(name)
               }
            });
         }
      });
      testList.forEach((name) => {
         builderConfig.modules.push({
            name: name + '_test',
            path: ['.', this._store, name, name + '_test'].join('/')
         });

         const modules = this._getModulesByRepName(name);

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

   /**
    * Создает конфиги для юнит тестов
    * @param {String} name - название репозитория в конфиге
    * @return {Promise<[any, ...]>}
    * @private
    */
   _makeTestConfig(name) {
      let port = 10025;
      let configPorts = this._argvOptions.ports ? this._argvOptions.ports.split(',') : [];
      return Promise.all(this._testList.map((name, i) => {
         let testConfig = require('./testConfig.base.json');
         let cfg = Object.assign({}, testConfig);
         cfg.url.port = configPorts[i] ? configPorts[i] : port++;
         cfg.tests = name + '_test';
         cfg.report = cfg.report.replace('${module}', name);
         this._testReports.push(cfg.report);
         cfg.htmlCoverageReport = cfg.htmlCoverageReport.replace('${module}', name);
         cfg.jsonCoverageReport = cfg.jsonCoverageReport.replace('${module}', name);
         return fs.outputFile(`./testConfig_${name}.json`, JSON.stringify(cfg, null, 4));
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
            true
         );
         this._copyUnit();
         await this._linkFolder();
         this.log(`Подготовка тестов завершена успешно`);
      } catch(e) {
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
         true
      );
   }

   /**
    * запускает тесты в браузере
    * @param {String} name - название репозитория в конфиге
    * @return {Promise<void>}
    * @private
    */
   async _startBrowserTest(name) {
      this.log(`Запуск тестов ${name} в браузере`);
      let cfg = this._repos[name];
      if (cfg.unitInBrowser) {
         let cfg = fs.readJsonSync(`./testConfig_${name}.json`);
         let testConfig = fs.readJsonSync('./testConfig.base.json');
         testConfig = Object.assign({}, testConfig);
         cfg.report = testConfig.report.replace('${module}', name + '_browser');
         this._testReports.push(cfg.report);
         cfg.htmlCoverageReport = testConfig.htmlCoverageReport.replace('${module}', name + '_browser');
         cfg.jsonCoverageReport = testConfig.jsonCoverageReport.replace('${module}', name + '_browser');
         fs.outputFileSync(`./testConfig_${name}_browser.json`, JSON.stringify(cfg, null, 4));
         await this._execute(
            `node node_modules/saby-units/cli.js --browser --report --config="./testConfig_${name}_browser.json"`,
            __dirname,
            true
         );
         this.log(`тесты ${name} в браузере завершены`);
         if (!fs.existsSync(cfg.report)) {
            console.error(`${name}: отсутствует файл отчета ${cfg.report}`);
         }
      }
   }

   /**
    * Запускает тестирование
    * @return {Promise<void>}
    */
   async startTest() {
      await this._makeTestConfig();
      await this._tslibInstall();
      await pMap(this._testList, (name) => {
         this.log(`Запуск тестов ${name}`);
         return Promise.all([
            this._execute(
               `node node_modules/saby-units/cli.js --isolated --report --config="./testConfig_${name}.json"`,
               __dirname,
               true
            ),
            this._startBrowserTest(name)
         ]);
      },{
         concurrency: 1
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
      const modules = this._getModulesByRepName(name);

      return Promise.all(modules.map((module => {
         this.log(`копирование модуля ${name}/${module}`);
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
         this.log(`Переключение на ветку ${checkoutBranch} для репозитория ${name}`);
         await this._execute(`git checkout ${checkoutBranch}`, pathToRepos);
      } catch (err) {
         throw new Error(`Ошибка при переключение на ветку ${checkoutBranch} в репозитории ${name}: ${e}`);
      }
      if (name === this._testModule) {
         this.log(`Попытка смержить ветку "${checkoutBranch}" для репозитория "${name}" с "${this._rc}"`);
         try {
            await this._execute(`git merge origin/${this._rc}`, pathToRepos);
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
         this.log(`git clone ${this._repos[name].url}`);

         await this._execute(`git clone ${this._repos[name].url} ${name}`, path.join(this._store, reposStore));

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
         this.log(`Копирование репозитория ${name}`);

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
         const branch = name === this._testModule ? this._testBranch : this._rc;
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
   log(message) {
      console.log(message);
   }

   /**
    * Выполняет команду shell
    * @param {String} command - текст команды
    * @param {String} path - путь по которому надо выполнить команду
    * @param {Boolean} force - если true в случае ошибки вернет промис resolve
    * @return {Promise<any>}
    * @private
    */
   _execute(command, path, force) {
      return new Promise((resolve, reject) => {
         const cloneProcess = shell.exec(`cd ${path} && ${command}`, {
            silent: true,
            async: true
         });
         this._childProcessMap.push(cloneProcess);
         cloneProcess.stdout.on('data', (data) => {
            this.log(data);
         });

         cloneProcess.stderr.on('data', (data) => {
            this.log(data);
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



