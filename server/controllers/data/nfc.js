'use strict';

var _ = require('lodash'),
    logger = log4js.getLogger(),
    async = require('async'),
    mongoose = require('mongoose'),
    User = mongoose.model('User'),
    Nfc = mongoose.model('Nfc'),
    validator = require('../../utils/validator');

var Results = {
  SUCCESS: 0,
  ERROR: 1,
};

exports.post = function (req, res) {
  validator(req).checkBody('id').isInt();
  validator(req).checkBody('tag').notEmpty();
  validator(req).checkBody('temp').nullable().isIn([true,false]);

  var validateErrors = req.validationErrors();
  if (validateErrors) {
    // バリデートエラー
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json({
      result: Results.ERROR,
      message: req.__('バリデートエラー'),
    });
  }
  var reqParams = {
    userId: parseInt(req.body.id),
    nfcNumber: req.body.tag,
    temp: req.body.temp || false
  };

  /**
   * すでにNFCが登録済みである場合にのレスポンスを行う。
   * @param res レスポンスオブジェクト
   */
  var responseDuplicateError = function (res) {
    res.status(400);
    res.json({
      result: Results.ERROR,
      message: req.__('他のユーザが使用中のNFC')
    });
    return;
  };

  User.findOne({ id: reqParams.userId })
    .populate('nfcs')
    .exec(function (err, user) {
      if (!err) {
        if (user) {
          Nfc.findOne({ number: reqParams.nfcNumber })
            .populate('user')
            .exec(function (err, nfc) {
              if (!err) {
                if (!nfc) {
                  // 新規NFC
                  var newNfc = new Nfc({
                    number: reqParams.nfcNumber,
                    user: user,
                    temp: reqParams.temp
                  });
                  newNfc.save(function (err, nfc) {
                    if (!err) {
                      user.nfcs.push(nfc);
                      user.save(function (err, user) {
                        if (!err) {
                          // 正常登録
                          return res.json({
                            result: Results.SUCCESS,
                          });
                        } else {
                          logger.error(err);
                          res.status(500);
                          return res.json({
                            result: Results.ERROR,
                            message: err.toString(),
                          });
                        }
                      });
                    } else {
                      logger.error(err);
                      res.status(500);
                      return res.json({
                        result: Results.ERROR,
                        message: err.toString(),
                      });
                    }
                  });
                } else if (nfc.user.id !== user.id) {

                  if (nfc.temp) {
                    // NFCに仮フラグが付いている場合は上書きする
                    var nfcUser = nfc.user;

                    async.waterfall([
                      // NFCの保有者を更新
                      function (done) {
                        nfc.user = user;
                        nfc.temp = reqParams.temp || false;

                        nfc.save(done);
                      },
                      // 古いユーザの情報を削除
                      function (nfc, number, done) {
                        nfcUser.nfcs.remove(nfc);
                        nfcUser.save(function (err) {
                          if (err) {
                            done(err);
                          } else {
                            done(null, nfc);
                          }
                        });
                      },
                      // 新しい紐づき先ユーザの設定
                      function (nfc, done) {
                        user.nfcs.push(nfc);
                        user.save(done);
                      }
                    ], function (err) {
                      if (err) {
                        res.status(500);
                        return res.json({
                          result: Results.ERROR,
                          message: err.toString()
                        });
                      } else {
                        return res.json({ result: Results.SUCCESS });
                      }
                    });

                  } else {
                    responseDuplicateError(res);
                    return;
                  }
                } else {
                  // ユーザがNFCを登録済みの場合

                  if (nfc.temp === reqParams.temp) {
                    // リクエストと、登録されているNFCの仮カードフラグが同一値であれば登録済みとみなす
                    return res.json({
                      result: Results.SUCCESS
                    });
                  } else {
                    if (nfc.temp) {

                      nfc.temp = false;
                      nfc.save(function (err) {
                        if (err) {
                          res.status(500);
                          return res.json({
                            result: Results.ERROR,
                            message: err.toString()
                          });
                        } else {
                          res.status(200);
                          return res.json({
                            result: Results.SUCCESS
                          });
                        }
                      });
                    } else {
                      // 他のユーザが本登録されているカードに対する操作
                      responseDuplicateError(res);
                      return;
                    }
                  }
                }
              } else {
                logger.error(err);
                res.status(500);
                return res.json({
                  result: Results.ERROR,
                  message: err.toString(),
                });
              }
            });
        } else {
          res.status(400);
          return res.json({
            result: Results.ERROR,
            message: req.__('ユーザが見つかりません。'),
          });
        }
      } else {
        logger.error(err);
        res.status(500);
        return res.json({
          result: Results.ERROR,
          message: err.toString(),
        });
      }
    });
};
