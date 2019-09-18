const fs = require('fs-extra');
const path = require('path');
const logger = require('./util/logger');
const geniePath = 'tools/jinnee';
const xml = require('./util/xml');
const ModulesMap = require('./util/modulesMap');
const Base = require('./base');

const builderConfigName = 'builderConfig.json';

class Build extends Base {
   constructor(cfg) {
      super(cfg);
      this._store = cfg.store;
      this._rc = cfg.rc;
      this._reposConfig = cfg.reposConfig;
      this._withBuilder = cfg.withBuilder;
      this._resources = cfg.resources;
      this._workDir = cfg.workDir;
      this._builderCache = cfg.builderCache;
      this._workspace = cfg.workspace;
      this._projectDir = cfg.projectDir;
      this._builderCfg = path.join(process.cwd(), 'builderConfig.json');
      this._modulesMap = new ModulesMap({
         reposConfig: this._reposConfig,
         store: cfg.store,
         testRep: cfg.testRep
      });
   }

   /**
    * инициализирует рабочую директорию: запускает билдер, копирует тесты
    * @return {Promise<void>}
    */
   async _run() {
      try {
         logger.log('Подготовка тестов');
         await this._modulesMap.build();
         await this._tslibInstall();
         if (this._withBuilder) {
            await this._initWithBuilder();
         } else {
            await this._initWithGenie();
         }
         await this._linkFolder();
         logger.log('Подготовка тестов завершена успешно');
      } catch (e) {
         throw new Error(`Подготовка тестов завершена с ошибкой ${e}`);
      }
   }

   async _initWithBuilder() {
      await this._makeBuilderConfig();
      await this._shell.execute(
         `node node_modules/gulp/bin/gulp.js --gulpfile=node_modules/sbis3-builder/gulpfile.js build --config=${this._builderCfg}`,
         process.cwd(),
         true,
         'builder'
      );
   }

   async _prepareSrv() {
      let srvPath = path.join(this._projectDir, 'InTestUI.s3srv');
      let srv = await xml.readXmlFile(srvPath);
      let srvModules = [];
      srv.service.items[0].ui_module.forEach((item) => {
         if (this._modulesMap.has(item.$.name)) {
            let cfg = this._modulesMap.get(item.$.name);
            item.$.url = path.relative(this._projectDir, path.join(this._store, cfg.rep, cfg.modulePath));
            srvModules.push(cfg.name);
            cfg.srv = true;
            this._modulesMap.set(cfg.name, cfg);
         }
      });

      xml.writeXmlFile(srvPath, srv);
   }

   _prepareDeployCfg(filePath) {
      let cfgString = fs.readFileSync(filePath, 'utf8');
      cfgString = cfgString.replace(/\{site_root\}/g, this._workDir);
      cfgString = cfgString.replace(/\{json_cache\}/g, this._builderCache);
      fs.outputFileSync(filePath, cfgString);
   }

   async _initWithGenie() {
      const builderOutput = path.join(this._workDir, 'builder_test');
      let sdkVersion = this._rc.replace('rc-', '').replace('.', '');
      let genieFolder = '';
      let deploy = path.join(this._projectDir, 'InTest.s3deploy');
      let logs = path.join(this._workDir, 'logs');
      let project = path.join(this._projectDir, 'InTest.s3cld');
      let genieCli = '';

      await this._prepareSrv();
      await this._makeBuilderConfig(builderOutput);

      if (process.platform === 'win32') {
         let sdkPath = process.env['SBISPlatformSDK_' + sdkVersion];
         genieFolder = path.join(sdkPath, geniePath);
         genieCli = `'${path.join(genieFolder, 'jinnee-utility.exe')}' jinnee-dbg-stand-deployment300.dll`;
      } else {
         let sdkPath = process.env.SDK;
         process.env['SBISPlatformSDK_' + sdkVersion] = sdkPath;
         genieFolder = path.join(this._workspace, 'jinnee');
         await this._shell.execute(
            `7za x ${path.join(sdkPath, 'tools', 'jinnee', 'jinnee.zip')} -o${genieFolder} > /dev/null`,
            process.cwd()
         );
         genieCli = `${path.join(genieFolder, 'jinnee-utility')} libjinnee-dbg-stand-deployment300.so`;
      }

      this._prepareDeployCfg(path.join(this._projectDir, 'InTest.s3deploy'));

      await this._shell.execute(
         `${genieCli} --deploy_stand=${deploy} --logs_dir=${logs} --project=${project}`,
         genieFolder,
         'jinnee'
      );

      await this._shell.execute(
         `node node_modules/gulp/bin/gulp.js --gulpfile=node_modules/sbis3-builder/gulpfile.js build --config=${this._builderCfg}`,
         process.cwd(),
         true,
         'builder'
      );

      fs.readdirSync(builderOutput).forEach(f => {
         let dirPath = path.join(builderOutput, f);
         if (fs.statSync(dirPath).isDirectory()) {
            fs.ensureSymlink(dirPath, path.join(this._resources, f));
         }
      });
   }

   /**
    * копирует tslib
    * @private
    */
   async _tslibInstall() {
      let tslib = path.relative(process.cwd(), path.join(this._store, 'ws', '/WS.Core/ext/tslib.js'));
      logger.log(tslib, 'tslib_path');
      return this._shell.execute(
         `node node_modules/saby-typescript/install.js --tslib=${tslib}`,
         process.cwd(),
         true,
         'typescriptInstall'
      );
   }

   /**
    * Создает симлинки в рабочей директории, после прогона билдера
    * @return {Promise<void>}
    * @private
    */
   async _linkFolder() {
      for (const name of Object.keys(this._reposConfig)) {
         if (this._reposConfig[name].linkFolders) {
            for (const pathOriginal of Object.keys(this._reposConfig[name].linkFolders)) {
               const pathDir = path.join(this._store, name, pathOriginal);
               const pathLink =  path.join(this._resources, this._reposConfig[name].linkFolders[pathOriginal]);
               await fs.ensureSymlink(pathDir, pathLink);
            }
         }
      }
   }

   /**
    * Создает конфиг для билдера
    * @return {Promise<void>}
    * @private
    */
   _makeBuilderConfig(output) {
      let builderConfig = require('../builderConfig.base.json');
      let testList = this._modulesMap.getTestList();

      testList.forEach((name) => {
         let modules = this._modulesMap.getChildModules(this._modulesMap.getModulesByRep(name));

         modules.forEach((moduleName) => {
            let cfg = this._modulesMap.get(moduleName);
            if (moduleName !== 'unit' && !cfg.srv) {
               const isNameInConfig = builderConfig.modules.find((item) => (item.name === moduleName));
               if (!isNameInConfig) {
                  builderConfig.modules.push({
                     name: moduleName,
                     path: path.join(this._store, cfg.rep, cfg.path)
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
