const chai = require('chai');
const CliTest = require('./../cli');
const sinon = require('sinon');
const fs = require('fs-extra');
const path = require('path');
const xml2js = require('xml2js');
let cli;
let stubArgv;
let stubBuilder;

describe('CLI', () => {
   beforeEach(() => {
      stubArgv = sinon.stub(process, 'argv').value(['','', '--rep=types', '--branch=200/feature', '--rc=rc-200']);
      cli = new CliTest();
   });

   afterEach(() => {
      stubArgv.restore();
   });

   describe('._getArgvOptions()', () => {
      it('should return argv options', () => {
         stubArgv.value(['','','--rep=12', '--b=15']);
         let config = cli._getArgvOptions();
         chai.expect(config).to.be.an('object').to.deep.equal({rep:'12',b:'15'});
      });
   });

   // describe('.init()', () => {
   //    it('should throw error when rep is empty', () => {
   //       stubArgv.value(['','']);
   //       chai.expect(() => cli.init()).to.throw();
   //    });
   //    it('should set params from argv', () => {
   //       chai.expect(cli._testBranch).to.equal('200/feature');
   //       chai.expect(cli._testRep[0]).to.equal('types');
   //       chai.expect(cli._rc).to.equal('rc-200');
   //    });
   //    it('should set params from config', () => {
   //       const config = require('./../config.json');
   //       chai.expect(cli._repos).to.deep.equal(config.repositories);
   //       chai.expect(cli._store).to.equal(path.join(process.cwd(), config.store));
   //       chai.expect(cli._workDir).to.equal(path.join(process.cwd(),config.workDir));
   //    });
   // });

});
