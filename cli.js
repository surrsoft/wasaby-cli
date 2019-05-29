const fs = require('fs-extra');
const shell = require('shelljs');
const CONFIG = 'config.json';
const path = require('path');
const reposStore = '_repos';

function walkDir(dir, callback, rootDir) {
   rootDir = rootDir || dir;
   fs.readdirSync(dir).forEach(f => {
      let dirPath = path.join(dir, f);
      let relativePath = path.relative(rootDir, dir);
      let isDirectory = fs.statSync(dirPath).isDirectory();
      isDirectory ? walkDir(dirPath, callback, rootDir) : callback(path.join(relativePath, f));
   });
};

class Cli {
   init() {
      let config = this.readConfig();
      this._repos = config.repositories;
      this._store = config.store;
      this._workDir = config.workDir;

      this._argvOptions = this._getArgvOptions();
      this._testBranch = this._argvOptions.branch || this._argvOptions.rc || '';
      this._testModule = this._argvOptions.rep;
      this._rc = this._argvOptions.rc;
      if (!this._testModule) {
         throw new Error('Параметр --rep не передан');
      }

      this._testList = [this._testModule];
      this._unitModules = [];
      let cfg = this._repos[this._testModule];
      this._childProcessMap = [];
      if (cfg.dependTest) {
         this._testList = this._testList.concat(cfg.dependTest);
      }
   }

   run() {
      this.init();
      this.initStore()
         .then(
            this.initWorkDir.bind(this)
         ).then(
            this._startTest.bind(this)
         ).catch((e) => {
            this._closeChildProcess().then(() => {
               console.log(`Тестирование завершено с ошибкой ${e}`);
            });
         });
   }

   _closeChildProcess() {
      return Promise.all(this._childProcessMap.map((process) => {
         return new Promise((resolve) => {
            process.on('close', () => {
               resolve();
            });
            process.withErrorKill = true;
            process.kill('SIGKILL');
         });
      }));
      this._childProcessMap = [];
   }

   readConfig() {
      let data = fs.readFileSync(CONFIG);
      return JSON.parse(data);
   }

   _getArgvOptions() {
      let options = {};
      process.argv.slice(2).forEach(arg => {
         if (arg.startsWith('--')) {
            let argName = arg.substr(2);
            const [name, value] = argName.split('=', 2);
            options[name] = value === undefined ? true : value;
         }
      });
      return options;
   }

   _getModulesByRepName(name) {
      let s3mods = [];
      let modulesDir = this._repos[name].modulesDir || '';
      walkDir(path.join(this._store, reposStore, name, modulesDir), (filePath) => {
         if (filePath.includes('.s3mod')) {
            filePath = filePath.split(path.sep);
            filePath.splice(-1, 1);
            modulesDir && filePath.unshift(modulesDir);
            let modulePath = path.join.apply(path, filePath);
            if (!s3mods.includes(modulePath)) {
               s3mods.push(modulePath);
            }
         }
      });
      return s3mods;
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
      return module.includes('/') ? module.split('/').pop() : module.split('\\').pop();
   }

