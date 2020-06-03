const isolated = require('saby-units/lib/isolated.js');
const express = require('express');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const path = require('path');
const serveStatic = require('serve-static');
const getPort = require('./net/getPort');
const global = (function() {
   return this || (0, eval)('this');
})();
const resourceRoot = '/';

/**
 * Запускает сервер приложения
 * @param {String} resources Путь до ресурсов
 * @param {Number} port Порт на котором будет запущен сервер
 * @param {Boolean} start Запустить браузер
 */
async function run(resources, port, start) {
   const app = express();
   const availablePort = await getPort(port);
   const relativeResources = path.isAbsolute(resources) ? path.relative(process.cwd(), resources) : resources;

   app.use(bodyParser.json());
   app.use(cookieParser());
   app.use('/', serveStatic(relativeResources));
   app.listen(availablePort);

   let require = isolated.prepareTestEnvironment(
      relativeResources,
      undefined,
      false,
      undefined,
      false
   );

   global.require = require;

   console.log('start init');
   require(['Env/Env', 'Core/core-init'], function (Env) {
      Env.constants.resourceRoot = resourceRoot;
      Env.constants.modules = require('json!/contents').modules;
      console.log(`server started http://localhost:${availablePort}`);
   }, function (err) {
      console.error(err);
      console.error('core init failed');
   });

   /*server side render*/
   app.get('/:moduleName/*', serverSideRender);

   // support localization
   app.get('/loadConfiguration', loadConfiguration);

   app.get('/loadDictionary', loadDictionary);

   if (start) {
      openBrowser(availablePort);
   }
}


function serverSideRender(req, res) {
   try {
      req.compatible = false;

      if (!process.domain) {
         process.domain = {
            enter: function () {
            },
            exit: function () {
            }
         };
      }

      process.domain.req = req;
      process.domain.res = res;

      console.log('URL:' + req.originalUrl);
      const tpl = requirejs('wml!Controls/Application/Route');

      console.log(`tpl is ${typeof tpl}. ${tpl || tpl.toString()}`);

      let pathRoot = req.originalUrl.split('/');
      if (!pathRoot) {
         console.error('Incorrect url. Couldn\'t resolve path to root component');
      }

      pathRoot = pathRoot.filter(function (el) {
         return el.length > 0;
      });

      let cmp;
      if (~pathRoot.indexOf('app')) {
         cmp = pathRoot[0] + '/Index';
      } else {
         cmp = pathRoot.join('/') + '/Index';
      }
      try {
         console.log('Require: ' + cmp);
         requirejs(cmp);
      } catch (error) {
         console.error(error);
         res.writeHead(404, {
            'Content-Type': 'text/html'
         });
         res.end('');

         return;
      }

      const html = tpl({
         lite: true,
         wsRoot: '/WS.Core/',
         resourceRoot,
         application: cmp,
         appRoot: '/',
         _options: {
            preInitScript: 'window.wsConfig.debug = true;window.wsConfig.userConfigSupport = false;'
         }
      });

      if (html.addCallback) {
         html.addCallback(function (htmlres) {
            res.writeHead(200, {
               'Content-Type': 'text/html'
            });
            res.end(htmlres);
         });
      } else {
         res.writeHead(200, {
            'Content-Type': 'text/html'
         });
         res.end(html);
      }

      setDebugCookie(req, res);
   } catch (err) {
      res.writeHead(200, {
         'Content-Type': 'text/html'
      });
      res.end(html);

      console.error(err);
   }
}

function loadConfiguration(req, res) {
   requirejs(['I18n/i18n'], (i18n) => {
      const locale = req.query.locale || req.cookies.lang;
      i18n.Loader.loadConfiguration(locale).then((configuration) => {
         if (typeof req.query.v !== 'undefined') {
            res.set('Cache-Control', 'public, max-age=315360000, immutable');
         }
         res.json(configuration);
      }, (err) => {
         res.status(404).send(err);
      });
   });
}

function loadDictionary(req, res) {
   requirejs(['Core/i18n/Loader'], (Loader) => {
      const module = req.query.module;
      const locale = req.query.locale || req.cookies.lang;

      Loader.default.dictionary(module, locale).then((dictionary) => {
         if (typeof req.query.v !== 'undefined') {
            res.set('Cache-Control', 'public, max-age=315360000, immutable');
         }
         res.json(dictionary);
      }, (err) => {
         res.status(404).send(err);
      });
   });
}

function setDebugCookie(req, res) {
   if (req.cookies.s3debug === undefined) {
      res.cookie('s3debug', true, { maxAge: 900000, httpOnly: true });
      console.log('cookie s3debug created successfully');
   }
}

module.exports = {
   run: run
};
