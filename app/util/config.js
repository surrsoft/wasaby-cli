const path = require('path');
const fs = require('fs-extra');

const CONFIG = '../../config.json';

/**
 * Модуль для работы с конфигом test-cli
 * @author Ганшин Я.О
 */


/**
 * Возвращает конфиг
 * return Object
 */
function get() {
   const packageConfig = _getPackageConfig();
   const config = { ...require(CONFIG) };

   if (packageConfig) {
      if (packageConfig.devDependencies) {
         for (const name of Object.keys(packageConfig.devDependencies)) {
            if (config.repositories[name]) {
               config.repositories[name].path = path.join(process.cwd(), 'node_modules', name);
            }
         }
      }
      config.testRep = [packageConfig.name];
      config.rc = getVersion();
      if (!config.repositories.hasOwnProperty(packageConfig.name)) {
         config.repositories[packageConfig.name] = {};
      }
      config.repositories[packageConfig.name].skipStore = true;
      config.repositories[packageConfig.name].path = process.cwd();
      Object.assign(config, packageConfig['wasaby-cli'] || {});
   }

   return config;
}

/**
 * преобразует версию от npm к стандартной
 * @param {String} version
 * @return {*}
 */
function normalizeVersion(version) {
   const res = version.split('.');
   res.splice(-1, 1);
   return res.join('.');
}
/**
 * Возыращает версию rc ветки
 * @return {String}
 */
function getVersion() {
   const packageConfig = require('../../package.json');
   return `rc-${normalizeVersion(packageConfig.version)}`;
}
/**
 * Возвращает package.json, если cli запущено как зависимость
 * return Object|undefined
 */
function _getPackageConfig() {
   const configPath = path.join(process.cwd(), 'package.json');
   if (fs.existsSync(configPath)) {
      const config = require(configPath);
      if (config.name !== 'wasaby-cli') {
         return config;
      }
   }
   return undefined;
}

module.exports = {
   get: get
};
