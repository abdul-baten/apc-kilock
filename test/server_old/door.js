'use strict';

var should = require('should'),
  app = require('../../server/app'),
  request = require('supertest'),
  mongoose = require('mongoose'),
  _ = require('lodash'),
  async = require('async'),
  testdata = require('../utils/testdata'),
  logger = log4js.getLogger(),
  Device = mongoose.model('Device'),
  OneTimeToken = mongoose.model('OneTimeToken'),
  User = mongoose.model('User'),
  Nfc = mongoose.model('Nfc'),
  Door = mongoose.model('Door'),
  PassHistory = mongoose.model('PassHistory');

var open_testdata_initialize = function (done) {

  // 有効ユーザ登録

  async.series([
    // データリセット
    testdata.truncate,
    // ユーザ登録
    function(callback) {
      var user = new User({
        name: 'opentest1 opentest1',
        mail: 'TMZ8Z73rbqrXXfpk@gmail.com',
        login: 'opentest1',
        doorOpen: true,
        enabled: true,
        extensionPhoneNumber: 100,
        devices: [],
        nfcs: [],
        sourcename: 'local',
        sourcetype: 'local',
        source: { type: 'local' }
      });
      user.save(function (err, user) {
        async.parallel({
          devices: function (next) {
            var device = new Device({
              token: 'opentoken1',
              name: 'openname1',
              user: user,
              type: 'mobile',
            });
            device.save(next);
          },
          nfcs: function (next) {
            var nfc = new Nfc({
              number: 'abcdefg12345',
              user: user,
            });
            nfc.save(next);
          },
        }, function (err, result) {
          if (err) {
            logger.error(err);
          } else {
            user.devices = [result.devices[0]];
            user.nfcs = [result.nfcs[0]];
            user.save();
          }
        });
      });
      callback(null, null);
    },
    // 無効ユーザ登録
    function(callback) {
      var invalid_user = new User({
        name: 'opentest2 opentest2',
        mail: 'TMZ8Z73rbqrXXfpk@gmail.com',
        login: 'opentest2',
        doorOpen: true,
        enabled: false,
        extensionPhoneNumber: 200,
        devices: [],
        nfcs: [],
        sourcename: 'local',
        sourcetype: 'local',
        source: { type: 'local' },
      });
      invalid_user.save(function (err, user) {
        async.parallel({
          devices: function (next) {
            var device = new Device({
              token: 'opentoken2',
              name: 'openname2',
              user: user,
              type: 'mobile',
            });
            device.save(next);
          },
          nfcs: function (next) {
            var nfc = new Nfc({
              number: 'hijklmn67890',
              user: user,
            });
            nfc.save(next);
          },
        }, function (err, result) {
          if (err) {
            logger.error(err);
          } else {
            user.devices = [result.devices[0]];
            user.nfcs = [result.nfcs[0]];
            user.save();
          }
        });
      });
      callback(null, null);
    },
    function(callback) {
      var user = new User({
        name: 'opentest3 opentest3',
        mail: 'TMZ8Z73rbqrXXfpk@gmail.com',
        login: 'opentest3',
        doorOpen: false,
        enabled: true,
        extensionPhoneNumber: 300,
        devices: [],
        nfcs: [],
        sourcename: 'local',
        sourcetype: 'local',
        source: { type: 'local' }
      });
      user.save(function (err, user) {
        async.parallel({
          devices: function (next) {
            var device = new Device({
              token: 'opentoken4',
              name: 'openname4',
              user: user,
              type: 'mobile',
            });
            device.save(next);
          },
          nfcs: function (next) {
            var nfc = new Nfc({
              number: 'opqrstu12345',
              user: user,
            });
            nfc.save(next);
          },
        }, function (err, result) {
          if (err) {
            logger.error(err);
          } else {
            user.devices = [result.devices[0]];
            user.nfcs = [result.nfcs[0]];
            user.save();
          }
        });
      });
      callback(null, null);
    },
    // テスト用Device作成
    function(callback){
      var device = new Device({
        token: 'nfc-device-token',
        name: 'openname3',
        type: 'nfc',
      });
      device.save();
      callback(null, null);
    },
    function(callback) {
      // テスト用Door作成
      var door = new Door({
        key: 'door',
        name: 'テストドア',
        action: 'passonly',
      });
      door.save();
      callback(null, null);
    }
  ], function(err, result){
    if (err) {
      logger.error(err);
    }
    if (done) { done(err); }
  });
};

