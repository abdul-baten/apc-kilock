'use strict';

var _ = require('lodash');
var async = require('async');
var mongoose = require('mongoose');
var logger = log4js.getLogger();
var GroupTag = mongoose.model('GroupTag');
var Group = mongoose.model('Group');

var groupResults = function (groups) {
  return _(groups).map(function (group) {
    return {
      id: group.id,
      name: group.name,
    };
  }).value();
};

exports.get = function (req, res) {
  async.parallel({
    // タグと紐づくグループ
    groupTags: function (callback) {
      GroupTag.find({}).sort({name: 1})
      .exec(function (err, groupTags) {
        if (err) {
          return callback(err);
        }
        async.map(groupTags, function (groupTag, callback) {
          Group.find({tags: groupTag})
          .sort({displayOrder: 1, name: 1})
          .exec(function (err, groups) {
            if (err) {
              return callback(err);
            }
            callback(null, {
              tag: {
                name: groupTag.name,
              },
              groups: groupResults(groups),
            });
          });
        }, callback);
      });
    },
    // タグ無しグループ
    noTagGroups: function (callback) {
      Group.find({$or: [
        { tags: null },
        { tags: {$size: 0} },
      ]})
      .sort({displayOrder: 1, name: 1})
      .exec(function (err, groups) {
        if (err) {
          return callback(err);
        }
        callback(null, groupResults(groups));
      });
    },
  }, function (err, results) {
    if (err) {
      logger.error(err);
      res.status(500);
      return res.json({});
    }
    results.groupTags = _(results.groupTags).filter(function (groupTag) {
      return groupTag.groups && groupTag.groups.length > 0;
    }).value();
    return res.json(results);
  });
};
