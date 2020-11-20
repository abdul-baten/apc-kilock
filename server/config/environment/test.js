'use strict';

module.exports = {
  env: 'test',
  port: {
    web: process.env.PORT || 9000,
  },

  mongo: {
    uri: process.env.MONGOLAB_URI ||
         process.env.MONGOHQ_URL ||
         process.env.MONGODB_URL ||
         'mongodb://localhost/attend-test',
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
      baseUrl: process.env.CAS_BASE_URL || 'https://www.apctdl.com/cas/',
      service: process.env.CAS_SERVICE || 'http://localhost:9000',
      sourceName: process.env.CAS_SOURCE_NAME || 'cas',
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

  // +9:00(JST)
  timezoneOffsetHour: 9,

  // JSTで3時 UTCで18時(-6時)
  futofftimehour: -9,
};
