var
  mongoose = require('mongoose'),
  mysql = require('mysql'),
  async = require('async'),
  events = require('events'),
  express = require('express'),
  http = require('http'),
  util = require('util'),
  app = express(),

  User = require('./models/User'),
  Group = require('./models/Group'),
  Survey = require('./models/Survey'),
  Result = require('./models/Result'),

  emitter = new events.EventEmitter();

app.configure(function () {
  app.use(express.logger({ format: '\x1b[1m:method\x1b[0m \x1b[33m:url\x1b[0m :response-time ms' }));
  app.use(express.static(__dirname + '/public'));
  app.use(express.bodyParser());
  app.set('views', __dirname + '/templates');
  app.set('view engine', 'jade');
});

var server = http.createServer(app).listen(3000, function(){
      console.log('\r\n Express server running at http://localhost:3000/');
    }),
    io = require('socket.io').listen(server, { log: false });

app.get('/', function (req, res) {
  res.render('index');
});

app.post('/index', function (req, res) {
  res.end();
  dbConnect(req.body, function () {
    emitter.emit('mes', 'connected to DBs');
  });
});

io.sockets.on('connection', function (socket) {
  console.log('client connected');
  socket.on('disconnect', function () {
    console.log('client disconnected');
    emitter.removeAllListeners(['mes']);
    emitter.removeAllListeners(['end']);
    emitter.removeAllListeners(['err']);
    emitter.removeAllListeners(['progress']);
  });
  emitter.on('mes', function (message) {
    socket.emit('mes', message);
  });
  emitter.on('end', function (message) {
    socket.emit('end', message);
  });
  emitter.on('err', function (message) {
    socket.emit('err', message);
  });
  emitter.on('progress', function (message) {
    socket.emit('progress', message);
  });
});

var conn,
  usersColl = {},
  groupsColl = {},
  survColl = {},
  countr = 1,
  prcOld = 0;

function sendProgress (total) {
  var percent = Math.ceil(countr / total * 100);
  if (countr == total) {
    percent = 0;
    countr = 1;
    prcOld = 0;
    return;
  }
  countr++;
  if (percent > prcOld) {
    prcOld = percent;
    emitter.emit('progress', percent);
    //console.log(percent);
  }
}

var GetMysqlGroups = function(){
  var q = 'SELECT g.id, g.group_name, u.username FROM `ndg_group` AS g JOIN `ndg_user` AS u ON u.id = g.ndg_user_id';
    conn.query(q, function (err, results) {
        if(err) {
            console.log(err);
            emitter.emit('err', util.inspect(err,{ depth: null}));
            return;
        } else {
          async.each(results, function (grp, callback) {
            new Group ({
              name: grp.group_name,
              _owner: usersColl[grp.username]._id
            }).save(function (err, group) {
              if(err) {
                console.log(err);
                emitter.emit('err', util.inspect(err,{ depth: null}));
                return;
              }
              groupsColl[grp.id] = group._id;
              sendProgress(results.length);
              callback();
            });
          }, function () {
            console.log('groups created');
            emitter.emit('mes', 'groups created');
            emitter.emit('setGroups');
          });
        }   
    });
};

