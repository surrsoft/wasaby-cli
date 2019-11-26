const fs = require('fs-extra');
const path = require('path');
const logger = require('./util/logger');
const xml = require('./util/xml');
const ModulesMap = require('./util/modulesMap');
const Base = require('./base');

const builderConfigName = 'builderConfig.json';
const builderBaseConfig = '../builderConfig.base.json';

const _private = {

   /**
    * Возвращает путь до исполняемого файла джина
    * @param {String} pathToJinnee
    * @returns {string}
    * @private
    */
   _getJinneeCli(pathToJinnee) {
      if (process.platform === 'win32') {
         return `"${path.join(pathToJinnee, 'jinnee-utility.exe')}" jinnee-dbg-stand-deployment300.dll`;
      }
      return `${path.join(pathToJinnee, 'jinnee-utility')} libjinnee-dbg-stand-deployment300.so`;
   }
};

class Build extends Base {
   constructor(cfg) {
      super(cfg);
      this._store = cfg.store;
      this._rc = cfg.rc;
      this._reposConfig = cfg.reposConfig;
      this._buildTools = cfg.buildTools;
      this._resources = cfg.resources;
      this._workDir = cfg.workDir;
      this._builderCache = cfg.builderCache;
      this._workspace = cfg.workspace;
      this._projectDir = cfg.projectDir;
      this._pathToJinnee = cfg.pathToJinnee;
      this._builderCfg = path.join(process.cwd(), 'builderConfig.json');
      this._modulesMap = new ModulesMap({
         reposConfig: this._reposConfig,
         store: cfg.store,
         testRep: cfg.testRep,
         workDir: this._workDir,
         only: cfg.only
      });
      if (cfg.builderBaseConfig) {
         this._builderBaseConfig = path.normalize(path.join(process.cwd(), cfg.builderBaseConfig));
      } else {
         this._builderBaseConfig = builderBaseConfig;
      }
   }

   /**
    * Запускает сборку стенда
    * @return {Promise<void>}
    */
   async _run() {
      try {
         logger.log('Подготовка тестов');
         await this._modulesMap.build();
         await this._tslibInstall();
         if (this._buildTools === 'builder') {
            await this._initWithBuilder();
         } else {
            await this._initWithJinnee();
         }
         await this._linkFolder();
         logger.log('Подготовка тестов завершена успешно');
      } catch (e) {
         throw new Error(`Подготовка тестов завершена с ошибкой ${e}`);
      }
   }

   /**
    * Сборка ресурсов через билдер
    * @param {String} builderOutput Папка в которую складыватся результат работы билдера
    * @returns {Promise<void>}
    * @private
    */
   async _initWithBuilder(builderOutput) {
      await this._makeBuilderConfig(builderOutput);
      await this._shell.execute(
         `node node_modules/gulp/bin/gulp.js --gulpfile=node_modules/sbis3-builder/gulpfile.js build --config=${this._builderCfg}`,
         process.cwd(), {
            force: true,
            name: 'builder'
         }
      );
   }

   /**
    * Заменяет пути в srv
    * @param {String} srvPath Путь до srv файла
    * @returns {Promise<void>}
    * @private
    */
   async _prepareSrv(srvPath) {
      if (fs.existsSync(srvPath)) {
         const srv = await xml.readXmlFile(srvPath);
         const dirName = path.dirname(srvPath);

         srv.service.items[0].ui_module.forEach((item) => {
            if (this._modulesMap.has(item.$.name)) {
               const cfg = this._modulesMap.get(item.$.name);
               item.$.url = path.relative(dirName, cfg.s3mod);
               cfg.srv = true;
               this._modulesMap.set(cfg.name, cfg);
            }
         });
         if (srv.service.parent) {
            await Promise.all(srv.service.parent.map(item => (
               this._prepareSrv(path.normalize(path.join(dirName, item.$.path)))
            )));
         }
         xml.writeXmlFile(srvPath, srv);
      }
   }

   /**
    * Заменяет константы в .deploy
    * @param {String} filePath Путь до .deploy файлаы
    * @private
    */
   _prepareDeployCfg(filePath) {
      let cfgString = fs.readFileSync(filePath, 'utf8');
      cfgString = cfgString.replace(/{site_root}/g, this._workDir);
      cfgString = cfgString.replace(/{json_cache}/g, this._builderCache);
      fs.outputFileSync(filePath, cfgString);
   }

