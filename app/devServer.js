const fs = require('fs-extra');
const path = require('path');
const Shell = require('./util/shell');
const readline = require('readline');

const DEFAULT_PORT = 2001;
const DEFAULT_DB_PORT = 5432;
const SERVER_ROOT = 'intest-ps/ui';


const _private = {

   /**
    * Возвращает путь до исполняемого файла джина
    * @param {String} pathToJinnee
    * @returns {string}
    * @private
    */
   _getJinneeCli(pathToJinnee) {
      if (process.platform === 'win32') {
         return `"${path.join(pathToJinnee, 'jinnee-utility.exe')}" jinnee-dbg-stand-deployment300.dll`;
      }
      return `${path.join(pathToJinnee, 'jinnee-utility')} libjinnee-db-converter300.so`;
   },

   question(msg) {
      const rl = readline.createInterface({
         input: process.stdin,
         output: process.stdout
      });
      return new Promise((resolve) => {
         rl.question(`${msg}: `, (value) => {
            resolve(value);
         });
      });
   }
};


class DevServer {
   constructor(cfg) {
      this._shell = new Shell();
      this._workDir = cfg.workDir;
      this._name = cfg.name;
      this._port = cfg.port || DEFAULT_PORT;
      this._store = cfg.store;
      this._rc = 'rc-20.1000';
      this._port = DEFAULT_DB_PORT || cfg.dbPort
   }

   start() {
      const namePs = `${this._name}-ps`;
      this._linkCDN();
      this._shell.execute(`${this._workDir}/${this._name}/sbis-daemon --name "${this._name}" --library "libsbis-rpc-service300.so" --ep "FcgiEntryPoint" start --http  --port ${this._port}`, process.cwd()).catch(console.error);
      this._shell.execute(`${this._workDir}/${namePs}/sbis-daemon --name "${namePs}" --library "libsbis-rpc-service300.so" --ep "FcgiEntryPoint" start --http  --port ${this._port}`, process.cwd()).catch(console.error);
   }

   stop() {
      const namePs = `${this._name}-ps`;

      this._shell.execute(`${this._workDir}/${this._name}/sbis-daemon --name "${this._name}" stop`, process.cwd()).catch(console.error);
      this._shell.execute(`${this._workDir}/${namePs}/sbis-daemon --name "${namePs}" stop`, process.cwd()).catch(console.error);
   }

   _linkCDN() {
      return fs.ensureSymlink(path.join(this._store, 'cdn'), path.join(this._workDir, SERVER_ROOT, 'cdn'));
   }

   async readLogin() {
      const rl = readline.createInterface({
         input: process.stdin,
         output: process.stdout
      });
      new Promise((resolve) => {
         rl.question('Please enter login: ', (value) => {
            this._login = value;
            rl.close();
            resolve();
         });
      });
   }

   async convertBD() {
      await this.readLogin();
      console.log(`${this._login}`);
      this._login = await _private.question('Please enter login');
      this._password = await _private.question('Please enter password');
      console.log(`${this._login} ${this._password }`);
      // const pathToJinnee = await this._getPathToJinnee();
      // const jinneeCli = _private._getJinneeCli(pathToJinnee);
      // const project = '/home/local/TENSOR-CORP/ganshinyao/sbis/platform_tests/stands/controls/distrib/InTest.s3cld';
      // const deploy = '/home/local/TENSOR-CORP/ganshinyao/sbis/platform_tests/stands/controls/distrib/InTest.dbschema';
      // await this._shell.execute(
      //    `${jinneeCli} --project=${project} --deploy_db=${deploy}`,
      //    pathToJinnee, {
      //       name: 'jinnee'
      //    }
      // );
   }

   async _getPathToJinnee() {
      const pathToSDK = this._getPathToSdk();
      let pathToJinnee = '';
      if (this._pathToJinnee) {
         pathToJinnee = this._pathToJinnee;
      } else if (process.env.SDK) {
         pathToJinnee = path.join(pathToSDK, 'tools', 'jinnee', 'jinnee.zip');
      } else {
         pathToJinnee = path.join(pathToSDK, 'tools', 'jinnee');
      }

      if (!fs.existsSync(pathToJinnee)) {
         throw new Error(`Не существует путь до джина: ${pathToJinnee}`);
      }

      if (fs.statSync(pathToJinnee).isFile()) {
         const unpack = path.join(this._workspace, 'jinnee');
         await this._shell.execute(
            `7za x ${pathToJinnee} -y -o${unpack} > /dev/null`,
            process.cwd()
         );
         return unpack;
      }

      return pathToJinnee;
   }

   /**
    * Возвращает путь до SDK
    * @returns {string}
    * @private
    */
   _getPathToSdk() {
      let pathToSDK;
      const sdkVersion = this._rc.replace('rc-', '').replace('.', '');

      if (process.env.SDK) {
         pathToSDK = process.env.SDK;
         process.env['SBISPlatformSDK_' + sdkVersion] = pathToSDK;
      } else {
         pathToSDK = process.env['SBISPlatformSDK_' + sdkVersion];
      }

      if (!pathToSDK) {
         throw new Error(`SDK версии ${sdkVersion} не установлен`);
      }

      if (!fs.existsSync(pathToSDK)) {
         throw new Error(`Не найден SDK по пути: ${pathToSDK}`);
      }

      return pathToSDK;
   }

   _prepareDeployCfg(filePath) {
      let cfgString = fs.readFileSync(filePath, 'utf8');
      cfgString = cfgString.replace(/{host}/g, this._host);
      cfgString = cfgString.replace(/{login}/g, this._login);
      cfgString = cfgString.replace(/{db_name}/g, this._dbName);
      cfgString = cfgString.replace(/{password}/g, this._password);
      cfgString = cfgString.replace(/{port}/g, this._port);
      fs.outputFileSync(filePath, cfgString);
   }
}

module.exports = DevServer;