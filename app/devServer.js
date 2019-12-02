const fs = require('fs-extra');
const path = require('path');
const Shell = require('./util/shell');
const Sdk = require('./util/sdk');
const logger = require('./util/logger');
const Project = require('./xml/project');

const DEFAULT_PORT = 2001;
const DB_CONNECTION = {
   host: 'localhost',
   port: 5432,
   login: 'postgres',
   password: 'postgres',
   dbName: 'intest'
};

/**
 * Класс для управления локальным сервером
 * @class DevServer
 * @autor Ганшин Я.О.
 */

class DevServer {
   constructor(cfg) {
      this._shell = new Shell();
      this._workDir = cfg.workDir;
      this._host = cfg.host || 'localhost';
      this._port = cfg.port || DEFAULT_PORT;
      this._store = cfg.store;
      this._rc = cfg.rc;
      this._project = new Project({
         file: cfg.project
      });
      this._workspace = cfg.workspace;
      this._dbSchema = cfg.dbSchema;
      this._dbConnection = {
         host: DB_CONNECTION.host || cfg.dbHost,
         dbName: DB_CONNECTION.dbName || cfg.dbName,
         login: DB_CONNECTION.login || cfg.dbLogin,
         password: DB_CONNECTION.password || cfg.dbPassword,
         port: DB_CONNECTION.port || cfg.dbPort
      };
   }

   /**
    * Запускает сервер
    * @returns {Promise<void>}
    */
   async start() {
      await this._linkCDN();
      await this._copyServiceIni(path.join(this._workDir, await this._getServicePath()));
      await this._copyServiceIni(path.join(this._workDir, await this._getServicePathPS()));

      await Promise.all([
         this._start(await this._getServicePath()),
         this._start(await this._getServicePathPS()),
      ]);
   }

   /**
    * Останавливает сервер
    * @returns {Promise<void>}
    */
   async stop() {
      await Promise.all([
         this._stop(await this._getServicePath()),
         this._stop(await this._getServicePathPS())
      ]);
   }

   /**
    * Запускает конвертацию бд
    * @returns {Promise<void>}
    */
   async convertDB() {
      const sdk = new Sdk({
         rc: this._rc,
         workspace: this._workspace
      });
      const dbSchema = await this._getDBShema();
      await this._prepareConvertCfg(dbSchema);
      await sdk.jinneeConvert(dbSchema, this._project.file);
   }

   /**
    * Запускает сервис
    * @param {String} name Название сервиса который нужно остановить
    * @private
    */
   async _start(name) {
      try {
         await this._shell.execute(
            `${this._workDir}/${name}/sbis-daemon --name "${name}" --library` +
            `"libsbis-rpc-service300.so" --ep "FcgiEntryPoint" start --http--port ${this._port}`,
            process.cwd()
         );
      } catch(e) {
         logger.error(e);
         throw e;
      }
   }

   /**
    * Останавливает сервис
    * @param {String} name Название сервиса который нужно остановить
    * @private
    */
   async _stop(name) {
      try {
         this._shell.execute(
            `${this._workDir}/${name}/sbis-daemon --name "${name}" stop`,
            process.cwd()
         );
      } catch(e) {
         logger.error(e);
         throw e;
      }
   }

   /**
    * Линкует cdn в корень сервиса
    * @returns {Promise<*>}
    * @private
    */
   async _linkCDN() {
      const service = await this._getServicePathPS();
      return fs.ensureSymlink(path.join(this._store, 'cdn'), path.join(this._workDir, service, 'ui', 'cdn'));
   }

   /**
    * Заменяет константы в конфиге конвертации
    * @param {String} filePath путь до конфига
    * @returns {Promise<void>}
    * @private
    */
   async _prepareConvertCfg(filePath) {
      let cfgString = await fs.readFile(filePath, 'utf8');
      cfgString = cfgString.replace(/{host}/g, this._dbConnection.host);
      cfgString = cfgString.replace(/{login}/g, this._dbConnection.login);
      cfgString = cfgString.replace(/{db_name}/g, this._dbConnection.dbName);
      cfgString = cfgString.replace(/{password}/g, this._dbConnection.password);
      cfgString = cfgString.replace(/{port}/g, this._dbConnection.port);
      await fs.outputFile(filePath, cfgString);
   }

   /**
    * Копирует ini файлы в сервис
    * @param service Директория в которой развернут сервис
    * @returns {Promise<void>}
    * @private
    */
   async _copyServiceIni(service) {
      let cfgString = await fs.readFile(path.join(process.cwd(), '/resources/sbis-rpc-service.base.ini'), 'utf8');
      cfgString = cfgString.replace(/{dbHost}/g, this._dbConnection.host);
      cfgString = cfgString.replace(/{dbLogin}/g, this._dbConnection.login);
      cfgString = cfgString.replace(/{dbName}/g, this._dbConnection.dbName);
      cfgString = cfgString.replace(/{dbPassword}/g, this._dbConnection.password);
      cfgString = cfgString.replace(/{dbPort}/g, this._dbConnection.port);
      cfgString = cfgString.replace(/{host}/g, this._host);
      cfgString = cfgString.replace(/{port}/g, this._port);
      await fs.outputFile(path.join(service, 'sbis-rpc-service.ini'), cfgString);
   }

   /**
    * Возвращет путь до схемы бд
    * @returns {Promise<*>}
    * @private
    */
   async _getDBShema() {
      if (!this._dbSchema) {
         const projectDir = path.dirname(this._project.file);
         const name = await this._project.getName();
         this._dbSchema = path.join(projectDir, `${name}.dbschema`);
      }
      return this._dbSchema;
   }

   /**
    * Возвращает название основного сервиса
    * @returns {Promise<string>}
    * @private
    */
   async _getServicePath() {
      return (await this._project.getName()).toLocaleLowerCase();
   }

   /**
    * Возвращает название сервиса представлений
    * @returns {Promise<string>}
    * @private
    */
   async _getServicePathPS() {
      const service = await this._getServicePath();
      return `${service}-ps`;
   }
}

module.exports = DevServer;