   /**
    * Запускает сборку джином
    * @returns {Promise<void>}
    * @private
    */
   async _initWithJinnee() {
      const deploy = path.join(this._projectDir, 'InTest.s3deploy');
      const logs = path.join(this._workDir, 'logs');
      const project = path.join(this._projectDir, 'InTest.s3cld');
      const pathToJinnee = await this._getPathToJinnee();
      const jinneeCli = _private._getJinneeCli(pathToJinnee);

      await this._prepareSrv(path.join(this._projectDir, 'InTestUI.s3srv'));

      this._prepareDeployCfg(path.join(this._projectDir, 'InTest.s3deploy'));

      await this._shell.execute(
         `${jinneeCli} --deploy_stand=${deploy} --logs_dir=${logs} --project=${project}`,
         pathToJinnee, {
            name: 'jinnee'
         }
      );

      const builderOutput = path.join(this._workDir, 'builder_test');
      await this._initWithBuilder(builderOutput);
      fs.readdirSync(builderOutput).forEach((f) => {
         let dirPath = path.join(builderOutput, f);
         if (fs.statSync(dirPath).isDirectory()) {
            fs.ensureSymlink(dirPath, path.join(this._resources, f));
         }
      });
   }

   /**
    * Возвращает путь до папки с джином, если джин в архиве распаковывает в рабочую директорию
    * @returns {Promise<string|*>}
    * @private
    */
   async _getPathToJinnee() {
      const pathToSDK = this._getPathToSdk();
      let pathToJinnee = '';
      if (this._pathToJinnee) {
         pathToJinnee = this._pathToJinnee;
      } else if (process.env.SDK) {
         pathToJinnee = path.join(pathToSDK, 'tools', 'jinnee', 'jinnee.zip');
      } else {
         pathToJinnee = path.join(pathToSDK, 'tools', 'jinnee');
      }

      if (!fs.existsSync(pathToJinnee)) {
         throw new Error(`Не существует путь до джина: ${pathToJinnee}`);
      }

      if (fs.statSync(pathToJinnee).isFile()) {
         const unpack = path.join(this._workspace, 'jinnee');
         await this._shell.execute(
            `7za x ${pathToJinnee} -y -o${unpack} > /dev/null`,
            process.cwd()
         );
         return unpack;
      }

      return pathToJinnee;
   }

   /**
    * Возвращает путь до SDK
    * @returns {string}
    * @private
    */
   _getPathToSdk() {
      let pathToSDK;
      const sdkVersion = this._rc.replace('rc-', '').replace('.', '');

      if (process.env.SDK) {
         pathToSDK = process.env.SDK;
         process.env['SBISPlatformSDK_' + sdkVersion] = pathToSDK;
      } else {
         pathToSDK = process.env['SBISPlatformSDK_' + sdkVersion];
      }

      if (!pathToSDK) {
         throw new Error(`SDK версии ${sdkVersion} не установлен`);
      }

      if (!fs.existsSync(pathToSDK)) {
         throw new Error(`Не найден SDK по пути: ${pathToSDK}`);
      }

      return pathToSDK;
   }

   /**
    * Копирует tslib
    * @private
    */
   _tslibInstall() {
      const tslib = path.relative(process.cwd(), path.join(this._modulesMap.getRepositoryPath('sbis3-ws'), '/WS.Core/ext/tslib.js'));
      logger.log(tslib, 'tslib_path');
      return this._shell.execute(
         `node node_modules/saby-typescript/cli/install.js --tslib=${tslib}`,
         process.cwd(), {
            force: true,
            name: 'typescriptInstall'
         }
      );
   }

   /**
    * Создает симлинки в рабочей директории, после прогона билдера
    * @return {Promise<void>}
    * @private
    */
   _linkFolder() {
      const promises = [];
      for (const name of Object.keys(this._reposConfig)) {
         if (this._reposConfig[name].linkFolders) {
            for (const pathOriginal of Object.keys(this._reposConfig[name].linkFolders)) {
               const pathDir = path.join(this._store, name, pathOriginal);
               const pathLink = path.join(this._resources, this._reposConfig[name].linkFolders[pathOriginal]);
               promises.push(fs.ensureSymlink(pathDir, pathLink));
            }
         }
      }
      return Promise.all(promises);
   }

   /**
    * Создает конфиг для билдера
    * @return {Promise<void>}
    * @private
    */
   _makeBuilderConfig(output) {
      const builderConfig = require(this._builderBaseConfig);
      const testList = this._modulesMap.getTestList();

      testList.forEach((name) => {
         const modules = this._modulesMap.getChildModules(this._modulesMap.getModulesByRep(name));
         modules.forEach((moduleName) => {
            const cfg = this._modulesMap.get(moduleName);
            if (moduleName !== 'unit' && !cfg.srv) {
               const isNameInConfig = builderConfig.modules.find(item => (item.name === moduleName));
               if (!isNameInConfig) {
                  builderConfig.modules.push({
                     name: moduleName,
                     path: cfg.path
                  });
               }
            }
         });
      });

      builderConfig.output = output || this._resources;
      return fs.outputFile(`./${builderConfigName}`, JSON.stringify(builderConfig, null, 4));
   }
}

module.exports = Build;
