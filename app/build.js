const fs = require('fs-extra');
const path = require('path');
const logger = require('./util/logger');
const Shell = require('./util/shell');

class Build {
   constructor(cfg) {
      this._shell = new Shell();
      this._store = cfg.store;
      this._repos = cfg.repos;
   }

   /**
    * инициализирует рабочую директорию: запускает билдер, копирует тесты
    * @return {Promise<void>}
    */
   async run() {
      logger.log(`Подготовка тестов`);
      await this._tslibInstall();
      try {
         if (this._withBuilder) {
            await this._initWithBuilder();
         } else {
            await this._initWithGenie();
         }
         await this._linkFolder();
         logger.log(`Подготовка тестов завершена успешно`);
      } catch(e) {
         throw e;
         throw new Error(`Подготовка тестов завершена с ошибкой ${e}`);
      }
   }

   async _initWithBuilder() {
      await this._makeBuilderConfig();
      await this._shell.execute(
         `node node_modules/gulp/bin/gulp.js --gulpfile=node_modules/sbis3-builder/gulpfile.js build --config=${this._buiderCfg}`,
         __dirname,
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
            if (!cfg.test) {
               item.$.url = path.relative(this._projectDir, path.join(this._store, cfg.rep, cfg.path));
               srvModules.push(cfg.name);
            }
         }
      });
      this._makeBuilderTestConfig();

      xml.writeXmlFile(srvPath, srv);
   }

   _makeBuilderTestConfig() {
      let builderConfig = require('./builderConfig.base.json');
      this._getTestList().forEach((name) => {
         let module = name+'_test';
         builderConfig.modules.push({
            name: name + '_test',
            path: path.join(this._store, name, name + '_test')
         });
         let modules = this._repos[name].modules || [];

         modules.forEach((modulePath) => {
            const moduleName = this._getModuleNameByPath(modulePath);

            if (moduleName !== 'unit') {
               const isNameInConfig = builderConfig.modules.find((item) => (item.name == moduleName));
               let cfg = this._modulesMap.get(moduleName);
               let repName = cfg ? cfg.rep : name;
               if (!isNameInConfig) {
                  builderConfig.modules.push({
                     name: moduleName,
                     path: path.join(this._store, repName, 'module', moduleName)
                  })
               }
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
         await this._shell.execute(`7za x ${path.join(sdkPath,'tools','jinnee','jinnee.zip')} -o${genieFolder}`, __dirname);
         genieCli = `${path.join(genieFolder, 'jinnee-utility')} libjinnee-dbg-stand-deployment300.so`;
      }
      this._prepareDeployCfg(path.join(this._projectDir, 'InTest.s3deploy'));
      await this._shell.execute(
         `${genieCli} --deploy_stand=${deploy} --logs_dir=${logs} --project=${project}`,
         genieFolder,
         'jinnee'
      );
      await this._shell.execute(
         `node node_modules/gulp/bin/gulp.js --gulpfile=node_modules/sbis3-builder/gulpfile.js build --config=${this._buiderCfg}`,
         __dirname,
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
         __dirname,
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
      for (const name in this._repos) {
         if (this._repos[name].linkFolders) {
            for (const pathOriginal in this._repos[name].linkFolders) {
               const pathDir = path.join(this._store, name, pathOriginal);
               const pathLink =  path.join(this._resources, this._repos[name].linkFolders[pathOriginal]);
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
      let builderConfig = require('./builderConfig.base.json');
      let testList = this._getTestList().slice();
      //удалить по этой задаче https://online.sbis.ru/opendoc.html?guid=79e5557f-b621-40bf-ae79-86b6fc5930b6
      testList.forEach((name) => {
         const cfg = this._repos[name];
         if (cfg.dependOn) {
            cfg.dependOn.forEach((name) => {
               if (!testList.includes(name)) {
                  testList.push(name)
               }
            });
         }
      });
      testList.forEach((name) => {
         if (!this._testModulesMap.has(name) && this._repos[name].test) {
            builderConfig.modules.push({
               name: name + '_test',
               path: path.join(this._store, name, name + '_test')
            });
         }

         let modules = this._getChildModules(this._getModulesFromMap(name));

         modules.forEach((modulePath) => {
            const moduleName = this._getModuleNameByPath(modulePath);

            if (moduleName !== 'unit') {
               const isNameInConfig = builderConfig.modules.find((item) => (item.name == moduleName));
               let cfg = this._modulesMap.get(moduleName);
               let repName = cfg ? cfg.rep : name;
               if (!isNameInConfig) {
                  builderConfig.modules.push({
                     name: moduleName,
                     path: path.join(this._store, repName, 'module', moduleName)
                  })
               }
            }
         });

      });

      return fs.outputFile(`./${builderConfigName}`, JSON.stringify(builderConfig, null, 4));
   }
}

module.exports = Build;
