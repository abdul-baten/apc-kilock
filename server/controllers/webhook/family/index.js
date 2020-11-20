'use strict';

var express = require('express');
var auth = require('../../../auth/auth.service');
var controller = require('./family.controller.js');

var router = express.Router();

// メールアドレス登録用トークン作成
router.post('/', controller.webhookReciever);
// Mandrill Inboundの
router.head('/', controller.webhookReciever);

module.exports = router;
