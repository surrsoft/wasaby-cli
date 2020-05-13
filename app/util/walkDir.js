const fs = require('fs-extra');
const path = require('path');
const ENOENT = 'ENOENT';
/**
 * Рекурсивно обходит дректории исключая симлинки
 * @param {String} rootDir - Директория которую надо обойти
 * @param {Function} callback - Коллбек, вызывается для файлов
 * @param {Array} exclude - Пути которые надо исключить
 * @function walkDir
 * @author Ганшин Я.О
 */
function walkDir(rootDir, callback, exclude = [], currentDir = '') {
   const defCurrentDir = currentDir || rootDir;
   const relativePath = path.relative(rootDir, defCurrentDir);
   if (fs.existsSync(defCurrentDir)) {
      fs.readdirSync(defCurrentDir).forEach((file) => {
         if (file[0] === '.' ) { // пропускаем скрытые файлы
            return;
         }

         const fullPath = path.join(defCurrentDir, file);
         try {
            const lstat = fs.lstatSync(fullPath);
            if (!exclude.includes(fullPath) && !lstat.isSymbolicLink()) {
               if (lstat.isDirectory()) {
                  walkDir(rootDir, callback, exclude, fullPath);
               } else {
                  callback(path.join(relativePath, file));
               }
            }
         } catch (error) {
            if (!String(error).includes(ENOENT)) { // игнорируем ошибки существования файла
               throw error
            }
         }
      });
   }
}

module.exports = walkDir;