var GetMysqlUsers = function () {
  var q = [
   " SELECT u.username,",
     " 'password' AS `password`,",
     " IF (u.first_name IS NOT NULL AND u.first_name <> '', u.first_name, 'missing') AS firstName,",
     " IF (u.last_name IS NOT NULL AND u.last_name <> '', u.last_name, 'missing') AS lastName,",
     " IF (u.email IS NOT NULL AND u.email <> '', u.email, 'missing') AS email,",
     " IF (LENGTH(CAST(REPLACE(u.phone_number, ' ', '') AS SIGNED)) >= 10, CAST(REPLACE(u.phone_number, ' ', '') AS SIGNED), 2222222222) AS phone,",
     " u.validation_key AS activatedCode,",
     " IF (u.user_validated = 'Y', TRUE, FALSE) AS activated,",
     " u.user_admin,",
     " u.ndg_group_id,",
     " CASE ur.ndg_role_role_name",
       " WHEN 'Super Admin' THEN 'superAdmin'",
       " WHEN 'Admin' THEN 'admin'",
       " WHEN 'Operator' THEN 'operator'",
       " WHEN 'Field Worker' THEN 'fieldWorker'",
     " END AS permission,",
     " com.company_name AS company,",
     " IF (com.company_industry IS NOT NULL AND com.company_industry <> '', com.company_industry, 'missing') AS industry,",
     " com.company_country AS country",
   " FROM ndg_user AS u",
    " JOIN user_role AS ur ON ur.username = u.username",
    " JOIN company AS com ON com.id = u.company_id",
  ].join("\n");

  conn.query(q, function (err, usrs) {
    if(err) {
      console.log(err);
      emitter.emit('err', util.inspect(err,{ depth: null}));
      return;
    }
    async.each(usrs, function (usr, callback) {
        if (usr.user_admin == usr.username) {
          usr.permission = 'superAdmin';
        }
        new User(usr).save(function(err, user) {
          if(err) {
            console.log(err);
            emitter.emit('err', util.inspect(err,{ depth: null}));
            return;
          }
          user.ndg_group_id = usr.ndg_group_id;
          user.user_admin = usr.user_admin;
          usersColl[user.username] = user;

          sendProgress(usrs.length);
          callback();
        })
      }, function () {
          console.log('users created');
          emitter.emit('mes', 'users created');
          emitter.emit('setOwners');
      }
    )
  });
};

function setOwners () {
  User.find(function(err, users) {
    if (err) {
      console.log(err);
      emitter.emit('err', util.inspect(err,{ depth: null}));
      return;
    }
    async.each(users, function (user, callback) {
      var _ownerName = usersColl[user.username].user_admin;
      user._owner = usersColl[_ownerName] ? usersColl[_ownerName]._id : user._id;
      usersColl[user.username]._owner = user._owner;
      user.save(function (err, usr) {
        if (err) {
          console.log(err);
          emitter.emit('err', util.inspect(err,{ depth: null}));
          return;
        }
        sendProgress(users.length);
        callback();
      })
    }, function () {
      console.log('users _owner set');
      emitter.emit('mes', 'users _owner set');
      emitter.emit('createGroups');
    });
  })
}

function setGroups () {
  var usrsArr = Object.keys(usersColl);
  async.each(usrsArr, function (username, callback) {
    var user = usersColl[username];
    if (!user.ndg_group_id) {
      sendProgress(usrsArr.length);
      callback();
      return
    }
    User.findOne({username: user.username}, function (err, usr) {
      if (err) {
        console.log(err);
        emitter.emit('err', util.inspect(err,{ depth: null}));
        return;
      }
      usr._group = groupsColl[user.ndg_group_id];
      usr.save(function (err, usr) {
        if (err) {
          console.log(err);
          emitter.emit('err', util.inspect(err,{ depth: null}));
          return;
        }
        sendProgress(usrsArr.length);
        callback();
      });
    })
  }, function () {
    console.log('to user set _group');
    emitter.emit('mes', 'to user set _group');
    emitter.emit('GetMysqlSurveys');
  });
};

