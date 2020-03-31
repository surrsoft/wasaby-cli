const { exec } = require('child_process');
const path = require('path');
const options = {};

process.argv.forEach(arg => {
   if (arg.startsWith('--')) {
      let argName = arg.substr(2);
      const [name, value] = argName.split('=', 2);
      options[name] = value === undefined ? true : value;
   }
});

if (path.isAbsolute(options.applicationRoot)) {
   options.applicationRoot = path.relative(process.cwd(), options.applicationRoot);
}

exec(`node cli.js --tasks=app --workDir=${options.applicationRoot}`);

