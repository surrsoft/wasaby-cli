const fs = require('fs-extra');
const path = require('path');
const logger = require('./util/logger');

const xml = require('./util/xml');
const ModulesMap = require('./util/modulesMap');
const Base = require('./base');

const builderConfigName = 'builderConfig.json';

class Build extends Base{
   constructor(cfg) {
      super(cfg);
      this._store = cfg.store;
      this._rc = cfg.rc;
      this._reposConfig = cfg.reposConfig;
      this._withBuilder = cfg.withBuilder;
      this._resources = cfg.resources;
      this._buiderCfg = path.join(process.cwd(), 'builderConfig.json');
      this._modulesMap = new ModulesMap({
         store: cfg.store,
         reposConfig: this._reposConfig,
         testRep: cfg.testRep
      });
   }

   /**
    * инициализирует рабочую директорию: запускает билдер, копирует тесты
    * @return {Promise<void>}
    */
   async _run() {
      try {
         logger.log(`Подготовка тестов`);
         await this._modulesMap.build();
         await this._tslibInstall();
         if (this._withBuilder) {
            await this._initWithBuilder();
         } else {
            await this._initWithGenie();
         }
         await this._linkFolder();
         logger.log(`Подготовка тестов завершена успешно`);
      } catch(e) {
         throw new Error(`Подготовка тестов завершена с ошибкой ${e}`);
      }
   }

   async _initWithBuilder() {
      await this._makeBuilderConfig();
      await this._shell.execute(
         `node node_modules/gulp/bin/gulp.js --gulpfile=node_modules/sbis3-builder/gulpfile.js build --config=${this._buiderCfg}`,
         process.cwd(),
         true,
         'builder'
      );
   }

   async readSrv() {
      //await copyProject()
      let srvPath = path.join(this._projectDir, 'InTestUI.s3srv');
      let srv = await xml.readXmlFile(srvPath);
      let srvModules = [];
      srv.service.items[0].ui_module.forEach((item) => {
         if (this._modulesMap.has(item.$.name)) {
            let cfg = this._modulesMap.get(item.$.name);
            item.$.url = path.relative(this._projectDir, path.join(this._store, cfg.rep, cfg.path));
            srvModules.push(cfg.name);
            cfg.srv = true;
            this._modulesMap.set(cfg.name, cfg);
         }
      });
      this._makeBuilderTestConfig();

      xml.writeXmlFile(srvPath, srv);
   }

   _makeBuilderTestConfig() {
      let builderConfig = require('./builderConfig.base.json');
      this._modulesMap.getTestList().forEach((name) => {
         let testmodules = this._testModulesMap.get(name);
         testmodules.forEach((testModuleName) => {
            let cfg = this._modulesMap.get(testModuleName);
            let repName = cfg ? cfg.rep : name;
            builderConfig.modules.push({
               name: testModuleName,
               path: path.join(this._store, cfg.rep, cfg.path)
            })
         });

         let modules = this._getChildModules(this._getModulesFromMap(name));

         modules.forEach((modulePath) => {
            const moduleName = this._getModuleNameByPath(modulePath);
            const isNameInConfig = builderConfig.modules.find((item) => (item.name == moduleName));
            let cfg = this._modulesMap.get(moduleName);
            let repName = cfg ? cfg.rep : name;
            if (!isNameInConfig && !cfg.srv) {
               builderConfig.modules.push({
                  name: moduleName,
                  path: path.join(this._store, cfg.rep, cfg.path)
               })
            }
         });
      });

      builderConfig.output = path.join(this._workDir, 'builder_test');
      return fs.outputFile(`${builderConfigName}`, JSON.stringify(builderConfig, null, 4));
   }

   _prepareDeployCfg(filePath) {
      let cfg_string = fs.readFileSync(filePath, "utf8");
      cfg_string = cfg_string.replace(/\{site_root\}/g, this._workDir);
      fs.outputFileSync(filePath, cfg_string);
   }

   async _initWithGenie() {
      this.readSrv();

      let sdkVersion = this._rc.replace('rc-', '').replace('.','');

      let genieFolder = '';
      let deploy = path.join(this._projectDir, 'InTest.s3deploy');
      let logs = path.join(this._workDir, 'logs');
      let project = path.join(this._projectDir, 'InTest.s3cld');
      let conf = path.join(this._projectDir, 'InTest.s3webconf');
      let genieCli = '';
      if (process.platform == 'win32') {
         let sdkPath = process.env['SBISPlatformSDK_' + sdkVersion];
         genieFolder = path.join(sdkPath, geniePath);
         genieCli = `"${path.join(genieFolder, 'jinnee-utility.exe')}" jinnee-dbg-stand-deployment300.dll`;
      } else  {
         let sdkPath = process.env['SDK'];
         process.env['SBISPlatformSDK_' + sdkVersion] = process.env['SDK'];
         genieFolder = path.join(this._workspace, 'jinnee');
         await this._shell.execute(`7za x ${path.join(sdkPath,'tools','jinnee','jinnee.zip')} -o${genieFolder}`, process.cwd());
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
      fs.readdirSync(path.join(this._workDir, 'builder_test')).forEach(f => {
         let dirPath = path.join(this._workDir, 'builder_test', f);
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
      for (const name in this._reposConfig) {
         if (this._reposConfig[name].linkFolders) {
            for (const pathOriginal in this._reposConfig[name].linkFolders) {
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
   _makeBuilderConfig() {
      let builderConfig = require('../builderConfig.base.json');
      let testList = this._modulesMap.getTestList();
      testList.forEach((name) => {
         let modules = this._modulesMap.getChildModules(this._modulesMap.getModulesByRep(name));

         modules.forEach((moduleName) => {
            if (moduleName !== 'unit') {
               const isNameInConfig = builderConfig.modules.find((item) => (item.name == moduleName));
               let cfg = this._modulesMap.get(moduleName);
               if (!isNameInConfig) {
                  builderConfig.modules.push({
                     name: moduleName,
                     path: path.join(this._store, cfg.rep, cfg.path)
                  })
               }
            }
         });

      });
      if (this._resources) {
         builderConfig.output = this._resources;
      }
      return fs.outputFile(`./${builderConfigName}`, JSON.stringify(builderConfig, null, 4));
   }
}

module.exports = Build;
