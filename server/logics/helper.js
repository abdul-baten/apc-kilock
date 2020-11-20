'use strict';

var  _ = require('lodash');
var config = require('../config/environment');
var logger = log4js.getLogger();
var moment = require('moment');
var Koyomi = require('koyomi');

/**
 * 勤務表状態の値リストを返却
 *
 * @return array 勤務表状態の値リスト
 */
var getAttendanceStatusValues = function() {
  return Object.keys(config.attendanceStatuses).map(function(key) {
    return config.attendanceStatuses[key];
  });
};

/**
 * 勤務表更新アクションの値リストを返却
 *
 * @return array 勤務表更新アクションの値リスト
 */
var getAttendanceActionValues = function() {
  return Object.keys(config.attendanceActions).map(function(key) {
    return config.attendanceActions[key];
  });
};

/**
 * 勤務表更新権限の値リストを返却
 *
 * @return array 勤務表更新権限の値リスト
 */
var getAttendancePermissionValues = function() {
  return Object.keys(config.attendancePermissions).map(function(key) {
    return config.attendancePermissions[key];
  });
};

/**
 * 交通費-区分の値リストを返却
 *
 * @return array 交通費-区分の値リスト
 */
var getTravelTypeValues = function() {
  return Object.keys(config.travelTypes).map(function(key) {
    return config.travelTypes[key];
  });
};

/**
 * 交通費-目的の値リストを返却
 *
 * @return array 交通費-目的の値リスト
 */
var getTravelPurposesValues = function() {
  return Object.keys(config.travelPurposes).map(function(key) {
    return config.travelPurposes[key];
  });
};

/**
 * 選択可能年リストを返却
 *
 * @return array 年リスト
 */
var getSelectYears = function() {
  var now = moment();

  var list = [];
  for (var y = now.year() - config.yearSelectBefore; y <= now.year(); y++) {
    list.push(y);
  }
  return list;
};

/**
 * 選択可能月リストを返却
 *
 * @return array 月リスト
 */
var getSelectMonths = function() {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
};

/**
 * 土日祝日であるか返却
 *
 * @return bool
 */
var isHoliday = function(year, month, day) {
  var weekday = moment([year, month - 1, day]).day();
  var holidayKeys = _.keys(Koyomi.getHolidays(year));
  var key = month.toString() + ('0' + day).slice(-2);
  if (weekday == 0 || weekday == 6 || _.indexOf(holidayKeys, key) >= 0) {
    return true;
  } else {
    return false;
  }
};

module.exports = {
  getAttendanceStatusValues:     getAttendanceStatusValues,
  getAttendanceActionValues:     getAttendanceActionValues,
  getAttendancePermissionValues: getAttendancePermissionValues,
  getTravelTypeValues:           getTravelTypeValues,
  getTravelPurposesValues:       getTravelPurposesValues,
  getSelectYears:                getSelectYears,
  getSelectMonths:               getSelectMonths,
  isHoliday:                     isHoliday,
};
