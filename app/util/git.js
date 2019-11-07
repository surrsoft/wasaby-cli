const Shell = require('./shell');
const logger = require('./logger');

class Git {
    constructor(cfg) {
        this._pathToRep = cfg.path;
        this._shell = new Shell();
        this._name = cfg.name;
    }

    fetch() {
        return this._shell.execute('git fetch --all --prune', this._pathToRep, {
            name: `${this._name} git fetch`
        });
    }

    mergeAbort() {
        return this._shell.execute('git merge --abort', this._pathToRep, {
            force: true,
            name: `${this._name} git merge abort`
        });
    }

    reset(revision) {
        return this._shell.execute(`git reset --hard ${revision}`, this._pathToRep, {
            name:`${this._name} git reset`
        });
    }

    clean() {
        return this._shell.execute('git clean -fdx', this._pathToRep, {
            name:`${this._name} git clean`
        });
    }

    checkout(branch) {
        return this._shell.execute(`git checkout -f ${branch}`, this._pathToRep, {
            name:`${this._name} git checkout`
        });
    }

    async merge(branch) {
        try {
            await this._shell.execute(`git merge remotes/origin/${branch}`, this._pathToRep, {
                name:`${this._name} git merge`
            });
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

    async diff(branch, rc) {
        let res = await this._shell.execute(`git diff --name-only ${branch}..origin/${rc}`, this._pathToRep, {
            name:`${this._name} git diff`
        });

        return res.join('\n').split('\n').filter((name) => !!name);
    }

    async getBranch() {
        let res = await this._shell.execute(`git symbolic-ref --short HEAD`, this._pathToRep, {
            name:`${this._name} git branch`
        });

        return res.length > 0 ? res[0] : '';
    }

}

module.exports = Git;