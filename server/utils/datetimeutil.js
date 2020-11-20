'use strict';

var config = require('../config/environment');
require('date-utils');

module.exports = {
  now: function () {
    return new Date(Date.now());
  },
  workstartdate: function (targetDate) {
    var date;
    if (targetDate) {
      date = targetDate.clone();
    } else {
      date = this.now();
    }
    var h = date.getUTCHours();
    if (config.futofftimehour < 0) {
      if (h >= (24 + config.futofftimehour)) {
        date.addDays(1);
      }
      date.setUTCHours(24 + config.futofftimehour);
    } else {
      if (h < config.futofftimehour) {
        date.addDays(-1);
      }
      date.setUTCHours(config.futofftimehour);
    }
    // タイムゾーン考慮がないのでとりあえず1日引く FIXME タイムゾーンの考慮
    date.addDays(-1);
    date.setUTCMinutes(0);
    date.setUTCSeconds(0);
    date.setUTCMilliseconds(0);
    return date;
  },
  workenddate: function (targetDate) {
    var date = this.workstartdate(targetDate);
    date.addDays(1);
    date.addMilliseconds(-1);
    return date;
  },
  workdate: function (targetDate, additional) {
    var date;
    if (targetDate && targetDate instanceof Date) {
      date = this.workstartdate(targetDate);
    } else {
      if (targetDate) {
        additional = targetDate;
      }
      date = this.workstartdate(this.now());
    }
    // タイムゾーン考慮がないのでとりあえず1日足す FIXME タイムゾーンの考慮
    date.addDays(1);
    if (additional) {
      if (additional.y) {
        date.addYears(additional.y);
      }
      if (additional.m) {
        date.addMonths(additional.m);
      }
      if (additional.d) {
        date.addDays(additional.d);
      }
    }
    var y = date.getUTCFullYear();
    var m = date.getUTCMonth() + 1;
    var d = date.getUTCDate();
    return {
      year: y,
      month: m,
      day: d,
    };
  },
  getDaysInMonth: function (year, month) {
    return Date.getDaysInMonth(year, month - 1);
  },
  getDiffMinutes: function (target1, target2) {
    return target1.getMinutesBetween(target2);
  },
  roundUp: function (targetDate, minutes) {
    if (minutes == null) {
      minutes = config.roundMinutes;
    }
    var ms = minutes * 60 * 1000;
    var timestamp = Math.ceil(targetDate.getTime() / ms) * ms;
    return new Date(timestamp);
  },
  roundDown: function (targetDate, minutes) {
    if (minutes == null) {
      minutes = config.roundMinutes;
    }
    var ms = minutes * 60 * 1000;
    var timestamp = Math.floor(targetDate.getTime() / ms) * ms;
    return new Date(timestamp);
  },
};
