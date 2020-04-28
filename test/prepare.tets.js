const chai = require('chai');
const sinon = require('sinon');
const fs = require('fs-extra');
const path = require('path');
const Prepare = require('../app/prepare');

let makeConfig;
let writeJSON;
let existsSync;
describe('Store', () => {
   beforeEach(() => {
      prepare = new Prepare({
         reposConfig: {
            test1: {},
            test2: {}
         },
         store: 'store',
         testRep: ['name'],
         resources: 'application'
      });
      writeJSON = sinon.stub(fs, 'writeJSON').callsFake(() => undefined);
      existsSync = sinon.stub(fs, 'existsSync').callsFake(() => undefined);
   });
   afterEach(() => {
      writeJSON.restore();
      existsSync.restore();
   });

   describe('_writeConfig', () => {
      let stubRemove;
      beforeEach(() => {
         stubRemove = sinon.stub(fs, 'remove').callsFake(() => undefined);
      });
      afterEach(() => {
         stubRemove.restore();
      });
      it('should write config', (done) => {
         writeJSON.callsFake(() => {
            done();
         });
         prepare._writeConfig('path/to/config');
      });

      it('should remove config if it exists', (done) => {
         existsSync.callsFake(() => true);
         stubRemove.callsFake(() => {
            done();
         });
         prepare._writeConfig('path/to/config');
      });
   });

   describe('_getPathFromConfig', () => {
      let readJSON;
      beforeEach(() => {
         readJSON = sinon.stub(fs, 'readJSON').callsFake(() => ({
            compilerOptions: {
               paths: {
                  module: ['path/to/module']
               }
            }
         }));
      });
      afterEach(() => {
         readJSON.restore();
      });

      it('should return paths', async () => {
         let paths = await prepare._getPathFromConfig('path/to/config');
         chai.expect({module: ['path/to/module']}).to.deep.equal(paths);
      });
   });

   describe('_getPaths', () => {
      let modulesMapList, modulesMapGet;
      beforeEach(() => {
         modulesMapList = sinon.stub(prepare._modulesMap, 'getChildModules').callsFake(() => (['testModule']));
         modulesMapGet = sinon.stub(prepare._modulesMap, 'get').callsFake(() => ({
            name: 'testModule',
            path: 'path/to/module'
         }));
      });
      afterEach(() => {
         modulesMapList.restore();
      });

      it('should return paths', async () => {
         let paths = await prepare._getPaths();
         chai.expect(paths).to.have.property('testModule/*');
      });
   });


});