const fs = require('fs-extra');
const pMap = require('p-map');
const path = require('path');
const walkDir = require('./util/walkDir');
const logger = require('./util/logger');
const Shell = require('./util/shell');

class Store {
   constructor(cfg) {
      this._store = cfg.store;
      this._argvOptions = cfg.argvOptions;
      this._repos = cfg.repos;
      this._rc = cfg.rc;
      this._shell = new Shell();
      this._testRep = cfg.testRep;
   }

   async init() {
      logger.log(`Инициализация хранилища`);
      try {
         await fs.mkdirs(this._store);
         await Promise.all(Object.keys(this._repos).map((name) => {
            return this.initRep(name);
         }));
         logger.log(`Инициализация хранилища завершена успешно`);
      } catch (e) {
         this._shell.closeChildProcess();
         throw new Error(`Инициализация хранилища завершена с ошибкой ${e}`);
      }
   }

   /**
    * Инициализация хранилища, клонирует/копирует репозитории переключает на нужные ветки
    * @param {String} name - название репозитория в конфиге
    * @return {Promise<void>}
    */
   async initRep(name) {
      let branch = this._argvOptions[name] || this._rc;
      if (fs.existsSync(branch)) {
         return this.copyRepToStore(this._argvOptions[name], name);
      }
      return this.checkout(
         name,
         branch,
         await this.cloneRepToStore(name)
      );
   }

   /**
    * Копирует репозиторий, если в параметрах запуска передали путь
    * @param {String} pathToOriginal
    * @param {String} name - название репозитория в конфиге
    * @return {Promise<void>}
    */
   async copyRepToStore(pathToOriginal, name) {
      try {
         logger.log(`Копирование репозитория`, name);

         await fs.ensureSymlink(pathToOriginal, path.join(this._store, name));
      } catch (err) {
         throw new Error(`Ошибка при копировании репозитория ${name}: ${err}`);
      }
   }

   /**
    * переключает репозиторий на нужную ветку
    * @param {String} name - название репозитория в конфиге
    * @param {String} checkoutBranch - ветка на которую нужно переключиться
    * @return {Promise<void>}
    */
   async checkout(name, checkoutBranch) {
      let pathToRepos = path.join(this._store, name);
      if (!checkoutBranch) {
         throw new Error(`Не удалось определить ветку для репозитория ${name}`);
      }
      try {
         logger.log(`Переключение на ветку ${checkoutBranch}`, name);
         await this._shell.execute(`git reset --hard HEAD`, pathToRepos, `git_reset ${name}`);
         await this._shell.execute(`git clean -fdx`, pathToRepos, `git_clean ${name}`);
         await this._shell.execute(`git fetch`, pathToRepos, `git_fetch ${name}`);
         await this._shell.execute(`git checkout ${checkoutBranch}`, pathToRepos, `git_checkout ${name}`);
      } catch (err) {
         if (/rc-.*00/.test(checkoutBranch)) {
            await this._shell.execute(`git checkout ${checkoutBranch.replace('00', '10')}`, pathToRepos, `checkout ${name}`);
         } else {
            throw new Error(`Ошибка при переключение на ветку ${checkoutBranch} в репозитории ${name}: ${err}`);
         }
      }
      if (this._testRep.includes(name)) {
         logger.log(`Попытка смержить ветку "${checkoutBranch}" с "${this._rc}"`, name);
         try {
            await this._shell.execute(`git merge origin/${this._rc}`, pathToRepos, `git_merge ${name}`);
         } catch (e) {
            throw new Error(`При мерже "${checkoutBranch}" в "${this._rc}" произошел конфликт`);
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
            logger.log(`git clone ${this._repos[name].url}`, name);
            await this._shell.execute(`git clone ${this._repos[name].url} ${name}`, this._store, `clone ${name}`);
         } catch (err) {
            throw new Error(`Ошибка при клонировании репозитория ${name}: ${err}`);
         }
      }
   }

}

module.exports = Store;
