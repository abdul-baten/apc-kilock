'use strict';

var _ = require('lodash'),
    async = require('async'),
    mongoose = require('mongoose'),
    logger = log4js.getLogger(),
    config = require('../../config/environment'),
    Group = mongoose.model('Group'),
    User = mongoose.model('User'),
    Nfc = mongoose.model('Nfc'),
    Role = mongoose.model('Role'),
    validator = require('../../utils/validator'),
    attendance_logic = require('../../logics/attendance_logic');

var PermitLevel = {
  HIDE: 0,
  DISABLED: 1,
  ENABLED: 2,
};

var permitItems = {
  base: {
    passHistories: PermitLevel.ENABLED,
    attendance: PermitLevel.ENABLED,
    device: PermitLevel.ENABLED,
    maillist: PermitLevel.ENABLED,
    name: PermitLevel.ENABLED,
    mail: PermitLevel.HIDE,
    extensionPhoneNumber: PermitLevel.HIDE,
    profile: PermitLevel.HIDE,
    nfc: PermitLevel.ENABLED,
    imageurl: PermitLevel.HIDE,
    enabled: PermitLevel.ENABLED,
    doorOpen: PermitLevel.HIDE,
    admin: PermitLevel.ENABLED,
    top: PermitLevel.ENABLED,
    displayOrder: PermitLevel.ENABLED,
    delete: PermitLevel.ENABLED,
    role: PermitLevel.ENABLED,
    manageGroup: PermitLevel.HIDE,
  },
  // 試験的な機能を使用する場合
  pilot: {
    passHistories: PermitLevel.ENABLED,
    attendance: PermitLevel.ENABLED,
    device: PermitLevel.ENABLED,
    maillist: PermitLevel.ENABLED,
    name: PermitLevel.ENABLED,
    mail: PermitLevel.ENABLED,
    extensionPhoneNumber: PermitLevel.ENABLED,
    profile: PermitLevel.ENABLED,
    nfc: PermitLevel.ENABLED,
    imageurl: PermitLevel.ENABLED,
    enabled: PermitLevel.ENABLED,
    doorOpen: PermitLevel.ENABLED,
    admin: PermitLevel.ENABLED,
    top: PermitLevel.ENABLED,
    displayOrder: PermitLevel.ENABLED,
    delete: PermitLevel.ENABLED,
    role: PermitLevel.ENABLED,
    manageGroup: PermitLevel.ENABLED,
  },
  newregister: {
    passHistories: PermitLevel.HIDE,
    attendance: PermitLevel.HIDE,
    device: PermitLevel.HIDE,
    maillist: PermitLevel.HIDE,
    nfc: PermitLevel.HIDE,
    profile: PermitLevel.HIDE,
    imageurl: PermitLevel.HIDE,
    enabled: PermitLevel.HIDE,
    manageGroup: PermitLevel.HIDE,
  },
  source: {
    'redmine': {
      name: PermitLevel.DISABLED,
      mail: PermitLevel.DISABLED,
      enabled: PermitLevel.DISABLED,
    },
    'local': {
    },
    'default': {
      enabled: PermitLevel.DISABLED,
    },
  },
  authority: {
    admin: {
    },
    user: {
      mail: PermitLevel.HIDE,
      nfc: PermitLevel.DISABLED,
      enabled: PermitLevel.DISABLED,
      doorOpen: PermitLevel.HIDE,
      admin: PermitLevel.DISABLED,
      top: PermitLevel.DISABLED,
      displayOrder: PermitLevel.DISABLED,
      delete: PermitLevel.DISABLED,
      role: PermitLevel.HIDE,
      manageGroup: PermitLevel.HIDE,
    },
    self: {
      enabled: PermitLevel.DISABLED,
      admin: PermitLevel.DISABLED,
    },
  },
};

/**
 * グループの管理権限を保有しているか確認する。
 * @param {Array} groups 編集対象のユーザが所属しているグループの一覧
 * @param {Object} user 権限保有確認対象のユーザ
 * @returns {boolean} グループの管理権限を保有している場合はtrue,それ以外はfalse
 */
var isGroupManageUser = function (groups, user) {
  if (!user.manageGroups || !groups) {
    return false;
  }

  var foundGroup = _.find(groups, function (group) {
    return user.manageGroups.indexOf(group.id) >= 0;
  });

  return !!foundGroup;
};

