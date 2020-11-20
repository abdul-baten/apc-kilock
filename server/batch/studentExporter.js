'use strict';

/**
 * QRコード差し込み印刷用のcsvを生成する。
 * 引数として、UNIX Timeが入力可能。
 * UNIX Timeを入力した場合、その時間より後にkilock-converterと同期したユーザのみ抽出する。
 */

var path = require('path');
var fs = require('fs');
var mongoose = require('mongoose');
var async = require('async');
var _ = require('lodash');

global.log4js = require('log4js');

// trueの場合にデバッグログを出力する
var DEBUG = false;

// 各所で処理できなかったエラー
process.on('uncaughtException', function (err) {
  console.error(err);
});

/**
 * デバッグログ出力用関数。変数DEBUGがtrueの場合にmsgを表示する。
 * @param msg 出力メッセージ
 */
var debugLog = function (msg) {
  if (!DEBUG) {
    return;
  }

  console.log(msg);
};

var findDate;
// 引数が入力されている場合
if (process.argv.length >= 2) {
  findDate = new Date(+process.argv[2]);
  debugLog(findDate);
} else {
  debugLog('引数なし');
}

var mailDomain = '@qsj1984-attend.apctdl.com';
var mongoUrl = 'mongodb://localhost/attend-dev';
mongoose.connect(mongoUrl, {
  db: {
    safe: true
  }
});

// Bootstrap models
var modelsPath = path.join(__dirname + '/../', 'models');
debugLog(modelsPath);

debugLog('readmodule');
var extension = '.model.js';

// 各modelファイルを読み込む
['user', 'group', 'groupTag', 'organization', 'mailRegistrationToken'].forEach(function (name) {
  var filePath = modelsPath + '/' + name + extension;

  debugLog(filePath);
  require(filePath);
});

var User = mongoose.model('User');
var Group = mongoose.model('Group');
var GroupTag = mongoose.model('GroupTag');
var Organization = mongoose.model('Organization');
var MailRegistrationToken = mongoose.model('MailRegistrationToken');
debugLog('readmodule end');

debugLog('process start');
async.waterfall([
  function (callback) {
    var findQuery = {code: {$exists: true}, enabled: true, sourcetype: 'kilock-converter'};

    // 引数が入力された場合は、クエリの検索条件を追加
    if (findDate) {
      findQuery.updated = {$gt: findDate};
    }

    debugLog(findQuery);

    User.find(findQuery)
      .sort({code: 1})
      .exec(callback);
  },
  function (users, callback) {
    console.log(['学年', '生徒番号', '生徒名', '登録用メールアドレス'].join(','));
    async.eachSeries(users, function (user, callback) {
      async.parallel({
          mrtoken: function (callback) {
            MailRegistrationToken.findOne({user: user}).exec(callback);
          },
          groupGrade: function (callback) {
            Group.find({users: user})
              .populate('tags')
              .exec(function (err, groups) {
                var grade;
                _(groups).each(function (group) {
                  if (grade) {
                    return;
                  }
                  if (group.tags && group.tags[0] && group.tags[0].name === '学年') {
                    grade = group;
                  }
                });
                callback(null, grade);
              });
          },
        },
        function (err, results) {
          var mrtoken = results.mrtoken;
          var groupGrade = results.groupGrade;
          if (!mrtoken || !mrtoken.token) {
            return callback();
          }
          var mail = 'reg' + mrtoken.token + mailDomain;
          var grade = groupGrade ? groupGrade.name : '';
          console.log([grade, user.code, user.name, mail].join(','));
          callback();
        });
    }, callback);
  },
], function (err) {
  if (err) {
    console.error(err);
  }

  debugLog('process end');
  mongoose.disconnect();
  process.exit();
});
