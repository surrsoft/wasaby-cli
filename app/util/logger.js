/**
 * Выводит сообщение в лог
 * @param {String} message
 */
function log(message, name) {
   let date = new Date();
   let time = `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}:${date.getMilliseconds()}`;
   name = name ? ' ' + name : '';
   //tslint:disable-next-line:no-console
   console.log(`[${time}]${name}: ${message}`);
}

module.exports = {
   log: log
};