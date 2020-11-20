'use strict';

var _ = require('lodash'),
    async = require('async'),
    mongoose = require('mongoose'),
    logger = log4js.getLogger(),
    passHistoriesLogic = require('../../logics/pass_histories_logic'),
    MailTemplate = mongoose.model('MailTemplate'),
    validator = require('../../utils/validator');

exports.get = function (req, res) {
  var condition = {};

  if (_.isString(req.params.passTypeId)) {
    var re = new RegExp(/^\d+$/);
    if (req.params.passTypeId.match(re)) {
      condition.passTypeId = parseInt(req.params.passTypeId, 10);
    }
    else if (req.params.passTypeId !== 'index') {
      res.status(400);
      res.send(new Error());
      res.end();
      return;
    }
  }
  else if (_.isNumber(req.params.passTypeId)) {
    condition.passTypeId = req.params.passTypeId;
  }

  MailTemplate.find(condition).sort('passTypeId').exec(function(err, mailTemplates) {
    if (err) {
      logger.error(err);
      res.status(500);
      res.send(err);
      res.end();
      return;
    }

    var results = [];
    _.forEach(mailTemplates, function(template) {
      logger.debug(typeof template.passTypeId);
      if (passHistoriesLogic.passTypeValueIsUnknown(template.passTypeId)) {
        return;
      }
      var passTypeName = passHistoriesLogic.convertPassType(template.passTypeId);
      if (!passTypeName) {
        return;
      }

      var obj = _.pick(template.toObject(), function (value, key) {
        return key.charAt(0) !== '_';
      });
      obj.passTypeName = req.__(passTypeName);
      results.push(obj);
    });

    logger.debug(results);
    if (_.has(condition, 'passTypeId')) {
      if (results.length === 0) {
        res.status(404);
        res.end();
      }
      else {
        logger.debug(results[0]);
        res.json(results[0]);
      }
    }
    else {
      res.json(results);
    }
  });
};

exports.put = function (req, res) {
  var loginuser = req.user;
  if (!loginuser.admin) {
    res.status(403); //operation not permitted
    res.end();
    return;
  }
  //logger.debug(req.params);
  //logger.debug(req.body);
  if (parseInt(req.params.passTypeId, 10) !== req.body.passTypeId) {
    res.status(400);
    res.end();
    return;
  }

  var conditions = {passTypeId: req.body.passTypeId};
  var template = _.merge(_.merge({}, req.params), req.body);
  MailTemplate.findOneAndUpdate(conditions, template, {upsert: true}, function (err, template) {
    if (err) {
      logger.error(err);
      res.status(400);
      res.end();
    }
    else {
      res.status(200);
      res.json(template);
    }
  });
};
