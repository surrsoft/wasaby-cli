const chai = require('chai');
const sinon = require('sinon');
const path = require('path');
const fs = require('fs-extra');
const Sdk = require('../../app/util/sdk');

let sdk;
let stubExecute;

describe('Sdk', () => {
   beforeEach(() => {
      sdk = new Sdk({
         rc: 'rc-10.1000',
         workspace: 'application'
      });
      stubExecute = sinon.stub(sdk._shell, 'execute').callsFake(() => undefined);
   });

   afterEach(() => {
      stubExecute.restore();
   });
   describe('.getPathToJinnee()', () => {
      let stubsdk;
      let stubExistsSync;
      let stubStatSync;

      beforeEach(() => {
         stubsdk = sinon.stub(sdk, 'getPathToSdk').callsFake(() => 'sdk');
         stubExistsSync = sinon.stub(fs, 'existsSync').callsFake(() => true);
         stubStatSync = sinon.stub(fs, 'statSync').callsFake(() => {
            return {isFile: () => false};
         });
      });

      afterEach(() => {
         stubsdk.restore();
         stubExistsSync.restore();
         stubStatSync.restore();
      });

      it('should return path to jinnee', async() => {
         chai.expect(await sdk.getPathToJinnee()).to.equal(path.join('sdk', 'tools', 'jinnee'));
      });

      it('should throw an error when jinnee not exists', (done) => {
         stubExistsSync.callsFake(() => false);
         sdk.getPathToJinnee().catch(() => {
            done();
         });
      });

      it('should unpack archive', (done) => {
         stubStatSync.callsFake(() => {
            return {isFile: () => true};
         });
         stubExecute.callsFake((cmd) => {
            chai.expect(cmd).to.includes(`7za x ${path.join('sdk', 'tools', 'jinnee')}`);
            done();
         });
         sdk.getPathToJinnee();
      });

      it('should return path to unpack archive', async () => {
         stubStatSync.callsFake(() => {
            return {isFile: () => true};
         });
         stubExecute.callsFake((cmd) => {
            chai.expect(cmd).to.includes(`7za x ${path.join('sdk', 'tools', 'jinnee')}`);
         });
         chai.expect(await sdk.getPathToJinnee()).to.equal(path.join('application', 'jinnee'));
      });
   });

   describe('getPathToSdk()', () => {
      let stubSdk;
      let stubExists;

      before(() => {
         process.env.SDK = process.env.SDK || '';
         process.env.SBISPlatformSDK_101000 = process.env.SBISPlatformSDK_101000 || '';
      });

      beforeEach(() => {
         stubExists = sinon.stub(fs, 'existsSync').callsFake(() => true);
      });

      afterEach(() => {
         stubSdk.restore();
         stubExists.restore();
      });

      it('should return sdk path from SDK', () => {
         stubSdk = sinon.stub(process.env, 'SDK').value('path/to/sdk');
         chai.expect(sdk.getPathToSdk()).to.equal('path/to/sdk');
      });

      it('should return sdk path from SDK with version', () => {
         stubSdk = sinon.stub(process.env, 'SBISPlatformSDK_101000').value('path/to/sdk');
         chai.expect(sdk.getPathToSdk()).to.equal('path/to/sdk');
      });

      it('should throw an error when path to sdk is empty', () => {
         stubSdk = sinon.stub(process.env, 'SBISPlatformSDK_101000').value('');
         chai.expect(() => sdk.getPathToSdk()).to.throw();
      });

      it('should throw an error when sdk is not exists', () => {
         stubSdk = sinon.stub(process.env, 'SBISPlatformSDK_101000').value('path/to/sdk');
         stubExists.callsFake(() => false);
         chai.expect(() => sdk.getPathToSdk()).to.throw();
      });
   });
});