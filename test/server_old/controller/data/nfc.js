'use strict';

var should = require('should'),
  app = require('../../../../server/app'),
  mongoose = require('mongoose'),
  logger = log4js.getLogger(),
  _ = require('lodash'),
  testdata = require('../../../utils/testdata'),
  async = require('async'),
  Device = mongoose.model('Device'),
  User = mongoose.model('User'),
  Nfc = mongoose.model('Nfc'),
  request = require('supertest');

describe('POST /data/users.json', function () {

  // DBの初期化、テストデータの登録を行う。
  before(function (done) {
    var createUser = function (id, name, login, mail) {
      var user = new User({
        id: id,
        name: name,
        login: login,
        enabled: false,
        extensionPhoneNumber: 200,
        devices: [],
        nfcs: [],
        sourcename: 'local',
        sourcetype: 'local',
        source: { type: 'local' },
        mail: mail
      });

      return user;
    };

    testdata.truncate(function () {
      var user1 = createUser(1, 'testuser1', 'testuser1', 'testuser1@ap-com.co.jp');
      var user2 = createUser(2, 'testuser2', 'testuser2', 'testuser2@ap-com.co.jp');

      async.parallel(
        [
          function (parallelDone) {
            user1.save(function (err, user) {
              if (err) {
                parallelDone(err);
              } else {
                var nfc = new Nfc({
                  number: 'hijklmn67890',
                  user: user,
                });
                nfc.save(parallelDone);
              }
            });
          },
          function (parallelDone) {
            user2.save(function (err, user) {
              if (err) {
                parallelDone(err);
              } else {
                var nfc = new Nfc({
                  number: 'tempcard1',
                  user: user,
                  temp: true
                });
                nfc.save(parallelDone);
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
    });
  });

  /**
   * NFCが登録されているか、データが意図したように登録されているか確認を行う。
   * @param {string} nfcNumber NFCタグの番号
   * @param {Integer} userId NFCに紐づくユーザのID
   * @param {Boolean} temp 仮発行フラグ
   * @param {Function} callback ユニットテスト完了時に実行するコールバック
   */
  var isNfcExist = function (tagNumber, userId, temp, callback) {
    Nfc.findOne({number: tagNumber}).populate('user').exec(function (err, nfc) {
      should.not.exist(err);

      nfc.number.should.be.exactly(tagNumber);
      nfc.temp.should.be.exactly(temp);
      nfc.user.id.should.be.exactly(userId);
      callback();
    });

  };

  it('ユーザ1にNFC1を登録(正常:tempなし)', function (done) {
    var tagNumber = 'nfctest0001';

    request(app)
      .post('/data/nfc.json')
      .set('Accept-Language', 'ja')
      .send({
        id: 1,
        tag: tagNumber,
      })
      .auth('test', 'test')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        should.not.exist(err);
        res.body.result.should.be.exactly(0);

        isNfcExist(tagNumber, 1, false, done);
      });
  });

  it('ユーザ2にNFC2を登録(正常:temp=false)', function (done) {
    var tagNumber = 'nfctest0002';

    request(app)
      .post('/data/nfc.json')
      .set('Accept-Language', 'ja')
      .send({
        id: 2,
        tag: tagNumber,
        temp: false
      })
      .auth('test', 'test')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        should.not.exist(err);
        res.body.result.should.be.exactly(0);

        isNfcExist(tagNumber, 2, false, done);
      });
  });


  it('ユーザ1にNFC3を登録(正常:temp=true)', function (done) {
    var tagNumber = 'nfctest0003';

    request(app)
      .post('/data/nfc.json')
      .set('Accept-Language', 'ja')
      .send({
        id: 1,
        tag: tagNumber,
        temp: true
      })
      .auth('test', 'test')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        should.not.exist(err);
        res.body.result.should.be.exactly(0);

        isNfcExist(tagNumber, 1, true, done);
      });
  });

  it('ユーザ2にNFC3を登録(仮発行を上書き)', function (done) {
    var tagNumber = 'nfctest0003';

    request(app)
      .post('/data/nfc.json')
      .set('Accept-Language', 'ja')
      .send({
        id: 2,
        tag: tagNumber,
        temp: false,
      })
      .auth('test', 'test')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);

        res.body.result.should.be.exactly(0);

        User.findOne({id: 1}).populate('nfcs').exec(function (err, user) {
          should.not.exist(err);
          var nfc = _.find(user.nfcs, function (nfc) {
            return nfc.number === tagNumber;
          });

          should.not.exist(nfc);
          isNfcExist(tagNumber, 2, false, done);
        });
      });
  });

  it('バリデーションチェック(異常:param[temp]が不正値)', function (done) {
    var tagNumber = 'nfctest0001';

    request(app)
      .post('/data/nfc.json')
      .set('Accept-Language', 'ja')
      .send({
        id: 1,
        tag: tagNumber,
        temp: 'test'
      })
      .auth('test', 'test')
      .expect(400)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        should.not.exist(err);
        res.body.result.should.be.exactly(1);
        res.body.message.should.be.exactly('バリデートエラー');
        done();
      });
  });

  it('ユーザ1にNFC1を登録(正常:登録済み)', function (done) {
    var tagNumber = 'nfctest0001';

    request(app)
      .post('/data/nfc.json')
      .set('Accept-Language', 'ja')
      .send({
        id: 1,
        tag: tagNumber,
      })
      .auth('test', 'test')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        should.not.exist(err);
        res.body.result.should.be.exactly(0);

        isNfcExist(tagNumber, 1, false, done);
      });
  });

  it('ユーザ2に登録されている仮NFC1を本登録(正常)', function (done) {
    var tagNumber = 'tempcard1';

    request(app)
      .post('/data/nfc.json')
      .set('Accept-Language', 'ja')
      .send({
        id: 2,
        tag: tagNumber,
      })
      .auth('test', 'test')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        should.not.exist(err);
        res.body.result.should.be.exactly(0);

        isNfcExist(tagNumber, 2, false, done);
      });
  });

  it('ユーザ1にNFC1を仮登録(異常:登録済み)', function (done) {
    var tagNumber = 'nfctest0001';

    request(app)
      .post('/data/nfc.json')
      .set('Accept-Language', 'ja')
      .send({
        id: 1,
        tag: tagNumber,
        temp: true
      })
      .auth('test', 'test')
      .expect(400)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        should.not.exist(err);
        res.body.result.should.be.exactly(1);

        isNfcExist(tagNumber, 1, false, done);
      });
  });


  it('ユーザ2にNFC1を登録(異常:重複登録)', function (done) {
    var tagNumber = 'nfctest0001';

    request(app)
      .post('/data/nfc.json')
      .set('Accept-Language', 'ja')
      .send({
        id: 2,
        tag: tagNumber,
        temp: false
      })
      .auth('test', 'test')
      .expect(400)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        res.body.result.should.be.exactly(1);
        res.body.message.should.be.exactly('他のユーザが使用中のNFC');
        done();
      });
  });

  it('ユーザ2にNFC1を登録(異常:重複登録)', function (done) {
    var tagNumber = 'nfctest0001';

    request(app)
      .post('/data/nfc.json')
      .set('Accept-Language', 'ja')
      .send({
        id: 2,
        tag: tagNumber,
        temp: false
      })
      .auth('test', 'test')
      .expect(400)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        res.body.result.should.be.exactly(1);
        res.body.message.should.be.exactly('他のユーザが使用中のNFC');
        done();
      });
  });

});


