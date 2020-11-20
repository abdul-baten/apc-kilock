'use strict';

var _ = require('lodash'),
    async = require('async'),
    mongoose = require('mongoose'),
    logger = log4js.getLogger(),
    passHistoriesLogic = require('../../logics/pass_histories_logic'),
    config = require('../../config/environment'),
    validator = require('../../utils/validator');

exports.get = function (req, res) {
  var passTypeInfos = [];
  var editorConfig = config.mailTemplateEditor || {};
  var maxTextLength = editorConfig.maxTextLength || 100;

  _.forEach(passHistoriesLogic.showPassTypeValidValue, function (typeId) {

    if (passHistoriesLogic.passTypeValueIsUnknown(typeId)) {
      return;
    }

    var name = passHistoriesLogic.convertPassType(typeId);
    if (!name) {
      return;
    }

    var key = 'PASSTYPE_NAME_' + name.toUpperCase();
    var localizedName = req.__(key);
    if (!localizedName) {
      return;
    }

    var info = {
      id: typeId,
      name: localizedName,
      maxTextLength: maxTextLength,
    };

    passTypeInfos.push(info);
  });

  res.json(passTypeInfos);
};
