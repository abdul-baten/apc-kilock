'use strict';

var _ = require('lodash'),
    async = require('async'),
    mongoose = require('mongoose'),
    i18n = require('i18n'),
    User = mongoose.model('User'),
    logger = log4js.getLogger(),
    validator = require('../../utils/validator'),
    logic = require('../../logics/attendance_logic');

exports.get = function (req, res) {
  async.parallel({
    hasPermission: function(callback) {
      logic.getPermissionProjects(req.user._id, function(err, permissions) {
        if (permissions.middle.length > 0 ||
            permissions.better.length > 0 ||
            permissions.admin.length > 0 ||
            req.user.admin || req.user.top) {
          callback(err, true);
        } else {
          callback(err, false);
        }
      });
    },
  }, function(err, prepareData) {
    // TODO 権限制御
    var loginuser = req.user;
    var data = [];
    data.push({
      'title': req.__('User List'),
      'link': '/users/',
    });
    if (loginuser.admin) {
      data.push({
        'title': req.__('All Passage History'),
        'link': '/passhistories/all',
      });
//  メールは全権限非表示
//      data.push({
//        'groupTitle': req.__('Mail Group'),
//        'details': [{
//          'title': req.__('Mail Sending'),
//          'link': '/mail/send'
//        }, {
//          'title': req.__('Mail Template Editor'),
//          'link': '/mail-template-editor',
//        }],
//      });
    }
    if (prepareData.hasPermission) {
      data.push({
        'groupTitle': req.__('Rest Group'),
        'details': [{
          'title': req.__('RestTime Template Edit'),
          'link': '/resttime-template',
        }],
      });
    }
    if (prepareData.hasPermission) {
      data.push({
        'title': req.__('Approve Overtime Request'),
        'link': '/approve/overtime'
      });
    }
    data.push({
      'groupTitle': req.__('Attendance Group'),
      'details': [{
        'title': req.__('Attendance Status List'),
        'link': '/attendance-status'
      }, {
        'title': req.__('Attendance Status Update Log List'),
        'link': '/attendance-status-log'
      }],
    });
    data.push({
      'title': loginuser.name,
      'link': '/user/' + loginuser.id,
    });
    return res.json(data);
  });
};
