const shell = require('shelljs');

/**
 * Запускает демо стенда контролов.
 */
shell.exec(`node store/_repos/controls/app.js --applicationRoot=application`, {
   async: true
});

