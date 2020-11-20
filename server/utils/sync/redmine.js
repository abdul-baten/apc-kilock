'use strict';

var urlUtil = require('url');
var _ = require('lodash');
var util     = require('util');
var async    = require('async');
var logger   = log4js.getLogger();
var mongoose = require('mongoose');
var http     = require('http');
var https    = require('https');
var User     = mongoose.model('User');
var Group    = mongoose.model('Group');

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
   * JsonAPIの結果を受け取る処理
   * @param protocol {Object} - http or https
   * @param protocolOptions {Object} - URLなどの情報
   * @param callback {Function} - コールバック関数 Jsonの結果が返る
   */
  this.jsonApiGet = function (protocol, protocolOptions, callback) {
    var req = protocol.get(protocolOptions, function (res) {
      res.setEncoding('utf8');
      var result = '';
      res.on('data', function (chunk) {
        result += chunk;
      });
      res.on('end', function () {
        var parsedResult;
        try {
          parsedResult = JSON.parse(result);
        } catch (e) {
          // JSONパース失敗
          return callback({error: e, target: result, protocolOptions: protocolOptions});
        }
        callback(null, parsedResult);
      });
    }).on('error', function (err) {
      callback(err);
    });
  };

  var convertUrl = function (url) {
    var parsedUrl = urlUtil.parse(url);
    var isHttps = parsedUrl.protocol && parsedUrl.protocol.indexOf('https') === 0;
    var protocol = isHttps ? https : http;
    return {
      protocol: protocol,
      protocolOptions: {
        host: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.path,
        method: 'GET',
      }
    };
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
    var protocol, protocolOptions;
    if (detail.url) {
      var parsedUrl = convertUrl(detail.url);
      protocol = parsedUrl.protocol;
      protocolOptions = parsedUrl.protocolOptions;
    } else {
      protocol = detail.https ? https : http;
      protocolOptions = detail.https || detail.http;
    }
    protocolOptions = _.clone(protocolOptions);
    protocolOptions.path = protocolOptions.path + '&limit=' + limit + '&offset=' + offset;

    $this.jsonApiGet(protocol, protocolOptions, function(err, results) {
      if (err) {
        return callback(err);
      }
      var next;
      if ((results.limit + results.offset) < results.total_count) {
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
      async.each(results.users, function (user, callback) {
        register(user, detail, callback);
      }, next);
    });
  };

  this.isIgnore = function (sourceUser) {
    // loginなし、mailなし、一致しないは除外
    if (!sourceUser.login || !sourceUser.mail ||
      sourceUser.login !== sourceUser.mail) {
      logger.trace(sourceUser);
      return true;
    }
    if (settings.ignoreUsers &&
      _(settings.ignoreUsers).contains(sourceUser.login)) {
      return true;
    }
    return false;
  };

  this.registerUser = function (sourceUser, detail, done) {
    var forceUpdate = options.forceUpdate || false;
    var userDoorOpen = detail.userDoorOpen !== undefined ? detail.userDoorOpen : options.userDoorOpen;

    if ($this.isIgnore(sourceUser)) {
      logger.trace('除外ユーザ:' + sourceUser.login);
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
      // ログインIDから取得
      findByLogin: function (callback) {
        User.findOne({
          login: sourceUser.login
        }).exec(User.populateSource(callback));
      },
    }, function (err, results) {
      if (err) {
        return done(err);
      }
      var registerUser;
      if (!results.findBySource && results.findByLogin) {
        // ソース情報から取得できなかったがログインIDが登録済み
        //   -> このソース情報とのヒモ付が必要
        registerUser = results.findByLogin;
        if (registerUser.sourcetype === 'local') {
          // ローカルユーザからソースありユーザへ変更
          registerUser.sourcetype = source.type;
          registerUser.sourcename = source.name;
          registerUser.source = { id: sourceUser.id };
          logger.info('ローカルユーザからソースありユーザへ変更:' + registerUser.login);
        }
        if (registerUser.addToSetSource(source, { id: sourceUser.id })) {
          logger.info('新しいソース追加: login: %s , source.name: %s',
            registerUser.login, source.name);
        } else {
          logger.warn('既に同一ソースあり: login: %s , source.name: %s',
            registerUser.login, source.name);
        }
      } else {
        registerUser = results.findBySource;
      }
      var createFullName = function() {
        // TODO 表記順対応
        return sourceUser.lastname + ' ' + sourceUser.firstname;
      };
      if (registerUser) {
        var isPrimary = registerUser.isPrimarySource(source);
        // update
        if (!isPrimary) {
          logger.trace('主要ソースではないので同期時間のみ更新');
          // 主要ソースではないので同期時間のみ更新
          registerUser.ignoreCurrentTimestamp = true;
        } else if (!forceUpdate &&
          registerUser.name === createFullName() &&
          registerUser.lastname === sourceUser.lastname &&
          registerUser.firstname === sourceUser.firstname &&
          registerUser.login === sourceUser.login &&
          registerUser.mail === sourceUser.mail &&
          registerUser.enabled) {
          // 値が全く同じなら同期時間のみ更新
          registerUser.ignoreCurrentTimestamp = true;
        } else {
          registerUser.name = createFullName();
          registerUser.lastname = sourceUser.lastname;
          registerUser.firstname = sourceUser.firstname;
          registerUser.login = sourceUser.login;
          registerUser.mail = sourceUser.mail;
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
          name: createFullName(),
          lastname: sourceUser.lastname,
          firstname: sourceUser.firstname,
          login: sourceUser.login,
          mail: sourceUser.mail,
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
      }
      registerUser.save(function (err) { done(err); });
    });
  };

  this.buildProtocolOptions = function(detail, limit, offset) {
    var protocolOptions = _.clone(detail);
    protocolOptions.path = protocolOptions.path + '&limit=' + limit + '&offset=' + offset;
    return protocolOptions;
  };

  /**
   * グループ同期処理
   * @param detail {Object} - 同期情報詳細
   * @param register {Function} - 登録処理
   * @param callback {Function} - コールバック関数
   */
  this.syncGroups = function (detail, register, callback) {
    var protocol, protocolOptions;
    if (detail.url) {
      var parsedUrl = convertUrl(detail.url);
      protocol = parsedUrl.protocol;
      protocolOptions = parsedUrl.protocolOptions;
    } else {
      protocol = detail.https ? https : http;
      protocolOptions = detail.https || detail.http;
    }
    protocolOptions = _.clone(protocolOptions);

    $this.jsonApiGet(protocol, protocolOptions, function (err, results) {
      if (err) {
        callback(err);
        return;
      }

      async.each(results.groups, function (group, callback) {
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
    Group.findOne({
      sourcetype: source.type,
      sourcename: source.name,
      sourcedata: {
        id: sourceGroup.id
      }
    }).exec(function (err, group) {
      if (err) {
        return done(err);
      }
      var register;
      if (group) {
        // update
        register = group;
        if (!forceUpdate &&
          register.name === sourceGroup.name) {
          // 値が全く同じなら同期時間のみ更新
          group.ignoreCurrentTimestamp = true;
        } else {
          group.name = sourceGroup.name;
        }
        group.synchronizedAt = Date.now();
      } else {
        // insert
        register = new Group({
          name         : sourceGroup.name,
          enabled      : autoGroupEnabled,
          displayOrder : 9999000,
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
    var protocol = detail.https ? https : http;
    Group.find({enabled: true, sourcename: source.name, sourcetype: source.type})
      .exec(function (err, groups) {
        if (err) {
          logger.error(err);
          return end();
        }
        async.each(groups, function (group, callback) {
          var protocol, protocolOptions;
          if (detail.url) {
            var parsedUrl = convertUrl(detail.url);
            protocol = parsedUrl.protocol;
            protocolOptions = parsedUrl.protocolOptions;
          } else {
            protocol = detail.https ? https : http;
            protocolOptions = detail.https || detail.http;
          }
          protocolOptions = _.clone(protocolOptions);
          protocolOptions.path = util.format(protocolOptions.path, group.sourcedata.id.toString());

          $this.jsonApiGet(protocol, protocolOptions, function (err, results) {
            if (err) {
              return callback(err);
            }
            register(group, results.group.users, callback);
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