var getPermitItems = function (sourceType, options) {
  var isAdmin = options.isAdmin || false;
  var isSelf = options.isSelf || false;
  var isTop = options.isTop || false;
  var isNew = options.isNew || false;
  var authority = isAdmin ? permitItems.authority.admin : permitItems.authority.user;
  var sourcePermitItems = permitItems.source[sourceType];
  sourcePermitItems = sourcePermitItems || permitItems.source['default'];

  var results = _.clone(config.pilotFunctions === 'enabled' ? permitItems.pilot : permitItems.base);
  results = _.merge(results, sourcePermitItems);
  results = _.merge(results, authority);
  if (isSelf) {
    results = _.merge(results, permitItems.authority.self);
  }
  if (isNew) {
    results = _.merge(results, permitItems.newregister);
  }
  return results;
};

var responseUser = function (res, reqParams, userOptions) {
  var isAdmin = userOptions.isAdmin;
  var isSelf = userOptions.isSelf;
  var condition = { id: reqParams.userId };
  async.waterfall([
    function (callback) {
      User.findOne(condition)
        .populate('nfcs')
        .populate('devices')
        .populate('roles')
        .populate('family')
        .exec(User.populateSource(callback));
    },
    function (user, callback) {
      attendance_logic.getPermissionProjects(
        user._id,
        function(err, attendancePermissionProjects) {
          callback(err, user, attendancePermissionProjects);
        }
      );
    }
  ], function (err, user, attendancePermissionProjects) {
    if (err) {
      logger.error(err);
      res.status(500);
      return res.send(err);
    }
    var user = user;
    if (!user) {
      res.status(404);
      return res.send(404);
    }
    var sourceType;
    if (user.sources && user.sources.length > 0) {
      sourceType = (_(user.sources).find(function (source) {
        return source.primary;
      }) || user.sources[0]).source.type;
    } else {
      sourceType = 'local';
    }
    var permitItems = getPermitItems(sourceType, {
        isAdmin: isAdmin,
        isSelf: isSelf,
      });
    if (user.family.length === 0) {
      permitItems.maillist = PermitLevel.HIDE;
    }
    var data = {
      id: user.id,
      login: user.login,
      name: user.name,
      employeeCode: user.employeeCode,
      mail: user.mail || null,
      admin: user.admin,
      top: user.top,
      enabled: user.enabled,
      doorOpen: user.doorOpen,
      extensionPhoneNumber: user.extensionPhoneNumber || null,
      imageurl: user.imageurl || null,
      profile: user.profile || null,
      order: Math.floor(user.displayOrder / 1000),
      nfcs: _.map(user.nfcs, function (nfc) {
        return { number: nfc.number };
      }),
      hasDevice: (user.devices && user.devices.length > 0),
      permitItems: permitItems,
      roles: user.roles,
      manageGroups: user.manageGroups,
      attendancePermissionProjects: attendancePermissionProjects,
    };
    return res.json(data);
  });
};

exports.get = function (req, res) {
  var param = req.query;
  if (req.params.userId === 'register') {
    // 管理者のみ登録可
    if (!req.user.admin) {
      // 権限エラー
      res.status(403);
      return res.json({});
    }
    // 新規ユーザ画面
    var permitItems = getPermitItems('local',  {
        isAdmin: req.user.admin,
        isNew: true,
      });
    var data = {
      admin: false,
      enabled: true,
      order: 9999,
      permitItems: permitItems,
    };
    return res.json(data);
  } else {
    validator(req).checkParams('userId').isInt();
    var validateErrors = req.validationErrors();
    if (validateErrors) {
      // バリデートエラー
      logger.info({validateErrors: validateErrors});
      res.status(400);
      return res.json(validateErrors);
    }
    var reqParams = {
      userId: parseInt(req.params.userId),
    };
    var isSelf = reqParams.userId === req.user.id;

    async.waterfall([
      function (callback) {
        User.findOne({id: reqParams.userId}).exec(callback);
      },
      function (user, callback) {
        var condition = {};
        condition.$and = [];
        condition.$and.push({users: user});
        condition.$and.push({enabled: true});
        Group.find(condition).exec(callback);
      },
    ], function (err, groups) {
      if (err) {
        logger.error(err);
        res.status(500);
        res.send(err);
      } else {
        var isGroupManageUserFlg = isGroupManageUser(groups, req.user);

        // 管理者か自分のみ編集可
        if (req.user.admin || isGroupManageUserFlg || isSelf) {
          return responseUser(res, reqParams, {
            isAdmin: req.user.admin,
            isSelf: isSelf
          });
        }
      }
    });
  }
};

