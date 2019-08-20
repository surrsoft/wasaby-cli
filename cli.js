

// const reposStore = '_repos';
// const builderConfigName = 'builderConfig.json';
// const pMap = require('p-map');
// const geniePath = 'tools/jinnee';
// const resourcesPath = 'intest-ps/ui/resources';
// const BROWSER_SUFFIX = '_browser';
// const NODE_SUFFIX = '_node';
const path = require('path');
const CONFIG = './config.json';

const Store = require('./app/store');
const Build = require('./app/build');


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

let getModuleTemplate = (name, id) => {
   return {
      ui_module:{
         $: {
            name: name,
            id: id,
         },
         description: 'test module'
      }
   };
};

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
      // this._testReports = new Map();
      //
      //
      // this._resources = ;
      // this._projectDir = this._argvOptions.projectDir;
      //
      // this._testBranch = this._argvOptions.branch || this._argvOptions.rc || '';
      //
      // this._workspace = this._argvOptions.workspace || './application';
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
         //await this.initStore();
         await this.build();
         // await this.startTest();
         // this.checkReport();
         // this.prepareReport();
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
         resources: path.join(this._workDir, resourcesPath)
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

      await store.init();
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



