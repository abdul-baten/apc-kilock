'use strict';

var _ = require('lodash');
var mongoose = require('mongoose');
var async = require('async');
var config = require('../environment');
var logger = log4js.getLogger();

var Organization = mongoose.model('Organization');

// デフォルト組織の登録
module.exports = function (doneAll) {
  if (!config.rootOrganizationPath) {
    return doneAll();
  }
  async.waterfall([
    function (callback) {
      Organization.findOne({path: config.rootOrganizationPath})
        .exec(callback);
    },
    function (organization, callback) {
      // 組織取得、なければ登録
      if (organization) {
        return callback(null, organization, 0);
      }
      organization = new Organization({
        name: config.rootOrganizationPath,
        path: config.rootOrganizationPath,
      });
      logger.info('register default organization');
      organization.save(callback);
    },
  ], doneAll);
};
