'use strict';

var _ = require('lodash');
var util = require('util');
var async = require('async');
var request = require('request');
var codepoint = require('codepoint');
var logger = log4js.getLogger();
var mongoose = require('mongoose');
var User = mongoose.model('User');
var Group = mongoose.model('Group');
var GroupTag = mongoose.model('GroupTag');

module.exports = function (options, source) {
  var $this = this;
  var settings = source.settings;

  // APIから1回で取得する最大値(RedmineAPIの仕様上100より大きくはできない)
  var limit = 100;
  options = _.merge({
    userDoorOpen: settings.userDoorOpen !== undefined ? settings.userDoorOpen : false,
    autoGroupEnabled: settings.autoGroupEnabled !== undefined ? settings.autoGroupEnabled : true,
  }, options);
  this.sync = function (done) {
    // ユーザ関連処理 エラーが起きた時点でログを出すのでエラーをコールバックさせない
    var userFunctions = function (next) {
      async.series([
        function (chain) {
          if (!settings.users) {
            return chain();
          }
          async.each(settings.users, function (detail, callback) {
            // ユーザ同期登録処理
            $this.syncUsers(detail, $this.registerUser, function (err) {
              if (err) {
                logger.error(err);
                // ユーザ関連処理終了
                return next();
              }
              callback();
            });
          }, chain);
        },
        function (chain) {
          // 同期されなかった(=30分以上同期されていない)ユーザを無効化
          var expire = new Date(Date.now() - (30 * 60 * 1000));
          User.find({
              enabled: true,
              sources: {
                $elemMatch: {
                  source: source,
                  synchronizedAt: {$lt: expire},
                },
              },
            })
            .exec(User.populateSource(function(err, users) {
              async.each(users, function (user, done) {
                logger.info('無効化ユーザ:' + user.login);
                user.removeSource(source);
                user.enabled = user.sources.length > 0;
                user.save(done);
              }, chain);
            }));
        },
      ], function (err) {
        if (err) {
          logger.error(err);
        }
        next();
      });
    };
    // グループ関連処理 エラーが起きた時点でログを出すのでエラーをコールバックさせない
    var groupFunctions = function (next) {
      async.series([
        function (chain) {
          if (!settings.groups) {
            return chain();
          }
          async.each(settings.groups, function (detail, callback) {
            // グループ同期処理
            $this.syncGroups(detail, $this.registerGroup, function (err) {
              if (err) {
                logger.error(err);
                // グループ関連処理終了
                return next();
              }
              callback();
            });
          }, chain);
        },
        function (chain) {
          // 同期されなかった(=30分以上同期されていない)グループを無効化
          var expire = new Date(Date.now() - (30 * 60 * 1000));
          Group.find({enabled: true, sourcename: source.name, synchronizedAt: {$lt: expire}})
            .exec(function(err, groups) {
              async.each(groups, function (group, done) {
                logger.info('無効化グループ:' + group.name);
                group.enabled = false;
                group.save(done);
              }, chain);
            });
        },
      ], function (err) {
        if (err) {
          logger.error(err);
        }
        next();
      });
    };
    async.series([
      function (chain) {
        async.parallel([
          userFunctions,
          groupFunctions,
        ], chain);
      },
      function (chain) {
        if (!settings.groupUsers) {
          return chain();
        }
        async.each(settings.groupUsers, function (detail, callback) {
          callback();
          // 非同期で実行
          // グループ-ユーザ同期処理
          async.nextTick(function () {
            $this.syncGroupUsers(detail, $this.registerGroupUsers, function (err) {
              if (err) {
                logger.error(err);
              }
            });
          });
        }, chain);
      },
    ], function (err) {
      logger.trace('synchronization end.');
      if (err) {
        logger.error(err);
      }
      done();
    });
  };

  /**
   * ユーザ同期処理
   * @param detail {Object} - 同期情報詳細
   * @param register {Function} - 登録処理
   * @param callback {Function} - コールバック関数
   * @param offset {Integer} - 複数回APIから取得する場合のoffset値
   */
  this.syncUsers = function (detail, register, callback, offset) {
    offset = offset || 0;

    var protocolOptions = {
      url: detail.url,
      auth: detail.auth,
      method: 'GET',
      qs: {
        limit: limit,
        offset: offset,
      },
      json: true,
    };

    request(protocolOptions, function (err, response, body) {
      if (err) {
        return callback(err);
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        return callback(new Error(util.format('synchronize error. status code: %s', response.statusCode.toString())));
      }

      if (!body.users) {
        logger.error({body: body});
        return callback(new Error('synchronize error. invalid format.'));
      }

      var next;
      if ((body.limit + body.offset) < body.total_count) {
        // ユーザ数が多い場合は複数回取得
        next = function (err) {
          if (err) {
            callback(err);
          } else {
            $this.syncUsers(detail, register, callback, offset + limit);
          }
        };
      } else {
        next = callback;
      }
      // 登録
      async.each(body.users, function (user, callback) {
        var convertedUser = _.clone(user);
        // unicode scalar value の変換
        var regexCodePoint = /&#(\d+);/g;
        if (convertedUser.name && convertedUser.name.match(regexCodePoint)) {
          convertedUser.name = convertedUser.name.replace(regexCodePoint, function (v, g) {
            return codepoint.fromCodePoint(g);
          });
        }
        register(convertedUser, detail, callback);
      }, next);
    });
  };

  this.isIgnore = function (sourceUser) {
    // loginなし、mailなし、一致しないは除外
    if (!sourceUser.id || !sourceUser.name) {
      logger.trace(sourceUser);
      return true;
    }
    return false;
  };

  this.registerUser = function (sourceUser, detail, done) {
    var forceUpdate = options.forceUpdate || false;
    var userDoorOpen = detail.userDoorOpen !== undefined ? detail.userDoorOpen : options.userDoorOpen;

    if ($this.isIgnore(sourceUser)) {
      logger.trace('除外ユーザ:' + sourceUser.id);
      return done();
    }

    async.parallel({
      // ソース情報から取得
      findBySource: function (callback) {
        User.findOne({
          sources: {
            $elemMatch: {
              source: source,
              data: {
                id: sourceUser.id,
              },
            },
          },
        }).exec(User.populateSource(callback));
      },
    }, function (err, results) {
      if (err) {
        return done(err);
      }
      var registerUser = results.findBySource;
      if (registerUser) {
        var isPrimary = registerUser.isPrimarySource(source);
        // update
        if (!isPrimary) {
          logger.trace('主要ソースではないので同期時間のみ更新');
          // 主要ソースではないので同期時間のみ更新
          registerUser.ignoreCurrentTimestamp = true;
        } else if (!forceUpdate &&
          registerUser.name === sourceUser.name &&
          registerUser.code === sourceUser.code &&
          registerUser.enabled) {
          // 値が全く同じなら同期時間のみ更新
          registerUser.ignoreCurrentTimestamp = true;
        } else {
          registerUser.name = sourceUser.name;
          registerUser.code = sourceUser.code;
          registerUser.enabled = true;
        }
        var sourceData = registerUser.findSource(source);
        if (sourceData) {
          sourceData.primary = isPrimary;
          sourceData.synchronizedAt = Date.now();
        }
        registerUser.synchronizedAt = Date.now();
      } else {
        // insert
        registerUser = new User({
          name: sourceUser.name,
          code: sourceUser.code,
          enabled: true,
          doorOpen: userDoorOpen,
          displayOrder: 9999000,
          organization: source.organization,
          sourcename : source.name,
          sourcetype : source.type,
          source : { id: sourceUser.id },
          sources: [{
            source: source,
            data: { id: sourceUser.id },
            primary: true,
            synchronizedAt: Date.now(),
          }],
        });
        registerUser.autoLoginId();
      }
      registerUser.save(function (err) { done(err); });
    });
  };

  /**
   * グループ同期処理
   * @param detail {Object} - 同期情報詳細
   * @param register {Function} - 登録処理
   * @param callback {Function} - コールバック関数
   * @param offset {Integer} - 複数回APIから取得する場合のoffset値
   */
  this.syncGroups = function (detail, register, callback) {
    var protocolOptions = {
      url: detail.url,
      auth: detail.auth,
      method: 'GET',
      json: true,
    };

    request(protocolOptions, function (err, response, body) {
      if (err) {
        return callback(err);
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        return callback(new Error(util.format('synchronize error. status code: %s', response.statusCode.toString())));
      }

      if (!body.groups) {
        logger.error({body: body});
        return callback(new Error('synchronize error. invalid format.'));
      }

      async.each(body.groups, function (group, callback) {
        register(group, detail, callback);
      }, callback);
    });
  };

  /**
   * グループ登録
   */
  this.registerGroup = function (sourceGroup, detail, done) {
    var autoGroupEnabled = detail.autoGroupEnabled !== undefined ? detail.autoGroupEnabled : options.autoGroupEnabled;
    var forceUpdate      = options.forceUpdate || false;
    async.parallel({
      group: function (callback) {
        Group.findOne({
          sourcetype: source.type,
          sourcename: source.name,
          sourcedata: {
            id: sourceGroup.id
          }
        })
        .populate('tags')
        .exec(callback);
      },
      groupTags: function (callback) {
        if (!sourceGroup.tag) {
          return callback(null, []);
        }
        async.retry(3, function (callback) {
          GroupTag.findOne({
              name: sourceGroup.tag,
              organization: source.organization
            })
            .exec(function (err, groupTag) {
              if (err) {
                logger.warn(err);
                return callback(err);
              }
              if (groupTag) {
                return callback(null, [groupTag]);
              }
              // グループタグを新規登録
              async.map([sourceGroup.tag], function (tag, callback) {
                (new GroupTag({
                  name: sourceGroup.tag,
                  organization: source.organization,
                })).save(callback);
              }, callback);
            });
        }, callback);
      },
    },
    function (err, results) {
      if (err) {
        return done(err);
      }
      var group = results.group;
      var groupTags = results.groupTags;
      var sameTags = function (tags1, tags2) {
        if (tags1.length !== tags2.length) {
          return false;
        }
        var tagNames1 = _(tags1).pluck('name').value();
        var tagNames2 = _(tags1).pluck('name').value();
        return (_.difference(tagNames1, tagNames2)).length === 0;
      };
      var register;
      if (group) {
        // update
        register = group;
        if (!forceUpdate &&
          register.name === sourceGroup.name &&
          sameTags(register.tags || [], groupTags)) {
          // 値が全く同じなら同期時間のみ更新
          group.ignoreCurrentTimestamp = true;
        } else {
          group.name = sourceGroup.name;
          group.tags = groupTags;
        }
        group.synchronizedAt = Date.now();
      } else {
        // insert
        register = new Group({
          name         : sourceGroup.name,
          enabled      : autoGroupEnabled,
          displayOrder : 9999000,
          tags: groupTags,
          sourcename   : source.name,
          sourcetype   : source.type,
          source       : { id  : sourceGroup.id },
          sourcedata   : { id  : sourceGroup.id },
        });
      }
      register.save(done);
    });
  };

  /**
   * グループ-ユーザ同期
   */
  this.syncGroupUsers = function (detail, register, done) {
    var end = function (err) {
      if (err) {
        logger.error(err);
      }
      logger.trace('synchronization group-user end.');
      done();
    };
    Group.find({enabled: true, sourcename: source.name, sourcetype: source.type})
      .exec(function (err, groups) {
        if (err) {
          logger.error(err);
          return end();
        }
        async.each(groups, function (group, callback) {

          var protocolOptions = {
            url: util.format(detail.url, group.sourcedata.id.toString()),
            auth: detail.auth,
            method: 'GET',
            json: true,
          };

          request(protocolOptions, function (err, response, body) {
            if (err) {
              return callback(err);
            }

            if (response.statusCode < 200 || response.statusCode >= 300) {
              return callback(new Error(util.format('synchronize error. status code: %s', response.statusCode.toString())));
            }

            if (!body.group) {
              logger.error({body: body});
              return callback(new Error('synchronize error. invalid format.'));
            }

            register(group, body.group.users, callback);
          });
        }, function (err) {
          if (err) {
            logger.error(err);
          }
          end();
        });
      });
  };

  /**
   * グループ-ユーザ登録
   */
  this.registerGroupUsers = function (group, sourceUsers, done) {
    async.map(sourceUsers, function (sourceUser, callback) {
      if (sourceUser && sourceUser.id) {
        User.findOne({
            sources: {
              $elemMatch: {
                source: source,
                data: {
                  id: sourceUser.id,
                },
              },
            },
          }).exec(callback);
      } else {
        callback();
      }
    }, function (err, users) {
      if (err) {
        return done(err);
      }
      group.users = _.compact(users);
      group.save(done);
    });
  };
};
