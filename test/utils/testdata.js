'use strict';

var mongoose = require('mongoose'),
  async = require('async'),
  logger = log4js.getLogger();

module.exports.truncate = function (after) {
  after();
//  async.each([
//      'AttendanceLog',
//      'CollectionSummary',
//      'Device',
//      'Door',
//      'Nfc',
//      'OneTimeToken',
//      'PassHistory',
//      'Phone',
//      'Sequence',
//      'User',
//      'Role',
//      'FamilyUser',
//      'AttendanceInCut' // TODO KiLock移行後は不要
//    ],
//    function (modelname, callback) {
//      var model = mongoose.model(modelname);
//      model.remove(callback);
//    },
//    function (err) {
//      if (err) {
//        logger.error(err);
//        return;
//      }
//      logger.info('end truncate.');
//      if (after) { after(); }
//    });
};
