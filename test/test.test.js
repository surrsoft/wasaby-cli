const chai = require('chai');
const sinon = require('sinon');
const fs = require('fs-extra');
const Test = require('../app/test');
let xml = require('../app/util/xml');


let test;
describe('Test', () => {
   beforeEach(() => {
      test = new Test({
         rc: 'rc-12',
         store: '',
         repos: {
            test1: {},
            test2: {}
         },
         workspace: '',
         workDir: '',
         resources: ''
      });
   });

   describe('._makeTestConfig()', () => {
      let stubfs, stubTestList;
      beforeEach(() => {
         stubTestList = sinon.stub(test._modulesMap, 'getTestList').callsFake((name) => {
            return ['test1', 'test2'];
         });
      });
      it('should make a config files for each modules in confing', (done) => {
         let baseConfig = require('../testConfig.base.json');
         let configFiles = {};
         stubfs = sinon.stub(fs, 'outputFileSync').callsFake((fileName, config) => {
            configFiles[fileName] = JSON.parse(config);
         });
         test._makeTestConfig().then(() => {
            test._modulesMap.getTestList().forEach((key) => {
               chai.expect(configFiles).to.have.property('./testConfig_' + key + '.json');
            });
            let config = configFiles['./testConfig_test1.json'];
            Object.keys(baseConfig).forEach((key) => {
               chai.expect(config).to.have.property(key);
            });
            done();
         });
      });
      afterEach(() => {
         stubTestList.restore();
         stubfs.restore();
      });
   });

   describe('._startBrowserTest()', () => {
      let stubcli, stubfsjson, stubexecute, stubOutputFile;
      beforeEach(() => {
         stubcli = sinon.stub(test, '_repos').value({
            'test': {
               unitInBrowser: true
            }
         });
         stubfsjson = sinon.stub(fs, 'readJsonSync').callsFake(() => {
            return require('../testConfig.base.json');
         });
      });

      it('shouldnt start test if it node only', () => {
         stubexecute = sinon.stub(test._shell, 'execute').callsFake(() => {
         });
         stubOutputFile = sinon.stub(fs, 'outputFileSync').callsFake(() => {
            throw new Error();
         });
         stubcli = sinon.stub(test, '_repos').value({
            'test': {
               unitInBrowser: false
            }
         });

         chai.expect(() => test._startBrowserTest('test')).to.not.throw();
      });

      it('should run test', (done) => {
         stubOutputFile = sinon.stub(fs, 'outputFileSync').callsFake(() => {
         });
         stubexecute = sinon.stub(test._shell, 'execute').callsFake((cmd) => {
            chai.expect(cmd).to.includes('--browser');
            done();
         });

         test._startBrowserTest('test');
      });

      afterEach(() => {
         stubcli.restore();
         stubfsjson.restore();
         stubexecute.restore();
         stubOutputFile.restore();
      });
   });

   describe('.checkReport()', () => {
      let stubTestReports, stubexistsSync, stubOtput;
      it('should create report when it not exists', (done) => {
         stubTestReports = sinon.stub(test, '_testReports').value(['test', 'test1']);
         stubexistsSync = sinon.stub(fs, 'existsSync').callsFake((name) => {
            if (name == 'test1') {
               return false;
            }
            return true;
         });
         stubOtput = sinon.stub(fs, 'outputFileSync').callsFake((name, text) => {
            chai.expect(name).to.includes('test1');
            done();
         });
         test.checkReport();
      });
      it('should not throw an error', () => {
         stubTestReports = sinon.stub(test, '_testReports').value(['test', 'test1']);
         stubexistsSync = sinon.stub(fs, 'existsSync').callsFake((name) => {
            return true;
         });

         chai.expect(() => {
            test.checkReport()
         }).to.not.throw();
      });
      afterEach(() => {
         stubTestReports.restore();
         stubexistsSync.restore();
         stubOtput && stubOtput.restore();
      });
   });

   describe('.startTest()', () => {
      let stubmakeTestConfig, stubstartBrowserTest, stubtestList, stubExecute, stubBuild;
      beforeEach(() => {
         stubmakeTestConfig = sinon.stub(test, '_makeTestConfig').callsFake(() => {
            return Promise.resolve();
         });
         stubstartBrowserTest = sinon.stub(test, '_startBrowserTest').callsFake(() => {
            return Promise.resolve();
         });
         stubBuild = sinon.stub(test._modulesMap, 'build').callsFake(() => {});
         stubtestList = sinon.stub(test._modulesMap, 'getTestList').callsFake(() => ['engine']);
      });
      it('should start test', (done) => {
         let commandsArray = [];
         stubExecute = sinon.stub(test._shell, 'execute').callsFake((cmd) => {
            commandsArray.push(cmd);
            chai.expect(commandsArray).to.includes('node node_modules/saby-units/cli.js --isolated --report --config="./testConfig_engine.json"');
            return Promise.resolve();
         });
         test.run().then(() => {
            done();
         });
      });

      afterEach(() => {
         stubmakeTestConfig.restore();
         stubstartBrowserTest.restore();
         stubtestList.restore();
         stubBuild.restore();
         stubExecute && stubExecute.restore();
      });
   });

   describe('.prepareReport()', () => {
      let stubRead, stubWrite, stubTestReports, fsExistsSync, stubTestError;
      beforeEach(() => {
         stubWrite = sinon.stub(xml, 'writeXmlFile').callsFake(() => {
         });
         stubTestError = sinon.stub(test, '_testErrors').value({});
         stubTestReports = sinon.stub(test, '_testReports').value(new Map([['test', {}], ['test1', {}]]));
         stubRead = sinon.stub(fs, 'readFileSync').callsFake(() => {
            return '<testsuite><testcase classname="test1"></testcase></testsuite>';
         });
         fsExistsSync = sinon.stub(fs, 'existsSync').callsFake(() => true);
      });

      it('should return all test', (done) => {
         stubWrite.callsFake(function (name, obj) {
            chai.expect(obj.testsuite.testcase[0].$.classname).to.equal('[test]: test1');
            done();
         });
         test.prepareReport();
      });

      it('should make failure report if it is empty', (done) => {
         stubRead.callsFake(() => '<testsuite></testsuite>');
         stubTestReports = sinon.stub(test._modulesMap, 'getTestModules').callsFake(() => ['test']);
         stubTestError.value({test: ['error']});
         stubWrite.callsFake((name, obj) => {
            chai.expect(obj.testsuite.testcase[0].failure).to.equal('error');
            done();
         });
         test.prepareReport();
      });

      afterEach(() => {
         stubWrite.restore();
         stubRead.restore();
         stubTestReports.restore();
         fsExistsSync.restore();
         stubTestError.restore();
      });
   });
});
