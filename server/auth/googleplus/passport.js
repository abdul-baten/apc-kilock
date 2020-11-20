var passport = require('passport');
var async = require('async');
var GooglePlusStrategy = require('passport-google-plus');
var logger = log4js.getLogger();

exports.setup = function (config, authService) {
  if (!config || !config.authentication ||
    !config.authentication.googleplus ||
    !config.authentication.googleplus.clientId ||
    !config.authentication.googleplus.clientSecret) {
    logger.info('disable authentication googleplus.');
    return false;
  }
  var strategy = new GooglePlusStrategy({
    clientId: config.authentication.googleplus.clientId,
    clientSecret: config.authentication.googleplus.clientSecret,
    passReqToCallback: true,
  }, function(req, tokens, profile, done) {
    logger.trace(tokens);
    var accessToken = tokens.access_token;
    // 認証に対応するソース名
    var sourcename = config.authentication.googleplus.sourceName;
    // 認証に紐付けるデータ
    var sourcedata = { id: profile.id };
    // ログイン時にsessionに格納する情報
    var additional = {
      // ログアウト時にリダイレクトするパス
      logoutPath: '/',
      // 認証を解除する際のパス
      revokePath: 'https://accounts.google.com/o/oauth2/revoke?token=' + accessToken
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
          authType: 'google',
          username: profile.displayName,
          sourcename: sourcename,
          profile: profile,
          additional: additional,
          // 20分以内に登録しなければ無効
          expiration: new Date(Date.now() + (20 * 60 * 1000)),
        } : null;
        callback(null, null, registerUser);
      }
    ], done);
  });
  strategy.name = 'googleplus';
  passport.use(strategy);
  return true;
};
