const shell = require('shelljs');
const logger = require('./logger');

class Shell {
   constructor() {
      this._childProcessMap = [];
   }

   /**
    * @typedef {ExecParams} Items параметры child_process.exec https://nodejs.org/api/child_process.html#child_process_child_process_exec_command_options_callback
    * @property {String} force Если true в случае ошибки вернет промис resolve.
    * @property {String} processName Метка процесса в логах.
    */
   /**
    * Выполняет команду shell
    * @param {String} command - текст команды
    * @param {String} path - путь по которому надо выполнить команду
    * @param {ExecParams} params
    * @return {Promise<any>}
    * @private
    */
   execute(command, path, params) {
      let errors = [];
      let result = [];
      params = Object.assign({
         async: true,
         silent: true
      }, params);

      return new Promise((resolve, reject) => {
         const cloneProcess = shell.exec(`cd ${path} && ${command}`, params);
         this._childProcessMap.push(cloneProcess);

         cloneProcess.stdout.on('data', (data) => {
            logger.log(data, params.processName);
            result.push(data.trim());
         });

         cloneProcess.stderr.on('data', (data) => {
            logger.log(data, params.processName);
            errors.push(data);
         });

         cloneProcess.on('exit', (code) => {
            this._childProcessMap.splice(this._childProcessMap.indexOf(cloneProcess), 1);
            if (params.force || !code && !cloneProcess.withErrorKill) {
               resolve(result);
            } else {
               reject(errors);
            }
         });
      });
   }

   /**
    * Закрвыает все дочерние процессы
    * @return {Promise<void>}
    * @private
    */
   async closeChildProcess() {
      await Promise.all(this._childProcessMap.map((process) => {
         return new Promise((resolve) => {
            process.on('close', () => {
               resolve();
            });
            process.withErrorKill = true;
            process.kill('SIGKILL');
         });
      }));
      this._childProcessMap = [];
   }

}

module.exports = Shell;
