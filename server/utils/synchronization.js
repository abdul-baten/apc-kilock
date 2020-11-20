'use strict';

var _ = require('lodash'),
    async    = require('async'),
    logger   = log4js.getLogger(),
    config   = require('../config/environment'),
    mongoose = require('mongoose'),
    Source   = mongoose.model('Source'),
    SyncRedmine = require('./sync/redmine'),
    SyncSalesForce = require('./sync/salesforce'),
    SyncUserConverter = require('./sync/userConverter'),
    passport = require('passport'),
    forceDotComStrategy = require('passport-forcedotcom').Strategy;

exports.users = function (options, next) {
  var $this = this;
  this.main = function (callback) {
    Source.find({})
      .populate('organization')
      .exec(function (err, sources) {
        async.each(sources, $this.syncAny, function (err) {
          if (err) {
            logger.error(err);
          }
          if (callback) callback();
        });
      });
  };

  this.syncAny = function (source, done) {
    if (config.ignoreSyncSources && _(config.ignoreSyncSources).contains(source.name)) {
      // 除外するソース
      logger.debug('Source - %s is ignore', source.name);
      return done();
    }
    // 一定同期時間を過ぎているかの判別用日時
    var expire = new Date(Date.now() - (config.syncMinimumSecond * 1000));
    if (!options.forceUpdate && source.synchronizedAt > expire) {
      // 一定時間経過していないので同期しない
      // 動作確認のための暫定処理
      return done();
    }
    // 前回同期から時間が経ちすぎているかの判別用日時
    var tooLongLater = new Date(Date.now() - (30 * 60 * 1000));
    var syncDone;
    if (!options.forceUpdate && source.synchronizedAt && source.synchronizedAt > tooLongLater) {
      // 前回同期から時間がそんなに経っていないので非同期
      // 動作確認のための暫定処理
      syncDone = function () {};
      done();
      logger.trace('非同期でユーザ情報同期');
    } else {
      // 前回同期から時間が経っているので同期
      syncDone = done;
      logger.trace('ユーザ情報同期');
    }
    source.synchronizedAt = Date.now();
    source.save(function (err, source) {
      if (err) {
        logger.error(err);
        return syncDone();
      }
      switch(source.type) {
        case 'redmine':
          if (source.settings) {
            (new SyncRedmine(options, source)).sync(syncDone);
          } else {
            syncDone();
          }
          break;
        case 'salesforce':
          (new SyncSalesForce(options, source)).sync(syncDone);
          break;
        case 'kilock-converter':
          if (source.settings) {
            (new SyncUserConverter(options, source)).sync(syncDone);
          } else {
            syncDone();
          }
          break;
        default:
          syncDone();
          break;
      }
    });
  };

  this.main(next);
};
