const chai = require('chai');
const sinon = require('sinon');
const fs = require('fs-extra');
const Build = require('../app/build');


let build;
describe('Build', () => {
   beforeEach(() => {
      build = new Build({
         testRep: ['test1'],
         repos: {
            test1: {},
            test2: {}
         },
         store: ''
      });

   });
   describe('._makeBuilderConfig()', () => {
      let stubfs;
      beforeEach(() => {
         stubfs = sinon.stub(fs, 'outputFile').callsFake(() => {
         });
         sinon.stub(build, '_modulesMap').value({
            getTestList: () => {
               return ['test1', 'test2'];
            },
            getModulesByRep: (name) => {
               return [name];
            },
            getChildModules: () => {
               return [];
            }
         });
      });
      it('should throw error when rep is empty', (done) => {
         let baseConfig = require('../builderConfig.base.json');
         stubfs.callsFake((fileName, config) => {
            config = JSON.parse(config);
            chai.expect(config).to.deep.include(baseConfig);
            done();
         });

         build._makeBuilderConfig();
      });


      afterEach(() => {
         stubfs.restore();
      });
   });

   describe('.run()', () => {

   });

   describe('._tslibInstall()', () => {
      let stubExecute;
      it('should copy ts config', (done) => {
         let cmd;
         stubExecute = sinon.stub(build._shell, 'execute').callsFake((c) => {
            cmd = c;
            return Promise.resolve();
         });
         build._tslibInstall().then(() => {
            chai.expect(cmd).to.includes('tslib.js');
            done();
         });
      });

      afterEach(() => {
         stubExecute.restore();
      })
   });
});
