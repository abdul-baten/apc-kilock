'use strict';

var urlUtil = require('url');
var _ = require('lodash');
var util     = require('util');
var async    = require('async');
var logger   = log4js.getLogger();
var mongoose = require('mongoose');
var http     = require('http');
var https    = require('https');
var User     = mongoose.model('User');
var Group    = mongoose.model('Group');
var config   = require('../../config/environment');
var querystring = require('querystring');
var Project  = mongoose.model('Project');
var Personnel  = mongoose.model('Personnel');
var Sequence  = mongoose.model('Sequence');

var running;

module.exports = function (options, source) {
  var $this = this;
  var accessToken;
  var instanceUrl;

  if (running === true) {
    logger.info('salesforce synchronization is running.');
    this.sync = function () {};
    return;
  }

  running = true;
  logger.info('salesforce synchronization start.');

  this.sync = function (done) {
    // OAuth認証(パスワードタイプ)
    var queryString = querystring.stringify({
      grant_type:    'password',
      client_id:     config.authentication.salesforce.clientID,
      client_secret: config.authentication.salesforce.clientSecret,
      username:      config.authentication.salesforce.username,
      password:      config.authentication.salesforce.password,
    });

    var options = {
      hostname: config.authentication.salesforce.hostname,
      port: 443,
      path: config.authentication.salesforce.tokenPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': queryString.length
      },
    };

    var req = https.request(options, function(res) {
      res.setEncoding('utf8');
      var result = '';
      res.on('data', function (chunk) {
        result += chunk;
      });

      res.on('end', function () {
        var parsedResult;
        try {
          parsedResult = JSON.parse(result);

          if (parsedResult.error) {
            logger.error('Salesforce synchronization error.');
            logger.error(parsedResult);
            done();

          } else {
            accessToken = parsedResult.access_token;
            instanceUrl = parsedResult.instance_url;

            // ユーザ関連処理 エラーが起きた時点でログを出すのでエラーをコールバックさせない
            async.series([
              function(callback) {
                $this.syncProjects(callback);
              },
              function(callback) {
                $this.syncPersonnels(callback);
              },
              function(callback) {
                $this.syncGroupUsers(callback);
              },
            ], function (err) {
              running = false;
              logger.info('salesforce synchronization end.');
              if (err) {
                logger.error(err);
              }
              done();
            });
          }
        } catch (e) {
          running = false;
          done();
        }
      });
    });

    req.write(queryString);
    req.end();
  };

  /**
   * Project同期処理
   * @param register {Function} - 登録処理
   * @param callback {Function} - コールバック関数
   */
  this.syncProjects = function (callback) {
    var parsedUrl = convertUrl(instanceUrl + config.salesforceApi.projectApiPath);
    var protocol = parsedUrl.protocol;
    var protocolOptions = parsedUrl.protocolOptions;
    protocolOptions = _.clone(protocolOptions);
    $this.jsonApiGet(protocol, protocolOptions, function(err, results) {
      if (err) {
        return callback(err);
      }

      var expire = new Date(Date.now() - (30 * 60 * 1000));
      async.series([
        function (callback) {
          async.each(results, function (project, callback) {
            if (!project) {
              return callback();
            }
            $this.registProject(project, callback);
          }, callback);
        },
        function (callback) {
          // 同期されなかった(=30分以上同期されていない)グループを無効化
          Group.find({enabled: true, sourcename: source.name, synchronizedAt: {$lt: expire}})
            .exec(function(err, groups) {
              async.each(groups, function (group, done) {
                logger.info('無効化グループ:' + group.name);
                group.enabled = false;
                group.save(done);
              }, callback);
            });
        },
        function (callback) {
          // 同期されなかった(=30分以上同期されていない)プロジェクトを無効化
          Project.find({valid: true, synchronizedAt: {$lt: expire}})
            .exec(function(err, projects) {
              async.each(projects, function (project, done) {
                logger.info('無効化プロジェクト' + project.name);
                project.valid = false;
                project.save(done);
              }, callback);
            });
        },
      ], callback);
    });
  }

  function lcfirst(str) {
    str += '';
    var f = str.charAt(0).toLowerCase();
    return f + str.substr(1);
  }

  /**
   * SalesForce API の返却情報をモデルに格納可能な形式で取得する
   *
   * @param data {Object} - APIより取得したデータ
   * @param itemName {String} - 項目名
   * @param itemGroupName {String} - [任意]グルーピング名('__r'を除いた項目名)
   */
  var getItem = function(data, itemName, itemGroupName) {
    if (itemGroupName && data[itemGroupName]) {
      return data[itemGroupName][itemName] ? data[itemGroupName][itemName] : null;
    } else {
      return data[itemName] ? data[itemName] : null;
    }
  }

  /**
   * SalesForce API の返却情報のうち、グルーピングされている情報をモデルに格納可能な形式で取得する
   * グルーピングされている項目は、'__r'および'__c'がサフィックスとして付加されている項目
   *
   * @param data {Object} - APIより取得したデータ
   * @param itemGroupName {String} - グルーピング名('__r'を除いた項目名)
   * @param additionalItemNames {String} - [任意]追加取得項目名
   */
  var getItemGroup = function(data, itemGroupName, additionalItemNames) {
    var __c = data[itemGroupName + '__c'];
    var __r = data[itemGroupName + '__r'];

    var itemGroup = {
      id   : __c || null,
      name : null,
      url  : null,
    };

    if (!__r) {
      return itemGroup;
    }

    var attributes = __r.attributes;
    if (attributes) {
      itemGroup['url'] = attributes.url || null;
    }
    itemGroup['id']   = __r.Id || null;
    itemGroup['name'] = __r.Name || null;

    if (additionalItemNames) {
      for (var i in additionalItemNames) {
        var itemName = additionalItemNames[i];
        itemGroup[lcfirst(itemName)] = __r.itemName || null;
      }
    }

    return itemGroup;
  };

  /**
   * Project登録・更新処理
   * @param project {Object} - APIより取得したプロジェクト情報
   * @param callback {Function} - コールバック関数
   */
  this.registProject = function (project, callback) {
    Group.findOne({
      'source.projectId': project.Id,
    }, function(err, group) {
      if (!group) {
        var group = new Group({
          organization : null,
          displayOrder : 9999000,
        });
      }
      group.name = project.Name,
      group.enabled = true;
      group.sourcename = source.name;
      group.sourcetype = source.type;
      group.source = { projectId: project.Id };
      group.sourcedata = { projectId: project.Id };
      group.synchronizedAt = Date.now();
      group.save(function(err) {
        if (err) {
          logger.error(err);
          return callback(err);
        }
        var projectId = getItem(project, 'Id');
        Project.findOne({id: projectId}, function(err, docProject) {
          if (!docProject) {
            docProject = new Project({
              id: getItem(project, 'Id'),
            });
          }
          docProject.name       = getItem(project, 'Name');
          docProject.url        = getItem(project, 'url', ['attributes']);
          docProject.memberNum  = getItem(project, 'MemberNum__c');
          docProject.gm         = getItemGroup(project, 'GM');
          docProject.department = getItemGroup(project, 'Department');
          docProject.group      = group._id;
          docProject.valid      = getItem(project, 'Valid__c') || true;
          docProject.synchronizedAt = Date.now();
          docProject.save(function(err) {
            if (err) {
              logger.error(err);
              return callback(err);
            }
            callback();
          });
        });
      });
    });
  };

  /**
   * Personnel同期処理
   * @param register {Function} - 登録処理
   * @param callback {Function} - コールバック関数
   */
  this.syncPersonnels = function (callback) {
    var parsedUrl = convertUrl(instanceUrl + config.salesforceApi.personnelApiPath);
    var protocol = parsedUrl.protocol;
    var protocolOptions = parsedUrl.protocolOptions;
    protocolOptions = _.clone(protocolOptions);
    $this.jsonApiGet(protocol, protocolOptions, function(err, results) {
      if (err) {
        return callback(err);
      }

      var expire = new Date(Date.now() - (30 * 60 * 1000));
      async.series([
        function (callback) {
          async.each(results, function (personnel, callback) {
            if (personnel) {
              async.parallel([
                function(callback) {
                  $this.registPersonnel(personnel, callback);
                },
              ], function (err, results) {
                callback();
              });
            } else {
              callback();
            }
          }, callback);
        },
        function (callback) {
          // 同期されなかった(=30分以上同期されていない)ユーザを無効化
          User.find({
              enabled: true,
              sources: {
                $elemMatch: {
                  source: source,
                  synchronizedAt: {$lt: expire},
                },
              },
            })
            .exec(User.populateSource(function(err, users) {
              async.each(users, function (user, done) {
                logger.info('無効化ユーザ:' + user.login);
                user.removeSource(source);
                user.enabled = user.sources.length > 0;
                user.save(done);
              }, callback);
            }));
        },
        function (callback) {
          // 同期されなかった(=30分以上同期されていない)要員を無効化
          Personnel.find({valid: true, synchronizedAt: {$lt: expire}})
            .exec(function(err, personnels) {
              async.each(personnels, function (personnel, done) {
                logger.info('無効化要員' + personnel.name);
                personnel.valid = false;
                personnel.save(done);
              }, callback);
            });
        },
      ], callback);
    });
  }

  /**
   * Personnel登録・更新処理
   * @param personnel {Object} - APIより取得したプロジェクト情報
   * @param callback {Function} - コールバック関数
   */
  this.registPersonnel = function (personnel, callback) {
    async.parallel({
      project: function(callback) {
        var id = personnel.Project__c || (personnel.Project__r ? personnel.Project__r.Id || null : null);
        if (id) {
          Project.findOne({id: id}).exec(function(err, project) {
            callback(null, project);
          });
        } else {
          callback();
        }
      },
      user: function(callback) {
        var employeeCode = personnel.EmployeeNumber__c || null;
        if (employeeCode) {
          Sequence.findOne({name: 'users'}, {}, {}, function(err, sequence) {
            User.findOne({employeeCode: employeeCode}, function(err, user) {
              var id;
              if (user == null) {
                user = new User();
                id = sequence ? sequence.seq + 1 : 1;
              } else {
                id = user.id;
              }

              var name = personnel.Name || personnel.RealName__c;
              var mail = personnel.EmailAddress__c || null;

              user.login        = mail || employeeCode;
              user.name         = name;
              user.lastname     = name ? name.split(' ')[0] : '';
              user.firstname    = name ? name.split(' ')[1] : '';
              user.mail         = mail;
              user.employeeCode = employeeCode;
              user.enabled      = true;
              user.doorOpen     = true;
              user.displayOrder = 9999000;
              user.organization = source.organization;
              user.sourcename   = source.name;
              user.sourcetype   = source.type;
              user.source       = { id: id };
              user.sources = [{
                source: source,
                data: { id: id },
                primary: true,
                synchronizedAt: Date.now(),
              }];
              user.save(function(err) {
                callback(err, user);
              });
            });
          });
        } else {
          callback();
        }
      },
    }, function (err, results) {
      Personnel.findOneAndUpdate({id: getItem(personnel, 'Id')}, {$set: {
        id:                    getItem(personnel, 'Id'),
        url:                   getItem(personnel, 'url', ['attributes']),
        gmFlag:                getItem(personnel, 'GM_Flag__c') || false,
        mgrFlag:               getItem(personnel, 'MGR_Flag__c') || false,
        engineerLevel:         getItem(personnel, 'EngineerLevel__c'),
        skills:                getItem(personnel, 'Skills__c'),
        strap:                 getItem(personnel, 'Strap__c'),
        kana:                  getItem(personnel, 'Kana__c'),
        project:               results.project ? results.project._id : null,
        emailAddress:          getItem(personnel, 'EmailAddress__c'),
        familyAllowance:       getItemGroup(personnel, 'FamilyAllowance'),
        workableDate:          getItem(personnel, 'WorkableDate__c'),
        operationType:         getItem(personnel, 'OperationType__c'),
        seniority:             getItem(personnel, 'Seniority__c'),
        employmentType:        getItem(personnel, 'EmploymentType__c'),
        nearestStation:        getItem(personnel, 'NearestStation__c'),
        departmentManagerFlag: getItem(personnel, 'DepartmentManagerFlag__c') || false,
        divisionManager:       getItem(personnel, 'DivisionManager__c') || false,
        employeeNumber:        getItem(personnel, 'EmployeeNumber__c'),
        user:                  results.user ? results.user._id : null,
        department1:           getItem(personnel, 'Department1__c'),
        departmentRank1:       getItem(personnel, 'DepartmentRank1__c'),
        department2:           getItem(personnel, 'Department2__c'),
        departmentRank2:       getItem(personnel, 'DepartmentRank2__c'),
        department3:           getItem(personnel, 'Department3__c'),
        departmentRank3:       getItem(personnel, 'DepartmentRank3__c'),
        outsourcingCompany:    getItemGroup(personnel, 'OutsourcingCompany'),
        reference:             getItem(personnel, 'Reference__c'),
        duty:                  getItem(personnel, 'Duty__c'),
        sex:                   getItem(personnel, 'Sex__c'),
        birthday:              getItem(personnel, 'Birthday__c'),
        retirementDate:        getItem(personnel, 'RetirementDate__c'),
        seasonTicketPrice:     getItem(personnel, 'SeasonTicketPrice__c'),
        grade:                 getItemGroup(personnel, 'Grade'),
        employmentDate:        getItem(personnel, 'EmploymentDate__c'),
        age:                   getItem(personnel, 'Age__c'),
        comment:               getItem(personnel, 'Comment__c'),
        projectDepartmentManagerFlag__c: getItemGroup(personnel, 'Affiliated_Post') || false,
        name:                  getItem(personnel, 'Name'),
        position:              getItem(personnel, 'Position__c'),
        productCode:           getItem(personnel, 'ProductCode__c'),
        description:           getItem(personnel, 'Description__c'),
        valid:                 getItem(personnel, 'Valid__c') || true,
        synchronizedAt:        Date.now(),
      }}, {upsert:true}, function(err, personnel) {
        if (err) {
          logger.error(err);
        }
        callback(err);
      });
    });
  };

  /**
   * GroupUsers 同期処理
   * @param callback {Function} - コールバック関数
   */
  this.syncGroupUsers = function (callback) {
    Project.find({valid: true}).populate('group').exec(function(err, projects) {
      async.each(projects, function(project, callback) {

        if (project == null || project.group == null) {
          callback();
          return;
        }
        var group = project.group;
        group.users = [];
        Personnel.find({valid: true, project:project._id}, {}, {}, function(err, personnels) {
          async.each(personnels, function(personnel, callback) {
            group.users.push(personnel.user);
            callback();
          }, function(err, results) {
            group.save(callback);
          });
        });

      }, callback);
    });
  };

  /**
   * JsonAPIの結果を受け取る処理
   * @param protocol {Object} - http or https
   * @param protocolOptions {Object} - URLなどの情報
   * @param callback {Function} - コールバック関数 Jsonの結果が返る
   */
  this.jsonApiGet = function (protocol, protocolOptions, callback) {
    var req = protocol.get(protocolOptions, function (res) {
      res.setEncoding('utf8');
      var result = '';
      res.on('data', function (chunk) {
        result += chunk;
      });
      res.on('end', function () {
        var parsedResult;
        try {
          parsedResult = JSON.parse(result);
        } catch (e) {
          // JSONパース失敗
          return callback({error: e, target: result, protocolOptions: protocolOptions});
        }
        callback(null, parsedResult);
      });
    }).on('error', function (err) {
      callback(err);
    });
  };

  var convertUrl = function (url) {
    var parsedUrl = urlUtil.parse(url);
    var isHttps = parsedUrl.protocol && parsedUrl.protocol.indexOf('https') === 0;
    var protocol = isHttps ? https : http;
    return {
      protocol: protocol,
      protocolOptions: {
        host: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.path,
        method: 'GET',
        headers: {
          'Authorization': 'OAuth ' + accessToken,
        }
      }
    };
  };
};
