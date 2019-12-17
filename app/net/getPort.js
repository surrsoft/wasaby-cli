const net = require('net');

const MIN_PORT = 11000;
const MAX_PORT = 65536;

/**
 * Поиск свободного порта
 * @author Ганшин Я.О
 */

/**
 * Проверяет занят ли порт
 * @param {Number} port
 * @returns {Promise<Number>}
 */
const checkPort = (port) => new Promise((resolve, reject) => {
   const server = net.createServer();
   server.unref();
   server.on('error', reject);
   server.listen(port, () => {
      server.close(() => {
         resolve(port);
      });
   });
});

const portsRange = (function* () {
   for (let port = MIN_PORT; port <= MAX_PORT; port++) {
      yield port;
   }
})();

/**
 * Возвращает свободный порт
 * @returns {Promise<Number>}
 */
module.exports = async function getPort() {
   let item = portsRange.next().value;
   if (item) {
      try {
         return await checkPort(item); // eslint-disable-line no-await-in-loop
      } catch (error) {
         if (error.code === 'EADDRINUSE') {
            return getPort();
         }
         throw error;
      }
   }
   throw new Error('Нет свободных портов');
};
