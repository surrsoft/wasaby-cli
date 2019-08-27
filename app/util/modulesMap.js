const path = require('path');
const pMap = require('p-map');
const xml = require('./xml');
const walkDir = require('./walkDir');

class ModulesMap {
   constructor(cfg) {
      this._repos = cfg.repos;
      this._store = cfg.store;
      this._testRep = cfg.testRep;
      this._modulesMap = new Map();
      this._testModulesMap = new Map();
   }


   get(name) {
      return this._modulesMap.get(name);
   }

   set(name, value) {
      this._modulesMap.set(name, value);
   }

   forEach(callback) {
      this._modulesMap.forEach(callback);
   }

   getParentModules(modules) {
      let result = modules.slice();
      this._modulesMap.forEach(cfg => {
         if (cfg.forTests && !result.includes(cfg.name) && cfg.depends.some(dependName => result.includes(dependName))) {
            result.push(cfg.name);
         }
      });
      if (modules.length  !== result.length) {
         return this.getParentModules(result);
      }
      return result;
   }

   getChildModules(modules, path) {
      let result = [];
      path = path || [];
      modules.forEach(name => {
         if (this._modulesMap.has(name) && !path.includes(name)) {
            let cfg = this._modulesMap.get(name);
            let depends = this.getChildModules(cfg.depends, path.concat([name]));
            result.push(name);
            result = result.concat(depends.filter((item) => !result.includes(item)));
         }
      });
      return result;
   }
   /**
    * Возвращает список репозиториев для тестирования
    * @param {string} name - Название репозитория в конфиге
    * @return {Array}
    * @private
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
    * Возвращает список модулей содержащих юнит тесты
    * @return {Array}
    * @private
    */
   getTestModulesWithDepends(name) {
      let result = [];
      this._testModulesMap.get(name).forEach((moduleName) => {
         let cfg = this._modulesMap.get(moduleName);
         result = result.concat(cfg.depends || []).filter((name) => {
            return !!this._modulesMap.get(name).forTests
         });
         result.push(moduleName);
      });
      return result;
   }

   getTestModules(name) {
      return this._testModulesMap.get(name) || [];
   }

   getModulesByRep(repName) {
      let moduels = [];
      this._modulesMap.forEach(cfg => {
         if (cfg.rep == repName) {
            moduels.push(cfg.name);
         }
      });
      return moduels;
   }

   async build() {
      let modules = this._findModulesInStore();
      await this._addToModulesMap(modules);
   }

   /**
    * Ищет модули в репозитории по s3mod
    * @param {String} name - название репозитория в конфиге
    * @return {Array}
    * @private
    */
   _findModulesInStore() {
      let s3mods = [];
      Object.keys(this._repos).forEach(name => {
         walkDir(path.join(this._store, name), (filePath) => {
            if (filePath.includes('.s3mod')) {
               let splitFilePath = filePath.split(path.sep);
               splitFilePath.splice(-1, 1);
               let modulePath = path.join.apply(path, splitFilePath);
               let moduleName = splitFilePath[splitFilePath.length - 1];
               s3mods.push({
                  name: moduleName,
                  rep: name,
                  path: modulePath,
                  modulePath: filePath
               });
            }
         });
      });
      return s3mods;
   }

   async _addToModulesMap(modules) {
      let addedModules = [];
      await pMap(modules, (cfg) => {
         return xml.readXmlFile(path.join(this._store, cfg.rep, cfg.modulePath)).then((xmlObj) => {
            if (!this._modulesMap.has(cfg.name) && xmlObj.ui_module) {
               cfg.depends = [];
               if (xmlObj.ui_module.depends && xmlObj.ui_module.depends[0]) {
                  let depends = xmlObj.ui_module.depends[0];
                  if (depends.ui_module) {
                     depends.ui_module.forEach(function (item) {
                        cfg.depends.push(item.$.name);
                     })
                  }
                  if (depends.module) {
                     depends.module.forEach(function (item) {
                        cfg.depends.push(item.$.name);
                     })
                  }
               }
               if (xmlObj.ui_module.unit_test) {
                  let testModules = this._testModulesMap.get(cfg.rep) || [];
                  testModules.push(cfg.name);
                  this._testModulesMap.set(cfg.rep, testModules);
               }
               addedModules.push(cfg.path);
               this._modulesMap.set(cfg.name, cfg);
            }
         })
      }, {
         concurrency: 4
      });
      return addedModules;
   }
}

module.exports = ModulesMap;
