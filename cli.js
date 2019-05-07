const fs = require('fs-extra');
const shell = require('shelljs');
const CONFIG = 'config.json';
const path = require('path');
const reposStore = '_repos';
const argvOptions = {
   rc: false,
   branch: false,
   rep: false
};

function walkDir(dir, callback, rootDir) {
   rootDir = rootDir || dir;
   fs.readdirSync(dir).forEach(f => {
      let dirPath = path.join(dir, f);
      let relativePath = path.relative(rootDir, dir);
      let isDirectory = fs.statSync(dirPath).isDirectory();
      isDirectory ? walkDir(dirPath, callback, rootDir) : callback(path.join(relativePath, f));
   });
};

class cli {
   constructor() {
      let config = this.readConfig();
      this._repos = config.repositories;
      this._store = config.store;
      this._workDir = config.workDir;
      const options = this._getArgvOptions();
      this._testBranch = options.branch || options.rc;
      this._testModule = options.rep;
      this._branch = options.rc;
      this._testList = [this._testModule];
      this._argvOptions = options;
      this._unitModules = [];
      let cfg = this._repos[this._testModule];
      if (cfg.dependTest) {
         this._testList = this._testList.concat(cfg.dependTest);
      }
      if (!this._testModule) {
         throw new Error('Параметр --rep не передан');
      }

      this.initStore().then(this.initWorkDir.bind(this)).then(this._startTest.bind(this));
      //this.copy('Controls');
      //this._startTest();
   }

   readConfig() {
      let data = fs.readFileSync(CONFIG);
      return JSON.parse(data);
   }

   _getArgvOptions() {
      let options = Object.assign({}, argvOptions);
      process.argv.slice(2).forEach(arg => {
         if (arg.startsWith('--')) {
            let argName = arg.substr(2);
            const [name, value] = argName.split('=', 2);
            options[name] = value === undefined ? true : value;
         }
      });
      return options;
   }

   _makeBuilderConfig() {
      let builderConfig = require('./builderConfig.base.json');
      this._testList.forEach((name) => {
         builderConfig.modules.push({
            name: name + '_test',
            path: ['.', this._store, name, name + '_test'].join('/')
         });
         const cfg = this._repos[name];
         cfg.modules.forEach((modulePath) => {
            const moduleName = this._getModuleName(modulePath);
            if (moduleName !== 'unit') {
               const isNameInConfig = builderConfig.modules.find((item) => (item.name == moduleName));
               if (!isNameInConfig) {
                  builderConfig.modules.push({
                     name: moduleName,
                     path: ['.', this._store, name, 'module', moduleName].join('/')
                  })
               }
            }
         });
      });

      return fs.outputFile('./builderConfig.json', JSON.stringify(builderConfig, null, 4));
   }

   _getModuleName(module) {
      return module.split('/').pop();
   }

   _makeTestConfig(name) {
      let port = 10025;
      return Promise.all(this._testList.map((name) => {
         let testConfig = require('./testConfig.base.json');
         let cfg = Object.assign({}, testConfig);
         cfg.url.port = port++;
         cfg.tests = name + '_test';
         cfg.report = cfg.report.replace('${module}', name);
         cfg.htmlCoverageReport = cfg.htmlCoverageReport.replace('${module}', name);
         cfg.jsonCoverageReport = cfg.jsonCoverageReport.replace('${module}', name);
         return fs.outputFile(`./testConfig_${name}.json`, JSON.stringify(cfg, null, 4));
      }));
   }

   async _linkModules() {
      console.log(`Подготовка тестов`);
      let builderCfg = path.join(process.cwd(), 'builderConfig.json');
      await this._makeBuilderConfig();
      return this._execute(
         `node node_modules/gulp/bin/gulp.js --gulpfile=node_modules/sbis3-builder/gulpfile.js build --config=${builderCfg}`,
         ''
      ).then(() => {
         this._copyUnit();
         console.log(`Подготовка тестов завершена успешно`);
      }).catch((e) => {
         console.log(`Подготовка тестов завершена с ошибкой ${e}`);
      });
   }

   _tslibInstall() {
      return this._execute(`node node_modules/saby-typescript/install.js --tslib=application/WS.Core/ext/tslib.js`, '');
   }

   async initWorkDir() {
      await this._linkModules();
   }

