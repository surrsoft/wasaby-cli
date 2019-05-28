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
         cli.init();
         chai.expect(cli._testBranch).to.equal('200/feature');
         chai.expect(cli._testModule).to.equal('types');
         chai.expect(cli._rc).to.equal('rc-200');
      });
      it('should set params from config', () => {
         cli.init();
         const config = require('./../config.json');
         chai.expect(cli._repos).to.deep.equal(config.repositories);
         chai.expect(cli._store).to.equal(config.store);
         chai.expect(cli._workDir).to.equal(config.workDir);
      });
   });
   describe('._makeBuilderConfig()', () => {
      it('should throw error when rep is empty', () => {
         let fs = require('fs-extra');
         let stubfs = sinon.stub(fs, 'outputFile');
         stubArgv.value(['','']);
         chai.expect(() => cli.init()).to.throw();
      });
   });
});
