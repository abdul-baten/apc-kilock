'use strict';

var app = require('../../../server/app'),
  _ = require('lodash'),
  mongoose = require('mongoose'),
  async = require('async'),
  testdata = require('../../utils/testdata'),
  logger = log4js.getLogger(),
  User = mongoose.model('User'),
  FamilyUser = mongoose.model('FamilyUser'),
  Role = mongoose.model('Role');

describe('model User', function () {

  before(function (done) {
    testdata.truncate(
      function(){
        async.series([
            function (callback) {
              var role1 = new Role({name: 'test role1'});

              role1.save(callback);
            },
            function (callback) {
              var role2 = new Role({name: 'test role2'});
              //role2.save(callback);
              role2.save(function (err, role) {
                var sm = role.shouldMail;
                sm.should.be.exactly(false);
                callback(err, role2);
              });

            },
            function (callback) {
              var role3 = new Role({name: '生徒'});
              //role3.save(callback);
              role3.save(function (err, role) {
                var sm = role.shouldMail;
                sm.should.be.exactly(true);
                callback(err, role3);
              });
            },
          ],
          function (err) {
            if (err) done(err);

            done();
          });
      });
  });

  it('User作成', function (done) {

    var insertFamilyUserWithUser = function (user, callback) {
      var family = [
        {name: 'とーちゃん', mail: 'daddy@example.com', mailActivated: false, tokenPath: 'token0', tokenExpiration: new Date(), user: user},
        {name: 'かーちゃん', mail: 'mammy@example.com', mailActivated: true, tokenPath: 'token1', tokenExpiration: new Date(), user:user},
      ];

      var savedFamilyUser = [];
      var block = function (err, idx) {
        if (err || family.length <= idx) {
          callback(err, savedFamilyUser);
          return;
        }
        var familyUser = new FamilyUser(family[idx]);
        familyUser.save(function (err, familyUser) {
          savedFamilyUser.push(familyUser);
          block(err, idx + 1);
        });
      };

      block(null, 0);
    };

    async.waterfall([
      function (callback) {
        Role.find({}).exec(callback);
      },
      function (roles, callback) {
        var user = User({
          name: '試験太郎',
          login: 'login',
          admin: true,
          doorOpen: true,
          enabled: true,
          sourcename: 'source name',
          sourcetype: 'source type',
          source: {id: 62},
          roles: roles,
        });

        //user.save(callback);
        //WTF!!
        user.save(function (err, user) {
          callback(err, user);
        });
      },
      function (user, callback) {
        insertFamilyUserWithUser(user, function (err, family) {
          if (err) {
            callback(err);
            return;
          }
          user.family = family;
          user.save(callback);
        });
      },
    ], function (err, result) {
      if (err) done(err);

      result.name.should.be.exactly('試験太郎');
      result.login.should.be.exactly('login');
      result.admin.should.be.exactly(true);
      result.doorOpen.should.be.exactly(true);
      result.enabled.should.be.exactly(true);
      result.sourcename.should.be.exactly('source name');
      result.sourcetype.should.be.exactly('source type');
      result.source.id.should.be.exactly(62);
      result.roles.length.should.be.exactly(3);
      result.family.length.should.be.exactly(2);

      User.findOne({id: result.id})
        .populate('roles')
//        .populate('family')
        .exec(function (err, user) {
          if (err) done(err);

//          user.populated('family').length.should.be.exactly(2);

          user.roles.length.should.be.exactly(3);
          var shouldMail = _.some(user.roles, function (role) {
            return role.shouldMail;
          });
          shouldMail.should.be.exactly(true);

          user.family.length.should.be.exactly(2);
          user.retrieveMailRecipients(function (err, recipients) {
            if (err) done(err);

            recipients.length.should.be.exactly(1);
            recipients[0].name.should.be.exactly('かーちゃん');
            recipients[0].address.should.be.exactly('mammy@example.com');

            done();
          });
        });
    });
  });

});