var GetMysqlSurveys = function () {
  var q = ['SELECT s.id, s.available , s.survey_id, s.title, s.upload_date, u.username',
      'FROM `survey` AS s',
      'JOIN `ndg_user` AS u ON u.id = s.ndg_user_id'
    ].join("\n");
  conn.query(q, function (err, sresults) {
    if (err) {
      console.log(err);
      emitter.emit('err', util.inspect(err,{ depth: null}));
      return;
    } else {
      if (sresults.length) {
        async.each(sresults, function (survey, sCallback) {
          survey._categories = [];
          conn.query('SELECT * FROM category WHERE survey_id = ?', survey.id, function (err, ctgrs) {
            if(err) {
              console.log(err);
              emitter.emit('err', util.inspect(err,{ depth: null}));
              return;
            } else {
              var q = [
                'SELECT  q.id,',
                  "q.constraint_text,",
                  'q.label,',
                  "q.object_name,",
                  "q.relevant,",
                  "q.required,",
                  "t.type_name as type,",
                  "d.text_data AS default_value",
                "FROM question AS q",
                  "JOIN `question_type` AS t ON t.id = q.question_type_id",
                  "JOIN `default_answer` AS d ON d.id = q.default_answer_id",
                "WHERE q.category_id = ?",
              ].join("\n");
              async.each(ctgrs, function( ctgr, ctgCallback) {
                conn.query(q, ctgr.id, function (err, qsts) {
                  if(err) {
                    console.log(err);
                    emitter.emit('err', util.inspect(err,{ depth: null}));
                    return;
                  }
                  ctgr._questions = [];
                  async.each(qsts, function ( qst, qstCallback) {
                    conn.query('SELECT * FROM question_option WHERE question_id = ?', qst.id, function (err, opts) {
                      if(err) {
                        console.log(err);
                        emitter.emit('err', util.inspect(err,{ depth: null}));
                        return;
                      }
                      qst.items = opts.map(function(item) {
                        return {
                          text: item.label,
                          value: item.option_value,
                        }
                      });
                      if (qst.default_value.length) {
                        qst.defaultValue = qst.default_value;
                      }
                      qst.tagName = qst.type;
                      switch (qst.type) {
                        case 'select1':
                          qst.tagName = 'select1';
                          break;
                        case 'select':
                          qst.tagName = 'select';
                          break;
                        case 'binary#image':
                          qst.tagName = 'upload';
                          qst.mediatype = 'image';
                          break;
                        default:
                          qst.tagName = 'input';
                      }
                      qst.id = qst.object_name;
                      qst.constraint = qst.constraint_text;
                      qst.required = qst.required == 0 ? false : true ;
                      ctgr._questions.push(qst);
                      qstCallback();
                    });
                  }, function () {
                    ctgr.title = ctgr.label;
                    ctgr.id = ctgr.object_name;
                    survey._categories.push(ctgr);
                    ctgCallback();
                  });
                })
              }, function () {
                  var usr = usersColl[survey.username]
                  survey._owner = usr._owner;
                  survey._creator = usr;
                  survey.dateCreated = survey.upload_date;
                  survey.published = survey.available == 1 ? true : false;
                  new Survey(survey).save(function (err, srv) {
                    if(err) {
                      console.log(err);
                      emitter.emit('err', util.inspect(err,{ depth: null}));
                      return;
                    }
                    survColl[survey.id] = srv;
                    sendProgress(sresults.length);
                    sCallback();
                  })
              })
            }
          })
        }, function () {
          console.log('surveys created');
          emitter.emit('mes', 'surveys created');
          emitter.emit('GetMysqlResults');
        })
      }
    }   
  });
};

var GetMysqlResults = function(){
  var q = [
    "SELECT  r.id,",
      "r.end_time,",
      "r.latitude,",
      "r.longitude,",
      "r.ndg_result_id,",
      "r.start_time,",
      'r.title,',
      "r.ndg_user_id,",
      "r.survey_id,",
      "r.date_sent,",
      "u.username",
    "FROM ndg_result AS r",
    "JOIN ndg_user AS u ON u.id = r.ndg_user_id"
  ].join("\n");
  conn.query(q, function (err, results) {
    if (err) {
      console.log(err);
      emitter.emit('err', util.inspect(err,{ depth: null}));
      return;
    } else {
      if (results.length) {
        async.each(results, function (reslt, callback) {
          reslt._user = usersColl[reslt.username]._id;
          reslt._owner = usersColl[reslt.username]._owner;
          reslt._survey = survColl[reslt.survey_id]._id;
          reslt.timeEnd = reslt.end_time;
          reslt.timeStart = reslt.start_time;
          if (reslt.date_sent) {
            reslt.timeCreated = reslt.date_sent;
          }
          if (reslt.latitude && reslt.longitude) {
            reslt.geostamp = reslt.latitude + ' ' + reslt.longitude;
          }
          reslt._categoryResults = survColl[reslt.survey_id]._categories.map(function (item) {
            return {
              id : item.id,
              _questionResults: item._questions.map(function (quest) {
                return {
                  id : quest.id
                }
              })
            }
          });
          var q = [
            'SELECT a.text_data, c.object_name AS cat_id, q.object_name AS quest_id',
            'FROM answer AS a',
            '    JOIN question AS q ON a.question_id = q.id',
            '    JOIN category AS c ON q.category_id = c.id',
            'WHERE ndg_result_id = ?'
          ].join("\n");
          conn.query(q, reslt.id, function (err, answs) {
            if(err) {
              console.log(err);
              emitter.emit('err', util.inspect(err,{ depth: null}));
              return;
            }
            answs.forEach(function (answer) {
              reslt._categoryResults.filter(function (catRes) {
                return catRes.id == answer.cat_id;
              }).forEach(function (catRes) {
                catRes._questionResults.filter(function (qstRes) {
                  return qstRes.id == answer.quest_id;
                }).forEach(function (qstRes) {
                  qstRes.result = answer.text_data;
                });
              });
            });
            new Result(reslt).save(function (err, res) {
              if(err) {
                console.log(err);
                emitter.emit('err', util.inspect(err,{ depth: null}));
                return;
              }
              sendProgress(results.length);
              
              callback();
            })
          });
        }, function () {
          console.log('results created');
          emitter.emit('mes', 'results created');
          emitter.emit('setResultsCount');
        });
      }
    }
  })
};