describe('POST /door/device.json', function () {

  before(function (done) {

    async.series([
        // データリセット
        testdata.truncate,
        // 有効ユーザ登録
        function (callback) {
          var user = new User({
            name: 'devicetest1 devicetest1',
            mail: 'TMZ8Z73rbqrXXfpk@gmail.com',
            login: 'devicetest1',
            doorOpen: true,
            enabled: true,
            extensionPhoneNumber: 100,
            sourcename: 'local',
            sourcetype: 'local',
            source: { type: 'local' },
          });
          user.save(function (err) {
            if (err) {
              logger.error(err);
              callback(err);
            } else {
              var onetimetokens = [
              new OneTimeToken({
                token: '111111',
                type: 'DeviceMobile',
                user: user,
                expiration: new Date(Date.now() + (5 * 60 * 1000)),
              }),
              new OneTimeToken({
                token: '111112',
                type: 'DeviceMobile',
                user: user,
                expiration: new Date(Date.now() + (5 * 60 * 1000)),
              }),
              new OneTimeToken({
                token: '111113',
                type: 'DeviceMobile',
                user: user,
                expiration: new Date(Date.now() + (5 * 60 * 1000)),
              }),
              ];
              async.each(onetimetokens, function(onetimetoken, done) {
                onetimetoken.save(done);
              }, callback);
            }
          });
        },
        // 無効ユーザ登録
        function (callback) {
          var invalid_user = new User({
            name: 'devicetest2 devicetest2',
            mail: 'TMZ8Z73rbqrXXfpk@gmail.com',
            login: 'devicetest2',
            doorOpen: true,
            enabled: false,
            extensionPhoneNumber: 200,
            sourcename: 'local',
            sourcetype: 'local',
            source: { type: 'local' },
          });
          invalid_user.save(function (err) {
            if (err) {
              logger.error(err);
              callback(err);
            } else {
              var onetimetoken = new OneTimeToken({
                token: '222222',
                type: 'DeviceMobile',
                user: invalid_user,
                expiration: new Date(Date.now() + (5 * 60 * 1000)),
              });
              onetimetoken.save(callback);
            }
          })
        },
        // NFC用ワンタイムトークン登録

        function (callback) {
          var onetime_token_user = new User({
            name: 'devicetest3 devicetest3',
            mail: 'TMZ8Z73rbqrXXfpk@gmail.com',
            login: 'devicetest3',
            doorOpen: true,
            enabled: true,
            extensionPhoneNumber: 300,
            sourcename: 'local',
            sourcetype: 'local',
            source: { type: 'local' },
          });
          onetime_token_user.save(function (err) {
            if (err) {
              logger.error(err);
              callback(err);
            } else {
              var onetimetoken = new OneTimeToken({
                token: '900001',
                type: 'DeviceNfc',
                user: onetime_token_user,
                expiration: new Date(Date.now() + (5 * 60 * 1000)),
              });
              onetimetoken.save(callback);
            }
          });
        }
      ],
      function (err, result) {
        if (err) {
          logger.error(err);
        }
        done(err);
      }
    );
  });

  it('デバイス登録成功パターン', function (done) {
    request(app)
      .post('/door/device.json')
      .set('Accept-Language', 'ja')
      .send({
        onetime_token: '111111'
      })
      .auth('test', 'test')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        logger.info(res.body);
        res.body.should.be.instanceof(Object);
        res.body.result.should.be.exactly(0);
        res.body.message.should.be.exactly('devicetest1 devicetest1のデバイス を登録しました');
        done();
      });
  });

  it('削除済みをもう一回しようとするパターン', function (done) {
    request(app)
      .post('/door/device.json')
      .set('Accept-Language', 'ja')
      .send({
        onetime_token: '111111'
      })
      .auth('test', 'test')
      .expect(400)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        logger.info(res.body);
        res.body.should.be.instanceof(Object);
        res.body.result.should.be.exactly(1);
        done();
      });
  });

  it('2つ目デバイス登録成功パターン', function (done) {
    request(app)
    .post('/door/device.json')
    .set('Accept-Language', 'ja')
    .send({
      onetime_token: '111112'
    })
    .auth('test', 'test')
    .expect(200)
    .expect('Content-Type', /json/)
    .end(function (err, res) {
      if (err) return done(err);
      logger.info(res.body);
      res.body.should.be.instanceof(Object);
      res.body.result.should.be.exactly(0);
      res.body.message.should.be.exactly('devicetest1 devicetest1のデバイス(2) を登録しました');
      done();
    });
  });

  it('3つ目デバイス登録成功パターン', function (done) {
    request(app)
    .post('/door/device.json')
    .set('Accept-Language', 'ja')
    .send({
      onetime_token: '111113'
    })
    .auth('test', 'test')
    .expect(200)
    .expect('Content-Type', /json/)
    .end(function (err, res) {
      if (err) return done(err);
      logger.info(res.body);
      res.body.should.be.instanceof(Object);
      res.body.result.should.be.exactly(0);
      res.body.message.should.be.exactly('devicetest1 devicetest1のデバイス(3) を登録しました');
      done();
    });
  });

  it('無効ユーザパターン', function (done) {
    request(app)
      .post('/door/device.json')
      .set('Accept-Language', 'ja')
      .send({
        onetime_token: '222222'
      })
      .auth('test', 'test')
      .expect(400)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        logger.info(res.body);
        res.body.should.be.instanceof(Object);
        res.body.result.should.be.exactly(1);
        done();
      });
  });

  it('NFC用デバイス登録パターン', function (done) {
    request(app)
      .post('/door/device.json')
      .set('Accept-Language', 'ja')
      .send({
        onetime_token: '900001'
      })
      .auth('test', 'test')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        logger.info(res.body);
        res.body.should.be.instanceof(Object);
        res.body.result.should.be.exactly(0);
        done();
      });
  });
});

