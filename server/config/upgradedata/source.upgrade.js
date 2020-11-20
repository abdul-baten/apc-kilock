'use strict';

var url = require('url');
var _ = require('lodash');
var mongoose = require('mongoose');
var async = require('async');
var config = require('../environment');
var logger = log4js.getLogger();

var Source = mongoose.model('Source');

module.exports = function (doneAll) {
  async.series([
    function (callback) {
      // SourceにauthType追加
      Source.find({
        $or: [
          { authType: null },
          { authType: { $exists: false } },
        ]
      }).exec(function (err, sources) {
        if (err) {
          logger.error(err);
          return callback();
        }
        async.each(sources, function (source, callback) {
          if (source.type === 'redmine') {
            source.authType = 'cas';
          } else if (source.type === 'local' || source.type === 'kilock-converter') {
            source.authType = 'none';
          } else {
            source.authType = source.type;
          }
          source.save(callback);
        }, callback);
      });
    },
    function (callback) {
      // settingsの持ち方変更
      Source.find({type: 'redmine'})
      .exec(function (err, sources) {
        if (err) {
          logger.error(err);
          return callback();
        }
        var convertUrl = function (protocol, defaultPort) {
          return url.resolve(url.format({
            protocol: defaultPort === 443 ? 'https' : 'http',
            hostname: protocol.host,
            port: protocol.port !== defaultPort ? protocol.port : undefined,
          }), protocol.path);
        };
        async.each(sources, function (source, callback) {
          var needUpdate = false;
          if (source.settings && source.settings.users) {
            _(source.settings.users).each(function (setting) {
              if (setting.http || setting.https) {
                needUpdate = true;
                setting.userDoorOpen = source.userDoorOpen !== undefined ? source.userDoorOpen : false;
                if (setting.https) {
                  setting.url = convertUrl(setting.https, 443);
                  delete setting.https;
                } else {
                  setting.url = convertUrl(setting.http, 80);
                  delete setting.http;
                }
              }
            });
          }
          if (source.settings && source.settings.groups) {
            _(source.settings.groups).each(function (setting) {
              if (setting.http || setting.https) {
                needUpdate = true;
                setting.autoGroupEnabled = source.autoGroupEnabled !== undefined ? source.autoGroupEnabled : true;
                if (setting.https) {
                  setting.url = convertUrl(setting.https, 443);
                  delete setting.https;
                } else {
                  setting.url = convertUrl(setting.http, 80);
                  delete setting.http;
                }
              }
            });
          }
          if (source.settings && source.settings.groupUsers) {
            _(source.settings.groupUsers).each(function (setting) {
              if (setting.http || setting.https) {
                needUpdate = true;
                if (setting.https) {
                  setting.url = convertUrl(setting.https, 443);
                  delete setting.https;
                } else {
                  setting.url = convertUrl(setting.http, 80);
                  delete setting.http;
                }
              }
            });
          }
          if (source.settings.userDoorOpen !== undefined) {
            needUpdate = true;
            delete source.settings.userDoorOpen;
          }
          if (source.settings.autoGroupEnabled !== undefined) {
            needUpdate = true;
            delete source.settings.autoGroupEnabled;
          }
          if (needUpdate) {
            source.markModified('settings');
            source.save(callback);
          } else {
            callback(null, source);
          }
        }, callback);
      });
    },
  ], doneAll);
};
