const path = require('path');
const fs = require('fs-extra');

const CONFIG = '../../config.json';
/**
 * Возвращает конфиг
 * return Object
 */
function read() {
   const packageConfig = _getPackageConfig();
   let config = {...require(CONFIG)};
   if (packageConfig) {
      if (packageConfig.devDependencies) {
         for (const name of Object.keys(packageConfig.devDependencies)) {
            if (config.repositories[name]) {
               config.repositories[name].path = path.join('node_modules', name);
            }
         }
      }
   }
   return config;
}

/**
 * Возвращает package.json, если cli запущено как зависимость
 * return Object|undefined
 */
function _getPackageConfig() {
   let configPath = path.join(process.cwd(), 'package.json');
   if (fs.existsSync(configPath)) {
      const config = require(configPath);
      if (config.name !== 'test-cli') {
         return config;
      }
   }
}

module.exports = {
   read: read
};
