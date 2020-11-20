'use strict';

/**
 * @fileOverview Excelダウンロード処理を行う
 */
var urlUtil = require('url');
var http = require('http');
var https = require('https');
var config = require('../../../config/environment');
var logger = log4js.getLogger();
var async = require('async');
var _ = require('lodash');
var mongoose = require('mongoose');
var User = mongoose.model('User');
var Group = mongoose.model('Group');
var AttendanceType = mongoose.model('AttendanceType');
var validator = require('../../../utils/validator');
var fs = require('fs');
var jszip = require('jszip');
var encoding = require('encoding-japanese');

/**
 * JsonAPIの結果を受け取る処理
 * @param protocol {Object} - http or https
 * @param protocolOptions {Object} - URLなどの情報
 * @param callback {Function} - コールバック関数 Jsonの結果が返る
 */
var jsonApiGet = function (protocol, protocolOptions, callback) {
  var req = protocol.get(protocolOptions, function (res) {
    var bufs = [];
    bufs.totalLength = 0;
    res.on('data', function (chunk) {
      bufs.push(chunk);
      bufs.totalLength += chunk.length;
    });
    res.on('end', function () {
     callback(null, Buffer.concat(bufs, bufs.totalLength));
    });
  }).on('error', function (err) {
    callback(err);
  });
};

var convertUrl = function (url) {
  var parsedUrl = urlUtil.parse(url);
  var isHttps = parsedUrl.protocol && parsedUrl.protocol.indexOf('https') === 0;
  var protocol = isHttps ? https : http;
  var auth = parsedUrl.auth;
  return {
    protocol: protocol,
    protocolOptions: {
      host: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.path,
      method: 'GET',
      auth: auth,
    }
  };
};

/**
 * 勤怠区分一覧を取得する
 * @param {Object} req リクエストオブジェクト
 * @param {Object} res レスポンスオブジェクト
 */
exports.getExcel = function (req, res) {
  validator(req).checkQuery('year').isInt();
  validator(req).checkQuery('month').isInt();
  validator(req).checkQuery('userId').isInt();

  if (!req.user.admin && req.user.id != req.query.userId) {
    res.status(403);
    return res.json({});
  }

  var year   = req.query.year;
  var month  = req.query.month;
  var userId = req.query.userId || req.user.id;

  async.waterfall([
      function (done) {
        User.findOne({id: userId}).exec(function (err, user) {
          if (err) {
            logger.error(err);
            done(err);
          } else if (!user) {
            logger.error('ユーザが存在しません');
            done('ユーザが存在しません');
          } else if (!user.employeeCode) {
            logger.error('社員番号が存在しない。');
            done('社員番号が存在しない。');
          } else {
            done(null, user);
          }
        });
      },
    ],
    function (err, user) {
      if (err) {
        res.status(500);
        res.send({msg: err});
        return;

      } else {
        // URLパース
        var getParams = '?year=' + year + '&month=' + month +
                        '&employeeCode=' + user.employeeCode + '&contentType=zip';
        logger.debug(config.workReportApi.url + getParams);

        var parsedUrl = convertUrl(config.workReportApi.url + getParams);
        var protocol = parsedUrl.protocol;
        var protocolOptions = parsedUrl.protocolOptions;
        logger.debug(protocolOptions);

        // 勤務報告書作成APIコール
        jsonApiGet(protocol, protocolOptions, function(err, data) {
          if (err) {
            logger.debug(err);
            res.status(500);
            res.send({msg: err});
            return;
          }
          logger.debug(data);
          var monthFormated = ("0" + month).slice(-2);
          var filename = user.employeeCode + '_' + year + monthFormated + '.zip';
          return res.json({
            report: data,
            filename: filename,
          });
        });
      }
    }
  );
};

/**
 * 全社員の勤務表をダウンロード
 * @param {Object} req リクエストオブジェクト
 * @param {Object} res レスポンスオブジェクト
 */
exports.getExcelAll = function (req, res) {
  // バリデーション
  validator(req).checkQuery('year').isInt();
  validator(req).checkQuery('month').isInt();
  var validateErrors = req.validationErrors();
  if (validateErrors) {
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json(validateErrors);
  }

  if (!req.user.admin) {
    res.status(403);
    return res.json({});
  }

  User.find({
    enabled: true,
    employeeCode: { $ne: null },
  }, function(err, users) {

    var zip = new jszip();
    async.each(users, function(user, callback) {
      var parsedUrl = convertUrl(config.workReportApi.url +
          '?year=' + req.query.year + '&month=' + req.query.month +
          '&employeeCode=' + user.employeeCode + '&contentType=excel');
      var protocol = parsedUrl.protocol;
      var protocolOptions = parsedUrl.protocolOptions;

      // 勤務報告書作成APIコール
      jsonApiGet(protocol, protocolOptions, function(err, data) {
        var monthFormated = ("0" + req.query.month).slice(-2);
        var filename = user.employeeCode + '_' + req.query.year + monthFormated + '.xlsx';
        zip.file(filename, data);
        callback();
      });
    }, function(err) {
      res.send(zip.generate({type:"nodebuffer"}));
    });
  });
};
