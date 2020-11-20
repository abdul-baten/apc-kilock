'use strict';

var urlUtil = require('url');
var http = require('http');
var https = require('https');
var async = require('async');
var logger = log4js.getLogger();
var config = require('../config/environment');

/**
 * csvを受け取る処理
 * @param protocol {Object} - http or https
 * @param protocolOptions {Object} - URLなどの情報
 * @param callback {Function} - コールバック関数 Jsonの結果が返る
 */
var csvGet = function (protocol, protocolOptions, callback) {
  var req = protocol.get(protocolOptions, function (res) {
    res.setEncoding('utf8');
    var result = '';
    res.on('data', function (chunk) {
      result += chunk;
    });
    res.on('end', function () {
      callback(null, result);
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

var getReportType = function(user, callback) {
  var parsedUrl = convertUrl(config.workReportCsv.url);
  var protocol = parsedUrl.protocol;
  var protocolOptions = parsedUrl.protocolOptions;
  csvGet(protocol, protocolOptions, function(err, data) {
    if (err) {
      logger.error(err);
      callback(err);
    }
    var reportType = 0;
    var lines = data.split('\r\n');
    // 先頭行スキップ
    lines.shift();
    async.eachLimit(lines, 5, function (line, eachDone) {
      var splitedLine = line.split(',');
      var employeeCode = parseInt(splitedLine[0]);
      if (isNaN(employeeCode) && splitedLine != "") {
        logger.info('employeeCodeが整数ではありません:' + splitedLine[0]);
      } else {
        if (employeeCode == user.employeeCode) {
          reportType = parseInt(splitedLine[1]);
          if (isNaN(reportType)) {
            logger.info('reportTypeが整数ではありません:' + splitedLine[1]);
            reportType = 0;
          }
        }
      }
      eachDone();

    }, function(err) {
      callback(err, reportType);
    });
  });
};

var isApcReportType = function(reportType) {
  return reportType == 0;
}

module.exports = {
  getReportType:   getReportType,
  isApcReportType: isApcReportType,
};
