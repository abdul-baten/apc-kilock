'use strict';

var express = require('express');
var controller = require('./groupTags.controller');
var auth = require('../../../auth/auth.service');

var router = express.Router();

router.get('/groupTags.json', auth.login(), controller.get);

module.exports = router;