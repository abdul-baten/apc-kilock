'use strict';

// Use local.env.js for environment variables that grunt will set when the server starts locally.
// Use for your api keys, secrets, etc. This file should not be tracked by git.
//
// You will need to set these on the server you deploy to.

module.exports = {
  DOMAIN: 'http://localhost:9000',
  SUPPORT_OPEN: true,
  NODE_INSPECTOR_OPTION: {
    'web-port': 8080,
    // Change this to '0.0.0.0' to access the server from outside.
    'web-host': 'localhost',
    'debug-port': 5858,
  },
  NODE_INSPECTOR_URL: 'http://localhost:8080/debug?port=5858',

  TEST_BROWSER: 'PhantomJS',

  CALLBACK_BASE_URL: 'http://localhost:9000',

  CAS_BASE_URL: 'https://www.apctdl.com/cas/',
  CAS_SERVICE: 'http://localhost:9000',

  // https://console.developers.google.com/project
  GOOGLE_ID: '[Client ID]',
  GOOGLE_SECRET: '[Client Secret]',

  // https://apps.twitter.com/
  TWITTER_ID: '[Consumer Key (API Key)]',
  TWITTER_SECRET: '[Consumer Secret (API Secret)]',

  // https://developers.facebook.com/apps/
  FACEBOOK_ID: '[App ID]',
  FACEBOOK_SECRET: '[App Secret]',

  // https://github.com/settings/applications
  GITHUB_ID: '[Client ID]',
  GITHUB_SECRET: '[Client Secret]',

  // Control debug level for modules using visionmedia/debug
  DEBUG: ''
};
