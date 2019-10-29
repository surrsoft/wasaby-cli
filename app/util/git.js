const Shell = require('./shell');
const logger = require('./logger');

class Git {
    constructor(cfg) {
        this._pathToRep = cfg.path;
        this._shell = new Shell();
        this._name = cfg.name;
    }

    fetch() {
        return this._shell.execute('git fetch --all --prune', this._pathToRep, `${this._name} git fetch`);
    }

    mergeAbort() {
        return this._shell.execute('git merge --abort', this._pathToRep, true, `${this._name} git merge abort`);
    }

    reset(revision) {
        return this._shell.execute(`git reset --hard ${revision}`, this._pathToRep, `${this._name} git reset`);
    }

    clean() {
        return this._shell.execute('git clean -fdx', this._pathToRep, `${this._name} git clean`);
    }

    checkout(branch) {
        return this._shell.execute(`git checkout -f ${branch}`, this._pathToRep, `${this._name} git checkout`);
    }

    merge(branch) {
        return this._shell.execute(`git merge remotes/origin/${branch}`, this._pathToRep, `${this._name} git merge`);
    }

    async update() {
        await this.fetch();
        await this.mergeAbort();
        await this.reset('HEAD');
        await this.clean();
    }

    async pull(checkoutBranch) {
        try {
            await this._shell.execute('git pull -f', this._pathToRep, `${this._name} git pull`);
        } catch (e) {
            logger.log(`При пуле ветки произошла ошибка: ${e}`, `${this._name} git pull`);
            await this.mergeAbort();
            await this.reset(`origin/${checkoutBranch}`);
        }
    }

}

module.exports = Git;