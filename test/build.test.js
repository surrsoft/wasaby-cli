const chai = require('chai');
const sinon = require('sinon');
const fs = require('fs-extra');
const Build = require('../app/build');

let build;

describe('Build', () => {
   beforeEach(() => {
      build = new Build({
         testRep: ['test1'],
         reposConfig: {
            test1: {},
            test2: {},
            'sbis3-ws': {}
         },
         store: ''
      });

   });

   describe('._run', () => {
      it('should run builder', (done) => {
         let buildB = new Build({
            testRep: ['test1'],
            reposConfig: {
               test1: {}
            },
            store: '',
            buildTools: 'builder'
         });
         sinon.stub(buildB, '_modulesMap').value({build: () => undefined});
         sinon.stub(buildB, '_tslibInstall').callsFake(() => undefined);
         sinon.stub(buildB, '_initWithBuilder').callsFake(() => {
            done();
         });
         buildB._run();
      });
      it('should run genie', (done) => {
         let buildG = new Build({
            testRep: ['test1'],
            reposConfig: {
               test1: {}
            },
            store: '',
            buildTools: 'jinnee'
         });
         sinon.stub(buildG, '_modulesMap').value({build: () => undefined});
         sinon.stub(buildG, '_tslibInstall').callsFake(() => undefined);
         sinon.stub(buildG, '_initWithGenie').callsFake(() => {
            done();
         });
         buildG._run();
      });
   });
   describe('._makeBuilderConfig()', () => {
      let stubfs;
      beforeEach(() => {
         stubfs = sinon.stub(fs, 'outputFile').callsFake(() => undefined);
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
      it('should make builder config like base', (done) => {
         let baseConfig = require('../builderConfig.base.json');
         stubfs.callsFake((fileName, config) => {
            config = JSON.parse(config);
            chai.expect(config).to.deep.include(baseConfig);
            done();
         });

         build._makeBuilderConfig(baseConfig.output);
      });

      afterEach(() => {
         stubfs.restore();
      });
   });

   describe('.prepareSrv()', () => {
      const xml = require('../app/util/xml');
      let stubxmlRead;
      let stubxmlWrite;
      let stubExists;
      let buildMap;

      beforeEach(() => {
         stubxmlRead = sinon.stub(xml, 'readXmlFile').callsFake((path) => {
            if (path === 'test1.s3srv') {
               return {
                  service: {
                     items: [
                        {
                           ui_module: [
                              {
                                 $: {
                                    name: 'test11',
                                    url: 'url'
                                 }
                              }
                           ]
                        }
                     ],
                     parent: [
                        {
                           $: {
                              path: 'test2.s3srv'
                           }
                        }
                     ]
                  }
               };
            } else if (path === 'test2.s3srv') {
               return {
                  service: {
                     items: [
                        {
                           ui_module: [
                              {
                                 $: {
                                    name: 'test22',
                                    url: 'url'
                                 }
                              }
                           ]
                        }
                     ]
                  }
               };
            }
         });
         stubxmlWrite = sinon.stub(xml, 'writeXmlFile').callsFake(() => undefined);
         buildMap = sinon.stub(build, '_modulesMap').value(new Map([
            [
               'test11',
               {
                  name: 'test11',
                  rep: 'test1',
                  forTests: true,
                  s3mod: 'test11/test11.s3mod'
               }
            ], [
               'test22',
               {
                  name: 'test2',
                  rep: 'test2',
                  forTests: true,
                  s3mod: 'test11/test22.s3mod'
               }
            ]
         ]));
         stubExists = sinon.stub(fs, 'existsSync').callsFake((name) => {
            return name.includes('test1.s3srv');
         });
      });

      it('should replace path to modules', (done) => {
         build._prepareSrv('test1.s3srv');
         stubxmlWrite.callsFake((filePath, srv) => {
            chai.expect(srv.service.items[0].ui_module[0].$.url).to.include('test11.s3mod');
            done();
         });
      });

      it('should prepare parent s3srv', (done) => {
         stubExists.callsFake(() => true);
         build._prepareSrv('test1.s3srv');
         stubxmlWrite.callsFake((filePath, srv) => {
            if (filePath.includes('test2.s3srv')) {
               chai.expect(srv.service.items[0].ui_module[0].$.url).to.include('test22.s3mod');
               done();
            }
         });
      });

      afterEach(() => {
         stubxmlRead.restore();
         stubxmlWrite.restore();
         stubExists.restore();
         buildMap.restore();
      });
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
      });
   });
});
