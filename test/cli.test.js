const chai = require('chai');
const Cli = require('./../cli');
const sinon = require('sinon');
const fs = require('fs-extra');
const path = require('path');
let cli;
let stubArgv;

let getProcess = () => {
   return {
      on(prop, callback) {
         this[prop] = callback;
      },

      kill(result) {
         this.exit && this.exit(result);
         this.close && this.close(result);
      },

      stdout: {
         on(prop, callback) {
            this[prop] = callback;
         }
      },

      stderr: {
         on(prop, callback) {
            this[prop] = callback;
         }
      }

   }
};

describe('CLI', () => {
   beforeEach(() => {
      stubArgv = sinon.stub(process, 'argv');
      stubArgv.value(['','', '--rep=types', '--branch=200/feature', '--rc=rc-200']);
      cli = new Cli();
   });

   afterEach(() => {
      stubArgv.restore();
   });

   describe('.readConfig()', () => {
      it('should return config', () => {
         let config = cli.readConfig();
         chai.expect(config).to.be.an('object').to.deep.equal(require('./../config.json'));
      });

   });

   describe('._getArgvOptions()', () => {
      it('should return argv options', () => {
         stubArgv.value(['','','--a=12', '--b=15']);
         let config = cli._getArgvOptions();
         chai.expect(config).to.be.an('object').to.deep.equal({a:'12',b:'15'});
      });
   });

   describe('.init()', () => {
      it('should throw error when rep is empty', () => {
         stubArgv.value(['','']);
         chai.expect(() => cli.init()).to.throw();
      });
      it('should set params from argv', () => {
         chai.expect(cli._testBranch).to.equal('200/feature');
         chai.expect(cli._testModule).to.equal('types');
         chai.expect(cli._rc).to.equal('rc-200');
      });
      it('should set params from config', () => {
         const config = require('./../config.json');
         chai.expect(cli._repos).to.deep.equal(config.repositories);
         chai.expect(cli._store).to.equal(config.store);
         chai.expect(cli._workDir).to.equal(config.workDir);
      });
   });

   describe('._makeBuilderConfig()', () => {
      it('should throw error when rep is empty', (done) => {
         let baseConfig = require('../builderConfig.base.json');
         let stubfs = sinon.stub(fs, 'outputFile').callsFake((fileName, config) => {
            config = JSON.parse(config);
            chai.expect(config).to.deep.include(baseConfig);
            done();
         });
         stubArgv.value(['','']);
         let stubModules = sinon.stub(cli, '_getModulesByRepName').callsFake((name) => {
            return [name];
         });
         cli._makeBuilderConfig();
         stubModules.restore();
         stubfs.restore();
      });
   });

   describe('._makeTestConfig()', () => {
      it('should make a config files for each modules in confing', (done) => {
         let baseConfig = require('../testConfig.base.json');
         let configFiles = {};
         let stubfs = sinon.stub(fs, 'outputFile').callsFake((fileName, config) => {
            configFiles[fileName] = JSON.parse(config);
         });
         stubArgv.value(['','']);
         cli._makeTestConfig().then(() => {
            cli._repos[cli._testModule].dependTest.forEach((key) => {
               chai.expect(configFiles).to.have.property('./testConfig_'+key+'.json');
            });
            let config = configFiles['./testConfig_types.json'];
            Object.keys(baseConfig).forEach((key) => {
               chai.expect(config).to.have.property(key);
            });
            done();
         });
         stubfs.restore();
      });
   });

   describe('._findModulesInRepDir()', () => {
      it('should find all modules in repository', () => {
         let stubfs = sinon.stub(fs, 'readdirSync').callsFake((path) => {
            if (path.includes('tttModule')) {
               return ['ttt.txt', 'ttt.s3mod']
            }
            return ['tttModule']
         });
         let stubStat = sinon.stub(fs, 'statSync').callsFake((path) => {
            return {
               isDirectory: () => /.*tttModule$/.test(path)
            }
         });

         chai.expect(['tttModule']).to.deep.equal(cli._findModulesInRepDir('types'));

         stubfs.restore();
         stubStat.restore();
      });
   });
   describe('._getModulesByRepName()', () => {
      let stubFind, stubRepos;
      beforeEach(() => {
         stubFind = sinon.stub(cli, '_findModulesInRepDir').callsFake((path) => {
            return ['test']
         });
         stubRepos = sinon.stub(cli, '_repos').value({
            'test': {
               modules: ['test_config']
            }
         });
      });
      it('should concat modules from config and repository', () => {
         chai.expect(['test', 'test_config']).to.deep.equal(cli._getModulesByRepName('test'));
      });
      it('should return result from cache', () => {
         chai.expect(cli._getModulesByRepName('test')).to.equal(cli._getModulesByRepName('test'));
      });
      afterEach(() => {
         stubFind.restore();
         stubRepos.restore();
      });
   });

   describe('._closeChildProcess()', () => {

      it('should close all child process', (done) => {
         let stubcli = sinon.stub(cli, '_childProcessMap').value([getProcess()]);

         cli._closeChildProcess().then(() => {
            done();
         });

         stubcli.restore();
      });
   });

   describe('._getModuleNameByPath()', () => {
      it('should return name with posix separator', () => {
         chai.expect(cli._getModuleNameByPath('client/str')).to.equal('str');
      });
      it('should return name with windows separator', () => {
         chai.expect(cli._getModuleNameByPath('client\\str')).to.equal('str');
      });
   });

   describe('._getModuleNameByPath()', () => {
      it('should return name with posix separator', () => {
         chai.expect(cli._getModuleNameByPath('client/str')).to.equal('str');
      });
      it('should return name with windows separator', () => {
         chai.expect(cli._getModuleNameByPath('client\\str')).to.equal('str');
      });
   });

   describe('._startBrowserTest()', () => {
      let stubcli, stubfsjson, stubexecute, stubOutputFile;
      beforeEach(() => {
         stubcli = sinon.stub(cli, '_repos').value({
            'test': {
               unitInBrowser: true
            }
         });
         stubfsjson = sinon.stub(fs, 'readJsonSync').callsFake(() => {
            return require('../testConfig.base.json');
         });
      });

      it('shouldnt start test if it node only', () => {
         stubexecute = sinon.stub(cli, '_execute').callsFake(() => {});
         stubOutputFile = sinon.stub(fs, 'outputFileSync').callsFake(() => {
            throw new Error();
         });
         stubcli = sinon.stub(cli, '_repos').value({
            'test': {
               unitInBrowser: false
            }
         });

         chai.expect(() => cli._startBrowserTest('test')).to.not.throw();
      });

      it('should make config', (done) => {
         stubexecute = sinon.stub(cli, '_execute').callsFake(() => {});
         stubOutputFile = sinon.stub(fs, 'outputFileSync').callsFake((file, config) => {
            config = JSON.parse(config);

            chai.expect(config.htmlCoverageReport).to.includes('_browser');
            chai.expect(config.jsonCoverageReport).to.includes('_browser');
            done();
         });

         cli._startBrowserTest('test');
      });

      it('should run test', (done) => {
         stubOutputFile = sinon.stub(fs, 'outputFileSync').callsFake(() => {});
         stubexecute = sinon.stub(cli, '_execute').callsFake((cmd) => {
            chai.expect(cmd).to.includes('--browser');
            done();
         });

         cli._startBrowserTest('test');
      });

      afterEach(() => {
         stubcli.restore();
         stubfsjson.restore();
         stubexecute.restore();
         stubOutputFile.restore();
      });
   });

   describe('_execute', () => {
      const shell = require('shelljs');
      let stubExec;
      it('should execute command', (done) => {
         stubExec = sinon.stub(shell, 'exec').callsFake((cmd) => {
            let process = getProcess();
            setTimeout(() => {
               process.kill();
            });
            chai.expect(cmd).to.equal('cd path && help');
            done();
            return process;
         });
         cli._execute('help', 'path');
      });

      it('should return resolved promise if command result ok', (done) => {
         stubExec = sinon.stub(shell, 'exec').callsFake((cmd) => {
            let process = getProcess();
            setTimeout(() => {
               process.kill();
            });
            return process;
         });
         cli._execute('help', 'path').then(() => {
            done();
         });
      });

      it('should return resolved promise if command result is ok', (done) => {
         stubExec = sinon.stub(shell, 'exec').callsFake((cmd) => {
            let process = getProcess();
            setTimeout(() => {
               process.kill();
            });
            return process;
         });
         cli._execute('help', 'path').then(() => {
            done();
         });
      });

      it('should return rejected promise if command result is fail', (done) => {
         stubExec = sinon.stub(shell, 'exec').callsFake((cmd) => {
            let process = getProcess();
            setTimeout(() => {
               process.kill(2);
            });
            return process;
         });
         cli._execute('help', 'path').catch(() => {
            done();
         });
      });

      it('should return resolved promise if command result is fail and it need force', (done) => {
         stubExec = sinon.stub(shell, 'exec').callsFake((cmd) => {
            let process = getProcess();
            setTimeout(() => {
               process.kill(2);
            });
            return process;
         });
         cli._execute('help', 'path', true).then(() => {
            done();
         });
      });

      it('should return rejected promise if process will be killed', (done) => {
         stubExec = sinon.stub(shell, 'exec').callsFake((cmd) => {
            let process = getProcess();
            process.withErrorKill = true;
            setTimeout(() => {
               process.kill();
            });
            return process;
         });
         cli._execute('help', 'path').catch(() => {
            done();
         });
      });

      afterEach(()=> {
         stubExec.restore();
      })
   });

   describe('_copyUnit', () => {
      let stumbsUnitModules, copySync, stubReaddirSync, stubStat;
      it('should execute command', () => {
         stumbsUnitModules = sinon.stub(cli, '_unitModules').value(['test']);
         let copyFiles = [];
         copySync = sinon.stub(fs, 'copySync').callsFake((name) => {
            copyFiles.push(name);
         });
         stubReaddirSync = sinon.stub(fs, 'readdirSync').callsFake((path) => {
            if (path.includes('test')) {
               return ['ttt.js', 'ttt.test.js']
            }
            return ['test']
         });
         stubStat = sinon.stub(fs, 'statSync').callsFake((path) => {
            return {
               isDirectory: () => /.*test$/.test(path)
            }
         });
         cli._copyUnit();
         chai.expect(copyFiles).to.deep.equal([path.join('test','ttt.js')])
      });
      afterEach(() => {
         stumbsUnitModules.restore();
         copySync.restore();
         stubReaddirSync.restore();
         stubStat.restore();
      });
   })
});
