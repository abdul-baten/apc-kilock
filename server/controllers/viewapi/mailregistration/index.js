'use strict';

var express = require('express');
var controller = require('./mailregistration.controller');
var tokenRegistrationController = require('./mailregistraitontoken.controller');
var auth = require('../../../auth/auth.service');

var router = express.Router();

// メールアドレス登録用トークン作成
router.post('/createRegistrationToken/:id', auth.login(), tokenRegistrationController.createToken);

router.post('/publish/:id', auth.login(), controller.publish);
//メールアドレス登録（認証の必要なし）
router.post('/register/:id/:uuid', controller.register);

// 全ユーザのメールアドレストークン作成（暫定）
router.get('/createRegistrationToken/bulk', auth.login(), tokenRegistrationController.bulk);

module.exports = router;
