'use strict';

var _ = require('lodash');
var mongoose = require('mongoose');
var async = require('async');
var config = require('../environment');
var logger = log4js.getLogger();

var Source = mongoose.model('Source');
var Group = mongoose.model('Group');

module.exports = function (doneAll) {
  async.waterfall([
    function (callback) {
      // ソースの持ち方変更
      Group.find({
        $or: [
          { sourcedata: null },
          { sourcedata: { $exists: false } },
        ]
      }).exec(function (err, groups) {
        if (err) {
          logger.error(err);
          return callback(null, null);
        }
        async.each(groups, function (group, callback) {
          logger.trace(group.name);
          async.waterfall([
            function (callback) {
              Source.findOne({
                name: group.sourcename,
                type: group.sourcetype,
                organization: group.organization,
              }).exec(callback);
            },
            function (source, callback) {
              group.sourcedata = group.source || { type: 'other' };
              // TODO 将来的にソースを入れるように修正する
              // if (!source) {
              //   group.source = null;
              // } else {
              //   group.source = source;
              // }
              group.save(callback);
            },
            ], callback);
        }, callback);
      });
    },
    ], doneAll);
};
