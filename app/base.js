const Shell = require("./util/shell");

class Base {
   constructor(cfg) {
      this._shell = new Shell();
   }

   async run() {
      try {
         await this._run();
      } catch (e) {
         this._shell.closeChildProcess();
         throw e;
      }
   }

   async _run() {
      throw new Error("method _run must be impemented");
   }
}

module.exports = Base;