   _makeTestConfig(name) {
      let port = 10025;
      let configPorts = this._argvOptions.ports ? this._argvOptions.ports.split(',') : [];
      return Promise.all(this._testList.map((name, i) => {
         let testConfig = require('./testConfig.base.json');
         let cfg = Object.assign({}, testConfig);
         cfg.url.port = configPorts[i] ? configPorts[i] : port++;
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
         __dirname,
         true
      ).then(async () => {
         this._copyUnit();
         await this._linkFolder();
         console.log(`Подготовка тестов завершена успешно`);
      }).catch((e) => {
         throw new Error(`Подготовка тестов завершена с ошибкой ${e}`);
      });
   }

   _tslibInstall() {
      return this._execute(
         `node node_modules/saby-typescript/install.js --tslib=application/WS.Core/ext/tslib.js`,
         __dirname,
         true
      );
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
            __dirname,
            true
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
                  __dirname,
                  true
               )
            }
         });
      })).then(() => {
         console.log('Закончили тестирование');
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
      return Promise.all(Object.keys(this._repos).map((name) => {
         if (!fs.existsSync(path.join(this._store, name))) {
            return this.initRepos(name)
               .then(
                  this.copy.bind(this, name)
               );
         }
      })).then(() => {
         console.log(`Инициализация хранилища завершена успешно`);
      }).catch((e) => {
         throw new Error(`Инициализация хранилища завершена с ошибкой ${e}`);
      });
   }

   async _linkFolder() {
      for (const name in this._repos) {
         if (this._repos[name].linkFolders) {
            for (const pathOriginal in this._repos[name].linkFolders) {

               const pathDir = path.join(this._store, reposStore, name, pathOriginal);
               const pathLink =  path.join(this._workDir, this._repos[name].linkFolders[pathOriginal]);
               await fs.ensureSymlink(pathDir, pathLink);
            }
         }
      }
   }

   async copy(name) {
      let cfg = this._repos[name];
      let reposPath = path.join(this._store, reposStore, name);
      await fs.mkdirs(path.join(this._store, name));
      if (cfg.test) {
         await fs.ensureSymlink(path.join(reposPath, cfg.test), path.join(this._store, name, name + '_test'));
      }
      cfg.modules = this._getModulesByRepName(name).concat(cfg.modules || []);
      let d = cfg.modules.filter((a, index) => {return  cfg.modules.indexOf(a) != index});
      return Promise.all(cfg.modules.map((module => {
         console.log(`копирование модуля ${name}/${module}`);
         if (this._getModuleName(module) == 'unit') {
            this._unitModules.push(path.join(reposPath, module));
         } else {

            return fs.ensureSymlink(path.join(reposPath, module), path.join(this._store, name, 'module', this._getModuleName(module))).catch((e) => {
               throw new Error(`Ошибка при копировании репозитория ${name}: ${e}`);
            });
         }
      })));
   }

   async checkout(name, checkoutBranch, pathToRepos) {
      try {
         if (!checkoutBranch) {
            throw new Error(`Не удалось определить ветку для репозитория ${name}`);
         }
         console.log(`Переключение на ветку ${checkoutBranch} для репозитория ${name}`);
         return this._execute(`git checkout ${checkoutBranch} `, pathToRepos).then(() => {
            if (name === this._testModule) {
               console.log(`Попытка смержить ветку "${checkoutBranch}" для репозитория "${name}" с "${this._rc}"`);
               return this._execute(`git merge ${this._rc}`, pathToRepos).catch(() => {
                  throw new Error(`При мерже "${checkoutBranch}" в "${this._rc}" произошел конфликт`);
               });
            }
         });
      } catch (err) {
         throw new Error(`Ошибка при переключение на ветку ${checkoutBranch} в репозитории ${name}: ${e}`);
      }
   }

   async cloneRepos(name) {
      try {
         console.log(`git clone ${this._repos[name].url}`);

         await this._execute(`git clone ${this._repos[name].url} ${name}`, path.join(this._store, reposStore));

         return path.join(this._store, reposStore, name);
      } catch (err) {
         throw new Error(`Ошибка при клонировании репозитория ${name}: ${err}`);
      }
   }

   async copyRepos(pathToOriginal, name) {
      try {
         console.log(`Копирование репозитория ${name}`);

         return fs.ensureSymlink(pathToOriginal, path.join(this._store, reposStore, name));
      } catch (err) {
         throw new Error(`Ошибка при копировании репозитория ${name}: ${err}`);
      }
   }

   async initRepos(name) {
      if (this._argvOptions[name]) {
         if (fs.existsSync(this._argvOptions[name])) {
            return this.copyRepos(this._argvOptions[name], name);
         } else {
            return this.checkout(name,
               this._argvOptions[name],
               await this.cloneRepos(name, this._argvOptions[name])
            );
         }
      } else {
         const branch = name === this._testModule ? this._testBranch : this._rc;
         return this.checkout(name,
            branch,
            await this.cloneRepos(name)
         );
      }
   }

   _copyUnit() {
      this._unitModules.forEach((source) => {
         walkDir(source, (filePath) => {
            if (!filePath.includes('.test.')) {
               fs.copySync(path.join(source, filePath), path.join(this._workDir, 'unit', filePath));
            }
         });
      });
   }

   _execute(command, path, force) {
      return new Promise((resolve, reject) => {
         const cloneProcess = shell.exec(`cd ${path} && ${command}`, {
            silent: true,
            async: true
         });
         this._childProcessMap.push(cloneProcess);
         cloneProcess.stdout.on('data', (data) => {
            console.log(data);
         });

         cloneProcess.stderr.on('data', (data) => {
            console.log(data);
         });

         cloneProcess.on('exit', (code) => {
            this._childProcessMap.splice(this._childProcessMap.indexOf(cloneProcess), 1);
            if (force || !code && !cloneProcess.withErrorKill) {
               resolve();
            } else {
               reject();
            }
         });
      });
   };
}

module.exports = Cli;

if (require.main.filename === __filename) {
   let cli = new Cli();
   cli.run()
}



