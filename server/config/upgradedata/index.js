'use strict';

var _ = require('lodash');
var path = require('path');
var fs = require('fs');
var async = require('async');
var logger = log4js.getLogger();

var upgradeDataPath = __dirname;

// メインより前に実行する処理のファイル
var preUpgrade = [
  'defaultOrganization.js',
];

// メインより後に実行する処理のファイル
var postUpgrade = [
  // 'postupgrade.js',
];

logger.debug('------------- start upgrade');
async.series([
  function (callback) {
    // メインより前に実行する処理
    async.each(preUpgrade, function (file, callback) {
      logger.debug('run upgdadedata/%s', file);
      require(path.join(upgradeDataPath, file))(callback);
    }, callback);
  },
  function (callback) {
    logger.debug('run upgdadedata/main');
    require('./main')(callback);
  },
  function (callback) {
    // フォルダ内すべてのjsファイルを処理
    async.each(fs.readdirSync(upgradeDataPath), function (file, callback) {
      if (_(preUpgrade).contains(file) || _(postUpgrade).contains(file) ||
        file === 'main.js' || file === 'index.js') {
        return;
      }
      if (/(.*)\.(js$|coffee$)/.test(file)) {
        logger.debug('run upgdadedata/%s', file);
        require(path.join(upgradeDataPath, file))(callback);
      }
    }, callback);
  },
  function (callback) {
    // メインより後に実行する処理
    async.each(postUpgrade, function (file, callback) {
      logger.debug('run upgdadedata/%s', file);
      require(path.join(upgradeDataPath, file))(callback);
    }, callback);
  },
  ],
  function (err) {
    logger.debug('------------- end upgrade');
  });