function setResultsCount () {
  Survey.find(function (err, surveys) {
    if (err) {
      console.log(err);
      emitter.emit('err', util.inspect(err,{ depth: null}));
      return;
    }
    async.each(surveys, function (survey, callback) {
      Result.find({_survey: survey._id}, function (err, results) {
        if (err) {
          console.log(err);
          emitter.emit('err', util.inspect(err,{ depth: null}));
          return;
        }
        if (results.length) {
          survey.resultsCount = results.length;
          survey.save(function (err) {
            if (err) {
              console.log(err);
              emitter.emit('err', util.inspect(err,{ depth: null}));
              return;
            }
            sendProgress(surveys.length);
            callback();
          })
        } else {
          sendProgress(surveys.length);
          callback();
        }
      })
    }, function () {
      console.log('survey resultsCount set');
      emitter.emit('mes', 'survey resultsCount set');
      emitter.emit('finish');
    })
  })
}

function finish() {
  mongoose.connection.close();
  conn.end();
  emitter.emit('end', 'successfully completed');
  console.log('\n successfully completed')
}

function __log__(fn) {
  return function () {
    conn.__log__();
    fn();
  };
}

emitter.on('finish', __log__(finish));
emitter.on('setResultsCount', __log__(setResultsCount));
emitter.on('GetMysqlResults', __log__(GetMysqlResults));
emitter.on('GetMysqlSurveys', __log__(GetMysqlSurveys));
emitter.on('setOwners', __log__(setOwners));
emitter.on('setGroups', __log__(setGroups));
emitter.on('createGroups', __log__(GetMysqlGroups));

function dbConnect(config, cb) {
  mongoose.connect(config.mongodbUrl, function (err) {// mongodb://127.0.0.1:27017/migrator
    if (err) {
      console.log(err);
      emitter.emit('err', util.inspect(err,{ depth: null}));
      return;
    }

    mongoose.connection.db.executeDbCommand({dropDatabase:1});
    //mongoose.connection.db.dropDatabase();
    console.log('\r\n Connected to MongoDb v.' + mongoose.version);
    conn = mysql.createConnection({
      host     : config.msqlHost,//localhost
      password : config.msqlPass,
      user: config.msqlUser,// 'root',
      database: config.database,// 'codezon_ndg_ng'
    });
    conn.connect(function(err) {
      if (err) {
        emitter.emit('err', util.inspect(err,{ depth: null}));
        console.error('error connecting: ' + err.stack);
        mongoose.connection.close();
        return;
      }
      console.log('\r\n Connected to MsqlDb');
      cb();

      (function () {
        var _old = conn.query, cnt = 0;
        conn.query = function () {
          cnt++;
          _old.apply(conn, arguments);
        };
        conn.__log__ = function () {
          console.log('Num of MySql queries:', cnt);
          cnt = 0;
        };
      }());

      GetMysqlUsers();
    });
  });
}
