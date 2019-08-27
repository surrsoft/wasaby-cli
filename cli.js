

// const reposStore = '_repos';
//
// const pMap = require('p-map');
// const geniePath = 'tools/jinnee';
const resourcesPath = 'intest-ps/ui/resources';

const path = require('path');
const CONFIG = './config.json';

const Store = require('./app/store');
const Build = require('./app/build');
const Test = require('./app/test');

/**
 * Модуль для запуска юнит тестов
 * @class Cli
 * @author Ганшин Я.О.
 */
class Cli {
   constructor() {
      let config = require(CONFIG);
      this._repos = config.repositories;
      this._argvOptions = this._getArgvOptions();
      this._store = this._argvOptions.store || path.join(process.cwd(), config.store);
      this._testRep = this._argvOptions.rep.split(',');
      this._workDir = this._argvOptions.workDir || path.join(process.cwd(), config.workDir);
      this._workspace = this._argvOptions.workspace || './application';
      // this._testReports = new Map();
      //
      //
      // this._resources = ;
      // this._projectDir = this._argvOptions.projectDir;
      //
      // this._testBranch = this._argvOptions.branch || this._argvOptions.rc || '';
      //
      //
      // this._unitModules = [];
      // this._testErrors = {};
      //
      //
      // this._modulesMap = new Map();
      // this._withBuilder = false;
      // this._testModulesMap = new Map();
      // this._testList = undefined;
      //this._buiderCfg = path.join(process.cwd(), 'builderConfig.json');
   }

   /**
    * Запускает сборку юнит тестов
    * @return {Promise<void>}
    */
   async run() {
      try {
         await this.initStore();
         await this.build();
         await this.test();

         //this.log('Закончили тестирование');
      } catch(e) {
         //await this._closeChildProcess();
         //this.prepareReport();
         //this.log(`Тестирование завершено с ошибкой ${e}`);
         throw e;
      }
   }
   async build() {
      let build = new Build({
         store: this._store,
         repos: this._repos,
         testRep: this._testRep,
         withBuilder: true,
         resources: path.join(this._workDir, 'application')
      });

      await build.run();
   }

   async initStore() {
      let store = new Store({
         store: this._store,
         argvOptions: this._argvOptions,
         repos: this._repos,
         rc: this._argvOptions.rc,
         testRep: this._testRep
      });

      await store.run();
   }

   async test() {
      let test = new Test({
         store: this._store,
         repos: this._repos,
         testRep: this._testRep,
         ports: this._argvOptions.ports || '',
         workDir: this._workDir,
         workspace: this._workspace,
         resources: path.join(this._workDir, 'application')
      });

      await test.run();
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