/**
 * select_roleとして指定した役割がrolesに存在する場合は対応するRoleドキュメントのオブジェクトを返す
 * @param selectRole 選択した役割
 * @param roles 役割一覧
 * @return object 存在するときはRoleドキュメントのオブジェクト、存在しないときはnull
 */
var getSelectRole = function (selectRole, roles) {
  var role = _.find(roles, function (role) {
    return selectRole === (role._id + '');
  });

  return role || null;
};

/**
 * 選択された役割がRolesドキュメントに存在する場合、該当するRoleドキュメントを配列で取得する。
 * @param selectRoles 選択された役割
 * @param existRoles mongoに存在している役割
 * @return Array チェックボックスにて選択されたRoleドキュメント
 */
var getExistRoles = function (selectRoles, existRoles) {
  var selectRoleDocuments = [];

  if (!selectRoles) return selectRoleDocuments;

  _.forEach(selectRoles, function (selectRole) {
    var role = getSelectRole(selectRole, existRoles);

    if (role === null) return;
    selectRoleDocuments.push(role);
  });

  return selectRoleDocuments;
};

var registerUser = function (req, res, reqParams, organization, userOptions) {
  var permitItems;

  async.waterfall([
      // ユーザ取得
      function (next) {
        if (userOptions.isNew) {
          var newUser = new User({
            sourcename : 'local',
            sourcetype : 'local',
            source : { type: 'local' },
            sources: [],
            enabled: true,
            organization: organization,
          });
          newUser.autoLoginId();
          next(null, newUser);
        } else {
          User.findOne({ id: reqParams.userId })
            .populate('nfcs')
            .populate('roles')
            .exec(next);
        }
      },
      // 登録処理
      function (user, next) {
        if (!user) {
          res.status(404);
          return res.send(404);
        }
        permitItems = getPermitItems(user.sourcetype, userOptions);
        // 権限により更新可・不可を制御
        var permitKeys = _.keys(permitItems);
        _(permitKeys).each(function (key) {
          var item = permitItems[key];
          if (item !== 2) {
            return;
          }
          if (item === 'nfc' || item === 'device') {
            // TODO NFC、デバイスも権限管理する
            return;
          }
          // 情報をマッピング
          user[key] = reqParams[key];
        });
        Nfc.find({ number: { $in : reqParams.nfcs } })
          .populate('user')
          .exec(function (err, nfcs) {
              if (err) {
                return next(err);
              }
              next(null, user, nfcs);
            });
      },
      function (user, nfcs, next) {
        Role.find({}).exec(
          function (err, roles) {
            if (err) {
              logger.error(err);
              res.status(500);
              return res.json(err);
            }

            if (permitItems.role === PermitLevel.ENABLED && roles.length > 0) {
              user.roles = getExistRoles(reqParams.roleIdList, roles);
            }

            if (userOptions.isAdmin) {
              user.manageGroups = reqParams.groupIdList;
            }

            next(null, user, nfcs);
          });
      },
      function (user, nfcs, next) {
        // 有効なNFCのみに絞込
        var nfcNumbers =  _(reqParams.nfcs).filter(function (nfcNumber) {
          if (nfcNumber) {
            return true;
          } else {
            return false;
          }
        }).value();
        var hasOtherUser = false;
        var registerNfcs = [];
        var removeNfcs = [];
        // 登録すべきNFC
        _(nfcNumbers).each(function (nfcNumber) {
          var registerNfc = _.find(nfcs, function (nfc) {
            return nfc.number === nfcNumber;
          });
          if (!registerNfc) {
            registerNfc = new Nfc({number: nfcNumber, user: user});
          } else if (userOptions.isNew || registerNfc.user.id !== reqParams.userId) {
            // 他のユーザが使用中のNFC
            hasOtherUser = true;
          }
          registerNfcs.push(registerNfc);
        });
        // 削除すべきNFC
        _(user.nfcs).each(function (nfc) {
          if (!_.contains(nfcNumbers, nfc.number)) {
            removeNfcs.push(nfc);
          }
        });
        if (hasOtherUser) {
          res.status(400);
          var message = req.__('他のユーザが使用中のNFC');
          return res.json([{param: 'nfc', msg: message,}]);
        }
        // 新規の場合はローカルグループに所属させる
        if (userOptions.isNew) {
          Group.findOne({'sourcedata.type': 'local'})
            .exec(function (err, group) {
              if (err) {
                logger.error(err);
              } else if (group) {
                group.users.push(user);
                group.save(function (err) {
                  if (err) {
                    logger.error(err);
                  }
                });
              }
            });
        }
        // 登録処理
        async.parallel({
          registerUser: function (callback) {
            async.each(registerNfcs, function (nfc, done) {
              nfc.save(done);
            }, function (err) {
              if (err) {
                callback(err);
              } else {
                user.nfcs = registerNfcs;
                user.save(function(err, user) {
                  if (err) {
                    logger.error(err);
                    callback('ユーザ新規登録に失敗しました');
                    return;
                  }
                  attendance_logic.updatePermissions(
                    user._id,
                    reqParams.attendancePermissionMiddleProjects,
                    reqParams.attendancePermissionBetterProjects,
                    function(err) { callback(err, user); }
                  );
                });
              }
            });
          },
          removeNfcs: function (callback) {
            async.each(removeNfcs, function (nfc, done) {
              nfc.remove(done);
            }, callback);
          }
        }, next);
      },
    ], function (err, results) {
      // レスポンス
      if (!err) {
        if (results.registerUser) {
          reqParams.userId = results.registerUser.id;
        }
        return responseUser(res, reqParams, userOptions);
      } else {
        logger.error(err);
        res.status(500);
        return res.send(err);
      }
    });
};

