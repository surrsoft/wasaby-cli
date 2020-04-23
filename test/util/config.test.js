const chai = require('chai');
const config = require('../../app/util/config');
const sinon = require('sinon');
const fs = require('fs-extra');

describe('config', () => {
   describe('.get()', () => {
      let stubReadJSON;
      beforeEach(() => {
         stubReadJSON = sinon.stub(fs, 'readJSONSync').callsFake(() => {});
      });
      afterEach(() => {
         stubReadJSON.restore();
      });

      it('should consists version', async () => {
         stubReadJSON.callsFake((path) => {
            if (path.includes('package.json')) {
               return {version: '20.2000.0'};
            } else {
               return stubReadJSON.wrappedMethod(path);
            }
         });
         chai.expect('rc-20.2000').to.equal(config.get().rc);
      });

      it('should consists repositotires config', async () => {
         const expectedCfg = {
            repositories: {
               test: {
                  url: "test"
               }
            }
         };
         stubReadJSON.callsFake((path) => {
            if (path.includes('config.json')) {
               return expectedCfg;
            } else {
               return stubReadJSON.wrappedMethod(path);
            }
         });
         chai.expect(expectedCfg.repositories).to.deep.equal(config.get().repositories);
      });

      it('should add new repository', async () => {
         stubReadJSON.callsFake((path) => {
            if (path.includes('package.json')) {
               return {
                  name: 'test',
                  version: '20.2000.0'
               };
            } else {
               return stubReadJSON.wrappedMethod(path);
            }
         });
         const expected = {
            path: process.cwd(),
            skipStore: true
         };
         chai.expect(expected).to.deep.equal(config.get().repositories['test']);
      });

      it('should add path to existed repository', async () => {
         stubReadJSON.callsFake((path) => {
            if (path.includes('package.json')) {
               return {
                  name: 'test',
                  version: '20.2000.0'
               };
            } else {
               const cfg = stubReadJSON.wrappedMethod(path);
               cfg.repositories = {
                  'test': {
                     'url': 'test11'
                  }
               };
               return cfg;
            }
         });
         const expected = {
            path: process.cwd(),
            skipStore: true,
            url: 'test11'
         };
         chai.expect(expected).to.deep.equal(config.get().repositories['test']);
      });
   });
});