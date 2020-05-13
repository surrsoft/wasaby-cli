const fs = require('fs-extra');
const path = require('path');
const logger = require('./util/logger');
const Base = require('./base');
const walkDir = require('./util/walkDir');

const INDEX_FILE_NAME = 'Index.js';
const INDEX_TEMPLATE_PATH = path.normalize(path.join(__dirname, '../resources/index.html'));
const jsFile = /^[^.]*\.js$/

const DEFAULT_URL = '/:moduleName/app/:app';

/**
 * Класс отвечающий за генерацию разводящей страницы
 * @author Ганшин Я.О
 */

class CreateIndex extends Base {
   constructor(cfg) {
      super(cfg);
      this._moduleName = cfg.moduleName;
      this._resources = cfg.resources;
      this._contents = {};
      this._urlTemplate= DEFAULT_URL.replace(':moduleName', this._moduleName);
   }

   async _run() {
      try {
         logger.log('Генерация index.html');
         this._findLinks();
         this._makeIndex();
         logger.log('index.html сгенерирован успешно');
      } catch (e) {
         e.message = `Сборка ресурсов завершена с ошибкой: ${e.message}`;
         throw e;
      }
   }

   _findLinks() {
      const modulePath = path.join(this._resources, this._moduleName);

      if (!fs.existsSync(modulePath)) {
         throw new Error(`Не найдет модуль ${this._moduleName} по пути ${modulePath}`);
      }

      walkDir(modulePath, (filePath) => {
         if (CreateIndex.shouldIncludeToMenu(filePath)) {
            const preparedPath = filePath.replace('.js', '');
            CreateIndex.setContetns(preparedPath.split(path.sep), this._contents);
         }
      });
   }

   _makeIndex() {
      let htmlContetns = ['', '', ''];
      let count = 0;
      for (let name of Object.keys(this._contents)) {
         let list = '';
         for (let item of CreateIndex.getContentsList(this._contents[name])) {
            let componentName = [name].concat(item).join('/');
            list += `<li>${this._getLink(componentName)}</li>`;
         }
         htmlContetns[ count % htmlContetns.length ] += `<div class="contents-block"><h2>${name}</h2><ul>${list}</ul></div>`;
         count++;
      }

      let index = fs.readFileSync(INDEX_TEMPLATE_PATH, 'utf8');
      for (let i = 0; i < htmlContetns.length; i++) {
         index = index.replace('${contents' + (i + 1) + '}', htmlContetns[i]);
      }

      fs.outputFileSync(path.join(this._resources, 'index.html'), index);
   }

   _getLink(name) {
      let url = this._urlTemplate;
      let app = [this._moduleName, name].join('/');
      return `<a href="${url.replace(':app', encodeURIComponent(app))}">${name}</a>`
   }

   static getContentsList(contents, path = []) {
      let list = [];
      for (let name of Object.keys(contents)) {
         if (Object.keys(contents[name]).length > 0) {
            list = list.concat(CreateIndex.getContentsList(contents[name], path.concat(name)));
         } else {
            list.push(path.concat(name).join('/'));
         }
      }
      return list
   }

   static shouldIncludeToMenu(filePath) {
      const splitPath = filePath.split(path.sep);
      const fileName = splitPath[splitPath.length - 1];
      const splitFileName = fileName.split('.');
      const clearFileName = splitFileName[0];

      return splitPath.some((name) => name[0] !== '_') && (
            fileName === INDEX_FILE_NAME ||
            (jsFile.test(fileName) && clearFileName === splitPath[splitPath.length - 2])
         );
   }

   static setContetns(path, contents) {
      let name = path[0];
      contents[name] = contents[name] || {};

      if (path.length > 1) {
         CreateIndex.setContetns(path.slice(1), contents[name]);
      }
   }

}

module.exports = CreateIndex;
