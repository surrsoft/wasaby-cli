const fs = require('fs-extra');
const path = require('path');
const logger = require('./util/logger');
const Base = require('./base');
const Git = require('./util/git');

const ERROR_MERGE_CODE = 101;

class Store extends Base {
   constructor(cfg) {
      super(cfg);
      this._store = cfg.store;
      this._argvOptions = cfg.argvOptions;
      this._reposConfig = cfg.reposConfig;
      this._rc = cfg.rc;
      this._testRep = cfg.testRep;
   }

   /**
    *
    * @return {Promise<void>}
    */
   async _run() {
      logger.log('Инициализация хранилища');
      try {
         await fs.mkdirs(this._store);
         await Promise.all(Object.keys(this._reposConfig).map((name) => {
            return this.initRep(name).catch(error => {
               if (error.code === ERROR_MERGE_CODE) {
                  logger.log(`Удаление репозитория ${name}`);
                  fs.rmdirSync(path.join(this._store, name));
                  logger.log(`Повторное клонирование ${name}`);
                  return this.initRep(name);
               }
               throw error;
            });
         }));
         logger.log('Инициализация хранилища завершена успешно');
      } catch (e) {
         throw new Error(`Инициализация хранилища завершена с ошибкой ${e}`);
      }
   }

   /**
    * Инициализация хранилища, клонирует/копирует репозитории переключает на нужные ветки
    * @param {String} name - название репозитория в конфиге
    * @return {Promise<void>}
    */
   async initRep(name) {
      const cfg = this._reposConfig[name];
      //если есть путь до репозитория то его не надо выкачивать
      if (!cfg.skip && !cfg.path) {
         const branch = this._argvOptions[name] || this._rc;
         await this.cloneRepToStore(name);
         await this.checkout(
            name,
            branch
         );
      }
   }

   /**
    * переключает репозиторий на нужную ветку
    * @param {String} name - название репозитория в конфиге
    * @param {String} checkoutBranch - ветка на которую нужно переключиться
    * @return {Promise<void>}
    */
   async checkout(name, checkoutBranch) {
      const git = new Git({
         path: path.join(this._store, name),
         name: name
      });

      if (!checkoutBranch) {
         throw new Error(`Не удалось определить ветку для репозитория ${name}`);
      }

      logger.log(`Переключение на ветку ${checkoutBranch}`, name);

      await git.update();

      try {
         await git.checkout(checkoutBranch);
      } catch (err) {
         if (/rc-.*00/.test(checkoutBranch)) {
            // для некоторых репозиториев нет ветки yy.v00 только yy.v10 (19.610) в случае
            // ошибки переключаемся на 10 версию
            await git.checkout(checkoutBranch.replace('00', '10'));
         } else {
            throw new Error(`Ошибка при переключение на ветку ${checkoutBranch} в репозитории ${name}: ${err}`);
         }
      }

      if (checkoutBranch.includes('/') || checkoutBranch === this._rc) {
         await git.pull();
      }

      if (this._testRep.includes(name)) {
         logger.log(`Попытка смержить ветку '${checkoutBranch}' с '${this._rc}'`, name);
         try {
            git.merge(this._rc)
         } catch (e) {
            await git.mergeAbort();
            const error = new Error(`При мерже '${checkoutBranch}' в '${this._rc}' произошел конфликт`);
            error.code = ERROR_MERGE_CODE;
            throw error;
         }
      }
   }

   /**
    * Клонирует репозиторий из гита
    * @param {String} name - название репозитория в конфиге
    * @return {Promise<*|string>}
    */
   async cloneRepToStore(name) {
      if (!fs.existsSync(path.join(this._store, name))) {
         try {
            logger.log(`git clone ${this._reposConfig[name].url}`, name);
            await this._shell.execute(`git clone ${this._reposConfig[name].url} ${name}`, this._store, `clone ${name}`);
         } catch (err) {
            throw new Error(`Ошибка при клонировании репозитория ${name}: ${err}`);
         }
      }
   }

}

module.exports = Store;
