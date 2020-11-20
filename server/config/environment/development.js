'use strict';

module.exports = {
  env: 'development',
  port: {
    web: process.env.PORT || 9000,
    socketio: 10443,
    websocket: process.env.OPENSHIFT_NODEJS_PORT ||
      process.env.WEBSOCKET_PORT ||
      process.env.PORT ||
      11443
  },

  mongo: {
    uri: process.env.MONGOLAB_URI ||
      process.env.MONGOHQ_URL ||
      process.env.MONGODB_URL ||
      'mongodb://localhost/attend-dev',
    //    uri: 'mongodb://heroku_app37540373:baef047unee7q1pc7t8a676nig@ds043262.mongolab.com:43262/heroku_app37540373',
    options: {
      db: {
        safe: true
      }
    }
  },

  redis: {
    uri: process.env.REDISTOGO_URL ||
      process.env.REDISCLOUD_URL ||
      process.env.REDIS_URL ||
      'redis://localhost:6379/',
  },

  rootOrganizationPath: process.env.ORGANIZATION_PATH || 'sample',

  authentication: {
    cas: {
      baseUrl: process.env.CAS_BASE_URL || 'https://kinmu.ap-com.co.jp/cas/',
      service: process.env.CAS_SERVICE || 'http://192.168.33.10:9000',
      sourceName: process.env.CAS_SOURCE_NAME || 'cas',
    },
    local: {
      sourceName: 'local',
    },
  },

  log4js: {
    levels: {
      '[default]': process.env.LOGGER_LEVEL_DEFAULT ||
        process.env.LOGGER_LEVEL ||
        'TRACE',
      'express': process.env.LOGGER_LEVEL_EXPRESS ||
        process.env.LOGGER_LEVEL ||
        'DEBUG',
      'websocket': process.env.LOGGER_LEVEL_WEBSOCKET ||
        process.env.LOGGER_LEVEL ||
        'TRACE',
    },
  },

  mailer: { // この key を削除でメールの queue につながない
    kue: {
      prefix: 'q',
    },
    queueName: 'unlock-mail',
    recieveDomain: 'ap-com.co.jp'
  },

  familyRegistrationUrl: process.env.FAMILY_REGISTRATION_URL || 'http://localhost:3000',

  // 試験的な機能を使用するかどうか
  pilotFunctions: process.env.PILOT_FUNCTIONS || 'enabled',

  clientDirectory: 'client'
};
