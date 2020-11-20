'use strict';

var should = require('should'),
  app = require('../../../../server/app'),
  request = require('supertest'),
  mongoose = require('mongoose'),
  _ = require('lodash'),
  async = require('async'),
  testdata = require('../../../utils/testdata'),
  logger = log4js.getLogger(),
  User = mongoose.model('User'),
  FamilyUser = mongoose.model('FamilyUser');

var open_testdata_initialize = function (done) {

  var tokenExpiration = new Date();
  tokenExpiration.setHours(tokenExpiration.getHours() + 1);

  async.waterfall(
    [
      // データリセット
      testdata.truncate,
      // ユーザ登録
      function (waterfallDone) {
        var user = new User({
          id: 1,
          name: 'テストユーザ',
          mail: 'TMZ8Z73rbqrXXfpk@gmail.com',
          login: 'opentest1',
          doorOpen: true,
          enabled: true,
          extensionPhoneNumber: 100,
          devices: [],
          nfcs: [],
          family: [],
          sourcename: 'local',
          sourcetype: 'local',
          source: { type: 'local' }
        });
        user.save(waterfallDone);
      },
      function (user, number, waterfallDone) {
        var familyUser = new FamilyUser({
          name: '祖父',
          mail: 'testuser1@ap-com.co.jp',
          mailActivated: true,
          user: new Object(user._id),
          tokenPath: 'XXXXXXXXXXXXX1',
          tokenExpiration: tokenExpiration
        });

        familyUser.save(function (err, doc) {
          if (err) {
            waterfallDone(err);
          } else {
            user.family.push(doc);
            user.save(waterfallDone);
          }
        });
      },
      function (user, number, waterfallDone) {
        var familyUser = new FamilyUser({
          name: '祖母',
          mail: 'testuser2@ap-com.co.jp',
          mailActivated: false,
          user: new Object(user._id),
          tokenPath: 'XXXXXXXXXXXXX2',
          tokenExpiration: tokenExpiration
        });

        familyUser.save(function (err, doc) {
          if (err) {
            waterfallDone(err);
          } else {
            user.family.push(doc);
            user.save(waterfallDone);
          }
        });
      },
      function (user, number, waterfallDone) {
        var date = new Date();
        date.setHours(date.getHours() - 1);

        var familyUser = new FamilyUser({
          name: 'その他',
          mail: 'testuser3@ap-com.co.jp',
          mailActivated: true,
          user: new Object(user._id),
          tokenPath: 'XXXXXXXXXXXXX3',
          tokenExpiration: date
        });

        familyUser.save(function (err, doc) {
          if (err) {
            waterfallDone(err);
          } else {
            user.family.push(doc);
            user.save(function (err) {
              if (err) {
                waterfallDone(err);
              } else {
                waterfallDone();
              }
            });
          }
        });
      }
    ],
    function (err) {
      if (err) {
        done(err);
      } else {
        done();
      }
    });
};

