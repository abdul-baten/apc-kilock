'use strict';

var mongoose = require('mongoose');
var _ = require('lodash');
var async = require('async');
var logger = log4js.getLogger();
var User = mongoose.model('User'),
    Group = mongoose.model('Group'),
    AttendanceLog = mongoose.model('AttendanceLog'),
    Organization = mongoose.model('Organization'),
    Source = mongoose.model('Source'),
    Location = mongoose.model('Location'),
    MailTemplate = mongoose.model('MailTemplate'),
    Door = mongoose.model('Door');
var config = require('../environment');
var datetimeutil = require('../../utils/datetimeutil');

module.exports = function (doneAll) {
// 新しい必須カラム追加: 名前
User.find({name: {$exists: false}})
  .exec(function (err, users) {
    if (err) {
      logger.error(err);
    } else if (users && users.length > 0) {
      async.each(users, function(user, done) {
        user.name = user.lastname + ' ' + user.firstname;
        user.save(function (err) {
            if (err) {
              logger.error(err);
            }
            // エラーでも続行
            done();
          });
      }, function (err) {
        if (err) {
          logger.error(err);
        }
        logger.info('end upgrade.(user.name)');
      });
    }
  });

User.collection.getIndexes(function (err, indexes) {
  _(indexes).each(function(index) {
    // loginのみのunique制約削除
    if (index.length === 1 && index[0].length > 0 && index[0][0] === 'login') {
      User.collection.dropIndex({login:1}, function (err) {
        if (err) {
          logger.error(err);
          return;
        }
        logger.info('dropIndex user:{login:1}.');
      });
    }
  });
});

Source.collection.getIndexes(function (err, indexes) {
  _(indexes).each(function(index) {
    // nameのみのunique制約削除
    if (index.length === 1 && index[0].length > 0 && index[0][0] === 'name') {
      Source.collection.dropIndex({name:1}, function (err) {
        if (err) {
          logger.error(err);
          return;
        }
        logger.info('dropIndex source:{name:1}.');
      });
    }
  });
});

// 新しい必須カラム追加: 表示順
Group.find({displayOrder: {$exists: false}})
  .exec(function (err, groups) {
    if (err) {
      logger.error(err);
    } else if (groups && groups.length > 0) {
      async.each(groups, function(group, done) {
        group.ignoreCurrentTimestamp = true;
        group.displayOrder = 9999000;
        group.save(function (err) {
          if (err) {
            logger.error(err);
          }
          done();
        });
      }, function (err) {
        if (err) {
          logger.error(err);
        }
        logger.info('end upgrade.(group.displayOrder)');
      });
    }
  });

// 勤怠ログ自動記録時間追加
AttendanceLog.find({
    $or: [{
      autoInTimestamp: {$exists: false}
    },{
      autoOutTimestamp: {$exists: false}
    }]
  })
  .exec(function (err, attendanceLogs) {
    if (err) {
      logger.error(err);
    } else if (attendanceLogs && attendanceLogs.length > 0) {
      async.each(attendanceLogs, function(attendanceLog, done) {
        attendanceLog.autoInTimestamp = attendanceLog.inTimestamp;
        attendanceLog.autoOutTimestamp = attendanceLog.outTimestamp;
        attendanceLog.save(function (err) {
          if (err) {
            logger.error(err);
          }
          done();
        });
      }, function (err) {
        if (err) {
          logger.error(err);
        }
        logger.info('end upgrade.(attendanceLogs)');
      });
    }
  });

if (config.rootOrganizationPath) {
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
      logger.info('register sample organization');
      organization.save(callback);
    },
    function (organization, count, callback) {
      async.parallel([
        function (callback) {
          Source.findOne({ type: { $in: ['google', 'googleplus'] } })
            .exec(function (err, source) {
              if (err) {
                return callback(err);
              }
              if (source && source.type === 'googleplus') {
                source.name = 'google';
                source.type = 'google';
                source.authType = 'google';
                source.displayName = 'Google';
                source.save(callback);
                return;
              } else if (source) {
                return callback(null, source);
              }
              source = new Source({
                type: 'google',
                name: 'google',
                authType: 'google',
                displayName: 'Google',
                synchronizedAt: new Date(0),
                organization: organization,
                settings: {},
              });
              source.save(callback);
            });
        },
        function (callback) {
          async.each(['twitter', 'facebook', 'github'],
            function (sourcetype, callback) {
              Source.findOne({ type: sourcetype })
                .exec(function (err, source) {
                  if (err) {
                    return callback(err);
                  }
                  if (source) {
                    return callback(null, source);
                  }
                  source = new Source({
                    type: sourcetype,
                    name: sourcetype,
                    authType: sourcetype,
                    displayName: sourcetype,
                    synchronizedAt: new Date(0),
                    organization: organization,
                    settings: {},
                  });
                  source.save(callback);
                });
            }, callback);
        },
        function (callback) {
          User.where({sourcetype: 'googleplus'})
            .update({$set: { sourcetype: 'google', sourcename: 'google' }}, callback);
        },
        function (callback) {
          if (count === 0) {
            return callback(null, null);
          }
          // ロケーションとドア登録
          var location = new Location({
            name: 'sample',
            organization: organization,
          });
          logger.info('register sample location');
          location.save(function (err, location) {
            var door = new Door({
              key: 'sample',
              name: 'sample',
              action: 'passonly',
              location: location,
            });
            logger.info('register sample door');
            door.save(callback);
          });
        },
        function (callback) {
          if (count === 0) {
            return callback(null, null);
          }
          User.find({'sourcedata.type': 'local', $or: [{ organization: organization }, { organization: null }, { organization: {$exists: false} }]})
            .exec(function (err, localUsers) {
              if (err) {
                return callback(err);
              }
              // ローカルグループ追加
              var localGroup = new Group({
                name: 'ローカルユーザ',
                displayOrder: 2147483647,
                enabled: true,
                sourcename : 'local',
                sourcetype : 'local',
                source : { type: 'local' },
                sourcedata : { type: 'local' },
                organization: organization,
                // ローカルユーザをローカルグループに所属させる
                users: localUsers,
              });
              logger.info('add %s\'s local group', organization.name);
              localGroup.save(callback);
            });
        },
        function (callback) {
          // 組織に所属していないユーザを組織に追加
          User.find({$or: [ { organization: null }, { organization: {$exists: false} }]})
            .exec(function (err, users) {
              if (err) {
                return callback(err);
              }
              async.each(users, function (user, callback) {
                user.organization = organization;
                user.save(callback);
              }, callback);
            });
        },
      ], callback);
    },
  ], function (err) {
      if (err) {
        logger.error(err);
      }
      logger.info('end upgrade.(organization)');
    }
  );
}

