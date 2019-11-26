const fs = require('fs-extra');
const path = require('path');
const Shell = require('./util/shell');

const DEFAULT_PORT = 2001;
const SERVER_ROOT = 'intest-ps/ui';

class DevServer {
   constructor(cfg) {
      this._shell = new Shell();
      this._workDir = cfg.workDir;
      this._name = cfg.name;
      this._port = cfg.port || DEFAULT_PORT;
      this._store = cfg.store;
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

   convertBD() {
      this._shell.execute('./jinnee-utility libjinnee-db-converter300.so /project=/home/sbis/workspace/controls_20.1000/20.1000/bugfix/cp-old-vars-into-sb3c/platform_tests/stands/controls/distrib/InTest.s3cld /deploy_db=/home/sbis/workspace/controls_20.1000/20.1000/bugfix/cp-old-vars-into-sb3c/platform_tests/stands/controls/distrib/InTest.dbschem')
   }
}

module.exports = DevServer;