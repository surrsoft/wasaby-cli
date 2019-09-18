const shell = require("shelljs");
const logger = require("./logger");

class Shell {
   constructor() {
      this._childProcessMap = [];
   }

   /**
    * Выполняет команду shell
    * @param {String} command - текст команды
    * @param {String} path - путь по которому надо выполнить команду
    * @param {Boolean} force - если true в случае ошибки вернет промис resolve
    * @param {String} processName - метка процесса в логах
    * @return {Promise<any>}
    * @private
    */
   execute(command, path, force, processName) {
      let errors = [];

      if (typeof force === "string") {
         processName = force;
         force = false;
      }

      return new Promise((resolve, reject) => {
         const cloneProcess = shell.exec(`cd ${path} && ${command}`, {
            async: true,
            silent: true,
         });
         this._childProcessMap.push(cloneProcess);
         cloneProcess.stdout.on("data", (data) => {
            logger.log(data, processName);
         });

         cloneProcess.stderr.on("data", (data) => {
            logger.log(data, processName);
            errors.push(data);
         });

         cloneProcess.on("exit", (code) => {
            this._childProcessMap.splice(this._childProcessMap.indexOf(cloneProcess), 1);
            if (force || !code && !cloneProcess.withErrorKill) {
               resolve();
            } else {
               reject(errors);
            }
         });
      });
   };

   /**
    * Закрвыает все дочерние процессы
    * @return {Promise<void>}
    * @private
    */
   async closeChildProcess() {
      await Promise.all(this._childProcessMap.map((process) => {
         return new Promise((resolve) => {
            process.on("close", () => {
               resolve();
            });
            process.withErrorKill = true;
            process.kill("SIGKILL");
         });
      }));
      this._childProcessMap = [];
   }

}

module.exports = Shell;
