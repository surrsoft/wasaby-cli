const Shell = require('./shell');
const config = require('./config')
const ERROR_MERGE_CODE = 101;
/**
 * Ксласс содержащий методы работы с гитом
 * @class Git
 * @author Ганшин Я.О
 */
class Git {
   /**
    * Конструктор
    * @param {*} cfg
    */
   constructor(cfg) {
      this._path = cfg.path;
      this._shell = new Shell();
      this._name = cfg.name;
   }

   /**
    * Выполняет git fetch
    * @returns {Promise<any>}
    */
   fetch() {
      return this._shell.execute('git fetch --all --prune', this._path, {
         processName: `${this._name} git fetch`
      });
   }

   /**
    * Выполняет git merge --abort
    * @returns {Promise<any>}
    */
   mergeAbort() {
      return this._shell.execute('git merge --abort', this._path, {
         force: true,
         processName: `${this._name} git merge abort`
      });
   }

   /**
    * Выполняет git reset --hard revision
    * @param {String} revision  uuid комита или ветка
    * @returns {Promise<any>}
    */
   reset(revision) {
      return this._shell.execute(`git reset --hard ${revision}`, this._path, {
         processName: `${this._name} git reset`
      });
   }

   /**
    * Выполняет git clean -fdx
    * @returns {Promise<any>}
    */
   clean() {
      return this._shell.execute('git clean -fdx', this._path, {
         processName: `${this._name} git clean`
      });
   }

   /**
    * Выполняет git checkout
    * @param {String} branch Ветка на которую надо переключится
    * @returns {Promise<any>}
    */
   checkout(branch) {
      return this._shell.execute(`git checkout -f ${branch}`, this._path, {
         processName: `${this._name} git checkout`
      });
   }

   /**
    * Выполняет git merge
    * @param branch Ветка скоторой надо смержится
    * @returns {Promise<void>}
    */
   async merge(branch) {
      try {
         await this._shell.execute(`git merge remotes/origin/${branch}`, this._path, {
            processName: `${this._name} git merge`
         });
      } catch (e) {
         await this.mergeAbort();
         const error = new Error(`Ошибка при мерже '${branch}': ${e}`);
         error.code = ERROR_MERGE_CODE;
         throw error;
      }
   }

   /**
    * Выполняет git update
    * @returns {Promise<void>}
    */
   async update() {
      await this.fetch();
      await this.mergeAbort();
   }

   /**
    * Выполняет git diff возвращает результат
    * @param branch Ветка для которой нужен diff
    * @param rc Рц ветка
    * @returns {Promise<[]>}
    */
   async diff(branch, rc) {
      let res = await this._shell.execute(`git diff --name-only ${branch}..origin/${rc}`, this._path, {
         processName: `${this._name} git diff`
      });

      return res.join('\n').split('\n').filter(name => !!name);
   }

   /**
    * Возвращает текущую ветку репозитория
    * @returns {Promise<string>}
    */
   async getBranch() {
      let res = await this._shell.execute('git symbolic-ref --short HEAD', this._path, {
         processName: `${this._name} git branch`
      });

      return res.length > 0 ? res[0] : '';
   }

   /**
    * Возвращает версию из package.json
    * @returns {String}
    */
   getVersion() {
      const packageConfig = config.getPackageConfig(this._path);
      return config.getVersion(packageConfig);
   }
}

Git.ERROR_MERGE_CODE = ERROR_MERGE_CODE;
module.exports = Git;
