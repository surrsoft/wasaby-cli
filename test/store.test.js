const chai = require('chai');
const sinon = require('sinon');
const fs = require('fs-extra');
const path = require('path');
const Store = require('../app/store');

let store;

describe('Store', () => {
   beforeEach(() => {
      store = new Store({
         rc: 'rc-12',
         store: '',
         argvOptions:{},
         repos: {
            test1: {},
            test2: {}
         }
      });

   });
   describe('initRep', () => {
      var stubCheckout, stubClone, stubMkDir;
      beforeEach(() => {
         stubMkDir = sinon.stub(fs, 'mkdirs').callsFake(() => {
            return Promise.resolve();
         })
      });
      it('should checkout brunch', (done) => {
         stubCheckout = sinon.stub(store, 'checkout').callsFake((name, branch) => {
            chai.expect(name).to.equal('test');
            chai.expect(branch).to.equal(store._rc);
            done();
         });
         stubClone = sinon.stub(store, 'cloneRepToStore').callsFake((name) => {
            chai.expect(name).to.equal('test');
            return Promise.resolve('testPath')
         });
         store.initRep('test');
      });
      it('should checkout brunch version 19.999/test', (done) => {
         stubCheckout = sinon.stub(store, 'checkout').callsFake((name, branch, pathToRepos) => {
            chai.expect(branch).to.equal('19.999/test');
            done();
         });
         stubClone = sinon.stub(store, 'cloneRepToStore').callsFake((name) => {
            return Promise.resolve()
         });
         let stubArgv = sinon.stub(store, '_argvOptions').value({test: '19.999/test'});
         store.initRep('test');
         stubArgv.restore();
      });
      it('should copy rep', (done) => {
         stubClone = sinon.stub(store, 'copyRepToStore').callsFake((path) => {
            chai.expect(path).to.equal('pathToTest');
            done();
         });
         let stubArgv = sinon.stub(store, '_argvOptions').value({test: 'pathToTest'});
         let stubfs = sinon.stub(fs, 'existsSync').callsFake(() => {
            return true;
         });

         store.initRep('test');

         stubArgv.restore();
         stubfs.restore();
      });

      afterEach(() => {
         stubCheckout.restore();
         stubClone.restore();
         stubMkDir.restore();
      });
   });

   describe('.cloneRepToStore()', () => {
      let stubRepos, stubExecute, stubfs;
      beforeEach(() => {
         stubRepos = sinon.stub(store, '_repos').value({
            test: {
               url: 'test@test.git'
            }
         });
         stubfs = sinon.stub(fs, 'existsSync').callsFake(() => false)
      });

      it('cloneRepToStore', (done) => {
         stubExecute = sinon.stub(store._shell, 'execute').callsFake((cmd) => {
            chai.expect(cmd).to.equal('git clone test@test.git test');
            done();
            return Promise.resolve();
         });

         store.cloneRepToStore('test');

      });

      it('cloneRepToStore2', (done) => {
         stubExecute = sinon.stub(store._shell, 'execute').callsFake((cmd) => {
            return Promise.reject();
         });

         store.cloneRepToStore('pathToTest', 'test').catch(() => {
            done();
         });
      });

      afterEach(() => {
         stubExecute.restore();
         stubRepos.restore();
         stubfs.restore();
      })
   });

   describe('.checkout()', () => {
      let stubExecute, stubModule;

      it('should checkout branch', (done) => {
         stubExecute = sinon.stub(store._shell, 'execute').callsFake((cmd, path, label) => {
            if (label.includes('git_checkout')) {
               chai.expect(cmd).to.equal('git checkout branch');
               done();
            }
            return Promise.resolve();
         });

         store.checkout('name', 'branch', 'pathToRep');
      });

      it('should throw error if checkoutBranch is undefined', (done) => {
         store.checkout('name').catch(() => {
            done();
         });
      });

      it('should merge branch with rc', (done) => {
         let commandsArray = [];
         stubExecute = sinon.stub(store._shell, 'execute').callsFake((cmd) => {
            commandsArray.push(cmd);
            return Promise.resolve();
         });
         stubModule = sinon.stub(store, '_testRep').value('test');
         store.checkout('test', 'branch', 'pathToRep').then(() => {
            chai.expect(`git merge origin/${store._rc}`).to.equal(commandsArray[4]);
            done();
         });
      });

      it('should throw error if merge is failed', (done) => {
         stubExecute = sinon.stub(store._shell, 'execute').callsFake((cmd) => {
            if (cmd.includes('merge')) {
               return Promise.reject();
            } else {
               return Promise.resolve();
            }
         });
         stubModule = sinon.stub(store, '_testRep').value('test');
         store.checkout('test', 'branch', 'pathToRep').catch(() => {
            done();
         });
      });

      it('should throw error if checkout is failed', (done) => {
         stubExecute = sinon.stub(store._shell, 'execute').callsFake((cmd) => {
            if (cmd.includes('checkout')) {
               return Promise.reject();
            } else {
               return Promise.resolve();
            }
         });
         stubModule = sinon.stub(store, '_testRep').value('test');
         store.checkout('test', 'branch', 'pathToRep').catch(() => {
            done();
         });
      });


      afterEach(() => {
         stubExecute.restore();
         stubModule && stubModule.restore();
      });
   });

   describe('.run()', () => {
      let stubmkdirs, stubRepos, initRepStore;
      it('should make store dir', (done) => {
         let makeDir;
         stubmkdirs = sinon.stub(fs, 'mkdirs').callsFake((path) => {
            makeDir = path;
         });
         stubRepos = sinon.stub(store, '_repos').value({});
         initRepStore = sinon.stub(store, 'initRep').callsFake((path) => {
         });
         store.run().then(() => {
            chai.expect(makeDir).to.equal(store._store);
            done();
         });
      });

      afterEach(() => {
         stubmkdirs && stubmkdirs.restore();
         stubRepos && stubRepos.restore();
         initRepStore && initRepStore.restore();
      });
   });
});
