'use strict';

var should = require('should');
var customValidator = require('../../../server/utils/validator')();
var logger = log4js.getLogger();

describe('validator', function() {
  it('validator', function(done) {
    customValidator.isJpMobileEmail('da.me..@docomo.ne.jp').should.be.exactly(true);
    customValidator.isJpMobileEmail('da.me..@ezweb.ne.jp').should.be.exactly(true);
    customValidator.isJpMobileEmail('da.me..@softbank.ne.jp').should.be.exactly(true);
    customValidator.isJpMobileEmail('da.me..@i.softbank.ne.jp').should.be.exactly(true);
    customValidator.isJpMobileEmail('da.me..@disney.ne.jp').should.be.exactly(true);
    customValidator.isJpMobileEmail('da.me..@d.vodafone.ne.jp').should.be.exactly(true);
    customValidator.isJpMobileEmail('da.me..@.softbank.ne.jp').should.be.exactly(false);
    customValidator.isJpMobileEmail('da.me..@example.com').should.be.exactly(false);
    done();
  });
});
