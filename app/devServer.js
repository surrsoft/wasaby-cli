const Shell = require('./util/shell');

const DEFAULT_PORT = 2001;

class DevServer {
   constructor(cfg) {
      this._shell = new Shell();
      this._workDir = cfg.workDir;
      this._name = cfg.name;
      this._port = cfg.port || DEFAULT_PORT;
   }

   start() {
      const namePs = `${this._name}-ps`;

      this._shell.execute(`${this._workDir}/${this._name}/sbis-daemon --name "${this._name}" --library "libsbis-rpc-service300.so" --ep "FcgiEntryPoint" start --http  --port ${this._port}`, process.cwd()).catch(console.error);
      this._shell.execute(`${this._workDir}/${namePs}/sbis-daemon --name "${namePs}" --library "libsbis-rpc-service300.so" --ep "FcgiEntryPoint" start --http  --port ${this._port}`, process.cwd()).catch(console.error);
   }

   stop() {
      const namePs = `${this._name}-ps`;

      this._shell.execute(`${this._workDir}/${this._name}/sbis-daemon --name "${this._name}" stop`, process.cwd()).catch(console.error);
      this._shell.execute(`${this._workDir}/${namePs}/sbis-daemon --name "${namePs}" stop`, process.cwd()).catch(console.error);
   }


}

module.exports = DevServer;