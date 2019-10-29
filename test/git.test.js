//tslint:disable:no-unused-expression
//tslint:disable:one-variable-per-declaration

const chai = require('chai');
const sinon = require('sinon');
const Git = require('../app/util/git');
const shell = require('../app/util/shell');

let git;
let stubExecute;

describe('Store', () => {
    beforeEach(() => {
        stubExecute = sinon.stub(shell.prototype, 'execute').callsFake(() => {});
        git = new Git({
            rc: 'path/to',
            name: 'name',
        });
    });
    afterEach(() => {
        stubExecute.restore();
    });
    describe('pull', () => {
        it('should call git pull', (done) => {
            stubExecute.callsFake((cmd) => {
                chai.expect(cmd).to.includes('pull');
                done();
                return Promise.resolve();
            });

            git.pull('test');
        });

        it('should call git pull', () => {
            let cmdArray = [];
            stubExecute.callsFake((cmd) => {
                if (cmd.includes('pull')) {
                    return Promise.reject();
                } else {
                    cmdArray.push(cmd);
                }
                return Promise.resolve();
            });

            return git.pull('test').then(function () {
                chai.expect(cmdArray[0]).to.includes('merge --abort');
                chai.expect(cmdArray[1]).to.includes('reset --hard origin/test');
            });
        });
    });
});
