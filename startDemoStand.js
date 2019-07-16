const shell = require('shelljs');

/**
 * Запускает демо стенда контролов.
 */
shell.exec(`cd store/_repos/controls && node app --applicationRoot=./../../../application`, {
   async: true
});

