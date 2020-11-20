'use strict';

var config = require('../config/environment'),
    redis = require('redis'),
    url = require('url'),
    _ = require('lodash');

var redisUrl = config.redis && config.redis.uri ? url.parse(config.redis.uri) : null;

var createRedisClient = function (returnBuffers) {
  if (!redisUrl) {
    return null;
  }

  var options = config.redis.options;
  if (returnBuffers) {
    options['return_buffers'] = true;
  } else {
    options['return_buffers'] = false;
  }

  var client = redis.createClient(
    redisUrl.port || 6379,
    redisUrl.hostname,
    options
  );

  var password = redisUrl.auth ? redisUrl.auth.split(':')[1] : null;
  if (password) {
    client.auth(password);
  }
  return client;
};

module.exports = {
  createRedisClient: createRedisClient,
}
