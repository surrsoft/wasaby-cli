const path = require('path');

const Store = require('./app/store');
const Build = require('./app/build');
const Test = require('./app/test');
const config = require('./app/util/config');
const logger = require('./app/util/logger');
/**
 * Модуль для запуска юнит тестов
 * @class Cli
 * @author Ганшин Я.О.
 */
class Cli {
   constructor() {
      const cfg = config.get();
      this._reposConfig = cfg.repositories;
      this._argvOptions = this._getArgvOptions();
      this._store = this._argvOptions.store || path.join(__dirname, cfg.store);
      //на _repos остались завязаны srv и скрипт сборки пока это не убрать
      this._store = path.join(this._store, '_repos');
      this._testRep = this._argvOptions.rep ? this._argvOptions.rep.split(',').map(name => name.trim()) : cfg.testRep;
      this._rc = this._argvOptions.rc || cfg.rc;
      this._workDir = this._argvOptions.workDir || path.join(process.cwd(), cfg.workDir);
      this._workspace = this._argvOptions.workspace || './application';
      this.tasks = this._argvOptions.tasks ? this._argvOptions.tasks.split(',') : ['initStore', 'build', 'startTest'];
      if (this._argvOptions.withBuilder || this._argvOptions.builderCfg) {
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
         builderCache: this._argvOptions.builderCache || 'builder-json-cache',
         projectDir: this._argvOptions.projectDir,
         rc: this._rc,
         reposConfig: this._reposConfig,
         resources: this._resources,
         store: this._store,
         testRep: this._testRep,
         withBuilder: !!this._argvOptions.withBuilder,
         workDir: this._workDir,
         workspace: this._workspace,
         baseBuilderCfg: this._argvOptions.builderCfg
      });

      await build.run();
   }

   async initStore() {
      let store = new Store({
         argvOptions: this._argvOptions,
         rc: this._rc,
         reposConfig: this._reposConfig,
         store: this._store,
         testRep: this._testRep
      });

      await store.run();
   }

   async test() {
      let test = new Test({
         ports: this._argvOptions.ports || '',
         reposConfig: this._reposConfig,
         resources: this._resources,
         store: this._store,
         testRep: this._testRep,
         workDir: this._workDir,
         workspace: this._workspace
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

      // if (!options.rep) {
      //    throw new Error('Параметр --rep не передан');
      // }

      return options;
   }
}

module.exports = Cli;

if (require.main.filename === __filename) {
   //Если файл запущен напрямую запускаем тестирование
   let cli = new Cli();
   cli.run().catch((e) => {
      logger.error(e);
      process.exit(2);
   });
}
