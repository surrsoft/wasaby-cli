/**
 * Модуль для работы с консолью
 * @author Ганшин Я.О
 */
const fs = require('fs-extra');

/**
 * Выводит сообщение в лог
 * @class Logger
 */
class Logger {
   constructor() {
      this._enableLog = true;
   }
   /**
    * Устанавливает путь до файла с логами
    * @param {String} file
    */
   set logFile(file) {
      this._logFile = file;
   }

   /**
    * Возвращает путь до лог файла
    * @returns {String}
    */
   get logFile() {
      return this._logFile;
   }

   /**
    * Выводит сообщение в лог
    * @param {String} message Сообщение
    * @param {String} label Метка сообщения в логе
    */
   log(message, label = '') {
      if (!this._enableLog) {
         return;
      }

      const date = new Date();
      const time = `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}:${date.getMilliseconds()}`;
      const logLabel = label ? ' ' + label : '';
      const logMessage = `[${time}]${logLabel}: ${message}`;
      // eslint-disable-next-line no-console
      console.log(logMessage);
      if (this.logFile) {
         fs.outputFileSync(this.logFile, logMessage, {flag: 'a'});
      }
   }

   /**
    * Выводит ошибку в лог
    * @param message
    */
   error(message) {
      // eslint-disable-next-line no-console
      console.error(message);
      if (this.logFile) {
         fs.outputFileSync(this.logFile, `[ERROR]: ${message}`, {flag: 'a'});
      }
   }

   /**
    * Выключает логирование
    * @param message
    */
   silent() {
      this._enableLog = false;
   }
}

module.exports = new Logger();
