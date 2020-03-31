const Shell = require('./app/util/shell.js');

const options = {};

process.argv.forEach(arg => {
   if (arg.startsWith('--')) {
      let argName = arg.substr(2);
      const [name, value] = argName.split('=', 2);
      options[name] = value === undefined ? true : value;
   }
});

const shell = new Shell();

shell.execute(`node cli.js --tasks=app --workDir=${options.applicationRoot} --port=777`);

