'use strict';

module.exports = {
  env: 'production',

  session: {
    maxAge: 86400000,
  },

  basicAuth: {
    data: {
      username: 'dataapi',
      password: 'RjxUaWKxbcDmjgHBWXeu',
    },
    door: {
      username: 'doorapi',
      password: 'ShX4x7CJm6UCh4Y3',
    },
    external: {
      username: 'externalapi',
      password: '8TmbSgWmxKG83n2347u28869JmBn',
    },
  },

  express: {
    mode: 'server',
    logger: 'log4js'
  },

};
