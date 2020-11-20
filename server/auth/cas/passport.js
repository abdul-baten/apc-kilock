var passport = require('passport');
var async = require('async');
var CasStrategy = require('passport-cas').Strategy;
var logger = log4js.getLogger();

exports.setup = function (config, authService) {
  if (!config || !config.authentication ||
    !config.authentication.cas ||
    !config.authentication.cas.baseUrl ||
    !config.authentication.cas.service) {
    logger.info('disable authentication cas.');
    return false;
  }
  var configCas = config.authentication.cas;
  var casBaseUrl = configCas.baseUrl;
  if (casBaseUrl.slice(-1) === '/') {
    casBaseUrl = casBaseUrl.slice(0, -1);
  }
  var casService = configCas.service;
  passport.use(new CasStrategy({
    version: 'CAS3.0',
    ssoBaseURL: casBaseUrl,
    serverBaseURL: casService,
    validateURL: '/serviceValidate',
    passReqToCallback: true,
  }, function (req, profile, done) {
    // 認証に対応するソース名
    var sourcename = configCas.sourceName;
    // 認証に紐付けるデータ
    var sourcedata = {
      login: profile.user
    };



    logger.trace({
      passport: 'cas',
      login: profile.user
    });
    var logoutPath = casBaseUrl + '/logout?service=' + encodeURIComponent(casService);
    // ログイン時にsessionに格納する情報
    var additional = {
      // ログアウト時にリダイレクトするパス
      logoutPath: logoutPath,
    };
    async.waterfall([
      function (callback) {
        // ソース取得
        authService.findCurrentSource(req, sourcename, callback);
      },
      function (source, callback) {
        if (!source) {
          return done({
            message: 'source not found.'
          });
        }
        var filter = {
          sources: {
            $elemMatch: {
              source: source,
              data: sourcedata,
            }
          }
        };
        authService.findLoginUser(filter, additional, callback);
      },
      function (user, callback) {
        if (user) {
          return callback(null, user);
        } else {
          // ユーザが見つからない場合、loginを元に検索する
          authService.findLoginUser({
            login: profile.user
          }, additional, callback);
        }
      },
      function (user, callback) {
        if (user) {
          return callback(null, user);
        }
        logger.trace('CAS: ユーザが見つからないので登録するユーザ情報作成');
        // ユーザが見つからないので登録するユーザ情報作成
        var registerUser = profile ? {
          authType: 'cas',
          username: null,
          sourcename: sourcename,
          profile: profile,
          additional: additional,
          // 20分以内に登録しなければ無効
          expiration: new Date(Date.now() + (60 * 60 * 1000)),
        } : null;
        callback(null, null, registerUser);
      }
    ], done);
  }));

  return true;
};
