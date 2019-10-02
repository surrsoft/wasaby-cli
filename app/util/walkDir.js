const fs = require('fs-extra');
const path = require('path');

function walkDir(rootDir, callback, exclude, currentDir) {
   currentDir = currentDir || rootDir;
   exclude = exclude || [];
   const relativePath = path.relative(rootDir, currentDir);

   fs.readdirSync(currentDir).forEach(file => {
      const fullPath = path.join(currentDir, file);
      if (!exclude.includes(fullPath) && !fs.lstatSync(fullPath).isSymbolicLink()) {
         const isDirectory = fs.lstatSync(fullPath).isDirectory();
         isDirectory ? walkDir(rootDir, callback, exclude, fullPath) : callback(path.join(relativePath, file));
      }
   });
}

module.exports = walkDir;
