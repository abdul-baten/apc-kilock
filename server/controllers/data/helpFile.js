'use strict';

var config = require('../../config/environment');
var _ = require('lodash');
var logger = log4js.getLogger();
var fs = require('fs');
var async = require('async');
var multer = require('multer');
//var redisutil = require('../../utils/redisutil');
var mongoose = require('mongoose');
var Helpfile = mongoose.model('Helpfile');

var dstPath = './storage/help';

var storage = multer.diskStorage({
  filename: function(req, file, callback) {
    callback(null, file.originalname);
  },
  destination: function(req, file, callback) {
    callback(null, dstPath);
  }
})
var upload = multer({storage: storage}).single('file');
var redisKeyName = 'helpfilename';
var redisKeyData = 'helpfiledata';

exports.get = function (req, res) {
  Helpfile.findOne({}, function(err, file) {
    if (err) {
      logger.error(err);
      res.status(500);
      return res.json({});
    }
    if (file == null) {
      return res.json({
        filename: '',
        data:     null,
      })
    }
    return res.json({
      filename: file.filename,
      data:     file.data,
    })
  });
};

exports.post = function (req, res) {
  fs.readdir(dstPath, function(err, files) {
    if (err) {
      logger.error(err)
      res.status(500);
      return res.json({})
    }

    async.each(files, function(file, callback) {
      fs.unlink(dstPath + '/' + file, callback);
    }, function(err) {
      if (err) {
        logger.error(err)
        res.status(500);
        return res.json({})
      }

      upload(req, res, function (err) {
        if (err) {
          logger.error(err)
          res.status(500);
          return res.json({})
        }
        fs.readdir(dstPath, function(err, files) {
          fs.readFile(dstPath + '/' + files[0], function(err, data) {
            Helpfile.remove({}, function(err) {
              var file = new Helpfile();
              file.filename = files[0];
              file.data = data;
              file.save(function(err, file) {
                return res.json({})
              });
            });
          });
        });
      });
    });
  });
};
