/**
 * Модуль для работы с консолью
 * @author Ганшин Я.О
 */

/**
 * Выводит сообщение в лог
 * @param {String} message Сообщение
 * @param {String} label Метка сообщения в логе
 */
function log(message, label = '') {
   const date = new Date();
   const time = `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}:${date.getMilliseconds()}`;
   const logLabel = label ? ' ' + label : '';
   // eslint-disable-next-line no-console
   console.log(`[${time}]${logLabel}: ${message}`);
}

function error(message) {
   // eslint-disable-next-line no-console
   console.error(message);
}

module.exports = {
   log: log,
   error: error
};
