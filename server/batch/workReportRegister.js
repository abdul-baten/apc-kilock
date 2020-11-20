/**
 * @fileOverview IE8利用ユーザーに対して勤務報告書を添付したメール情報をRedisへ登録するバッチ
 */
process.env.NODE_ENV = 'production';
var urlUtil = require('url');
var http = require('http');
var https = require('https');
var mongoose = require('mongoose');
var path     = require('path');
var fs       = require('fs');
var async    = require('async');
var logic    = require('../logics/pass_histories_logic');
var sprintf  = require('sprintf').sprintf;

global.log4js = require('log4js');
var logger = log4js.getLogger();
var config   = require('../config/environment');

// 各所で処理できなかったエラー
process.on('uncaughtException', function (err) {
  console.error(err);
});

var YEAR_REGEX  = /^[0-9]{4}$/;
var MONTH_REGEX = /^([0]?[1-9]|1[0-2])$/;
var MAIL_REGEX  = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;

var year;
var month;
var now = new Date();
year  = now.getFullYear();
month = now.getMonth() + 1;
if (month === 1) {
  month = 12;
  year--;
} else {
  month--;
}

var program = require('commander');
program
  .option('-m --monthly', 'run this batch when first day of month.')
  .arguments('[year] [month]')
  .action(function (argYear, argMonth) {
    year  = argYear;
    month = argMonth;
    if (typeof month === 'undefined') {
      console.log('対象月の指定がありません');
      process.exit();
    }
    if (year) {
      if (!year.match(YEAR_REGEX)) {
        console.log('年のフォーマットが不正です');
        process.exit();
      }
    }
    if (month) {
      if (!month.match(MONTH_REGEX)) {
        console.log('月のフォーマットが不正です');
        process.exit();
      }
    }
  });
program.parse(process.argv);

// 毎月1日のみ実行オプション
if (program.monthly) {
  if (now.getDate() != 1) {
    console.log('1日でないため終了します');
    process.exit();
  }
}


console.log(year + '年' + month + '月分の勤務報告書メール情報を登録します');

/**
 * MongoDBとの接続を切る
 */
var disconnectMongodb = function () {
  console.log('mongoDBとの接続を切ります');
  mongoose.disconnect();
  console.log('mongoDBとの接続を切りました');
};

// Bootstrap models
var modelsPath = path.join(__dirname + '/../', 'models');
fs.readdirSync(modelsPath).forEach(function (file) {
  if (/(.*)\.(js$|coffee$)/.test(file)) {
    require(modelsPath + '/' + file);
  }
});

var User = mongoose.model('User');
var postbox, MailTemplate;
if (config.mailer) {
  postbox = require('../utils/postbox');
  MailTemplate = require('mongoose').model('MailTemplate');
}

// 参照するテンプレートのID
// テンプレートIDは、現状本ファイルと以下の各ファイルにそれぞれ定義がある
// 本バッチも暫定でここにテンプレートIDを定義するができれば一箇所に定義したい
var defaultTemplateId = 4;

/**
 * CSVをパースする。カラム数が想定している数と異なる場合はエラーとして扱う。
 * @param {string} line ファイルより読み込んだ行
 * @param {Function} done コールバック
 */
var parseLineTask = function (line, done) {

  var splitedLine = line.split(',');

  if (line.length === 0) {
    done('文字列長が0');
    return;
  }

  var employeeCode = parseInt(splitedLine[0]);
  if (isNaN(employeeCode)) {
    done('社員番号が整数でない -> ' + employeeCode);
    return;
  }

  var reportType = parseInt(splitedLine[1]);
  if (isNaN(reportType) || config.reportTypes.indexOf(reportType) === -1) {
    done('勤務報告書種別が不正 -> ' + reportType);
    return;
  }

  var mailList = [];
  for (var i = 2; i < splitedLine.length; i++) {
    var mail = splitedLine[i];
    if (!mail.match(MAIL_REGEX)) {
      done('メールアドレスがフォーマットと一致していない -> ' + mail);
      return;
    }
    mailList.push(mail);
  }

  var property = {
    employeeCode: employeeCode,
    reportType:   reportType,
    mailList:     mailList,
  };

  done(null, property);
};

