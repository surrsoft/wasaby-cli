const path = require('path');
const fs = require('fs-extra');

const CONFIG = path.normalize(path.join(__dirname, '../../config.json'));

/**
 * Модуль для работы с конфигом test-cli
 * @author Ганшин Я.О
 */


/**
 * Возвращает конфиг
 * @param {Object} argvOptions Параметры из командной строки
 * return Object
 */
function get(argvOptions) {
   const packageConfig = _getPackageConfig();
   const config = fs.readJSONSync(CONFIG);

   if (argvOptions) {
      setRepPathFromArgv(config, argvOptions);
   }

   config.rc = getVersion();

   if (packageConfig) {
      if (packageConfig.devDependencies) {
         for (const name of Object.keys(packageConfig.devDependencies)) {
            if (config.repositories[name]) {
               config.repositories[name].path = path.join(process.cwd(), 'node_modules', name);
            }
         }
      }
      config.testRep = [packageConfig.name];
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
   const packageConfig = fs.readJSONSync(path.join(__dirname, '../../package.json'));
   return `rc-${normalizeVersion(packageConfig.version)}`;
}
/**
 * Возвращает package.json, если cli запущено как зависимость
 * return Object|undefined
 */
function _getPackageConfig() {
   const configPath = path.join(process.cwd(), 'package.json');
   if (fs.existsSync(configPath)) {
      const config = fs.readJSONSync(configPath);
      if (config.name !== 'wasaby-cli') {
         return config;
      }
   }
   return undefined;
}

/**
* возвращает объект с путями до репозитриев
* @param {Object} config Конфиг приложения
* @param {Object} argvOptions Параметры из командной строки
* return Object
*/
function setRepPathFromArgv(config, argvOptions) {
   for (const name of Object.keys(config.repositories)) {
      if (argvOptions[name]) {
         let repPath = argvOptions[name];

         if (!path.isAbsolute(repPath)) {
            repPath = path.normalize(path.join(process.cwd(), repPath));
         }

         if (fs.existsSync(repPath)) {
            config.repositories[name].path = repPath;
         }
      }
   }
}

module.exports = {
   get: get
};
