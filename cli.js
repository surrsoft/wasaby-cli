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
      this._reposConfig = config.repositories;
      this._argvOptions = this._getArgvOptions();
      this._store = this._argvOptions.store || path.join(process.cwd(), config.store);
      this._store = path.join(this._store, '_repos');//на _repos остались завязаны srv и скрипт сборки пока это не убрать
      this._testRep = this._argvOptions.rep.split(',');
      this._workDir = this._argvOptions.workDir || path.join(process.cwd(), config.workDir);
      this._workspace = this._argvOptions.workspace || './application';
      this.tasks = this._argvOptions.tasks ?  this._argvOptions.tasks.split(',') : ['initStore', 'build', 'startTest'];
      if (this._argvOptions.withBuilder) {
         this._resources = path.join(this._workDir, 'application');
      } else {//если сборка идет джином то исходники лежат в  intest-ps/ui/resources
         this._resources = path.join(this._workDir, 'intest-ps', 'ui', 'resources');
      }
   }

   /**
    * Запускает сборку юнит тестов
    * @return {Promise<void>}
    */
   async run() {
      if (this.tasks.includes('initStore')) {
         await this.initStore();
      }
      if (this.tasks.includes('build')) {
         await this.build();
      }
      if (this.tasks.includes('startTest')) {
         await this.test();
      }
   }

   async build() {
      let build = new Build({
         store: this._store,
         reposConfig: this._reposConfig,
         rc: this._argvOptions.rc,
         testRep: this._testRep,
         workDir: this._workDir,
         projectDir: this._argvOptions.projectDir,
         withBuilder: !!this._argvOptions.withBuilder,
         builderCache: this._argvOptions.builderCache || 'builder-json-cache',
         workspace: this._workspace,
         resources: this._resources
      });

      await build.run();
   }

   async initStore() {
      let store = new Store({
         store: this._store,
         argvOptions: this._argvOptions,
         reposConfig: this._reposConfig,
         rc: this._argvOptions.rc,
         testRep: this._testRep
      });

      await store.run();
   }

   async test() {
      let test = new Test({
         store: this._store,
         reposConfig: this._reposConfig,
         testRep: this._testRep,
         ports: this._argvOptions.ports || '',
         workDir: this._workDir,
         workspace: this._workspace,
         resources: this._resources
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



