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
         chai.expect('rc-20.2000').to.equal(config.get({}).rc);
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
         chai.expect(expectedCfg.repositories).to.deep.equal(config.get({}).repositories);
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
         chai.expect(expected).to.deep.equal(config.get({}).repositories['test']);
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
            url: 'https://platform-git.sbis.ru/test11.git'
         };
         chai.expect(expected).to.deep.equal(config.get({}).repositories['test']);
      });


      it('should make git url', async () => {
         stubReadJSON.callsFake((path) => {
            if (path.includes('config.json')) {
               return {
                  "gitMirror": "platform-git.sbis.ru",
                  "repositories": {
                     "test1": {
                        "mirror": "git.sbis.ru",
                        "url": "test/test1"
                     },
                     "test2": {
                        "url": "test/test2"
                     }
                  }
               };
            } else {
               return stubReadJSON.wrappedMethod(path);
            }
         });
         const ssh = {
            protocol: 'ssh'
         };
         chai.expect('https://git.sbis.ru/test/test1.git').to.deep.equal(config.get({}).repositories.test1.url);
         chai.expect('https://platform-git.sbis.ru/test/test2.git').to.deep.equal(config.get({}).repositories.test2.url);
         chai.expect('git@platform-git.sbis.ru:test/test2.git').to.deep.equal(config.get(ssh).repositories.test2.url);
      });
   });
});