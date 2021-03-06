const chai = require('chai');
const Cli = require('./../cli');
const sinon = require('sinon');
const fs = require('fs-extra');
let cli;
let stubArgv;
let stubfs;
describe('CLI', () => {
   beforeEach(() => {
      stubArgv = sinon.stub(process, 'argv').value(['', '', '--rep=types', '--branch=200/feature', '--rc=rc-200']);
      stubArgv = sinon.stub(process, 'argv').value(['', '', '--rep=types', '--branch=200/feature', '--rc=rc-200']);
      stubfs = sinon.stub(fs, 'writeFileSync').callsFake(() => {});
      cli = new Cli();
   });

   afterEach(() => {
      stubArgv.restore();
      stubfs.restore();
   });

   describe('._getArgvOptions()', () => {
      it('should return argv options', () => {
         stubArgv.value(['', '', '--rep=12', '--b=15']);
         let config = Cli._getArgvOptions();
         chai.expect(config).to.be.an('object').to.deep.equal({
            b: '15',
            rep: '12'
         });
      });
   });

   describe('.constructor()', () => {
      it('should trim repository name', () => {
         stubArgv = stubArgv.value(['', '', '--rep=saby-types, sbis3-controls', '--branch=200/feature', '--rc=rc-200']);
         cli = new Cli();
         chai.expect(cli._testRep).to.deep.equal(['saby-types', 'sbis3-controls']);
      });
   });

});
