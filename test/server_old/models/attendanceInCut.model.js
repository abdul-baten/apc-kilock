'use strict';

// TODO KiLock移行後は不要

var should = require('should'),
  app = require('../../../server/app'),
  mongoose = require('mongoose'),
  async = require('async'),
  testdata = require('../../utils/testdata'),
  logger = log4js.getLogger(),
  ObjectId = require('mongoose').Types.ObjectId,
  AttendanceInCut = mongoose.model('AttendanceInCut');

describe('model AttendanceInCut', function () {

  before(function (done) {
    testdata.truncate(
      function () {
        done();
      }
    );
  });

  /**
   * テスト簡易化関数
   * @param {ObjectId} userObjectId オブジェクトID
   * @param {string} inTime 入りの時間(hh:mm)
   * @param {Function} callback テスト終了時に実行するコールバック
   */
  var createAndExistCheck = function (userObjectId, inTime, callback) {
    var a = new AttendanceInCut({user: userObjectId, inTime: inTime});

    a.save(function (err) {
      should.not.exist(err);
      AttendanceInCut.findOne({user: userObjectId}).exec(function (err, doc) {
        doc.inTime.should.be.exactly(inTime);
        callback();
      });
    });
  };

  /**
   * エラーテスト簡易化関数
   * @param {ObjectId} userObjectId オブジェクトID
   * @param {string} inTime 入りの時間(hh:mm)
   * @param {Function} callback テスト終了時に実行するコールバック
   */
  var createAndErrorCheck = function (userObjectId, inTime, callback) {
    var a = new AttendanceInCut({user: userObjectId, inTime: inTime});

    a.save(function (err) {
      should.exist(err);
      logger.info(err);
      callback();
    });
  };

  it('バリデーションチェック1(正常)', function (done) {
    var userObjectId = new ObjectId('54c1e301f88c39100d5e62d8');
    var inTime = '00:00';

    createAndExistCheck(userObjectId, inTime, done);
  });

  it('バリデーションチェック2(正常)', function (done) {
    var userObjectId = new ObjectId('54c1e301f88c39100d5e62d9');
    var inTime = '19:00';

    createAndExistCheck(userObjectId, inTime, done);
  });

  it('バリデーションチェック3(正常)', function (done) {
    var userObjectId = new ObjectId('54c1e301f88c39100d5e62d0');
    var inTime = '23:59';
    createAndExistCheck(userObjectId, inTime, done);
  });

  it('バリデーションチェック4(正常)', function (done) {
    var userObjectId = new ObjectId('54c1e301f88c39100d5e6208');
    var inTime = '4:00';

    createAndExistCheck(userObjectId, inTime, done);
  });

  it('バリデーションエラー1(異常:正規表現パターン外)', function (done) {
    var userObjectId = new ObjectId('14c1e301f88c39100d5e6208');
    var inTime = '000:00';

    createAndErrorCheck(userObjectId, inTime, done);
  });

  it('バリデーションチェック2(異常:正規表現パターン外)', function (done) {
    var userObjectId = new ObjectId('64c1e301f88c39100d5e6208');
    var inTime = ':00';

    createAndErrorCheck(userObjectId, inTime, done);
  });

  it('バリデーションチェック3(異常:正規表現パターン外)', function (done) {
    var userObjectId = new ObjectId('74c1e301f88c39100d5e6208');
    var inTime = '30:00';

    createAndErrorCheck(userObjectId, inTime, done);
  });

  it('バリデーションチェック4(異常:正規表現パターン外)', function (done) {
    var userObjectId = new ObjectId('84c1e301f88c39100d5e6208');
    var inTime = '20:60';

    createAndErrorCheck(userObjectId, inTime, done);
  });

  it('バリデーションチェック5(異常:userのオブジェクトidが重複)', function (done) {
    var userObjectId = new ObjectId('54c1e301f88c39100d5e6208');
    var inTime = '20:00';

    createAndErrorCheck(userObjectId, inTime, done);
  });

  describe('methods calculateCutDate', function () {

    var workdate = {
      year: 2014,
      month: 3,
      day: 14
    };

    it('生成1', function (done) {
      var expectAttendanceInCut = new AttendanceInCut({inTime: '10:00'});
      var workdate = {
        year: 2014,
        month: 3,
        day: 14
      };

      var expectDate = expectAttendanceInCut.calculateCutDate(workdate);

      expectDate.getHours().should.be.exactly(10);
      expectDate.getMinutes().should.be.exactly(0);
      done();

    });

    it('朝切り時刻生成1 日付補正なし(正常)', function (done) {
      var expectAttendanceInCut = new AttendanceInCut({inTime: '10:00'});

      var expectDate = expectAttendanceInCut.calculateCutDate(workdate);

      expectDate.getYear().should.be.exactly(workdate.year - 1900);
      expectDate.getMonth().should.be.exactly(workdate.month - 1);
      expectDate.getDate().should.be.exactly(workdate.day);
      expectDate.getHours().should.be.exactly(10);
      expectDate.getMinutes().should.be.exactly(0);
      expectDate.getSeconds().should.be.exactly(0);
      expectDate.getMilliseconds().should.be.exactly(0);
      done();

    });

    it('朝切り時刻生成1 日付補正あり(正常)', function (done) {
      var expectAttendanceInCut = new AttendanceInCut({inTime: '8:30'});

      var expectDate = expectAttendanceInCut.calculateCutDate(workdate);

      expectDate.getYear().should.be.exactly(workdate.year - 1900);
      expectDate.getMonth().should.be.exactly(workdate.month - 1);
      expectDate.getDate().should.be.exactly(workdate.day);
      expectDate.getHours().should.be.exactly(8);
      expectDate.getMinutes().should.be.exactly(30);
      expectDate.getSeconds().should.be.exactly(0);
      expectDate.getMilliseconds().should.be.exactly(0);
      done();

    });
  });


});