exports.post = function (req, res) {
  validator(req).checkBody('name').notEmpty();
  validator(req).checkBody('admin').nullable().isIn([true, false]);
  validator(req).checkBody('enabled').nullable().isIn([true, false]);
  validator(req).checkBody('doorOpen').nullable().isIn([true, false]);
  // TODO extensionPhoneNumberのユニークチェックをやる
  validator(req).checkBody('extensionPhoneNumber').nullable().isInt();
  validator(req).checkBody('order').isInt();
  validator(req).checkBody('roles').nullable();
  // TODO NFCが配列かどうかチェック
  var validateErrors = req.validationErrors();
  if (validateErrors) {
    // バリデートエラー
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json(validateErrors);
  }

  var reqParams = {
    name: req.body.name,
    mail: req.body.mail,
    admin: req.body.admin === 'true' || req.body.admin === true ? true : false,
    top: req.body.top === 'true' || req.body.top === true ? true : false,
    sipuri: req.body.sipuri,
    nfcs: req.body.nfc,
    enabled: req.body.enabled === 'true' || req.body.enabled === true ? true : false,
    doorOpen: req.body.doorOpen === 'true' || req.body.doorOpen === true ? true : false,
    extensionPhoneNumber: req.body.extensionPhoneNumber,
    imageurl: req.body.imageurl,
    profile: req.body.profile,
    displayOrder: parseInt(req.body.order) * 1000,
    roleIdList: req.body.roles,
    groupIdList: req.body.manageGroups,
    attendancePermissionMiddleProjects: req.body.attendancePermissionMiddleProjects,
    attendancePermissionBetterProjects: req.body.attendancePermissionBetterProjects
  };
  // 管理者のみ登録可
  if (!req.user.admin) {
    // 権限エラー
    res.status(403);
    return res.json({});
  }
  registerUser(req, res, reqParams, req.user.organization, {
    isAdmin: req.user.admin,
    isNew: true,
    isTop: true,
  });
};

