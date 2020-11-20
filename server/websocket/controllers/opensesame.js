'use strict';

var url = require('url');
var redis = require('redis');
var util = require('util');
var logger = log4js.getLogger('websocket');
var config = require('../../config/environment');

var redisUrl = config.redis && config.redis.uri ? url.parse(config.redis.uri) : null;

var createRedisClient = function () {
  if (!redisUrl) {
    return null;
  }
  var client = redis.createClient(
    redisUrl.port || 6379,
    redisUrl.hostname,
    config.redis.options
  );

  var password = redisUrl.auth ? redisUrl.auth.split(':')[1] : null;
  if (password) {
    client.auth(password);
  }
  return client;
};

var getQuery = function(client) {
  if (!client || !client.req) {
    return {};
  }
  var query = url.parse(client.req.url, true).query || {};
  return query;
};

var receiveMessage = function (socket) {
  return function (channel, message) {
    logger.debug('receive message channel="%s" massage="%s"', channel, message);
    socket.send(message);
  };
};

module.exports = function (ws) {
  ws.on('connection', function (socket) {
    logger.trace('connection');
    socket.on('error', function (err) {
      logger.error(err);
    });
    var redisClient;
    var doorKey = getQuery(socket).door_key;
    socket.on('close', function () {
      logger.debug('close(door_key=%s).', doorKey);
      if (redisClient) {
        redisClient.unsubscribe();
        redisClient.end();
      }
    });
    if (!doorKey) {
      // doorKeyがなければ切断
      logger.debug('no door key. close.');
      socket.close();
      return;
    } else {
      // 同じドアキーの接続を取得
      var existsClient = [];
      ws.clients.forEach(function (client) {
        if (socket === client) {
          return;
        }
        if (doorKey === getQuery(client).door_key) {
          existsClient.unshift(client);
        }
      });
      // 同じドアキーのクライアント数がmaxClientを超えると古い方からclose
      var maxClient = 5;
      logger.trace(existsClient.length);
      if (existsClient.length + 1 > maxClient) {
        existsClient.forEach(function (client, i) {
          try {
            if (i + 1 >= maxClient) {
              logger.debug('disconnect old connection(door_key=%s). close.', doorKey);
              client.close();
            }
          } catch (e) {
            logger.error(e);
          }
        });
      }
    }

    // redis経由のイベントを受け取れるようにする
    redisClient = createRedisClient();
    if (redisClient) {
      var subscribeChannel = util.format('opensesame door_key=%s', doorKey);
      logger.debug('subscribe channel="%s"', subscribeChannel);
      redisClient.subscribe(subscribeChannel);
      redisClient.on('message', receiveMessage(socket));
    }

    socket.on('message', function (msg) {
      logger.info({reciveMessage: msg});
      // 送ったソケット自身にそのままメッセージを返す
      socket.send(msg);
    });
  });
};
