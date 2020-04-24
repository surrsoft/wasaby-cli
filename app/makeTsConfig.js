const fs = require('fs-extra');
const path = require('path');
const Base = require('./base');

const BASE_CONFIG = 'saby-typescript/configs/es5.dev.json';

const TS_CONFIG_TEMPLATE = require('../resources/tsconfig.template.json');
const TSCONFIG_PATH = path.join(process.cwd(), 'tsconfig.json');
/**
 * Класс отвечающий за сборку ресурсов для тестов
 * @author Ганшин Я.О
 */

class MakeTsConfig extends Base {
   constructor(cfg) {
      super(cfg);
      this._store = cfg.store;
      this._rc = cfg.rc;
   }

   async _run() {
      const config = { ...TS_CONFIG_TEMPLATE };
      config.extends = path.relative(process.cwd(), require.resolve(BASE_CONFIG));
      config.compilerOptions.paths = this.getPaths();
      config.compilerOptions.baseUrl = this.resources;
      config.exclude = this.getExclude();
      await fs.writeJSON(TSCONFIG_PATH, config, {spaces: 4, EOL: '\n'});
   }

   getPaths() {
      const testList = this._modulesMap.getTestList();
      const paths = {};
      this._modulesMap.getChildModules(testList).forEach((moduleName) => {
         const relativePath = this.getRelativePath(moduleName);
         if (relativePath !== moduleName) {
            paths[moduleName + '/*'] = [relativePath + '/*'];
         }
      });

      const wsCore = this.getRelativePath('WS.Core');
      Object.keys(WS_PATHS).forEach((name) => {
         paths[name] = wsCore + WS_PATHS[name];
      });

      return paths;
   }

   getRelativePath(moduleName) {
      const cfg = this._modulesMap.get(moduleName);
      return unixify(path.relative(process.cwd(), cfg.path));
   }

   getExclude

}

function unixify(str) {
   return String(str).replace(/\\/g, '/');
}

module.exports = MakeTsConfig;
