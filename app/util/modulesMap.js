const path = require('path');
const pMap = require('p-map');
const xml = require('./xml');
const walkDir = require('./walkDir');

class ModulesMap {
   constructor(cfg) {
      this._reposConfig = cfg.reposConfig;
      this._store = cfg.store;
      this._testRep = cfg.testRep;
      this._modulesMap = new Map();
      this._testModulesMap = new Map();
   }

   /**
    * Возвращает конфиг модуля по имени
    * @param {String} name - Название модуля
    * @return {any}
    */
   get(name) {
      return this._modulesMap.get(name);
   }

   /**
    * Возвращает конфиг модуля по имени
    * @param {String} name - Название модуля
    * @param {any} value - Конфиг модуля
    */
   set(name, value) {
      this._modulesMap.set(name, value);
   }

   /**
    * Проверяет существование модуля
    * @param name - Название модуля
    * @return {boolean}
    */
   has(name) {
      return this._modulesMap.has(name);
   }

   /**
    * Перебирает модули из modulesMap
    * @param {function} callback
    */
   forEach(callback) {
      this._modulesMap.forEach(callback);
   }

   /**
    * Возвращает модули от которых зависят модули из переданного массива
    * @param {Array} modules - Массив с наваниями модулей
    * @return {Array}
    */
   getParentModules(modules) {
      let result = modules.slice();
      this._modulesMap.forEach(cfg => {
         if (
            cfg.forTests && !result.includes(cfg.name) &&
            cfg.depends.some(dependName => result.includes(dependName))
         ) {
            result.push(cfg.name);
         }
      });
      if (modules.length  !== result.length) {
         return this.getParentModules(result);
      }
      return result;
   }

   /**
    * Возращает все зависимости переданных модулей
    * @param {Array} modules - Массив с наваниями модулей
    * @param {Array} traverse - массив содеражащий текущий путь рекурсии
    * @return {Array}
    */
   getChildModules(modules, traverse) {
      let result = [];
      traverse = traverse || [];
      modules.forEach(name => {
         if (this._modulesMap.has(name) && !traverse.includes(name)) {
            let cfg = this._modulesMap.get(name);
            let depends = this.getChildModules(cfg.depends, traverse.concat([name]));
            result.push(name);
            result = result.concat(depends.filter((item) => !result.includes(item)));
         }
      });
      return result;
   }

   /**
    * Возвращает список репозиториев для тестирования
    * @return {Array}
    */
   getTestList() {
      if (this._testList) {
         return this._testList;
      }
      let tests = [];
      if (!this._testRep.includes('all')) {
         this._testRep.forEach((testRep) => {
            let modules = this.getParentModules(this.getTestModulesWithDepends(testRep));
            tests.push(testRep);
            modules.forEach((name) => {
               let cfg = this._modulesMap.get(name);
               if (!tests.includes(cfg.rep)) {
                  tests.push(cfg.rep);
               }
            });
         });
      } else {
         this._testModulesMap.forEach((modules, rep) => {
            tests.push(rep);
         });
      }
      return this._testList = tests;
   }

   /**
    * Возвращает список модулей содержащих юнит тесты и его зависимости
    * @return {Array}
    */
   getTestModulesWithDepends(name) {
      let result = [];
      this._testModulesMap.get(name).forEach((moduleName) => {
         let cfg = this._modulesMap.get(moduleName);
         result = result.concat(cfg.depends || []).filter((depend) => {
            return !!this._modulesMap.get(depend).forTests;
         });
         result.push(moduleName);
      });
      return result;
   }

   /**
    * Возвращает список модулей содержащих юнит тесты
    * @param name
    * @return {Array}
    */
   getTestModules(name) {
      return this._testModulesMap.get(name) || [];
   }

   /**
    * Возвращает список модулей по репозиторию
    * @param name
    * @return {Array}
    */
   getModulesByRep(repName) {
      let moduels = [];
      this._modulesMap.forEach(cfg => {
         if (cfg.rep === repName) {
            moduels.push(cfg.name);
         }
      });
      return moduels;
   }

   /**
    * Запускает инициализацию modulesMap
    * @return {Promise<void>}
    */
   async build() {
      let modules = this._findModulesInStore();
      await this._addToModulesMap(modules);
      this._markModulesForTest();
   }

   /**
    * Ищет модули в репозитории по s3mod
    * @param {String} name - название репозитория в конфиге
    * @return {Array}
    * @private
    */
   _findModulesInStore() {
      let s3mods = [];
      Object.keys(this._reposConfig).forEach(name => {
         walkDir(path.join(this._store, name), (filePath) => {
            if (filePath.includes('.s3mod')) {
               let splitFilePath = filePath.split(path.sep);
               splitFilePath.splice(-1, 1);
               let modulePath = path.join.apply(path, splitFilePath);
               let moduleName = splitFilePath[splitFilePath.length - 1];
               s3mods.push({
                  modulePath: filePath,
                  name: moduleName,
                  path: modulePath,
                  rep: name
               });
            }
         });
      });
      return s3mods;
   }

   /**
    * Добавляет модули в modulesMap
    * @param {Array} modules - массив с конфигами модулей
    * @return {Promise<void>}
    * @private
    */
   async _addToModulesMap(modules) {
      await pMap(modules, (cfg) => {
         return xml.readXmlFile(path.join(this._store, cfg.rep, cfg.modulePath)).then((xmlObj) => {
            if (!this._modulesMap.has(cfg.name) && xmlObj.ui_module) {
               cfg.depends = [];
               if (xmlObj.ui_module.depends && xmlObj.ui_module.depends[0]) {
                  let depends = xmlObj.ui_module.depends[0];
                  if (depends.ui_module) {
                     depends.ui_module.forEach((item) => {
                        cfg.depends.push(item.$.name);
                     });
                  }
                  if (depends.module) {
                     depends.module.forEach((item) => {
                        cfg.depends.push(item.$.name);
                     });
                  }
               }
               if (xmlObj.ui_module.unit_test) {
                  let testModules = this._testModulesMap.get(cfg.rep) || [];
                  testModules.push(cfg.name);
                  this._testModulesMap.set(cfg.rep, testModules);
               }
               this._modulesMap.set(cfg.name, cfg);
            }
         });
      }, {
         concurrency: 4
      });
   }

   /**
    * Помечает модули используемые для тестов
    * @private
    */
   _markModulesForTest() {
      Object.keys(this._reposConfig).forEach(name => {
         if (this._testModulesMap.has(name)) {
            let modules = this._testModulesMap.get(name);
            modules.forEach((testModuleName) => {
               let testModuleCfg = this._modulesMap.get(testModuleName);
               testModuleCfg.depends.forEach((moduleName) => {
                  let cfg = this._modulesMap.get(moduleName);
                  if (cfg && cfg.rep === name) {
                     cfg.forTests = true;
                     this._modulesMap.set(moduleName, cfg);
                  }
               });
            });
         }
      });
   }
}

module.exports = ModulesMap;
