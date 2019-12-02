const path = require('path');
const xml = require('./xml');

/**
 * Класс для работы c файлом проекта .s3cld
 * @class Project
 * @author Ганшин Я.О.
 */
class Project {
   constructor(cfg) {
      this.file = cfg.file;
   }

   /**
    * Возвращает xml объект файла проекта
    * @returns {Promise<*>}
    * @private
    */
   async _getProject() {
      if (!this._project) {
         this._project = await xml.readXmlFile(this.file);
      }
      return this._project;
   }

   /**
    * Возвращает название проекта
    * @returns {Promise<string>}
    */
   async getName() {
      if (!this._name) {
         const project = await this._getProject();
         this._name = project.cloud.$.name;
      }
      return this._name;
   }

   /**
    * Возвращает путь до s3deploy файла
    * @returns {Promise<string>}
    */
   async getDeploy() {
      const projectDir = path.dirname(this.file);
      const name = await this.getName();
      return path.join(projectDir, `${name}.s3deploy`);
   }

   /**
    * Возвращает массив файлов описаний s3srv
    * @returns {Promise<string>}
    */
   async getServices() {
      if (!this._srv) {
         this._srv = [];
         const projectDir = path.dirname(this.file);
         const project = await this._getProject();
         project.cloud.items[0].service.forEach((obj) => {
            let url = obj.$.url;
            this._srv.push(path.resolve(projectDir, url));
         });
      }
      return this._srv;
   }
}

module.exports = Project;