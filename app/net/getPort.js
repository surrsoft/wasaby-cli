const net = require('net');

const MIN_PORT = 1024;
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

/**
 * Возвращает свободный порт
 * @param {Number} minPort - Порт начиная от которого надо искать свободный
 * @returns {Promise<Number>}
 */
module.exports = async function getPort(minPort) {
   for (let port = minPort || MIN_PORT; port <= MAX_PORT; port++) {
      try {
         return await checkPort(port); // eslint-disable-line no-await-in-loop
      } catch (error) {
         if (!['EADDRINUSE', 'EACCES'].includes(error.code)) {
            throw error;
         }
      }
   }
   throw new Error('Нет свободных портов');
};
