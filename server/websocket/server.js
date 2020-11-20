var http = require('http'),
    https = require('https'),
    logger = log4js.getLogger();

var config = require('../config/environment');

module.exports = {
  websockets: {},
  createServer: function (mainServer) {
    var server;
    if (parseInt(config.port.web) === parseInt(config.port.websocket)) {
      server = mainServer;
    } else {
      if (config.httpsOptions) {
        server = https.createServer(config.httpsOptions, function (req, res) {
          res.send(404);
        });
      } else {
        server = http.createServer(function (req, res) {
          res.send(404);
        });
      }

      // Start server
      server.listen(config.port.websocket, config.ip, function () {
        logger.info('Express server listening on %s:%d.', config.ip, config.port.websocket);
      });
    }

    var WebSocketServers = function (server) {
      this.of = function (path) {
        return require('websocket.io').attach(server, {path:path});
      };
    };

    var wss = new WebSocketServers(server);

    var websockets = this.websockets;
    websockets.opensesame = wss.of('/ws/opensesame');
    require('./controllers/opensesame')(websockets.opensesame);
  }
};