describe('GET /external/family.json', function () {

  before(function (done) {
    open_testdata_initialize(done);
  });

  /**
   * APIへアクセスするためのヘルパー関数
   * @param {Object} sendParameter APIへ送信するパラメータ
   * @param {number} statusCode APIより受け取るステータスコード
   * @param {Function} callback レスポンスの確認を行うコールバック関数
   */
  var apiAccess = function (sendParameter, statusCode, callback) {
    request(app)
      .get('/external/family.json')
      .set('Accept-Language', 'ja')
      .query(sendParameter)
      .auth('test', 'test')
      .expect(statusCode)
      .end(callback);
  };

  it('エラー:バリデーション失敗(userId不足)', function (done) {
    var sendParameter = {
      token: 'XXXXXXXXXXXXX2'
    };
    apiAccess(sendParameter, 400, function (err) {
      if (err) {
        done(err);
      } else {
        done();
      }
    });
  });

  it('エラー:バリデーション失敗(userIdが数値以外)', function (done) {
    var sendParameter = {
      userId: 'xxx',
      token: 'XXXXXXXXXXXXX2'
    };
    apiAccess(sendParameter, 400, function (err) {
      if (err) {
        done(err);
      } else {
        done();
      }
    });
  });

  it('エラー:バリデーション失敗(token不足)', function (done) {
    var sendParameter = {
      userId: '1',
    };
    apiAccess(sendParameter, 400, function (err) {
      if (err) {
        done(err);
      } else {
        done();
      }
    });
  });

  it('エラー:存在しないuserIdを指定した場合', function (done) {
    var sendParameter = {
      userId: '2',
      token: 'XXXXXXXXXXXXX1',
    };
    apiAccess(sendParameter, 403, function (err) {
      if (err) {
        done(err);
      } else {
        done();
      }
    });
  });

  it('エラー:存在しないtokenを指定した場合', function (done) {
    var sendParameter = {
      userId: '1',
      token: 'XXXXXXXXXXXXX9',
    };
    apiAccess(sendParameter, 403, function (err) {
      if (err) {
        done(err);
      } else {
        done();
      }
    });
  });

  it('エラー:家族のトークン期限が切れてしまっている場合', function (done) {
    var sendParameter = {
      userId: '1',
      token: 'XXXXXXXXXXXXX3',
    };
    apiAccess(sendParameter, 403, function (err) {
      if (err) {
        done(err);
      } else {
        done();
      }
    });
  });

  it('家族情報取得(取得する家族情報のmailActivatedがtrueの場合)', function (done) {
    var sendParameter = {
      userId: '1',
      token: 'XXXXXXXXXXXXX1'
    };
    apiAccess(sendParameter, 200, function (err, res) {
      if (err) {
        done(err);
      } else {
        res.body.should.be.instanceof(Object);
        res.body.user.name.should.be.exactly('テストユーザ');
        res.body.family.name.should.be.exactly('祖父');
        res.body.family.mail.should.be.exactly('testuser1@ap-com.co.jp');
        res.body.family.mailActivated.should.be.exactly(true);
        done();
      }
    });
  });

  it('家族情報取得(取得する家族情報のmailActivatedがfalseの場合)', function (done) {
    var sendParameter = {
      userId: '1',
      token: 'XXXXXXXXXXXXX2'
    };
    apiAccess(sendParameter, 200, function (err, res) {
      if (err) {
        done(err);
      } else {
        res.body.should.be.instanceof(Object);
        res.body.user.name.should.be.exactly('テストユーザ');
        res.body.family.name.should.be.exactly('祖母');
        res.body.family.mail.should.be.exactly('testuser2@ap-com.co.jp');
        res.body.family.mailActivated.should.be.exactly(false);
        done();
      }
    });
  });
});