describe('POST /door/open.json', function () {

  before(function (done) {
    open_testdata_initialize(done);
  });

  it('バリデーションエラー確認(door_keyが空)', function (done) {
    request(app)
      .post('/door/open.json')
      .set('Accept-Language', 'ja')
      .send({
        location_id: 'door'
      })
      .auth('test', 'test')
      .expect(400)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        logger.info(res.body);
        res.body.should.be.instanceof(Object);
        res.body.result.should.be.exactly(2);
        res.body.door_key.should.be.exactly('');
        res.body.message.should.be.exactly('バリデートエラー');

        done();
      });
  });

  it('バリデーションエラー確認(pass_type異常値)', function (done) {
    request(app)
      .post('/door/open.json')
      .set('Accept-Language', 'ja')
      .send({
        device_token: 'opentoken1',
        door_key: 'door',
        pass_type: '5',
        lat: '10',
        lng: '20'
      })
      .auth('test', 'test')
      // TODO expectが正常に動いていない？念のため、shouldを使って確認しています。
      .expect(400)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        res.status.should.be.exactly(400);
        res.body.should.be.instanceof(Object);
        res.body.door_key.should.be.exactly('');
        res.body.result.should.be.exactly(2);
        res.body.message.should.be.exactly('バリデートエラー');
        done();
      });
  });

  it('バリデーションエラー(latのみ)', function (done) {
    request(app)
      .post('/door/open.json')
      .set('Accept-Language', 'ja')
      .send({
        device_token: 'opentoken1',
        door_key: 'door',
        pass_type: '2',
        lat: '35.690394'
      })
      .auth('test', 'test')
      .expect(400)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        logger.info(res.body);
        res.body.should.be.instanceof(Object);
        res.body.result.should.be.exactly(2);
        res.body.message.should.be.exactly('バリデートエラー(緯度経度の値が、どちらか片方しか存在していません。)');
        done();
      });
  });

  it('バリデーションエラー(lngのみ)', function (done) {
    request(app)
      .post('/door/open.json')
      .set('Accept-Language', 'ja')
      .send({
        device_token: 'opentoken1',
        door_key: 'door',
        pass_type: '2',
        lng: '35.690394'
      })
      .auth('test', 'test')
      .expect(400)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        logger.info(res.body);
        res.body.should.be.instanceof(Object);
        res.body.result.should.be.exactly(2);
        res.body.message.should.be.exactly('バリデートエラー(緯度経度の値が、どちらか片方しか存在していません。)');
        done();
      });
  });

  it('デバイスによる成功テスト', function (done) {
    request(app)
      .post('/door/open.json')
      .set('Accept-Language', 'ja')
      .send({
        device_token: 'opentoken1',
        door_key: 'door'
      })
      .auth('test', 'test')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        logger.info(res.body);
        res.body.should.be.instanceof(Object);
        res.body.result.should.be.exactly(0);
        res.body.message.should.be.exactly('opentest1 opentest1さんの通過を確認しました。');

        //mongoにデータが入っていることの確認
        PassHistory.findOne({deviceToken: 'opentoken1', openEvent: 'mobile'}, {}, {sort: {timestamp: -1}}, function (err, data) {
          if (err) {
            logger.error(err);
          } else {
            data.type.should.be.exactly('unknown');
            data.openEvent.should.be.exactly('mobile');
            data.result.should.be.exactly('allow');
            data.doorKey.should.be.exactly('door');
            should.not.exist(data.location);
          }
          done();
        });
      });
  });

  it('デバイスによる成功テスト(pass_type、lat、lngあり)', function (done) {
    request(app)
      .post('/door/open.json')
      .set('Accept-Language', 'ja')
      .send({
        device_token: 'opentoken1',
        door_key: 'door',
        pass_type: '2',
        lat: '139.763393',
        lng: '35.690394'
      })
      .auth('test', 'test')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        logger.info(res.body);
        res.body.should.be.instanceof(Object);
        res.body.result.should.be.exactly(0);
        res.body.message.should.be.exactly('opentest1 opentest1さんの通過を確認しました。');

        PassHistory.findOne({deviceToken: 'opentoken1', openEvent: 'mobile'}, {}, {sort: {timestamp: -1}}, function (err, data) {
          if (err) {
            logger.error(err);
          } else {
            data.type.should.be.exactly('leave');
            data.openEvent.should.be.exactly('mobile');
            data.result.should.be.exactly('allow');
            data.doorKey.should.be.exactly('door');

            data.location.should.be.instanceof(Array).and.have.lengthOf(2);
            data.location[0].should.be.exactly(35.690394);
            data.location[1].should.be.exactly(139.763393);
          }

          done();
        });

      });
  });

  it('エラー扉を開ける権限がない(デバイス)', function (done) {
    request(app)
    .post('/door/open.json')
    .set('Accept-Language', 'ja')
    .send({
      device_token: 'opentoken4',
      door_key: 'door'
    })
    .auth('test', 'test')
    .expect(200)
    .expect('Content-Type', /json/)
    .end(function (err, res) {
      if (err) return done(err);
      logger.info(res.body);
      res.body.should.be.instanceof(Object);
      res.body.result.should.be.exactly(1);
      res.body.message.should.be.exactly('扉を開ける権限がありません。');
      //mongoにデータが入っていることの確認
      PassHistory.findOne({deviceToken: 'opentoken4', openEvent: 'mobile'}, {}, {sort: {timestamp: -1}}, function (err, data) {
        if (err) {
          logger.error(err);
        } else {
          data.type.should.be.exactly('unknown');
          data.openEvent.should.be.exactly('mobile');
          data.result.should.be.exactly('deny');
          data.doorKey.should.be.exactly('door');
        }
        done();
      });
    });
  });

  it('地理空間インデックスからの抽出テスト', function (done) {
    request(app)
      .post('/door/open.json')
      .set('Accept-Language', 'ja')
      .send({
        device_token: 'opentoken1',
        door_key: 'door',
        pass_type: '2',
        lat: '35.690394',
        lng: '139.763393'
      })
      .auth('test', 'test')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        logger.info(res.body);
        res.body.should.be.instanceof(Object);
        res.body.result.should.be.exactly(0);
        res.body.message.should.be.exactly('opentest1 opentest1さんの通過を確認しました。');

        PassHistory.findOne({location: {$near :[139.763393,35.69038], $maxDistance: 2}}, {}, {sort: {timestamp: -1}}, function (err, data) {
          if (err) {
            logger.error(err);
            done(err);
          } else {
            data.type.should.be.exactly('leave');
            data.openEvent.should.be.exactly('mobile');
            data.result.should.be.exactly('allow');
            data.doorKey.should.be.exactly('door');

            data.location.should.be.instanceof(Array).and.have.lengthOf(2);
            data.location[0].should.be.exactly(139.763393);
            data.location[1].should.be.exactly(35.690394);

            done();
          }
        });

      });
  });

  it('デバイスによる無効ユーザテスト', function (done) {
    request(app)
      .post('/door/open.json')
      .set('Accept-Language', 'ja')
      .send({
        device_token: 'opentoken2',
        door_key: 'door'
      })
      .auth('test', 'test')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        logger.info(res.body);
        res.body.should.be.instanceof(Object);
        res.body.result.should.be.exactly(1);
        res.body.message.should.be.exactly('デバイスまたはユーザが登録されていません。');

        // mongoにデータが入っていることの確認
        PassHistory.findOne({deviceToken: 'opentoken2', openEvent: 'mobile'}, {}, {sort: {timestamp: -1}}, function (err, data) {
          if (err) {
            logger.error(err);
          } else {
            data.type.should.be.exactly('unknown');
            data.openEvent.should.be.exactly('mobile');
            data.result.should.be.exactly('deny');
            data.doorKey.should.be.exactly('door');
            should.not.exist(data.location);
            done();
          }
        });

      });
  });

  it('NFCによる成功テスト', function (done) {
    request(app)
      .post('/door/open.json')
      .set('Accept-Language', 'ja')
      .send({
        pass_type: '1',
        device_token: 'nfc-device-token',
        door_key: 'door',
        nfc: 'abcdefg12345',
      })
      .auth('test', 'test')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        logger.info(res.body);
        res.body.should.be.instanceof(Object);
        res.body.result.should.be.exactly(0);
        res.body.message.should.be.exactly('opentest1 opentest1さんの通過を確認しました。');

        PassHistory.findOne({deviceToken: 'nfc-device-token', nfcNumber: 'abcdefg12345', openEvent: 'nfc'}, {}, {sort: {timestamp: -1}}, function (err, data) {
          if (err) {
            logger.error(err);
          } else {
            data.type.should.be.exactly('enter');
            data.openEvent.should.be.exactly('nfc');
            data.result.should.be.exactly('allow');
            data.doorKey.should.be.exactly('door');
            data.nfcNumber.should.be.exactly('abcdefg12345');
            should.not.exist(data.location);
            done();
          }
        });

      });
  });

  it('NFCによる無効ユーザテスト', function (done) {
    request(app)
      .post('/door/open.json')
      .set('Accept-Language', 'ja')
      .send({
        device_token: 'nfc-device-token',
        door_key: 'door',
        nfc: 'hijklmn67890',
      })
      .auth('test', 'test')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        logger.info(res.body);
        res.body.should.be.instanceof(Object);
        res.body.result.should.be.exactly(1);
        res.body.message.should.be.exactly('NFCまたはユーザが登録されていません。');

        // mongoにデータが入っていることの確認
        PassHistory.findOne({deviceToken: 'nfc-device-token', nfcNumber: 'hijklmn67890', openEvent: 'nfc'}, {}, {sort: {timestamp: -1}}, function (err, data) {
          if (err) {
            logger.error(err);
          } else {
            data.type.should.be.exactly('unknown');
            data.openEvent.should.be.exactly('nfc');
            data.result.should.be.exactly('deny');
            data.nfcNumber.should.be.exactly('hijklmn67890');
            data.doorKey.should.be.exactly('door');
            should.not.exist(data.location);
            done();
          }
        });

      });
  });

  it('エラー扉を開ける権限がない(NFC)', function (done) {
    request(app)
    .post('/door/open.json')
    .set('Accept-Language', 'ja')
    .send({
      device_token: 'nfc-device-token',
      door_key: 'door',
      nfc: 'opqrstu12345',
    })
    .auth('test', 'test')
    .expect(200)
    .expect('Content-Type', /json/)
    .end(function (err, res) {
      if (err) return done(err);
      logger.info(res.body);
      res.body.should.be.instanceof(Object);
      res.body.result.should.be.exactly(1);
      res.body.message.should.be.exactly('扉を開ける権限がありません。');
      //mongoにデータが入っていることの確認
      PassHistory.findOne({deviceToken: 'nfc-device-token', nfcNumber: 'opqrstu12345', openEvent: 'nfc'}, {}, {sort: {timestamp: 1}}, function (err, data) {
        if (err) {
          logger.error(err);
        } else {
          data.type.should.be.exactly('unknown');
          data.openEvent.should.be.exactly('nfc');
          data.result.should.be.exactly('deny');
          data.doorKey.should.be.exactly('door');
        }
        done();
      });
    });
  });

  it('存在しないドアを開けようとするテスト', function (done) {
    request(app)
      .post('/door/open.json')
      .set('Accept-Language', 'ja')
      .send({
        device_token: 'opentoken1',
        door_key: 'unknown'
      })
      .auth('test', 'test')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        logger.info(res.body);
        res.body.should.be.instanceof(Object);
        res.body.result.should.be.exactly(2);
        res.body.message.should.be.exactly('ドアを取得できませんでした。');
        done();
      });
  });
});