   async _startTest() {
      console.log('Запуск тестов');
      await this._makeTestConfig();
      await this._tslibInstall();
      return Promise.all(this._testList.map((name) => {
         return this._execute(
            `node node_modules/saby-units/cli.js --isolated --report --config="./testConfig_${name}.json"`,
            ''
         ).then(() => {
            let cfg = this._repos[name];
            if (cfg.unitInBrowser) {
               let cfg = require(`./testConfig_${name}.json`);
               let testConfig = require('./testConfig.base.json');
               testConfig = Object.assign({}, testConfig);
               cfg.report = testConfig.report.replace('${module}', name + '_browser');
               cfg.htmlCoverageReport = testConfig.htmlCoverageReport.replace('${module}', name + '_browser');
               cfg.jsonCoverageReport = testConfig.jsonCoverageReport.replace('${module}', name + '_browser');
               fs.outputFileSync(`./testConfig_${name}.json`, JSON.stringify(cfg, null, 4));
               return this._execute(
                  `node node_modules/saby-units/cli.js --browser --report --config="./testConfig_${name}.json"`,
                  ''
               )
            }
         });
      })).then(() => {
         console.log('Тесты прошли');
      });
   }

   _initWorkDir() {
      if (!path.existsSync(this._workDir)) {
         fs.mkdirSync(this._workDir);
      }
   }

   async initStore() {
      console.log(`Инициализация хранилища`);
      try {
         await fs.remove(this._workDir);
         await fs.remove('builder-ui');
         await fs.remove(this._store);
         await fs.mkdirs(path.join(this._store, reposStore));
      } catch (e) {
         console.error(e.message);
      }
      if (this._branch) {
         return Promise.all(Object.keys(this._repos).map((name) => {
            if (!fs.existsSync(path.join(this._store, name))) {
               return this.clone(name).then(this.copy.bind(this, name));
            }
         })).then(() => {
            console.log(`Инициализация хранилища завершена успешно`);
         }).catch((e) => {
            console.log(`Инициализация хранилища завершена с ошибкой ${e}`);
         });
      }
   }

   async copy(name) {
      let cfg = this._repos[name];
      let reposPath = path.join(this._store, reposStore, name);
      await fs.mkdirs(path.join(this._store, name));
      if (cfg.test) {
         await fs.ensureSymlink(path.join(reposPath, cfg.test), path.join(this._store, name, name + '_test'));
      }
      return Promise.all(cfg.modules.map((module => {
         console.log(`копирование модуля ${name}/${module}`);
         if (this._getModuleName(module) == 'unit') {
            this._unitModules.push(path.join(reposPath, module));
         } else {
            return fs.ensureSymlink(path.join(reposPath, module), path.join(this._store, name, 'module', this._getModuleName(module))).catch((e) => {
               console.error(`Ошибка при копировании репозитория ${name}: ${e}`);
            });
         }
      })));
   }

   async clone(name) {
      if (this._argvOptions[name]) {
         try {
            console.log(`Копирование репозитория ${name}`);
            return fs.ensureSymlink(this._argvOptions[name], path.join(this._store, reposStore, name));
         } catch (e) {
            console.error(`Ошибка при копировании репозитория ${name}: ${e}`);
         }
      } else {
         try {
            console.log(`git clone ${this._repos[name].url}`);
            await this._execute(`git clone ${this._repos[name].url} ${name}`, path.join(this._store, reposStore));
            let branch = name == this._testModule ? this._testBranch : this._branch;
            return this._execute(`git checkout ${this._branch} `)
         } catch (e) {
            console.error(`Ошибка при клонировании репозитория ${name}: ${e}`);
         }
      }
   }

   _copyUnit() {
      this._unitModules.forEach((source) => {
         walkDir(source, (filePath) => {
            if (!filePath.includes('.test.')) {
               fs.copySync(path.join(source, filePath), path.join(this._workDir, 'unit', filePath));
            }
         });
      })

   }

   _execute(command, path) {
      return new Promise((resolve, reject) => {
         const cloneProcess = shell.exec(`cd ${path} && ${command}`, {
            silent: true,
            async: true
         });

         let result = '';

         cloneProcess.stdout.on('data', (data) => {
            console.log(data);
         });

         cloneProcess.stderr.on('data', (data) => {
            console.log(data);
         });

         cloneProcess.on('exit', () => {
            resolve(result);
         });

      });
   };
}

let c = new cli();