exports.put = function (req, res) {
  validator(req).checkParams('userId').isInt();
  validator(req).checkBody('id').isInt();
  validator(req).checkBody('name').notEmpty();
  validator(req).checkBody('admin').nullable().isIn([true, false]);
  validator(req).checkBody('top').nullable().isIn([true, false]);
  validator(req).checkBody('enabled').nullable().isIn([true, false]);
  validator(req).checkBody('doorOpen').nullable().isIn([true, false]);
  // TODO extensionPhoneNumberのユニークチェックをやる
  validator(req).checkBody('extensionPhoneNumber').nullable().isInt();
  validator(req).checkBody('order').isInt();
  validator(req).checkBody('roles').nullable();
  // TODO NFCが配列かどうかチェック
  var validateErrors = req.validationErrors();
  if (validateErrors) {
    // バリデートエラー
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json(validateErrors);
  }
  var reqParams = {
    userId: parseInt(req.body.id),
    name: req.body.name,
    mail: req.body.mail,
    admin: req.body.admin === 'true' || req.body.admin === true ? true : false,
    top: req.body.top === 'true' || req.body.top === true ? true : false,
    sipuri: req.body.sipuri,
    nfcs: req.body.nfc,
    enabled: req.body.enabled === 'true' || req.body.enabled === true ? true : false,
    doorOpen: req.body.doorOpen === 'true' || req.body.doorOpen === true ? true : false,
    extensionPhoneNumber: req.body.extensionPhoneNumber,
    imageurl: req.body.imageurl,
    profile: req.body.profile,
    displayOrder: parseInt(req.body.order) * 1000,
    roleIdList: req.body.roles,
    groupIdList: req.body.manageGroups,
    attendancePermissionMiddleProjects: req.body.attendancePermissionMiddleProjects,
    attendancePermissionBetterProjects: req.body.attendancePermissionBetterProjects,
  };
  if (parseInt(req.params.userId) !== reqParams.userId) {
    res.status(400);
    var message = req.__('Invalid id');
    return res.json([{param: 'id', msg: message,}]);
  }
  var userOptions = {
    isAdmin: req.user.admin,
    isSelf: reqParams.userId === req.user.id,
  };
  // 管理者か自分のみ編集可
  if (!userOptions.isAdmin && !userOptions.isSelf) {
    // 権限エラー
    res.status(403);
    return res.json(validateErrors);
  }

  registerUser(req, res, reqParams, req.user.organization, userOptions);
};

exports.delete = function (req, res) {
  // FIXME CSRF対策を入れる
  validator(req).checkParams('userId').isInt();
  var validateErrors = req.validationErrors();
  if (validateErrors) {
    // バリデートエラー
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json(validateErrors);
  }
  var reqParams = {
    userId: parseInt(req.params.userId),
  };
  var userOptions = {
    isAdmin: req.user.admin,
    isSelf: reqParams.userId === req.user.id,
  };
  // 管理者かつ自分以外編集可
  if (!userOptions.isAdmin || userOptions.isSelf) {
    // 権限エラー
    res.status(403);
    return res.json(validateErrors);
  }
  User.findOne({ id: reqParams.userId })
    .populate('nfcs')
    .populate('devices')
    .populate('phones')
    .exec(function (err, user) {
      if (err) {
        logger.error(err);
        res.status(500);
        return res.send(err);
      }
      if (!user) {
        res.status(400);
        return res.json([{param: 'id', msg: req.__('Unknown user.'),}]);
      }
      if (user.enabled) {
        res.status(400);
        return res.json([{param: 'id', msg: req.__('This user is enabled.'),}]);
      }
      async.parallel({
        user: function (callback) {
          callback(null, user);
        },
        oneTimeTokens: function (callback) {
          var OneTimeToken = mongoose.model('OneTimeToken');
          OneTimeToken.find({ user: user })
            .exec(callback);
        },
        attendanceLogs: function (callback) {
          var AttendanceLog = mongoose.model('AttendanceLog');
          AttendanceLog.find({ user: user })
            .exec(callback);
        },
      }, function (err, results) {
        if (err) {
          logger.error(err);
          res.status(500);
          return res.send(err);
        }
        logger.trace(results);
        // 削除処理
        async.parallel([
          function (callback) {
            results.user.remove(callback);
          },
          function (callback) {
            if (results.user.nfcs) {
              async.each(results.user.nfcs, function (target, done) {
                target.remove(done);
              }, function (err) {
                callback(err);
              });
            } else {
              callback();
            }
          },
          function (callback) {
            if (results.user.devices) {
              async.each(results.user.devices, function (target, done) {
                target.remove(done);
              }, function (err) {
                callback(err);
              });
            } else {
              callback();
            }
          },
          function (callback) {
            if (results.user.phones) {
              async.each(results.user.phones, function (target, done) {
                target.remove(done);
              }, function (err) {
                callback(err);
              });
            } else {
              callback();
            }
          },
          function (callback) {
            async.each(results.oneTimeTokens, function (target, done) {
              target.remove(done);
            }, function (err) {
              callback(err);
            });
          },
          function (callback) {
            async.each(results.attendanceLogs, function (target, done) {
              target.remove(done);
            }, function (err) {
              callback(err);
            });
          },
        ], function (err) {
          if (err) {
            logger.error(err);
            res.status(500);
            return res.send(err);
          }
          res.status(200);
          return res.json({});
        });
      });
    });
};
