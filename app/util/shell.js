const child_process = require('child_process');
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
    * @param {ExecParams} params Параметры
    * @return {Promise<any>}
    * @public
    */
   execute(command, path, params) {
      const execParams = {
         cwd: path || process.cwd(),
         ...params
      };
      const childProccess = child_process.exec(command, execParams);
      return this._subscribeProcess(childProccess, execParams);
   }

   /**
    * Выполняет команду shell
    * @param {String} command - Текст команды
    * @param {Array} args - Массив аргументов
    * @param {ExecParams} params Параметры
    * @return {Promise<any>}
    * @public
    */
   spawn(command, args, params) {
      const childProccess = child_process.spawn(command, args, params);
      return this._subscribeProcess(childProccess, params);
   }

   /**
    * Подписывается на дочерний процесс, возвращает промис, который резолвится по завершению процесса.
    * @param childProccess - ссылка на дочерний процесс
    * @param {ExecParams} params Параметры
    * @return {Promise<any>}
    * @private
    */
   _subscribeProcess(childProccess, params) {
      const errors = [];
      const result = [];
      this._childProcessMap.push(childProccess);

      if (!params.silent) {
         childProccess.stdout.on('data', (data) => {
            const dataString = data.toString();
            logger.log(dataString, params.processName);
            if (params.errorLabel && dataString.includes(params.errorLabel)) {
               errors.push(dataString);
            } else {
               result.push(dataString);
            }
         });

         childProccess.stderr.on('data', (data) => {
            const dataString = data.toString();
            logger.log(dataString, params.processName);
            errors.push(dataString);
         });
      }

      return new Promise((resolve, reject) => {
         childProccess.on('exit', (code, signal) => {
            this._childProcessMap.splice(this._childProcessMap.indexOf(childProccess), 1);
            if (signal === 'SIGTERM') {
               const message = `Process ${params.processName} has been terminated`;
               errors.push(message);
               logger.log(message, params.processName);
               reject(errors);
            } else if (params.force || (!code && !childProccess.withErrorKill)) {
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
