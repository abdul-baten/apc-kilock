var passport = require('passport');
var async = require('async');
var TwitterStrategy = require('passport-twitter').Strategy;
var logger = log4js.getLogger();

exports.setup = function (config, authService) {
  if (!config || !config.authentication ||
    !config.authentication.twitter ||
    !config.authentication.twitter.clientID ||
    !config.authentication.twitter.clientSecret ||
    !config.authentication.twitter.callbackURL) {
    logger.info('disable authentication twitter oauth.');
    return false;
  }
  var strategy = new TwitterStrategy({
    consumerKey: config.authentication.twitter.clientID,
    consumerSecret: config.authentication.twitter.clientSecret,
    callbackURL: config.authentication.twitter.callbackURL,
    passReqToCallback: true,
  }, function(req, token, tokenSecret, profile, done) {
    // 認証に対応するソース名
    var sourcename = config.authentication.twitter.sourceName;
    // 認証に紐付けるデータ
    var sourcedata = { id: profile.id };
    // ログイン時にsessionに格納する情報
    var additional = {
      // ログアウト時にリダイレクトするパス
      logoutPath: '/',
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
        }
        // ユーザが見つからないので登録するユーザ情報作成
        var registerUser = profile ? {
          authType: 'twitter',
          username: profile.displayName,
          sourcename: sourcename,
          profile: profile,
          additional: additional,
          // 20分以内に登録しなければ無効
          expiration: new Date(Date.now() + (20 * 60 * 1000)),
        } : null;
        callback(null, null, registerUser);
      },
      ], done);
  });
  passport.use(strategy);
  return true;
};
