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

    _checkout(branch) {
        return this._shell.execute(`git checkout -f ${branch}`, this._pathToRep, `${this._name} git checkout`);
    }

    async checkout(branch) {
        try {
            await this._checkout(branch);
        } catch (err) {
            if (/rc-.*00/.test(branch)) {
                // для некоторых репозиториев нет ветки yy.v00 только yy.v10 (19.610) в случае
                // ошибки переключаемся на 10 версию
                await this._checkout(branch.replace('00', '10'));
            } else {
                throw new Error(`Ошибка при переключение на ветку ${branch} в репозитории ${this._name}: ${err}`);
            }
        }
    }

    async merge(branch) {
        try {
            await this._shell.execute(`git merge remotes/origin/${branch}`, this._pathToRep, `${this._name} git merge`);
        } catch (e) {
            await this.mergeAbort();
            const error = new Error(`При мерже '${branch}' в '${this._rc}' произошел конфликт`);
            error.code = ERROR_MERGE_CODE;
            throw error;
        }
    }

    async update() {
        await this.fetch();
        await this.mergeAbort();
    }

}

module.exports = Git;