/**
 * 対応する社員番号を保持するユーザが存在することを確認する。
 * @param {Object} property CSVより読み込んた情報
 * @param {Function} done コールバック
 */
var findUserTask = function (property, done) {
  User.findOne({employeeCode: property.employeeCode}).exec(function (err, user) {
    if (err) {
      done(err + property.employeeCode);
    } else if (!user) {
      done('社員番号 ' + property.employeeCode + ' に紐づくユーザが存在しません');
    } else {
      done(null, property, user);
    }
  });
};

var sleepms = 0;

/**
 * メール送信情報を登録する
 * @param {Object} property CSVより読み込んだ情報
 * @param {Object} user CSVのemployeeCodeに対応するUserコレクション
 * @param {Function} done コールバック
 */
var registerMailTask = function (property, user, done) {
  async.parallel({
    template: function(callback) {
      MailTemplate.findOne({passTypeId:defaultTemplateId}).exec(callback);
    },
  }, function(err, data) {
    if (err) {
      done(err + property.employeeCode);
    }
    if (!data.template) {
      console.error('メールテンプレート取得に失敗しました。');
      done(err + property.employeeCode);
    }

    var monthFormated        = ('0' + month).slice(-2);
    var subject = sprintf(data.template.subject, year, monthFormated);
    var body = sprintf(data.template.text, user.name, year, monthFormated);
    var getParams = '?year=' + year + '&month=' + month +
                    '&employeeCode=' + property.employeeCode + '&contentType=zip';
    var attachments = [{
      filename: property.employeeCode + '_' + year + monthFormated + '.zip',
      path: config.workReportApi.url + getParams,
    }];

    async.each(property.mailList, function(mail, callback) {
      sleepms += parseInt(process.env.EMAIL_SENDING_INTERVAL) || 1000;
      setTimeout(function() {
        logger.info('report mail to: ' + mail);
        postbox.postMailGeneral(mail, subject, body, undefined, attachments, callback);
        sleepms -= parseInt(process.env.EMAIL_SENDING_INTERVAL) || 1000;
      }, sleepms);
    }, function(err) {
      if (err) {
        logger.info('Add redis failed.');
        logger.info(err);
      } else {
        logger.info('Add redis success.');
      }
      done();
    });
  });
};

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

var parsedUrl = convertUrl(config.workReportCsv.url);
console.log(config.workReportCsv.url);

var protocol = parsedUrl.protocol;
var protocolOptions = parsedUrl.protocolOptions;
console.log(protocolOptions);

// 勤務報告書作成APIコール
csvGet(protocol, protocolOptions, function(err, data) {
  if (err) {
    console.error(err);
  }
  var lines = data.split('\r\n');
  var successCount = 0;
  var errorCount = 0;

  // 先頭行スキップ
  lines.shift();

  // DBは本番に向いています。検証環境等で対応する場合は、DB接続先を書き換えてください。
  mongoose.connect(config.mongo.uri, config.mongo.options);

  async.eachLimit(lines, 5,
    function (line, eachDone) {
      async.waterfall(
        [
          function (waterfallDone) {
            waterfallDone(null, line);
          },
          parseLineTask,
          findUserTask,
          registerMailTask,
        ],
        function (err) {
          if (err && line) {
            console.log('ERROR detail: ' + err.toString());
            console.log('ERROR line: ' + line);
            errorCount++;
          } else {
            successCount++;
          }

          eachDone();
        }
      );
    },
    function () {
      console.log('successRecordNum: ' + successCount);
      console.log('errorRecordNum: ' + errorCount);
      console.log('totalRecordNum: ' + (successCount + errorCount));

      console.log('処理が完了しました。エラーについては標準出力を元に解析してください。');

      disconnectMongodb();

      process.exit();
    }
  );
});
