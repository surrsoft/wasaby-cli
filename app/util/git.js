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

    async checkout(commit) {
        try {
            const isBranch = commit.includes('/') || commit.includes('rc-');
            await this.reset(isBranch ? `remotes/origin/${commit}` : commit);
        } catch (err) {
            if (/rc-.*00/.test(commit)) {
                // для некоторых репозиториев нет ветки yy.v00 только yy.v10 (19.610) в случае
                // ошибки переключаемся на 10 версию
                await this.reset(`remotes/origin/${commit.replace('00', '10')}`);
            } else {
                throw new Error(`Ошибка при переключение на ветку ${commit} в репозитории ${name}: ${err}`);
            }
        }
    }

    async merge(branch) {
        try {
            await this._shell.execute(`git merge remotes/origin/${branch}`, this._pathToRep, `${this._name} git merge`);
        } catch (e) {
            await this.mergeAbort();
            const error = new Error(`При мерже '${checkout}' в '${this._rc}' произошел конфликт`);
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