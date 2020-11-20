'use strict';

var _ = require('lodash');
var async = require('async');
var mongoose = require('mongoose');
var logger = log4js.getLogger();
var passHistoriesLogic = require('../../logics/pass_histories_logic');
var MailTemplate = mongoose.model('MailTemplate');
var attendance_logic = require('../../logics/attendance_logic');
var helper = require('../../logics/helper');
var validator = require('../../utils/validator');
var RestTimeTemplate = mongoose.model('RestTimeTemplate');

exports.get = function (req, res) {
  RestTimeTemplate.find({}, function(err, restTimeTemplates) {
    if (err) {
      logger.error(err);
      res.status(500);
      return res.json(null);
    }

    res.status(200);
    return res.json({
      restTimeTemplates:  restTimeTemplates
    });
  });
};

exports.post = function (req, res) {

  // 管理者のみテンプレート登録可能
  if (!req.user.admin) {
    res.status(403); //operation not permitted
    res.end();
    return;
  }

  var templates       = JSON.parse(req.body.templates);
  var deleteTemplates = JSON.parse(req.body.deleteTemplates);

//  // Validation
//  var validate = function() {
//    for (var i in templates) {
//      if (templates[i].name == '' ) {
//          return false;
//      }
//      for (var j in templates[i].restTimes) {
//        if ( templates[i].restTimes[j].startTime.length != 5) {
//          return false;
//        }
//        if ( templates[i].restTimes[j].endTime.length != 5) {
//          return false;
//        }
//      }
//    }
//    return true;
//  };
//
//  if (!validate()) {
//    res.status(400);
//    return res.json({errors: ['不正な入力値です']});
//  }

  attendance_logic.updateRestTimeTemplates(
    req.body.userObjId || req.user._id,
    req.user._id,
    templates,
    deleteTemplates,
    function(err) {
      if (err) {
        logger.error(err);
        res.status(500);
        return res.json(err);
      }
      res.status(200);
      return res.json({});
    }
  );
};
