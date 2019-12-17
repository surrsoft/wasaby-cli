const Shell = require('./util/shell');

/**
 * Базовый класс
 * @class Base
 * @author Ганшин Я.О
 */

class Base {
   constructor() {
      this._shell = new Shell();
   }

   async run() {
      try {
         await this._run();
      } catch (e) {
         await this._shell.closeChildProcess();
         throw e;
      }
   }

   // eslint-disable-next-line class-methods-use-this,require-await
   async _run() {
      throw new Error('method _run must be impemented');
   }
}

module.exports = Base;