describe('POST /door/post.json', function () {
  before(function (done) {
    open_testdata_initialize(done);
  });

  it('バリデーションエラー確認(device_tokenが空)', function (done) {
    request(app)
      .post('/door/post.json')
      .set('Accept-Language', 'ja')
      .send({
        location_id: 'door'
      })
      .auth('test', 'test')
      .expect(400)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        logger.info(res.body);
        res.body.should.be.instanceof(Object);
        res.body.result.should.be.exactly(2);
        res.body.door_key.should.be.exactly('');
        res.body.message.should.be.exactly('バリデートエラー');

        done();
      });
  });

  it('バリデーションエラー確認(pass_type異常値)', function (done) {
    request(app)
      .post('/door/post.json')
      .set('Accept-Language', 'ja')
      .send({
        device_token: 'opentoken1',
        location_id: 'door',
        pass_type: '5',
        lat: '10',
        lng: '20'
      })
      .auth('test', 'test')
      // TODO expectが正常に動いていない？念のため、shouldを使って確認しています。
      .expect(400)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        res.status.should.be.exactly(400);
        res.body.should.be.instanceof(Object);
        res.body.door_key.should.be.exactly('');
        res.body.result.should.be.exactly(2);
        res.body.message.should.be.exactly('バリデートエラー');
        done();
      });
  });

  it('バリデーションエラー確認(latのみ)', function (done) {
    request(app)
      .post('/door/post.json')
      .set('Accept-Language', 'ja')
      .send({
        device_token: 'opentoken1',
        location_id: 'door',
        pass_type: '2',
        lat: '35.690394'
      })
      .auth('test', 'test')
      .expect(400)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        logger.info(res.body);
        res.body.should.be.instanceof(Object);
        res.body.result.should.be.exactly(2);
        res.body.message.should.be.exactly('バリデートエラー(緯度経度の値が、どちらか片方しか存在していません。)');
        done();
      });
  });

  it('バリデーションエラー確認(lngのみ)', function (done) {
    request(app)
      .post('/door/post.json')
      .set('Accept-Language', 'ja')
      .send({
        device_token: 'opentoken1',
        location_id: 'door',
        pass_type: '2',
        lng: '35.690394'
      })
      .auth('test', 'test')
      .expect(400)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        logger.info(res.body);
        res.body.should.be.instanceof(Object);
        res.body.result.should.be.exactly(2);
        res.body.message.should.be.exactly('バリデートエラー(緯度経度の値が、どちらか片方しか存在していません。)');
        done();
      });
  });

  it('地理空間インデックスからの抽出テスト', function (done) {
    request(app)
      .post('/door/post.json')
      .set('Accept-Language', 'ja')
      .send({
        device_token: 'opentoken1',
        location_id: 'door',
        pass_type: '2',
        lat: '35.700808',
        lng: '139.766181'
      })
      .auth('test', 'test')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        logger.info(res.body);
        res.body.should.be.instanceof(Object);
        res.body.result.should.be.exactly(0);
        res.body.message.should.be.exactly('opentest1 opentest1さんの通過を確認しました。');

        PassHistory.findOne({location: {$near: [139.767233 , 35.700198], $maxDistance: 2}, doorKey: 'door'},
          {}, {sort: {timestamp: -1}}, function (err, data) {

          if (err) {
            logger.error(err);
            done(err);
          } else {
            if (data === null) return done("data is null");

            data.type.should.be.exactly('leave');
            data.openEvent.should.be.exactly('mobile');
            data.result.should.be.exactly('allow');
            data.doorKey.should.be.exactly('door');

            data.location.should.be.instanceof(Array).and.have.lengthOf(2);
            data.location[0].should.be.exactly(139.766181);
            data.location[1].should.be.exactly(35.700808);

            done();
          }
        });

      });
  });

  it('デバイスによる成功テスト', function (done) {
    request(app)
      .post('/door/post.json')
      .set('Accept-Language', 'ja')
      .send({
        device_token: 'opentoken1',
        location_id: 'door'
      })
      .auth('test', 'test')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        logger.info(res.body);
        res.body.should.be.instanceof(Object);
        res.body.result.should.be.exactly(0);
        res.body.message.should.be.exactly('opentest1 opentest1さんの通過を確認しました。');

        // mongoにデータが入っていることの確認
        PassHistory.findOne({deviceToken: 'opentoken1'}, {}, {sort: {timestamp: -1}}, function (err, data) {
          if (err) {
            logger.error(err);
          } else {
            data.type.should.be.exactly('unknown');
            data.openEvent.should.be.exactly('mobile');
            data.result.should.be.exactly('allow');
            data.doorKey.should.be.exactly('door');
            should.exist(data.door);
            should.not.exist(data.location);
            done();
          }
        });
      });
  });

  it('デバイスによる成功テスト(pass_type、lat、lngあり)', function (done) {
    request(app)
      .post('/door/post.json')
      .set('Accept-Language', 'ja')
      .send({
        device_token: 'opentoken1',
        location_id: 'door',
        pass_type: '2',
        lat: '139.763393',
        lng: '35.690394'
      })
      .auth('test', 'test')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        logger.info(res.body);
        res.body.should.be.instanceof(Object);
        res.body.result.should.be.exactly(0);
        res.body.message.should.be.exactly('opentest1 opentest1さんの通過を確認しました。');

        // mongoにデータが入っていることの確認
        PassHistory.findOne({deviceToken: 'opentoken1'}, {}, {sort: {timestamp: -1}}, function (err, data) {
          if (err) {
            logger.error(err);
          } else {
            data.type.should.be.exactly('leave');
            data.result.should.be.exactly('allow');
            data.doorKey.should.be.exactly('door');
            data.openEvent.should.be.exactly('mobile');
            should.exist(data.door);

            data.location.should.be.instanceof(Array).and.have.lengthOf(2);
            data.location[0].should.be.exactly(35.690394);
            data.location[1].should.be.exactly(139.763393);

            done();
          }
        });

      });
  });

  it('デバイスによる成功テスト(location_idなし)', function (done) {
    request(app)
      .post('/door/post.json')
      .set('Accept-Language', 'ja')
      .send({
        device_token: 'opentoken1',
        pass_type: '2',
        lat: '139.763393',
        lng: '35.690394'
      })
      .auth('test', 'test')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        logger.info(res.body);
        res.body.should.be.instanceof(Object);
        res.body.result.should.be.exactly(0);
        res.body.message.should.be.exactly('opentest1 opentest1さんの通過を確認しました。');

        // mongoにデータが入っていることの確認
        PassHistory.findOne({deviceToken: 'opentoken1'}, {}, {sort: {timestamp: -1}}, function (err, data) {
          if (err) {
            logger.error(err);
          } else {
            data.type.should.be.exactly('leave');
            data.result.should.be.exactly('allow');
            data.openEvent.should.be.exactly('mobile');
            should.not.exist(data.door);

            data.location.should.be.instanceof(Array).and.have.lengthOf(2);
            data.location[0].should.be.exactly(35.690394);
            data.location[1].should.be.exactly(139.763393);

            done();
          }
        });
      });
  });

  it('存在しないドアを開けようとするテスト', function (done) {
    request(app)
      .post('/door/post.json')
      .set('Accept-Language', 'ja')
      .send({
        device_token: 'opentoken1',
        location_id: 'unknown'
      })
      .auth('test', 'test')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        logger.info(res.body);
        res.body.should.be.instanceof(Object);
        res.body.result.should.be.exactly(0);
        res.body.message.should.be.exactly('opentest1 opentest1さんの通過を確認しました。');

        // mongoにデータが入っていることの確認
        PassHistory.findOne({deviceToken: 'opentoken1'}, {}, {sort: {timestamp: -1}}, function (err, data) {
          if (err)  return done(err);

          data.type.should.be.exactly('unknown');
          data.result.should.be.exactly('allow');
          data.openEvent.should.be.exactly('mobile');
          data.doorKey.should.be.exactly('unknown');
          should.not.exist(data.door);
          done();
        });
      });
  });

  it('デバイスによる無効ユーザテスト', function (done) {
    request(app)
      .post('/door/post.json')
      .set('Accept-Language', 'ja')
      .send({
        device_token: 'opentoken2',
        location_id: 'door'
      })
      .auth('test', 'test')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        logger.info(res.body);
        res.body.should.be.instanceof(Object);
        res.body.result.should.be.exactly(1);
        res.body.message.should.be.exactly('デバイスまたはユーザが登録されていません。');

        // mongoにデータが入っていることの確認
        PassHistory.findOne({deviceToken: 'opentoken2'}, {}, {sort: {timestamp: -1}}, function (err, data) {
          if (err) {
            logger.error(err);
          } else {
            data.type.should.be.exactly('unknown');
            data.openEvent.should.be.exactly('mobile');
            data.result.should.be.exactly('deny');
            should.exist(data.door);
            data.doorKey.should.be.exactly('door');
            should.not.exist(data.location);
            done();
          }
        });

      });
  });

  it('NFCによる成功テスト', function (done) {
    request(app)
      .post('/door/post.json')
      .set('Accept-Language', 'ja')
      .send({
        pass_type: '1',
        device_token: 'nfc-device-token',
        location_id: 'door',
        nfc: 'abcdefg12345',
      })
      .auth('test', 'test')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        logger.info(res.body);
        res.body.should.be.instanceof(Object);
        res.body.result.should.be.exactly(0);
        res.body.message.should.be.exactly('opentest1 opentest1さんの通過を確認しました。');

        // mongoにデータが入っていることの確認
        PassHistory.findOne({deviceToken: 'nfc-device-token', nfcNumber: 'abcdefg12345', openEvent: 'nfc'}, {}, {sort: {timestamp: -1}}, function (err, data) {
          if (err) {
            logger.error(err);
          } else {
            data.type.should.be.exactly('enter');
            data.openEvent.should.be.exactly('nfc');
            data.result.should.be.exactly('allow');
            data.doorKey.should.be.exactly('door');
            should.exist(data.door);
            data.nfcNumber.should.be.exactly('abcdefg12345');
            should.not.exist(data.location);
            done();
          }
        });
      });
  });

  it('NFCによる無効ユーザテスト', function (done) {
    request(app)
      .post('/door/post.json')
      .set('Accept-Language', 'ja')
      .send({
        device_token: 'nfc-device-token',
        location_id: 'door',
        nfc: 'hijklmn67890'
      })
      .auth('test', 'test')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        logger.info(res.body);
        res.body.should.be.instanceof(Object);
        res.body.result.should.be.exactly(1);
        res.body.message.should.be.exactly('NFCまたはユーザが登録されていません。');

        // mongoにデータが入っていることの確認
        PassHistory.findOne({deviceToken: 'nfc-device-token', nfcNumber: 'hijklmn67890', openEvent: 'nfc'}, {}, {sort: {timestamp: -1}}, function (err, data) {
          if (err) {
            logger.error(err);
          } else {
            data.type.should.be.exactly('unknown');
            data.openEvent.should.be.exactly('nfc');
            data.result.should.be.exactly('deny');
            data.doorKey.should.be.exactly('door');
            should.exist(data.door);
            data.nfcNumber.should.be.exactly('hijklmn67890');
            should.not.exist(data.location);
            done();
          }
        });
      });
  });


});
