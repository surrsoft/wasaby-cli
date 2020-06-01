const fs = require('fs-extra');
const path = require('path');
const Base = require('./base');

const BASE_CONFIG = 'saby-typescript/configs/es5.dev.json';

const TS_CONFIG_TEMPLATE = require('../resources/tsconfig.template.json');
const TSCONFIG_PATH = path.join(process.cwd(), 'tsconfig.json');

/**
 * Класс отвечающий за генерацию tsconfig
 * @author Ганшин Я.О
 */

class Prepare extends Base {
   constructor(cfg) {
      super(cfg);
      this._store = cfg.store;
      this._rc = cfg.rc;
      this._resources = cfg.resources;
      this._builderCache = cfg.builderCache
   }

   async _run() {
      await this.makeTsConfig();
      await this.tsInstall();
   }

   async makeTsConfig() {
      const config = { ...TS_CONFIG_TEMPLATE };
      config.extends = path.relative(process.cwd(), require.resolve(BASE_CONFIG));
      config.compilerOptions.paths = await this._getPaths();
      config.exclude = this._getExclude();

      this._writeConfig(config);
   }

   async tsInstall() {
      const wsCore = this._modulesMap.get('WS.Core');
      const wsTslib = path.join(wsCore.path, 'ext', 'tslib.js');
      const tsPath = require.resolve('saby-typescript/cli/install.js');

      return this._shell.execute(
         `node ${tsPath} --tslib=${wsTslib} --tsconfig=skip`,
         process.cwd(), {
            force: true,
            name: 'typescriptInstall'
         }
      );
   }
   /**
    * Возвращает пути до модулей
    * @returns {Promise<{}>}
    * @private
    */
   async _getPaths() {
      const testList = this._modulesMap.getRequiredModules();
      const paths = {};
      this._modulesMap.getChildModules(testList).forEach((moduleName) => {
         const relativePath = this._getRelativePath(moduleName);
         if (relativePath !== moduleName) {
            paths[moduleName + '/*'] = [relativePath + '/*'];
         }
      });

      const configPaths = await this._getPathFromConfig(require.resolve(BASE_CONFIG));
      Object.keys(configPaths).forEach((name) => {
         configPaths[name] = configPaths[name].map((pathFromConfig) => {
            let splitedPath = pathFromConfig.split('/');
            if (this._modulesMap.has(splitedPath[0])) {
               splitedPath = [this._getRelativePath(splitedPath[0])].concat(splitedPath);
            }
            return splitedPath.join('/');
         });
         paths[name] = configPaths[name];
      });

      return paths;
   }

   /**
    * Возвращет относительный путь до модуля в формате unix
    * @param moduleName
    * @returns {string}
    * @private
    */
   _getRelativePath(moduleName) {
      const cfg = this._modulesMap.get(moduleName);
      return unixify(path.relative(process.cwd(), cfg.path));
   }

   /**
    * Возвращает секцию exclude
    * @returns {string[]}
    * @private
    */
   _getExclude() {
      return [ path.relative(process.cwd(), this._resources), this._builderCache ];
   }

   /**
    * Возвращает секцию paths из базового конфига
    * @param pathToConfig
    * @returns {Promise<{module: [string]}|*>}
    * @private
    */
   async _getPathFromConfig(pathToConfig) {
      const config = await fs.readJSON(pathToConfig);
      if (config.compilerOptions && config.compilerOptions.paths) {
         return config.compilerOptions.paths;
      } else if(config.extends) {
         return await this._getPathFromConfig(path.join(process.cwd(), config.extends));
      }
   }

   /**
    * Сохраняет конфиг
    * @param config
    * @returns {Promise<void>}
    * @private
    */
   async _writeConfig(config) {
      if (fs.existsSync(TSCONFIG_PATH)) {
         await fs.remove(TSCONFIG_PATH);
      }
      await fs.writeJSON(TSCONFIG_PATH, config, {spaces: 4, EOL: '\n'});
   }
}

function unixify(str) {
   return String(str).replace(/\\/g, '/');
}

module.exports = Prepare;
