'use strict';

var should = require('should'),
  app = require('../../server/app'),
  mongoose = require('mongoose'),
  logger = log4js.getLogger(),
  testdata = require('../utils/testdata'),
  async = require('async'),
  request = require('supertest');

describe('GET /data/users.json', function() {

 it('should respond with JSON array', function(done) {
   request(app)
     .get('/data/users.json?unit=1')
     .auth('test', 'test')
     .set('Accept-Language', 'ja')
     .expect(200)
     .expect('Content-Type', /json/)
     .end(function(err, res) {
       if (err) return done(err);
       res.body.should.be.instanceof(Object);
       // TODO 値のテスト
       done();
     });
 });
});

describe('POST /data/pass_histories.json', function () {
  var Device = mongoose.model('Device');
  var User = mongoose.model('User');
  var Nfc = mongoose.model('Nfc');
  var PassHistory = mongoose.model('PassHistory');

  before(function (done) {
    async.series([
      // データリセット
      testdata.truncate,
      function (callback) {
        var user = new User({
          name: 'opentest2 opentest2',
          login: 'opentest2',
          enabled: false,
          extensionPhoneNumber: 200,
          devices: [],
          nfcs: [],
          sourcename: 'local',
          sourcetype: 'local',
          source: { type: 'local' },
          mail: 'TMZ8Z73rbqrXXfpk@gmail.com',
        });
        user.save(function (err, user) {
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
              async.each([
                new Nfc({
                  number: 'hijklmn67890',
                  user: user,
                }),
                new Nfc({
                  number: 'opqrstu12345',
                  user: user,
                })
              ], function (nfc, done) {
                nfc.save(done);
              }, next);
            },
          }, function (err, result) {
            if (err) {
              callback(err);
            } else {
              user.devices = [result.devices[0]];
              user.nfcs = result.nfcs;
              user.save(callback);
            }
          });
        });
      },
      function (callback) {
        var device = new Device({
          token: 'opentoken3',
          name: 'openname3',
          type: 'nfc',
        });
        device.save(callback);
      },
    ], function (err) {
      if (err) {
        logger.error(err);
      }
      done(err);
    });
  });

  it('通過成功テスト', function (done) {
    request(app)
      .post('/data/pass_histories.json')
      .set('Accept-Language', 'ja')
      .send({
        unit: '1',
        type: 'nfc',
        timestamp: '1400202000001',
        data: '[{ "pass_type":"1", "nfc": "hijklmn67890", "timestamp": 1400202000000, "lat" : 139.763393 , "lng" : 35.690394},' +
          '{ "pass_type": "2", "nfc": "hijklmn67890", "timestamp": 1400202000000, "lat" : 20 , "lng" : 10} ]'
      })
      .auth('test', 'test')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        res.body.should.be.instanceof(Object);

        async.series([
            function (callback) {
              PassHistory.findOne({nfcNumber: 'hijklmn67890', type: 'leave'}, {}, {sort: {timestamp: -1}}, function (err, data) {
                if (err) return callback(err, null);
                if (data === null) return callback("data not found", null);

                data.openEvent.should.be.exactly('nfc');
                data.result.should.be.exactly('allow');
                should.not.exist(data.doorKey);

                data.location.should.be.instanceof(Array).and.have.lengthOf(2);
                data.location[0].should.be.exactly(10);
                data.location[1].should.be.exactly(20);

                callback(null, null);
              });
            },
            function (callback) {
              PassHistory.findOne({nfcNumber: 'hijklmn67890', type: 'enter'}, {}, {sort: {timestamp: -1}}, function (err, data) {
                if (err) return callback(err, null);
                if (data === null) return callback("data not found", null);
                data.openEvent.should.be.exactly('nfc');
                data.result.should.be.exactly('allow');
                should.not.exist(data.doorKey);

                data.location.should.be.instanceof(Array).and.have.lengthOf(2);
                data.location[0].should.be.exactly(35.690394);
                data.location[1].should.be.exactly(139.763393);

                callback(null, null);
              });
            }
          ], function (err, results) {
            if (err) return done(err);
          }
        );

        done();
      });
  });


  it('通過成功テスト(lat,lngなし)', function (done) {
    request(app)
      .post('/data/pass_histories.json')
      .set('Accept-Language', 'ja')
      .send({
        unit: '1',
        type: 'nfc',
        timestamp: '1400202000001',
        data: '[{ "pass_type":1, "nfc": "opqrstu12345", "timestamp": 1400203000002 },' +
          '{ "nfc": "opqrstu12345", "timestamp": 1400203000002} ]'

      })
      .auth('test', 'test')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        res.body.should.be.instanceof(Object);

        async.series([
          function (callback) {
            PassHistory.findOne({nfcNumber: 'opqrstu12345', type: 'enter'}, {}, {sort: {timestamp: -1}}, function (err, data) {
              if (err) return callback(err, null);
              if (data === null) return callback("data not found", null);

              data.openEvent.should.be.exactly('nfc');
              data.result.should.be.exactly('allow');
              should.not.exist(data.door);
              should.not.exist(data.location);

              callback(null, null);
            });
          },
          function (callback) {
            PassHistory.findOne({nfcNumber: 'opqrstu12345', type: 'unknown'}, {}, {sort: {timestamp: -1}}, function (err, data) {
              if (err) return callback(err, null);
              if (data === null) return callback("data not found", null);

              data.openEvent.should.be.exactly('nfc');
              data.result.should.be.exactly('allow');
              should.not.exist(data.door);
              should.not.exist(data.location);
              callback(null, null);
            });
          }
        ], function (err, results) {
          if (err) return done(err);
        });

        done();
      });
  });

  it('通過成功テスト(nfc未登録)', function (done) {

    this.timeout(3000);
    request(app)
      .post('/data/pass_histories.json')
      .set('Accept-Language', 'ja')
      .send({
        unit: '1',
        type: 'nfc',
        timestamp: '1400202000001',
        data: '[{ "pass_type":1, "nfc": "testnfc", "timestamp": 1400204000000, "lat" : 139.763393 , "lng" : 35.690394},' +
          '{ "pass_type": 2, "nfc": "testnfc", "timestamp": 1400204000000, "lat" : 20 , "lng" : 10} ]'
      })
      .auth('test', 'test')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        res.body.should.be.instanceof(Object);

        async.series([
          function (callback) {
            PassHistory.findOne({nfcNumber: 'testnfc', type: 'leave'}, {}, {sort: {timestamp: -1}}, function (err, data) {
              if (err) return callback(err, null);
              if (data === null) return callback("data not found", null);

              data.openEvent.should.be.exactly('nfc');
              data.result.should.be.exactly('allow');
              should.not.exist(data.doorKey);
              should.not.exist(data.nfc);

              data.location.should.be.instanceof(Array).and.have.lengthOf(2);
              data.location[0].should.be.exactly(10);
              data.location[1].should.be.exactly(20);

              callback(null, null);
            });
          },
          function (callback) {
            PassHistory.findOne({nfcNumber: 'testnfc', type: 'enter'}, {}, {sort: {timestamp: -1}}, function (err, data) {
              if (err) return callback(err, null);
              if (data === null) return callback("data not found", null);

              data.openEvent.should.be.exactly('nfc');
              data.result.should.be.exactly('allow');
              should.not.exist(data.doorKey);
              should.not.exist(data.nfc);

              data.location.should.be.instanceof(Array).and.have.lengthOf(2);
              data.location[0].should.be.exactly(35.690394);
              data.location[1].should.be.exactly(139.763393);

              callback(null, null);
            });
          }
        ], function (err, results) {
          if (err) return done(err);
        });
      });

    done();
  });

  it('通過成功テスト兼地理空間インデックスを用いた検索', function (done) {
    request(app)
      .post('/data/pass_histories.json')
      .set('Accept-Language', 'ja')
      .send({
        unit: '1',
        type: 'nfc',
        timestamp: '1400202000001',
        data: '[{ "pass_type":1, "nfc": "hijklmn67890", "timestamp": 1400205000000, "lat" : 35.690394, "lng" : 139.763393}]'
      })
      .auth('test', 'test')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        res.body.should.be.instanceof(Object);

        PassHistory.findOne({location: {$near :[139.767233 ,35.700198], $maxDistance: 2}}, {}, {sort: {timestamp: -1}}, function (err, data) {
          if (err) {
            logger.error(err);
            done(err);
          } else {
            if(data === null) return done("data is null");

            data.type.should.be.exactly('enter');
            data.openEvent.should.be.exactly('nfc');
            data.result.should.be.exactly('allow');
            should.not.exist(data.doorKey);

            data.location.should.be.instanceof(Array).and.have.lengthOf(2);
            data.location[0].should.be.exactly(139.763393);
            data.location[1].should.be.exactly(35.690394);

            done();
          }
        });

      });
  });

  it('通過失敗テスト(pass_type,lat,lngの値が不正)', function (done) {
    request(app)
      .post('/data/pass_histories.json')
      .set('Accept-Language', 'ja')
      .send({
        unit: '1',
        type: 'nfc',
        timestamp: '1400202000001',
        data: '[{ "pass_type":5, "nfc": "hijklmn67890", "timestamp": 1400202000002, "lat": "test", "lng": "test1" } ]'

      })
      .auth('test', 'test')
      .expect(400)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);

        res.body.should.be.instanceof(Object);
        res.body.message.should.be.exactly('不正な形式のデータです');
        res.body.result.should.be.exactly(1);

        done();
      });
  });

  it('通過失敗テスト(lat,lngのうちlatのみ存在)', function (done) {
    request(app)
      .post('/data/pass_histories.json')
      .set('Accept-Language', 'ja')
      .send({
        unit: '1',
        type: 'nfc',
        timestamp: '1400202000001',
        data: '[{ "nfc": "hijklmn67890", "timestamp": 1400202000002, "lat": 10.11  } ]'

      })
      .auth('test', 'test')
      .expect(400)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        res.body.should.be.instanceof(Object);
        res.body.message.should.be.exactly('不正な形式のデータです');
        res.body.result.should.be.exactly(1);

        done();
      });
  });

  it('通過失敗テスト(lat,lngのうちlngのみ存在)', function (done) {
    request(app)
      .post('/data/pass_histories.json')
      .set('Accept-Language', 'ja')
      .send({
        unit: '1',
        type: 'nfc',
        timestamp: '1400202000001',
        data: '[{ "nfc": "hijklmn67890", "timestamp": 1400202000002, "lng": 10.11 } ]'

      })
      .auth('test', 'test')
      .expect(400)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        res.body.should.be.instanceof(Object);
        res.body.message.should.be.exactly('不正な形式のデータです');
        res.body.result.should.be.exactly(1);

        done();
      });
  });
});

describe('GET /data/alive.json', function () {

  it('should respond with JSON array', function (done) {
    request(app)
      .get('/data/alive.json')
      .auth('test', 'test')
      .set('Accept-Language', 'ja')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (err, res) {
        if (err) return done(err);
        res.body.should.be.instanceof(Object);
        // TODO 値のテスト
        done();
      });
  });
});
