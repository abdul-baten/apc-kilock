'use strict';

var errors = require('./components/errors'),
  express = require('express'),
  _ = require('lodash'),
  basicAuth = require('basic-auth-connect'),
  authService = require('./auth/auth.service'),
  config = require('./config/environment'),
  passport = require('passport'),
  logger = log4js.getLogger();

/**
 * Application routes
 */
module.exports = function (app) {
  var createBasicAuth = function (authData) {
    if (authData && authData.username) {
      return basicAuth(authData.username, authData.password);
    } else {
      return basicAuth(function () {
        return true;
      });
    }
  };
  var responseIndex = function (req, res) {
    res.render('index.html');
  };
  // APIのURLマッピング
  var apiPath = {
    // Data API Routes
    data: {
      auth: createBasicAuth(config.basicAuth.data),
      mapping: {
        '/attendance.json': require('./controllers/data/attendance'),
        '/users.json': require('./controllers/data/users'),
        '/groups.json': require('./controllers/data/groups'),
        '/pass_histories.json': require('./controllers/data/pass_histories'),
        '/alive.json': require('./controllers/data/alive'),
        '/nfc.json': require('./controllers/data/nfc'),
        '/matters.json': require('./controllers/data/matters'),
        '/helpFile.json': require('./controllers/data/helpFile')
      }
    },
    // Door API Routes
    door: {
      auth: createBasicAuth(config.basicAuth.door),
      mapping: {
        '/device.json': require('./controllers/door/device'),
        '/open.json': require('./controllers/door/open'),
        '/post.json': require('./controllers/door/post'),
      }
    },
    // External API Routes
    external: {
      auth: createBasicAuth(config.basicAuth.external),
      mapping: {
        '/family.json': require('./controllers/external/family'),
        '/salesforce/matter.json': require('./controllers/external/salesforce/matter.controller'),
        '/salesforce/attendance.json': require('./controllers/external/salesforce/attendance.controller'),
      },
    },
    // viewapi @deprecated 個別に記述させる
    viewapi: {
      auth: authService.login(),
      mapping: {
        '/users.json': require('./controllers/viewapi/users'),
        '/projectusers.json': require('./controllers/viewapi/projectusers'),
        '/groups.json': require('./controllers/viewapi/groups'),
        '/projects.json': require('./controllers/viewapi/projects'),
        '/user/:userId.json': require('./controllers/viewapi/user'),
        '/passhistories.json': require('./controllers/viewapi/passhistories'),
        '/device.json': require('./controllers/viewapi/device'),
        '/maillist.json': require('./controllers/viewapi/maillist'),
        '/doors.json': require('./controllers/viewapi/doors'),
        '/navbar.json': require('./controllers/viewapi/navbar'),
        '/attendance.json': require('./controllers/viewapi/attendance'),
        '/attendanceStatus.json': require('./controllers/viewapi/attendanceStatus'),
        '/attendanceStatusLog.json': require('./controllers/viewapi/attendanceStatusLog'),
        '/attendanceSummary.json': require('./controllers/viewapi/attendanceSummary'),
        '/travelCost.json': require('./controllers/viewapi/travelCost'),
        '/timecard.json': require('./controllers/viewapi/timecard'),
        '/monthendclose.json': require('./controllers/viewapi/monthendclose'),
        '/overtimerequest.json': require('./controllers/viewapi/overtimerequest'),
        '/passtypes.json': require('./controllers/viewapi/passtypes'),
        '/mail-templates/:passTypeId.json': require('./controllers/viewapi/mail-templates'),
        '/role.json': require('./controllers/viewapi/role'),
        '/resttime-templates.json': require('./controllers/viewapi/resttime-templates'),
        '/resttime.json': require('./controllers/viewapi/resttime'),
        '/timecardmismatch.json': require('./controllers/viewapi/timecardmismatch')
      }
    },
  };

  app.use('/viewapi/groupTags', require('./controllers/viewapi/groupTags/'));
  app.use('/viewapi/mailregistration', require('./controllers/viewapi/mailregistration/'));
  app.use('/viewapi/sendmail', require('./controllers/viewapi/sendmail'));
  app.use('/viewapi/attendancetype', require('./controllers/viewapi/attendanceType'));
  app.use('/viewapi/export', require('./controllers/viewapi/export'));

  app.use('/webhook/family', require('./controllers/webhook/family/'));

  // pathと実行APIをマッピングする
  var routeApi = function (apidata, groupname) {
    var grouppath = '/' + groupname;
    _.each(apidata.mapping, function (api, path) {
      var r = app.route(grouppath + path);
      if (apidata.auth) {
        // 認証
        r = r.all(apidata.auth);
      }
      // 各メソッド
      if (api.get) {
        r = r.get(api.get);
      }
      if (api.post) {
        r = r.post(api.post);
      }
      if (api.put) {
        r = r.put(api.put);
      }
      if (api.delete) {
        r = r.delete(api.delete);
      }
      if (api.all) {
        r = r.all(api.all);
      } else {
        // 実装されていないメソッドは405エラー
        r.all(errors[405]);
      }
    });
    // 存在しないAPIは404エラー
    app.route(grouppath + '/*')
      .all(errors[404]);
  };

  _.each(apiPath, routeApi);

  // 認証なしページ
  app.route('/terms/*')
    .get(responseIndex);

  // 認証
  app.route('/auth/:url(signin|signup)')
    .get(responseIndex);
  app.use('/auth', require('./auth'));

  // エラーページ
  app.route('/400').all(errors[400]);
  app.route('/badRequest').all(errors[400]);
  app.route('/403').all(errors[403]);
  app.route('/forbidden').all(errors[403]);
  app.route('/404').all(errors[404]);
  app.route('/notFound').all(errors[404]);
  app.route('/405').all(errors[405]);
  app.route('/methodNotAllow').all(errors[405]);
  app.route('/418').all(errors[418]);
  app.route('/imaTeaPot').all(errors[418]);
  app.route('/500').all(errors[500]);
  app.route('/internalServerError').all(errors[500]);
  app.route('/501').all(errors[501]);
  app.route('/notImplemented').all(errors[501]);

  // All undefined asset or api routes should return a 404
  app.route('/:url(viewapi|auth|components|app|bower_components|assets|resource)/*')
    .get(errors[404]);

  // All other routes should redirect to the index.html
  app.route('/*')
    .all(authService.login())
    .get(responseIndex);
};
