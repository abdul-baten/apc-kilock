'use strict';

var fs = require('fs');
var url = require('url');
var path = require('path');
var _ = require('lodash');

function requiredProcessEnv(name) {
  if (!process.env[name]) {
    throw new Error('You must set the ' + name + ' environment variable');
  }
  return process.env[name];
}

// All configurations will extend these options
// ============================================
var all = {
  env: process.env.NODE_ENV,

  // Root path of server
  root: path.normalize(__dirname + '/../../..'),

  // Server IP
  ip: process.env.OPENSHIFT_NODEJS_IP ||
    process.env.IP ||
    undefined,

  port: {
    // Server port
    web: process.env.OPENSHIFT_NODEJS_PORT ||
      process.env.PORT ||
      undefined,
    // WebSocket Server port
    websocket: process.env.OPENSHIFT_NODEJS_PORT ||
      process.env.WEBSOCKET_PORT ||
      process.env.PORT ||
      undefined
  },

  mongo: {
    uri: process.env.MONGOLAB_URI ||
      process.env.MONGOHQ_URL ||
      process.env.MONGODB_URL ||
      undefined,
    options: {
      db: {
        safe: true
      }
    }
  },

  redis: {
    uri: process.env.REDISTOGO_URL ||
      process.env.REDISCLOUD_URL ||
      process.env.REDIS_URL ||
      undefined,
    options: {
      no_ready_check: true
    },
  },

  rootOrganizationPath: process.env.ORGANIZATION_PATH || undefined,

  session: {
    sessionSecret: 'VAL69NzzQK7pm6WH',
    cookieSecret: 'xTyswBSH9AsL8uAm',
    secure: process.env.HTTPS_OPTIONS_KEY && process.env.HTTPS_OPTIONS_CERT,
    maxAge: 86400000
  },

  authentication: {
    cas: {
      baseUrl: process.env.CAS_BASE_URL,
      service: process.env.CAS_SERVICE || process.env.CALLBACK_BASE_URL,
      sourceName: process.env.CAS_SOURCE_NAME || 'cas',
    },
    google: {
      clientID: process.env.GOOGLE_ID,
      clientSecret: process.env.GOOGLE_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL ||
        process.env.CALLBACK_BASE_URL ? url.resolve(process.env.CALLBACK_BASE_URL, '/auth/google/callback') : undefined,
      sourceName: process.env.GOOGLE_SOURCE_NAME || 'google',
    },
    twitter: {
      clientID: process.env.TWITTER_ID,
      clientSecret: process.env.TWITTER_SECRET,
      callbackURL: process.env.TWITTER_CALLBACK_URL ||
        process.env.CALLBACK_BASE_URL ? url.resolve(process.env.CALLBACK_BASE_URL, '/auth/twitter/callback') : undefined,
      sourceName: process.env.TWITTER_SOURCE_NAME || 'twitter',
    },
    facebook: {
      clientID: process.env.FACEBOOK_ID,
      clientSecret: process.env.FACEBOOK_SECRET,
      callbackURL: process.env.FACEBOOK_CALLBACK_URL ||
        process.env.CALLBACK_BASE_URL ? url.resolve(process.env.CALLBACK_BASE_URL, '/auth/facebook/callback') : undefined,
      sourceName: process.env.FACEBOOK_SOURCE_NAME || 'facebook',
    },
    github: {
      clientID: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK_URL ||
        process.env.CALLBACK_BASE_URL ? url.resolve(process.env.CALLBACK_BASE_URL, '/auth/github/callback') : undefined,
      sourceName: process.env.GITHUB_SOURCE_NAME || 'github',
    },
    salesforce: {
      username: process.env.SALESFORCE_USER,
      password: process.env.SALESFORCE_PASSWORD,
      clientID: process.env.SALESFORCE_CLIENT_ID,
      clientSecret: process.env.SALESFORCE_CLIENT_SECRET,
      url: process.env.SALESFORCE_URL,
      hostname: process.env.SALESFORCE_HOSTNAME,
      tokenPath: '/services/oauth2/token',
      sourceName: process.env.SALESFORCE_SOURCE_NAME || 'salesforce',
    }
  },

  // LOG_OUTPUT_DIRがない場合はconsole
  log4js: {
    appenders: process.env.LOG_OUTPUT_DIR ? [{
        type: 'file',
        filename: path.join(
          process.env.LOG_OUTPUT_DIR,
          'application.log'),
        maxLogSize: 10485760,
        backups: 10,
        category: '[default]',
      },
      {
        type: 'file',
        filename: path.join(
          process.env.LOG_OUTPUT_DIR,
          'express.log'),
        maxLogSize: 10485760,
        backups: 5,
        category: 'express',
      },
      {
        type: 'file',
        filename: path.join(
          process.env.LOG_OUTPUT_DIR,
          'websocket.log'),
        maxLogSize: 10485760,
        backups: 5,
        category: 'websocket',
      },
    ] : [{
      type: 'console'
    }, ],
    levels: {
      '[default]': process.env.LOGGER_LEVEL_DEFAULT ||
        process.env.LOGGER_LEVEL ||
        'INFO',
      'express': process.env.LOGGER_LEVEL_EXPRESS ||
        process.env.LOGGER_LEVEL ||
        'INFO',
      'websocket': process.env.LOGGER_LEVEL_WEBSOCKET ||
        process.env.LOGGER_LEVEL ||
        'INFO',
    },
  },

  basicAuth: {
    data: {
      username: 'test',
      password: 'test',
    },
    door: {
      username: 'test',
      password: 'test',
    },
    external: {
      username: 'test',
      password: 'test',
    },
  },

  express: {
    mode: process.env.EXPRESS_MODE || 'server',
    logger: 'morgan'
  },

  mailer: process.env.ENABLE_MAILER ? {
    kue: {
      prefix: 'q',
      redis: undefined,
    },
    queueName: 'unlock-mail',
    recieveDomain: process.env.MAIL_RECIEVE_DOMAIN || undefined
  } : undefined,

  // 同期関連
  // 同期対象から外すソース名の配列
  ignoreSyncSources: process.env.IGNORE_SYNC_SOURCES ? process.env.IGNORE_SYNC_SOURCES.split(',') : [],
  // 最短同期時間(秒)
  syncMinimumSecond: 600,

  faviconName: process.env.FAVICON_NAME || 'default.ico',
  familyRegistrationUrl: process.env.FAMILY_REGISTRATION_URL || undefined,

  // JSTで3時 UTCで18時(-6時)
  futofftimehour: -9,
  // +9:00(JST)
  timeoffset: 9,
  maxNumberOfDevicesPerUser: 5,
  mailTemplateEditor: {
    maxTextLength: 500,
  },
  defaultLocale: 'en',
  defaultSipUri: 'sip:%d@202.218.8.231',
  httpsOptions: process.env.HTTPS_OPTIONS_KEY && process.env.HTTPS_OPTIONS_CERT ? {
    key: fs.readFileSync(process.env.HTTPS_OPTIONS_KEY),
    cert: fs.readFileSync(process.env.HTTPS_OPTIONS_CERT),
  } : null,
  // ドア開けを有効にするかどうか
  doorOpenEnabled: process.env.DOOR_OPEN || false,

  // 出退勤メールで送れてメールを送る許容時間(分)
  maxDelayMinutes4PassHistoryMail: 60,

  // 試験的な機能を使用するかどうか
  pilotFunctions: process.env.PILOT_FUNCTIONS,

  workReportApi: {
    url: process.env.WORKREPORT_API_URL || 'http://user:pass@localhost/kilock/work_report',
    //  url: url.resolve(process.env.WORKREPORT_API_URL || 'http://user:pass@localhost/'),
  },

  workReportCsv: {
    url: process.env.WORKREPORT_CSV_URL || 'http://user:pass@localhost/kilock/work_report.csv',
    //  url: url.resolve(process.env.WORKREPORT_CSV_URL || 'http://localhost/'),
  },

  clientDirectory: 'public',

  // 勤務日内に含める24時以降のUnixtime
  offsetInDayTimestamp: 10800000,

  // 日勤勤務者の1日分の勤務時間
  dayWorkerHour: 7.5,

  // 夜勤勤務者の日付をまたいだ2日分の勤務時間
  nightWorkerHour: 15,

  // 勤務者の早出勤基準時間
  workEarlyHour: 1,

  // 勤務報告書種別
  reportTypes: [
    0, // APC
    1, // NEC
    2, // NECS1
    3, // NECS2
  ],

  // 勤怠情報を fixedとするまでの、月初めからの営業日数
  fixedStatusWorkDays: 4,

  // 丸め分
  roundMinutes: 15,

  // SalesForce
  salesforceApi: {
    projectApiPath: '/services/apexrest/project',
    personnelApiPath: '/services/apexrest/personnel',
  },

  // 検索時に選択可能な年の現在年より過去の年数
  yearSelectBefore: 3,

  // 交通費の最大経路数
  travelCostRoutesLimit: 5,

  // 勤務表入力完了に必要な法定休日日数
  requireLegalHolidays: 4,

  // 勤務表ステータス
  attendanceStatuses: {
    'no_application': 0, // 未申請
    'denegated': 1, // 否認
    'applicating': 2, // 申請中
    'accepted_middle': 3, // 中間承認済
    'accepted_better': 4, // 上長承認済
    'accepted_top': 5, // 総務確定済
  },

  // 勤務表ステータス更新アクション
  attendanceActions: {
    'applicate': 0, // 入力・修正
    'accept_middle': 1, // 中間承認
    'denegate_middle': 2, // 中間否認
    'accept_better': 3, // 上長承認
    'denegate_better': 4, // 上長否認
    'accept_top': 5, // 総務確定
    'denegate_top': 6, // 総務否認
    'revert_top': 7, // 総務確定差戻し
  },

  // 勤怠権限
  attendancePermissions: {
    'middle': 1, // 中間承認/否認権限
    'better': 2, // 上長承認/否認権限
    'top': 3, // 総務確定/否認権限
  },

  // 交通費-区分
  travelCostTypes: {
    '電車': 1,
    'バス': 2,
    'タクシー': 3,
    '宿泊': 4,
    'その他': 5,
  },

  // 交通費-目的
  travelCostPurposes: {
    '客先会議': 1,
    '現場業務': 2,
    '本社会議': 3,
    '深夜帰宅': 4,
    '通勤': 5,
    '研修': 6,
    '健康診断': 7,
    '社内イベント': 8,
    //  '出張交通費':   9,
    'その他': 10
  },

  // 交通費 用語説明-区分
  travelCostTypeCommentList: [{
      name: '電車',
      comment: 'JR線、私鉄各線、地下鉄、モノレール　など'
    },
    {
      name: 'バス',
      comment: '都バス、市バス　など'
    },
    {
      name: 'タクシー',
      comment: 'タクシー　<br /><span class="text-danger"><strong>※領収書添付</strong></span>'
    },
    {
      name: '宿泊',
      comment: '出張以外で宿泊をした場合　<br /><span class="text-danger"><strong>※領収書添付</strong></span>'
    },
    {
      name: 'その他',
      comment: '上記以外の公共交通機関など　<br /><span class="text-danger"><strong>※領収書添付</strong></span>'
    },
  ],

  // 交通費 用語説明-目的
  travelCostPurposeCommentList: [{
      name: '客先会議',
      comment: 'お客様先での打ち合わせ（帰宅含む）'
    },
    {
      name: '現場業務',
      comment: 'お客様先での作業（帰宅含む）'
    },
    {
      name: '本社会議',
      comment: '本社業務（社内会議、査定FB　等で帰宅含む）'
    },
    {
      name: '深夜帰宅',
      comment: '業務により通常の交通機関で帰宅できない場合のタクシー、深夜バス等'
    },
    {
      name: '通勤',
      comment: '通勤経路変更などにより定期券を未購入のため切符通勤した場合等'
    },
    {
      name: '研修',
      comment: '業務扱いの研修で発生した移動費用（帰宅含む）'
    },
    {
      name: '健康診断',
      comment: '定期健康診断・深夜業健康診断及び、その再検査での移動費用（帰宅含む）'
    },
    {
      name: '社内イベント',
      comment: '業務扱いの会社行事での移動費用（帰宅含む）'
    },
    {
      name: 'その他',
      comment: '上記に当てはまらない目的の移動（必ず備考欄に理由を記載）'
    },
  ],

  // 交通費 用語説明-経路
  travelCostRouteCommentList: [{
    name: '',
    comment: '<span class="text-danger"><strong>通勤定期区間外の</strong></span>始点から終点までの経路（乗り換え駅を含む）を手入力してください。'
  }, ],

  // 交通費 用語説明-金額
  travelCostAmountCommentList: [{
    name: '',
    comment: '経路に対応する金額を入力してください。'
  }, ],
};

// Export the config object based on the NODE_ENV
// ==============================================
module.exports = _.merge(
  all,
  require('./' + process.env.NODE_ENV + '.js') || {});
