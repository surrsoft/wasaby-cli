#!/usr/bin/env node

const path = require('path');

const Store = require('./app/store');
const Build = require('./app/build');
const Test = require('./app/test');
const DevServer = require('./app/devServer');
const config = require('./app/util/config');
const logger = require('./app/util/logger');
const app = require('./app/app');

const ERROR_CODE = 2;
const LOG_FOLDER = 'log';
/**
 * Модуль для запуска юнит тестов
 * @class Cli
 * @author Ганшин Я.О.
 */

class Cli {
   constructor() {
      this._argvOptions = Cli._getArgvOptions();
      const cfg = config.get(this._argvOptions);
      this._reposConfig = cfg.repositories;

      this._store = this._argvOptions.store || path.join(__dirname, cfg.store);

      // на _repos остались завязаны srv и скрипт сборки пока это не убрать
      this._store = path.join(this._store, '_repos');
      this._rc = this._argvOptions.rc || cfg.rc;
      this._workDir = this._argvOptions.workDir || path.join(process.cwd(), cfg.workDir);
      this._workspace = this._argvOptions.workspace || this._workDir;
      this.tasks = this._argvOptions.tasks ? this._argvOptions.tasks.split(',') : ['initStore', 'build', 'startTest'];
      this._only = !!this._argvOptions.only;

      logger.logFile = path.join(this._argvOptions.workspace || __dirname, LOG_FOLDER, `test-cli-${this.tasks.join('_')}.log`);

      if (this._argvOptions.rep) {
         this._testRep = this._argvOptions.rep.split(',').map(name => name.trim())
      } else if (cfg.testRep) {
         this._testRep = cfg.testRep;
         this._only = true;
      } else {
         this._testRep = 'all';
      }

      if (this._argvOptions.projectDir || this._argvOptions.project) {
         this._buildTools = 'jinnee';

         // если сборка идет джином то исходники лежат в  intest-ps/ui/resources
         this._resources = path.join(this._workDir, 'intest-ps', 'ui', 'resources');
         this._realResources = path.join(this._workDir, 'build-ui', 'resources');
         this._projectPath = this._argvOptions.projectDir ? path.join(this._argvOptions.projectDir, 'InTest.s3cld') : '';
         this._projectPath = this._argvOptions.project || this._projectPath;
      } else {
         this._buildTools = 'builder';
         this._resources = this._workDir;
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
      if (this.tasks.includes('devServer')) {
         await this.devServer();
      }
      if (this.tasks.includes('app')) {
         await this.app();
      }
   }

   async build() {
      const build = new Build({
         builderCache: this._argvOptions.builderCache || path.join(this._workDir, 'builder-json-cache'),
         projectPath: this._projectPath,
         rc: this._rc,
         reposConfig: this._reposConfig,
         resources: this._resources,
         store: this._store,
         testRep: this._testRep,
         buildTools: this._buildTools,
         workDir: this._workDir,
         workspace: this._workspace,
         builderBaseConfig: this._argvOptions.builderConfig,
         only: this._only,
         pathToJinnee: this._argvOptions.pathToJinnee,
         argvOptions: this._argvOptions
      });

      await build.run();
   }

   async initStore() {
      const store = new Store({
         argvOptions: this._argvOptions,
         rc: this._rc,
         reposConfig: this._reposConfig,
         store: this._store,
         testRep: this._testRep,
         only: this._only,
         projectPath: this._projectPath
      });

      await store.run();
   }

   async test() {
      const test = new Test({
         reposConfig: this._reposConfig,
         resources: this._resources,
         realResources: this._realResources,
         store: this._store,
         testRep: this._testRep,
         workDir: this._workDir,
         workspace: this._workspace,
         only: this._only,
         server: !!this._argvOptions.server,
         rc: this._rc,
         diff: this._argvOptions.diff,
         coverage: this._argvOptions.coverage,
         report: this._argvOptions.report,
         browser: this._argvOptions.browser,
         node: this._argvOptions.node
      });

      await test.run();
   }

   async devServer() {
      const devServer = new DevServer({
         workDir: this._workDir,
         store: this._store,
         rc: this._rc,
         port: this._argvOptions.port,
         project: this._argvOptions.project,
         workspace: this._workspace,
         dbHost: this._argvOptions.dbHost,
         dbName: this._argvOptions.dbName,
         dbLogin: this._argvOptions.dbLogin,
         dbPassword: this._argvOptions.dbPassword,
         dbPort: this._argvOptions.dbPort
      });

      if (this._argvOptions.start) {
         await devServer.start();
      } else if (this._argvOptions.stop) {
         await devServer.stop();
      } else if (this._argvOptions.convertDB) {
         await devServer.convertDB();
      } else if (this._argvOptions.createIni) {
         await devServer.createIni();
      }
   }

   app() {
      const cfg = config.get();
      const port =  this._argvOptions.port || cfg.port;

      return app.run(this._resources, port);
   }

   /**
    * Возвращает опции командной строки
    * @private
    */
   static _getArgvOptions() {
      const options = {};
      process.argv.slice(2).forEach((arg) => {
         if (arg.startsWith('--')) {
            const argName = arg.substr(2);
            const [name, value] = argName.split('=', 2);
            options[name] = value === undefined ? true : value;
         }
      });

      return options;
   }
}

module.exports = Cli;

// eslint-disable-next-line id-match
if (require.main.filename === __filename) {
   // Если файл запущен напрямую запускаем тестирование
   const cli = new Cli();
   cli.run().catch((e) => {
      logger.error(e);
      process.exit(ERROR_CODE);
   });
}
