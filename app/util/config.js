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
   const packageConfig = getPackageConfig(process.cwd());
   const config = fs.readJSONSync(CONFIG);

   if (argvOptions) {
      setRepPathFromArgv(config, argvOptions);
   }

   config.rc = getVersion(packageConfig);

   prepareReposUrl(config, argvOptions.protocol, argvOptions.gitMirror || config.gitMirror);

   if (packageConfig.name !== 'wasaby-cli') {
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
 * @param {Object} packageConfig  Конфиг npm пакета package.json
 * @return {String}
 */
function getVersion(packageConfig) {
   return `rc-${normalizeVersion(packageConfig.version)}`;
}
/**
 * Возвращает package.json
 * @param {String} pathToRep Путь до репозитория
 * return Object
 */
function getPackageConfig(pathToRep) {
   const configPath = path.join(pathToRep, 'package.json');
   return  fs.readJSONSync(configPath);
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

/**
 * Собирает ссылку на репозиторий в зависимости от протокола https или ssh
 * @param {Object} config Конфиг приложения
 * @param {String} protocol Протокол ssh или https
 * @param {String} gitMirror гит сервер по умолчанию
 */
function prepareReposUrl(config, protocol, gitMirror) {
   let suffix;
   let prefix;

   if (protocol === 'ssh') {
      prefix = 'git@';
      suffix = ':'
   } else {
      prefix = 'https://';
      suffix = '/'
   }

   for(let name of Object.keys(config.repositories)) {
      const cfg = config.repositories[name];
      cfg.url = `${prefix}${cfg.mirror || gitMirror}${suffix}${cfg.url}.git`;
   }
}


/**
 * cdn
 navigation-configuration
 permission
 rmi
 rmi_test
 Router
 saby-devtool
 saby-i18n
 saby-inferno
 saby-types
 saby-ui
 sbis-plugin-client
 sbis3-schemeeditor
 sbis3-ws
 sbis3-ws1
 sbis3.engine
 sbis3controls
 viewsettings
 wasaby-app
 wasaby-controls
 wasaby-polyfills
 */
module.exports = {
   get: get,
   getVersion: getVersion,
   getPackageConfig: getPackageConfig
};
