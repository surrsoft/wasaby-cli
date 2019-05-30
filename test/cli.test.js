const chai = require('chai');
const Cli = require('./../cli');
const sinon = require('sinon');
let cli;
let stubArgv;
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
         let fs = require('fs-extra');
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
         let fs = require('fs-extra');
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
         let fs = require('fs-extra');
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

   describe('._closeChildProcess()', () => {
      let getProcess = () => {
         return {
            on(prop, callback) {
               this[prop] = callback;
            },

            kill() {
               this.close();
            }
         }
      };
      it('should close all child process', (done) => {
         let stubcli = sinon.stub(cli, '_childProcessMap').value([getProcess()]);

         cli._closeChildProcess().then(() => {
            done();
         });


         stubcli.restore();
      });
   });

   describe('._getModuleNameByPath()', () => {
      it('shoul return name with posix separator', () => {
         chai.expect(cli._getModuleNameByPath('client/str')).to.equal('str');
      });
      it('shoul return name with windows separator', () => {
         chai.expect(cli._getModuleNameByPath('client\\str')).to.equal('str');
      });
   });

   describe('._getModulesByRepName()', () => {
      let stubfs, stubStat, stubCli;
      beforeEach(() => {
         let fs = require('fs-extra');
         stubfs = sinon.stub(fs, 'readdirSync').callsFake((path) => {
            if (path.includes('tttModule')) {
               return ['ttt.txt', 'ttt.s3mod'];
            }
            return ['tttModule'];
         });
         stubStat = sinon.stub(fs, 'statSync').callsFake((path) => {
            return {
               isDirectory: () => /.*tttModule$/.test(path)
            }
         });
         stubCli = sinon.stub(cli, '_repos').value({
            test: {
               modules: ['test']
            }
         });
      });

      it('shoul return concat modules from repository and from config', () => {
         chai.expect(cli._getModulesByRepName('test')).to.deep.equal(['tttModule', 'test']);
      });

      it('shoul return modules from cache', () => {
         chai.expect(cli._getModulesByRepName('test')).to.equal(cli._getModulesByRepName('test'));
      });

      afterEach(() => {
         stubfs.restore();
         stubStat.restore();
         stubCli.restore();
      })
   });

});
