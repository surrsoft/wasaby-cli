const fs = require('fs-extra');
const path = require('path');

function walkDir(dir, callback, rootDir) {
   rootDir = rootDir || dir;
   fs.readdirSync(dir).forEach(f => {
      let dirPath = path.join(dir, f);
      let relativePath = path.relative(rootDir, dir);
      let isDirectory = fs.statSync(dirPath).isDirectory();
      isDirectory ? walkDir(dirPath, callback, rootDir) : callback(path.join(relativePath, f));
   });
};

module.exports = walkDir;
