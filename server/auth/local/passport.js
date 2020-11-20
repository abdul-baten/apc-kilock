var passport = require('passport');
var async = require('async');
var LocalStrategy = require('passport-local').Strategy;
var logger = log4js.getLogger();

exports.setup = function (config, authService) {
  if (!config || !config.authentication || !config.authentication.local) {
    logger.info('disable authentication local.');
    return false;
  }
  var configLocal = config.authentication.local;
  passport.use(new LocalStrategy({
    usernameField: 'login',
    passReqToCallback: true,
  }, function(req, login, dummyPassword, done) {
    logger.debug('local strategy');
    // 認証に対応するソース名
    var sourcename = configLocal.sourceName;
    // 認証に紐付けるデータ
    var sourcedata = { login: login };

    logger.trace({passport: 'local', login: login});

    // ログイン時にsessionに格納する情報
    var additional = {
    };
    async.waterfall([
      function (callback) {
        // ソース取得
        authService.findCurrentSource(req, sourcename, callback);
      },
      function (source, callback) {
        if (!source) {
          return done({message: 'source not found.'});
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
          authService.findLoginUser({ login: login }, additional, callback);
        }
      },
      function (user, callback) {
        if (user) {
          return callback(null, user);
        }
        logger.trace('LOCAL: ユーザが見つからないので登録するユーザ情報作成');
        // ユーザが見つからないので登録するユーザ情報作成
        var registerUser = {
          authType: 'local',
          username: login,
          login: login,
          sourcename: sourcename,
          additional: additional,
          // 20分以内に登録しなければ無効
          expiration: new Date(Date.now() + (20 * 60 * 1000)),
        };
        callback(null, null, registerUser);
      }
      ], done);
  }));
  return true;
};
