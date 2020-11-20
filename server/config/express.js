/**
 * Express configuration
 */

'use strict';

var express = require('express'),
  favicon = require('serve-favicon'),
  morgan = require('morgan'),
  compression = require('compression'),
  bodyParser = require('body-parser'),
  methodOverride = require('method-override'),
  cookieParser = require('cookie-parser'),
  session = require('express-session'),
  errorHandler = require('errorhandler'),
  expressValidator = require('express-validator'),
  path = require('path'),
  mongoose = require('mongoose'),
  logger = log4js.getLogger('express'),
  config = require('./environment'),
  i18n = require('i18n');
var passport = require('passport');

module.exports = function (app) {
  var env = app.get('env');

  app.use(i18n.init);

  app.set('views', config.root + '/server/views');
  app.engine('html', require('ejs').renderFile);
  app.set('view engine', 'html');
  app.use(compression());
  app.use(bodyParser.urlencoded({
    limit: '20mb',
    extended: false
  }));
  app.use(bodyParser.json({
    limit: '20mb'
  }));
  app.use(methodOverride());
  app.use(expressValidator());

  var SessionStore = require('session-mongoose')({
    session: session
  });
  app.use(cookieParser(config.session.cookieSecret));
  app.use(session({
    secret: config.session.sessionSecret,
    store: new SessionStore({
      connection: mongoose.connection,
      modelName: 'Session'
    }),
    cookie: {
      httpOnly: true,
      secure: config.session.secure,
      maxAge: config.session.maxAge
    },
    resave: true,
    saveUninitialized: false,
    rolling: false
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  if (config.express.logger === 'morgan') {
    app.use(morgan('dev'));
  }
  if (config.express.logger === 'log4js') {
    app.use(log4js.connectLogger(logger, {
      level: 'auto'
    }));
  }

  var authService = require('../auth/auth.service');

  if (config.express.mode === 'server') {
    app.set('appPath', config.root + '/public');
    app.route('/')
      .all(authService.login())
      .get(function (req, res) {
        res.render('index.html');
      });
    app.use(favicon(path.join(config.root, 'server/favicons', config.faviconName)));
    app.use(express.static(path.join(config.root, 'public')));
  }

  if (config.express.mode === 'grunt') {
    app.set('appPath', 'client');
    app.route('/')
      .all(authService.login())
      .get(function (req, res) {
        res.render('index.html');
      });
    app.use(require('connect-livereload')());
    app.use(favicon(path.join(config.root, 'server/favicons', 'default.ico')));
    app.use(express.static(path.join(config.root, '.tmp')));
    app.use(express.static(path.join(config.root, 'client')));
    app.use(errorHandler()); // Error handler - has to be last
  }
};
