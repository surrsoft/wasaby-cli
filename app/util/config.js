const path = require('path');
const fs = require('fs-extra');

const CONFIG = '../../config.json';
/**
 * Возвращает конфиг
 * return Object
 */
function get() {
   const packageConfig = _getPackageConfig();
   const config = {...require(CONFIG)};
   if (packageConfig) {
      if (packageConfig.devDependencies) {
         for (const name of Object.keys(packageConfig.devDependencies)) {
            if (config.repositories[name]) {
               config.repositories[name].path = path.join('node_modules', name);
            }
         }
      }
      config.testRep = [packageConfig.name];
      config.rc = `rc-${normalizeVersion(packageConfig.version)}`;
      config.repositories[config.testRep].skipStore = true;
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
   res.splice(-1,1);
   return res.join('.');
}

/**
 * Возвращает package.json, если cli запущено как зависимость
 * return Object|undefined
 */
function _getPackageConfig() {
   const configPath = path.join(process.cwd(), 'package.json');
   if (fs.existsSync(configPath)) {
      const config = require(configPath);
      if (config.name !== 'test-cli') {
         return config;
      }
   }
}

module.exports = {
   get: get
};
