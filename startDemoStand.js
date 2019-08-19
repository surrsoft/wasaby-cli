const shell = require('shelljs');
const path = require('path');
const fs = require('fs-extra');
const options = {};

process.argv.forEach(arg => {
   if (arg.startsWith('--')) {
      let argName = arg.substr(2);
      const [name, value] = argName.split('=', 2);
      options[name] = value === undefined ? true : value;
   }
});

copyApJs().then(() => {
   if (path.isAbsolute(options.applicationRoot)) {
      options.applicationRoot = path.relative(process.cwd(), options.applicationRoot);
   }

   shell.exec(`node app.js --applicationRoot=${options.applicationRoot}`, {
      async: true
   });
}, (err) => {
   console.log(`Не смог запустить демо стенд. Error ${err}`);
});


function copyApJs() {
   return new Promise((resolve, reject) => {
      try {
         if (!path.isAbsolute(options.controls)) {
            options.controls = path.join(process.cwd(), options.controls);
         }

         fs.copyFile(path.join(options.controls, 'app.js'), path.join(process.cwd(), 'app.js'), (err) => {
            if (err) {
               throw err;
            }

            resolve();
         });
      } catch (err) {
         reject(err);
      }
   });
}
