'use strict';

var config = require('../../config/environment');
var _ = require('lodash');
var async = require('async');
var moment = require('moment');
var logger = log4js.getLogger();
var validator = require('../../utils/validator');
var attendance_logic = require('../../logics/attendance_logic');
var helper = require('../../logics/helper');
var mongoose = require('mongoose');
var User = mongoose.model('User');
var TravelCost = mongoose.model('TravelCost');

// タイムカードの一覧を返す (GET /viewapi/timecard.json)
exports.get = function (req, res) {
  validator(req).checkQuery('userObjId').nullable().isMongoId();
  validator(req).checkQuery('year').isInt();
  validator(req).checkQuery('month').isInt();
  validator(req).checkQuery('day').isInt();
  var validateErrors = req.validationErrors();
  if (validateErrors) {
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json(validateErrors);
  }

  // TravelCost取得
  TravelCost.findOne({
    user:  req.query.userObjId || req.user._id,
    year:  req.query.year,
    month: req.query.month,
    day:   req.query.day,
  }, function(err, travelCost) {
    if (err) {
      logger.error(err);
      res.status(500);
      res.send(err);
      return;
    }
    return res.json({
      travelCost:                   travelCost,
      travelCostRoutesLimit:        config.travelCostRoutesLimit,
      travelCostTypes:              config.travelCostTypes,
      travelCostPurposes:           config.travelCostPurposes,
      travelCostTypeCommentList:    config.travelCostTypeCommentList,
      travelCostPurposeCommentList: config.travelCostPurposeCommentList,
      travelCostRouteCommentList:   config.travelCostRouteCommentList,
      travelCostAmountCommentList:  config.travelCostAmountCommentList,
    });
  });
};

/**
 * @param Object リクエストパラメータ req
 * @param Object レスポンスパラメータ res
 * @return Json 更新後TravelCost
 */
exports.post = function (req, res) {
  // Validation
  validator(req).checkBody('userObjId').nullable().isMongoId();
  validator(req).checkBody('year').isInt();
  validator(req).checkBody('month').isInt();
  validator(req).checkBody('day').isInt();
  var validateErrors = req.validationErrors();
  if (validateErrors) {
    res.status(400);
    return res.json({errors: validateErrors});
  }

  // travelCost のバリデーション（入れ子構造）
  var customValidator = {
    errors: [],
    validate: function() {
      if (req.body.travelCost.items.length > 0) {
        req.body.travelCost.items.forEach(function(item, i) {
          if (item.type == null) {
            this.pushError(i, 'type', '区分を入力してください');
          }
          if (_.contains(helper.getTravelTypeValues, item.type)) {
            this.pushError(i, 'type', '不正な区分です');
          }
          if (item.purpose == null) {
            this.pushError(i, 'purpose', '目的を入力してください');
          }
          if (_.contains(helper.getTravelPurposeValues, item.purpose)) {
            this.pushError(i, 'purpose', '不正な目的です');
          }
          if (item.type != config.travelCostTypes['宿泊']) {
            if (item.routes.length < 2) {
              this.pushError(i, 'travelCostRoutes', '経路が少なすぎます');
            } else {
              var hasEmpty = item.routes.some(function(route) {
                return (route == null || route == "");
              });
              if (hasEmpty) {
                this.pushError(i, 'travelCostRoutes', '経路を入力してください');
              }
            }
          }
          if (item.amount == null) {
            this.pushError(i, 'amount', '金額を入力してください');
          }
          if (_.isNaN(parseInt(item.amount))) {
            this.pushError(i, 'amount', '不正な金額です');
          }
        }.bind(this));
      }
      var bizAmount = req.body.travelCost.bizAmount;
      if (bizAmount != null && _.isNaN(parseInt(bizAmount))) {
        this.pushError(null, 'bizAmount', '不正な出張手当です');
      }
    },
    pushError: function(index, param, error) {
      if (index == null) {
        this.errors.push({
          msg:   error,
          param: param,
        });
      } else {
        this.errors.push({
          index: index,
          msg:   error,
          param: 'travelCost.' + param,
        });
      }
    },
    getErrors: function() {
      return this.errors;
    },
    hasErrors: function() {
      return this.errors.length > 0 ? true : false;
    },
  };
  customValidator.validate();
  if (customValidator.hasErrors()) {
    res.status(400);
    return res.json({errors: customValidator.getErrors()});
  }

  attendance_logic.updateTravelCost(
    req.body.userObjId || req.user._id,
    req.user._id,
    req.body.year,
    req.body.month,
    req.body.day,
    req.body.travelCost,
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
