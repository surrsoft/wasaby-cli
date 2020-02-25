const chai = require('chai');
const sinon = require('sinon');
const DevServer = require('../app/devServer');
const shell = require('../app/util/shell');
const xml = require('../app/xml/xml');
const fs = require('fs-extra');
const Sdk = require('../app/util/sdk');

let devServer;
let stubExecute;
let stubxml;
let fsRead;
let fsOutput;
let fsOutputSync;
let fsAppend;
describe('DevServer', () => {
   beforeEach(() => {
      stubExecute = sinon.stub(shell.prototype, 'execute').callsFake(() => Promise.resolve());
      fsRead = sinon.stub(fs, 'readFile').callsFake(() => Promise.resolve(''));
      fsOutput = sinon.stub(fs, 'outputFile').callsFake(() => Promise.resolve());
      devServer = new DevServer({
         workDir: 'application',
         store: 'store',
         rc: '10.1000',
         project: '/path/to/project.s3srv',
      });
      stubxml = sinon.stub(xml, 'readXmlFile').callsFake(() => ({
         cloud: {
            $: {name: 'project'},
            items: [{service: [{$:{url:'./srv1.s3srv'}},{$:{url:'./srv2.s3srv'}}]}]
         }
      }));
      fsAppend = sinon.stub(fs, 'appendFileSync').callsFake(() => undefined);
      fsOutputSync = sinon.stub(fs, 'outputFileSync').callsFake(() => undefined);
   });

   afterEach(() => {
      stubExecute.restore();
      stubxml.restore();
      fsOutputSync.restore();
      fsOutput.restore();
      fsRead.restore();
      fsAppend.restore();
   });

   describe('.start()', () => {
      let stublinkFs;
      beforeEach(() => {
         stublinkFs = sinon.stub(fs, 'ensureSymlink').callsFake();
      });
      afterEach(() => {
         stublinkFs.restore();
      });
      it('should start dev server', (done) => {
         stubExecute.callsFake((cmd) => {
            chai.expect(cmd).includes('sbis-daemon').and.includes('--http');
            done();
            stubExecute.callsFake(() => Promise.resolve())
            return Promise.resolve();
         });
         devServer.start();
      });
      it('should link cdn', (done) => {
         stublinkFs.callsFake((path) => {
            chai.expect(path).includes('cdn');
            done();
         });
         devServer.start();
      });
   });

   describe('.convertDB()', () => {
      let stubJinneePath;
      beforeEach(() => {
         stubJinneePath = sinon.stub(Sdk.prototype, 'getPathToJinnee').callsFake(() => 'path/to/jinneee');
      });
      afterEach(() => {
         stubJinneePath.restore();
      });
      it('should start dev server', (done) => {
         stubExecute.callsFake((cmd) => {
            chai.expect(cmd).includes('libjinnee-db-converter');
            done();
            stubExecute.callsFake(() => undefined);
         });
         devServer.convertDB();
      });
   });
});
