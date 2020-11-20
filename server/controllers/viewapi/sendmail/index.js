'use strict';

var express = require('express');
var controller = require('./sendmail.controller');
var auth = require('../../../auth/auth.service');

var router = express.Router();

// テンプレート取得
router.get('/template.json', auth.login(), controller.getTemplate);
router.post('/group.json', auth.login(), controller.sendGroupMail);

module.exports = router;
