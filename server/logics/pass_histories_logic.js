/**
 * Created by nagaoka on 2014/11/07.
 */

'use strict';

var  _ = require('lodash');
var datetimeutil = require('../utils/datetimeutil');
var config = require('../config/environment');
var logger = log4js.getLogger();
var mongoose = require('mongoose');
var AttendanceInCut = mongoose.model('AttendanceInCut');
var Matter = mongoose.model('Matter');

/**
 * 通過種別
 * @type {string[]}
 */
var PassType = [
  'unknown',
  'enter',
  'leave',
  'manual_enter',
  'manual_leave',
  'manual_night_leave'
];

/**
 * リクエストのバリデーションに利用
 * @type {number[]}
 */
var ShowPassTypeValidValue = [1, 2];

/**
 * リクエストのバリデーションに利用
 * @type {number[]}
 */
var PassTypeValidValue = [0, 1, 2, 3, 4, 99];

/**
 * 通過種別のリクエストパラメータ対応付け
 * @type {{UNKNOWN: string, ENTER: string, LEAVE: string}}
 */
var PassTypeRequest = {
  UNKNOWN:      '0',
  ENTER:        '1',
  LEAVE:        '2',
  MANUAL_ENTER: '3',
  MANUAL_LEAVE: '4',
  MANUAL_NIGHT_LEAVE: '99',
};

/**
 * valueが存在する場合に、arrayに要素をpushする。
 * @param array
 * @param value
 */
var pushNotNullElement = function(array, value) {
  if(value) {
    array.push(value);
  }
};

module.exports = {
  /**
   * リクエストパラメータとして受け取った通過種別をMongoに入れる形式に変換して返す
   * @param passType
   * @returns {*}
   */
  convertPassType : function (passType) {
    if (passType === undefined || passType === null) {
      return PassType[0];
    }

    passType = passType.toString();

    switch (passType) {
      case PassTypeRequest.UNKNOWN:
        return PassType[0];
      case PassTypeRequest.ENTER:
        return PassType[1];
      case PassTypeRequest.LEAVE:
        return PassType[2];
      case PassTypeRequest.MANUAL_ENTER:
        return PassType[3];
      case PassTypeRequest.MANUAL_LEAVE:
        return PassType[4];
      case PassTypeRequest.MANUAL_NIGHT_LEAVE:
        return PassType[5];
    }

    return null;
  },
  /**
   * lat,lngとして指定された値を配列に格納します。
   * @param lat 緯度
   * @param lng 経度
   * @returns {Array}
   */
  createLocation: function (lat, lng) {
    var location = [];

    pushNotNullElement(location, lng);
    pushNotNullElement(location, lat);

    return location;
  },
  /**
   * 位置情報が意図した形式である場合はtrue,それ以外はfalseを返す。
   * @param location
   * @returns {boolean}
   */
  validLocation: function (location) {
    if (_(location).isArray()) {
      if ((location.length === 0) || (location.length === 2)) {
        return true;
      }
    }

    return false;
  },

  passTypeValueIsUnknown: function (passTypeValue) {
    var val = 0;
    if (_.isNumber(passTypeValue)) {
      val = passTypeValue;
    }
    else if (_.isString(passTypeValue)) {
      val = parseInt(passTypeValue, 10);
    }
    else {
      return true;
    }

    var index = _.indexOf(PassTypeValidValue, val);
    if (index < 0) {
      return true;
    }
    var idx = parseInt(PassTypeRequest.UNKNOWN, 10);
    if (index === idx) {
      return true;
    }

    var passType = this.convertPassType(val);
    if (!passType) {
      return true;
    }
    return false;
  },

  getMatter: function(matterId, timestamp, user, callback) {
    logger.info('getMatter')

    var passDate = new Date(parseInt(timestamp) - config.offsetInDayTimestamp);
    var workDate = datetimeutil.workdate(new Date(parseInt(timestamp)));

    // matterId 未指定時は主案件を取得
    if (matterId == null) {
      if (user) {
        var conditions = {
          year:  workDate.year,
          month: workDate.month,
          user:  user._id,
        };
        AttendanceInCut.findOne(conditions).populate('matter').exec(function(err, attendanceInCut) {
          if (err) {
            callback(err);
            return;
          }

          if (attendanceInCut && attendanceInCut.isActive()) {
            logger.info(attendanceInCut.matter)
            callback(null, attendanceInCut.matter);
          } else {
            // 主案件がない場合は期間内の案件を探して、あれば設定する
            Matter.findOne({
              contractStart: { $lte: passDate },
              contractEnd  : { $gte: passDate },
              resources    : { $elemMatch: { user: user._id } },
            }).sort({id:1}).exec(function(err, matter) {
              logger.info(matter)
              callback(err, matter)
            });
          }
        });
      } else {
        logger.info('matter is null')
        callback(null, null);
      }
    } else {
      logger.info('matter_id: ' + matterId)
      Matter.findOne({id: matterId}, null, {}, function(err, matter) {
        logger.info(matter)
        callback(null, matter);
      });
    }
  },

  passType : PassType,
  passTypeValidValue : PassTypeValidValue,
  showPassTypeValidValue : ShowPassTypeValidValue
};