// 組織ごとのローカルグループ追加
Organization.find({})
  .exec(function (err, organizations) {
    async.each(organizations, function (organization, done) {
      Group.findOne({'sourcedata.type': 'local', organization: organization })
        .exec(function (err, group) {
          logger.trace(group);
          if (err) {
            done(err);
          } else if (!group) {
            var localGroup = new Group({
              name: 'ローカルユーザ',
              displayOrder: 2147483647,
              enabled: true,
              sourcename : 'local',
              sourcetype : 'local',
              source : { type: 'local' },
              sourcedata : { type: 'local' },
              organization: organization,
            });
            localGroup.save(function (err, localGroup) {
              User.find({sources: { $size: 0 }, organization: organization})
              .exec(function(err, localUsers) {
                // ローカルユーザをローカルグループに所属させる
                localGroup.users = localUsers;
                localGroup.save(function (err) {
                  if (err) {
                    logger.error(err);
                  }
                  logger.info('add %s\'s local group', organization.name);
                  done();
                });
              });
            });
          } else {
            done();
          }
        });
    }, function (err) {
      if (err) {
        logger.error(err);
      }
      logger.info('end upgrade.(organization\'s local group)');
    });
  });


// MailTemplates
MailTemplate.count({}, function (err, count) {
  if (err) {
    logger.error(err);
    return;
  }

  var complete = function (err) {
    logger.info('end upgrade.(MailTemplates)');
  };

  var initalTemplates = {
    unknown: {
      ja: {
        subject: '通過を確認しました',
        text: '通過を確認しました',
      },
      en: {
        subject: 'pass the door',
        text: 'pass the door',
      },
    },
    enter: {
      ja: {
        subject: '入室しました',
        text: '入室しました',
      },
      en: {
        subject: 'enter the room',
        text: 'enter the room',
      },
    },
    leave: {
      ja: {
        subject: '退室しました',
        text: '退室しました',
      },
      en: {
        subject: 'leave the room',
        text: 'leave the room',
      },
    },
  };

  var templateInfo = function(key, locale) {
    var val = initalTemplates[key];
    return (val) ? val[locale] : {};
  };

  var passHistoriesLogic = require('../../logics/pass_histories_logic');

  var setupMailTemplates = function (missingPassTypeIds, callback) {
    logger.debug('XXX:setupMailTemplates:missing:' + missingPassTypeIds);
    var insert = null;
    insert = function (err, idx) {
      if (err || (missingPassTypeIds.length <= idx)) {
        if (callback) {
          callback(err);
        }
        return;
      }

      var passTypeId = missingPassTypeIds[idx];
      logger.debug('XXX:setupMailTemplates:' + passTypeId);
      var info = {
        passTypeId: passTypeId,
        subject: 'subject',
        text: 'text',
      };

      info = _.merge(info, templateInfo(passHistoriesLogic.convertPassType(passTypeId), config.defaultLocale));
      var template = new MailTemplate(info);
      template.save(function(err) {
        if (err) { logger.error(err); }
        insert(err, idx + 1);
      });
    };

    insert(null, 0);
  };

  /**
   * グループメールのテンプレートを登録する。
   */
  var registerGroupMailTemplate = function () {
    var passTypeId = 3;
    var groupMailTemplate = {
      jp: {
        passTypeId: passTypeId,
        subject: 'グループメール送信',
        text: 'メール送信body'
      },
      en: {
        passTypeId: passTypeId,
        subject: 'send group mail',
        text: 'mail body'
      }
    };

    var param = groupMailTemplate[config.defaultLocale];

    async.waterfall([
        function (done) {
          MailTemplate.findOne({passTypeId: 3}).exec(done);
        },
        function (mailTemplate, done) {
          if (mailTemplate) {
            done();
            return;
          }

          var groupMailTemplate = new MailTemplate(param);
          groupMailTemplate.save(done);
        }
      ],
      function (err, mailTemplate) {
        if (err) {
          logger.error(err);
          return;
        }
        if (mailTemplate) {
          logger.debug('グループメールテンプレートの登録が完了しました。');
        } else {
          logger.debug('すでにグループメールテンプレートが登録されています。');
        }
      });
  };

  var insertMissingTemplate = function () {
    MailTemplate
      .find()
      .where('passTypeId')
      .in(passHistoriesLogic.passTypeValidValue)
      .sort('passTypeId')
      .exec(function (err, templates) {
        logger.debug('XXX:templates:', templates);
        if (err) {
          logger.error(err);
          return;
        }

        var passTypeIds = _.map(templates, function (template) { return template.passTypeId; });

        var missingPassTypeIds = [];
        _.forEach(passHistoriesLogic.passTypeValidValue, function (passTypeId) {
          var idx = _.indexOf(passTypeIds, passTypeId);
          if (idx >= 0) {
            return;
          }
          missingPassTypeIds.push(passTypeId);
        });

        setupMailTemplates(missingPassTypeIds, complete);
      });
  };

  if (count === 0) {
    setupMailTemplates(passHistoriesLogic.passTypeValidValue, complete);
    registerGroupMailTemplate();
    return;
  }

  insertMissingTemplate();
  registerGroupMailTemplate();
});
doneAll();
};
