const path = require('path');

/**
 * Возвращает относительный путь от from до to, если отновительный путь построить не возможно вернет to
 * @param {String} from
 * @param {String} to
 * @returns {String}
 */
function relative(from, to) {
   // для виндовых путей вида 'c:' 'd:' невозможно построить относительный путь, возвращаем просто to
   if (path.isAbsolute(from) && path.isAbsolute(to) && from[0] !== to[0]) {
      return to;
   }
   return path.normalize(path.relative(from, to));
}

/**
 * Возвращает путь до npm пакета
 * @param {String} packageName Название npm пакета
 * @returns {String}
 */
function getPathToPackage(packageName) {
   const paths = [
      path.join(process.cwd(), 'node_modules', packageName),
      path.join(__dirname, '..', 'node_modules', packageName),
   ];
   for (const p of paths) {
      if (fs.existsSync(p)) {
         return path.normalize(p);
      }
   }

   throw new Error(`Пакет ${packageName} не установлен`);
}

module.exports = {
   relative: relative,
   getPathToPackage: getPathToPackage
};
