'use strict';

var validator = require('validator');

var sanitizers = ['trim', 'ltrim', 'rtrim', 'escape', 'whitelist', 'blacklist'];
var doNothingMethods = [];
Object.keys(validator).forEach(function(methodName) {
  if (!methodName.match(/^to/) && sanitizers.indexOf(methodName) === -1) {
    doNothingMethods[methodName] = function () {
      return doNothingMethods;
    };
  }
});

var isJpMobileEmail = function (value) {
  if (!value) {
    return false;
  }
  return /^.+@(docomo\.ne\.jp|ezweb\.ne\.jp|(i\.)?softbank\.ne\.jp|disney\.ne\.jp|[dhtcrknsq]\.vodafone\.ne\.jp)$/
    .test(value);
};

module.exports = function (req) {
  if (!req) {
    return {
      isJpMobileEmail: isJpMobileEmail,
    };
  }
  var checkParam = function (check, param) {
    return function (item, failMsg) {
      failMsg = failMsg || 'Invalid ' + item;
      var methods = check(item, failMsg);
      methods.nullable = function () {
        var value = param[item];
        if (value) {
          return methods;
        } else {
          return doNothingMethods;
        }
      };
      return methods;
    };
  };
  return {
    checkQuery : checkParam(req.checkQuery, req.query),
    checkBody : checkParam(req.checkBody, req.body),
    checkParams : checkParam(req.checkParams, req.params),
  };
};
