const { spawn } = require('child_process');
const logger = require('./logger');

/**
 * Класс для вызова shell команд
 * @class Shell
 * @author Ганшин Я.О
 */
class Shell {
   constructor() {
      this._childProcessMap = [];
   }

   /**
    * Параметры child_process.exec https://nodejs.org/api/child_process.html#child_process_child_process_exec_command_options_callback
    * @typedef ExecParams {Object}
    * @property {Boolean} force Если true в случае ошибки вернет промис resolve.
    * @property {String} processName Метка процесса в логах.
    * @property {String} errorLabel Метка, по которой сообщение в stdout будет распознано как ошибка.
    */
   /**
    * Выполняет команду shell
    * @param {String} command - текст команды
    * @param {String} path - путь по которому надо выполнить команду
    * @param {{processName: string, timeout: number}} params
    * @return {Promise<any>}
    * @public
    */
   execute(command, path, params) {
      const errors = [];
      const result = [];
      const execParams = {
         cwd: path || process.cwd(),
         ...params
      };

      return new Promise((resolve, reject) => {
         const args = command.split(' ');
         const cloneProcess = spawn(args[0], args.slice(1), execParams);
         let timerId;
         this._childProcessMap.push(cloneProcess);

         if (!execParams.silent) {
            cloneProcess.stdout.on('data', (data) => {
               const dataString = data.toString();
               logger.log(dataString, execParams.processName);
               if (execParams.errorLabel && dataString.includes(execParams.errorLabel)) {
                  errors.push(dataString);
               } else {
                  result.push(dataString);
               }
            });

            cloneProcess.stderr.on('data', (data) => {
               const dataString = data.toString();
               logger.log(dataString, execParams.processName);
               errors.push(dataString);
            });
         }

         cloneProcess.on('exit', (code, signal) => {
            if (timerId) {
               clearTimeout(timerId);
            }

            this._childProcessMap.splice(this._childProcessMap.indexOf(cloneProcess), 1);

            if (signal === 'SIGTERM') {
               const message = `Process ${execParams.processName} has been terminated`;
               errors.push(message);
               logger.log(message, execParams.processName);
               reject(errors);
            } else if (execParams.force || (!code && !cloneProcess.withErrorKill)) {
               resolve(result);
            } else {
               reject(errors);
            }
         });

         if (params.timeout) {
            timerId = setTimeout(function(){ cloneProcess.kill('SIGTERM')}, params.timeout);
         }
      });
   }

   /**
    * Закрвыает все дочерние процессы
    * @return {Promise<void>}
    * @public
    */
   async closeChildProcess() {
      await Promise.all(this._childProcessMap.map(process => (
         new Promise((resolve) => {
            process.on('close', () => {
               resolve();
            });
            process.withErrorKill = true;
            process.kill('SIGKILL');
         })
      )));
      this._childProcessMap = [];
   }
}

module.exports = Shell;