describe('DELETE /external/family.json', function () {

  before(function (done) {
    open_testdata_initialize(done);
  });

  // TODO 家族削除成功(自身を削除)の直前以外実行する必要なし、パフォーマンスを考えると改善するべきか
  beforeEach(function (done) {
    var tokenExpiration = new Date();
    tokenExpiration.setHours(tokenExpiration.getHours() + 1);
    FamilyUser.findOneAndUpdate({mail: 'testuser1@ap-com.co.jp'}, {$set: {tokenExpiration: tokenExpiration}}).exec(done);
  });

  /**
   * APIへアクセスし、
   * @param {Object} sendParameter
   * @param {number} statusCode
   * @param {Function} callback
   */
  var apiAccess = function (sendParameter, statusCode, callback) {
    request(app)
      .delete('/external/family.json')
      .set('Accept-Language', 'ja')
      .send(sendParameter)
      .auth('test', 'test')
      .expect(statusCode)
      .end(callback);
  };

  it('エラー:バリデーション失敗(mailAddress不足)', function (done) {
    var sendParameter = {
      userId: '1',
      token: 'XXXXXXXXXXXXX2'
    };
    apiAccess(sendParameter, 400, function (err) {
      if (err) {
        done(err);
      } else {
        done();
      }
    });
  });

  it('エラー:バリデーション失敗(mailAddressフォーマット)', function (done) {
    var sendParameter = {
      userId: '1',
      token: 'XXXXXXXXXXXXX2',
      mailAddress: 'te\\st@ap-com.co.jp'

    };
    apiAccess(sendParameter, 400, function (err) {
      if (err) {
        done(err);
      } else {
        done();
      }
    });
  });

  it('エラー:バリデーション失敗(userId不足)', function (done) {
    var sendParameter = {
      token: 'XXXXXXXXXXXXX2',
      mailAddress: 'testuser1@ap-com.co.jp'
    };
    apiAccess(sendParameter, 400, function (err) {
      if (err) {
        done(err);
      } else {
        done();
      }
    });
  });

  it('エラー:バリデーション失敗(userIdが数値以外)', function (done) {
    var sendParameter = {
      userId: 'xxx',
      token: 'XXXXXXXXXXXXX2',
      mailAddress: 'testuser1@ap-com.co.jp'
    };
    apiAccess(sendParameter, 400, function (err) {
      if (err) {
        done(err);
      } else {
        done();
      }
    });
  });

  it('エラー:バリデーション失敗(token不足)', function (done) {
    var sendParameter = {
      userId: '1',
      mailAddress: 'testuser1@ap-com.co.jp'
    };
    apiAccess(sendParameter, 400, function (err) {
      if (err) {
        done(err);
      } else {
        done();
      }
    });
  });

  it('エラー:バリデーション失敗(token文字数14文字未満)', function (done) {
    var sendParameter = {
      userId: '1',
      token: 'XXXXXXXXXXXXX',
      mailAddress: 'testuser1@ap-com.co.jp'
    };
    apiAccess(sendParameter, 400, function (err) {
      if (err) {
        done(err);
      } else {
        done();
      }
    });
  });

  it('エラー:バリデーション失敗(token文字数14文字超過)', function (done) {
    var sendParameter = {
      userId: '1',
      token: 'XXXXXXXXXXXXX11',
      mailAddress: 'testuser1@ap-com.co.jp'
    };
    apiAccess(sendParameter, 400, function (err) {
      if (err) {
        done(err);
      } else {
        done();
      }
    });
  });

  it('エラー:存在しないトークンでアクセス', function (done) {
    var sendParameter = {
      userId: '1',
      token: 'XXXXXXXXXXXXX0',
      mailAddress: 'testuser1@ap-com.co.jp'
    };
    apiAccess(sendParameter, 403, function (err) {
      if (err) {
        done(err);
      } else {
        done();
      }
    });
  });

  it('エラー:存在しないuserIdを指定した場合', function (done) {
    var sendParameter = {
      userId: '2',
      token: 'XXXXXXXXXXXXX1',
      mailAddress: 'testuser3@ap-com.co.jp'
    };
    apiAccess(sendParameter, 403, function (err) {
      if (err) {
        done(err);
      } else {
        done();
      }
    });
  });


  it('エラー:家族削除実行者のmailActivatedがfalseの場合', function (done) {
    var sendParameter = {
      userId: '1',
      token: 'XXXXXXXXXXXXX2',
      mailAddress: 'testuser0@ap-com.co.jp'
    };
    apiAccess(sendParameter, 403, function (err) {
      if (err) {
        done(err);
      } else {
        done();
      }
    });
  });

  it('エラー:家族が保持しているメールアドレス以外を指定した場合', function (done) {
    var sendParameter = {
      userId: '1',
      token: 'XXXXXXXXXXXXX1',
      mailAddress: 'testuser0@ap-com.co.jp'
    };
    apiAccess(sendParameter, 404, function (err) {
      if (err) {
        done(err);
      } else {
        done();
      }
    });
  });

  it('家族削除成功', function (done) {
    var sendParameter = {
      userId: '1',
      token: 'XXXXXXXXXXXXX1',
      mailAddress: 'testuser3@ap-com.co.jp'
    };
    apiAccess(sendParameter, 200, function (err) {
      if (err) {
        done(err);
      } else {
        async.series([
            function (seriesDone) {
              FamilyUser.findOne({tokenPath: 'XXXXXXXXXXXXX3'}).exec(function (err, doc) {
                if (err) {
                  seriesDone(err);
                } else if (!doc) {
                  seriesDone();
                } else {
                  seriesDone('削除に失敗している');
                }
              });
            },
            function (seriesDone) {
              User.findOne({id: 1}).populate('family').exec(function (err, doc) {
                if (err) {
                  seriesDone(err);
                } else if (!doc) {
                  seriesDone('該当するユーザが存在しない');
                } else {
                  doc.family.length.should.be.exactly(2);

                  var expiration = new Date(0);
                  _.find(doc.family, function (family) {
                    return family.tokenPath === 'XXXXXXXXXXXXX1';
                  }).tokenExpiration.getTime().should.equal(expiration.getTime());

                  seriesDone();
                }
              });
            }
          ],
          function (err) {
            if (err) {
              done(err);
            } else {
              done();
            }
          });
      }
    });
  });

  it('家族削除成功(自身を削除)', function (done) {
    var sendParameter = {
      userId: '1',
      token: 'XXXXXXXXXXXXX1',
      mailAddress: 'testuser1@ap-com.co.jp'
    };
    apiAccess(sendParameter, 200, function (err) {
      if (err) {
        done(err);
      } else {
        async.series([
            function (seriesDone) {
              FamilyUser.findOne({tokenPath: 'XXXXXXXXXXXXX1'}).exec(function (err, doc) {
                if (err) {
                  seriesDone(err);
                } else if (!doc) {
                  seriesDone();
                } else {
                  seriesDone('削除に失敗している');
                }
              });
            },
            function (seriesDone) {
              User.findOne({id: 1}).populate('familyUser').exec(function (err, doc) {
                if (err) {
                  seriesDone(err);
                } else if (!doc) {
                  seriesDone('該当するユーザが存在しない');
                } else {
                  doc.family.length.should.be.exactly(1);
                  seriesDone();
                }
              });
            }
          ],
          function (err) {
            if (err) {
              done(err);
            } else {
              done();
            }
          });
      }
    });
  });


});

