'use strict';

var should = require('should'),
    logger = log4js.getLogger();

var datetimeutil = require('../../server/utils/datetimeutil');

describe('日付テスト', function() {

  var dt = function(year, month, day, hour, min, sec) {
    return new Date(Date.UTC(year, month - 1, day, hour, min, sec));
  };

  it('workdate 2014/01/31 00:00:00 -> 2014/01/31', function(done) {
    var date = datetimeutil.workdate(dt(2014, 1, 31, 0, 0, 0));
    date.year.should.be.exactly(2014);
    date.month.should.be.exactly(1);
    date.day.should.be.exactly(31);
    done();
  });

  it('workdate 2014/01/31 17:59:59 -> 2014/01/31', function(done) {
    var date = datetimeutil.workdate(dt(2014, 1, 31, 17, 59, 59));
    date.year.should.be.exactly(2014);
    date.month.should.be.exactly(1);
    date.day.should.be.exactly(31);
    done();
  });

  it('workdate 2014/01/31 18:00:00 -> 2014/02/01', function(done) {
    var date = datetimeutil.workdate(dt(2014, 1, 31, 18, 0, 0));
    date.year.should.be.exactly(2014);
    date.month.should.be.exactly(2);
    date.day.should.be.exactly(1);
    done();
  });

  it('workdate 2014/01/31 23:59:59 -> 2014/02/01', function(done) {
    var date = datetimeutil.workdate(dt(2014, 1, 31, 23, 59, 59));
    date.year.should.be.exactly(2014);
    date.month.should.be.exactly(2);
    date.day.should.be.exactly(1);
    done();
  });

  it('workdate 2014/02/01 00:00:00 -> 2014/02/01', function(done) {
    var date = datetimeutil.workdate(dt(2014, 2, 1, 0, 0, 0));
    date.year.should.be.exactly(2014);
    date.month.should.be.exactly(2);
    date.day.should.be.exactly(1);
    done();
  });

  it('workdate 2014/02/01 03:00:00 -> 2014/02/01', function(done) {
    var date = datetimeutil.workdate(dt(2014, 2, 1, 3, 0, 0));
    date.year.should.be.exactly(2014);
    date.month.should.be.exactly(2);
    date.day.should.be.exactly(1);
    done();
  });

  it('workdate 2014/02/01 03:00:00 ({y: 1, m: -2, d: 5}) -> 2014/12/06', function(done) {
    var date = datetimeutil.workdate(dt(2014, 2, 1, 3, 0, 0), {y: 1, m: -2, d: 5});
    date.year.should.be.exactly(2014);
    date.month.should.be.exactly(12);
    date.day.should.be.exactly(6);
    done();
  });

  it('workdate 2014/08/01 01:00:00 -> 2014/08/01', function(done) {
    var date = datetimeutil.workdate(dt(2014, 8, 1, 1, 0, 0));
    date.year.should.be.exactly(2014);
    date.month.should.be.exactly(8);
    date.day.should.be.exactly(1);
    done();
  });

  it('workdate 2014/08/01 01:00:00 ({y: 0, m: -1, d: 0}) -> 2014/07/01', function(done) {
    var date = datetimeutil.workdate(dt(2014, 8, 1, 1, 0, 0), {y: 0, m: -1, d: 0});
    date.year.should.be.exactly(2014);
    date.month.should.be.exactly(7);
    date.day.should.be.exactly(1);
    done();
  });

  it('workstartdate 2014/02/02 18:22:33 -> 2014/02/02 18:00:00', function(done) {
    var date = datetimeutil.workstartdate(dt(2014, 2, 2, 18, 22, 33));
    date.getUTCFullYear().should.be.exactly(2014);
    date.getUTCMonth().should.be.exactly(2 - 1);
    date.getUTCDate().should.be.exactly(2);
    date.getUTCHours().should.be.exactly(18);
    date.getUTCMinutes().should.be.exactly(0);
    date.getUTCSeconds().should.be.exactly(0);
    date.getUTCMilliseconds().should.be.exactly(0);
    done();
  });

  it('workstartdate 2014/02/02 18:00:00 -> 2014/02/02 18:00:00', function(done) {
    var date = datetimeutil.workstartdate(dt(2014, 2, 2, 18, 0, 0));
    date.getUTCFullYear().should.be.exactly(2014);
    date.getUTCMonth().should.be.exactly(2 - 1);
    date.getUTCDate().should.be.exactly(2);
    date.getUTCHours().should.be.exactly(18);
    date.getUTCMinutes().should.be.exactly(0);
    date.getUTCSeconds().should.be.exactly(0);
    date.getUTCMilliseconds().should.be.exactly(0);
    done();
  });

  it('workstartdate 2014/02/02 1:22:33 -> 2014/02/01 18:00:00', function(done) {
    var date = datetimeutil.workstartdate(dt(2014, 2, 2, 1, 22, 33));
    date.getUTCFullYear().should.be.exactly(2014);
    date.getUTCMonth().should.be.exactly(2 - 1);
    date.getUTCDate().should.be.exactly(1);
    date.getUTCHours().should.be.exactly(18);
    date.getUTCMinutes().should.be.exactly(0);
    date.getUTCSeconds().should.be.exactly(0);
    date.getUTCMilliseconds().should.be.exactly(0);
    done();
  });
});
