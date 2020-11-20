'use strict';

var _ = require('lodash');
var mongoose = require('mongoose');
var async = require('async');
var config = require('../environment');
var logger = log4js.getLogger();

var Organization = mongoose.model('Organization');
var Source = mongoose.model('Source');
var Group = mongoose.model('Group');
var GroupTag = mongoose.model('GroupTag');

// 開発用データ等の登録処理
module.exports = function (doneAll) {
  if (process.env.NODE_ENV !== 'development') {
    return doneAll();
  }
  async.waterfall([
    function (callback) {
      Organization.findOne({path: config.rootOrganizationPath})
        .exec(callback);
    },
    function (organization, count, callback) {
      // 組織がなければ処理しない
      if (!organization) {
        return callback(null, null);
      }
      async.parallel([
        function (callback) {
          Source.findOne({name: 'cas'})
            .exec(function (err, source) {
              if (!source) {
                source = new Source({
                  type: 'local',
                  name: 'cas',
                  synchronizedAt: new Date(0),
                });
              }
              if (source.organization) {
                return callback(null, source);
              }
              source.organization = organization;
              source.settings = {};
              source.save(callback);
            });
        },
        function (callback) {
          GroupTag.count({}, function (err, count) {
            if (err) {
              logger.error(err);
              return callback();
            }
            if (count > 0) {
              return callback();
            }
            var tags = ['タグA', 'タグB', 'タグC' ];
            var groups = ['-1', '-2', '-3', '-4' ];
            async.each(tags, function (tag, callback) {
              (new GroupTag({
                name: tag,
                organization: organization,
              })).save(function (err, groupTag) {
                if (err) {
                  return callback(err);
                }
                async.each(groups, function (group, callback) {
                  (new Group({
                    name: tag + group,
                    enabled: true,
                    organization: organization,
                    tags: [groupTag],
                    sourcename: 'local',
                    sourcetype: 'local',
                    source: {},
                    sourcedata: { type: 'other' },
                  })).save(callback);
                }, callback);
              });
            }, function (err) {
              if (err) {
                logger.error(err);
              }
              logger.trace('create TagGroup.');
              callback();
            });
          });
        },
      ], callback);
    },
  ], function (err) {
      if (err) {
        logger.error(err);
      }
      logger.info('upgrade devdata end.');
    }
  );
};
