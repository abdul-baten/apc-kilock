'use strict';

var express = require('express'),
    path = require('path'),
    fs = require('fs'),
    http = require('http'),
    https = require('https'),
    mongoose = require('mongoose'),
    moment = require('moment'),
    i18n = require('i18n'),
    multer = require('multer');

global.log4js = require('log4js');
require('./utils/log4js-extend')(global.log4js, {
  path: __dirname + '/..',
});

/**
 * Main application file
 */

// Set default node environment to development
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

var config = require('./config/environment');

moment.locale(config.defaultLocale || 'en');

i18n.configure({
  locales: ['en', 'ja'],
  defaultLocale: config.defaultLocale || 'en',
  directory: __dirname + '/locales',
});

log4js.configure(config.log4js);

 // 各所で処理できなかったエラー
process.on('uncaughtException', function (err) {
  log4js.getLogger().fatal(err);
});

var db = mongoose.connect(config.mongo.uri, config.mongo.options);

// Bootstrap models
var modelsPath = path.join(__dirname, 'models');
fs.readdirSync(modelsPath).forEach(function (file) {
  if (/(.*)\.(js$|coffee$)/.test(file)) {
    require(modelsPath + '/' + file);
  }
});

if (process.env.NODE_ENV !== 'test') {
  require('./config/upgradedata/');
}

// Setup Express
var app = express();
require('./config/express')(app);
require('./routes')(app);

var server;
if (config.httpsOptions) {
  server = https.createServer(config.httpsOptions, app);
} else {
  server = http.createServer(app);
}

// Start server
server.listen(config.port.web, config.ip, function () {
  log4js.getLogger().info('Express server listening on %s:%d, in %s mode', config.ip, config.port.web, app.get('env'));
});

if (config.port.websocket && parseInt(config.port.websocket) > 0) {
  // WebSocket
  require('./websocket/server').createServer(server);
}

if (config.port.socketio && parseInt(config.port.socketio) > 0) {
  // Socket.io
  require('./socketio/server');
}

// Expose app
exports = module.exports = server;
