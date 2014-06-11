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
  msqlUsrs,
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
    conn.query('SELECT * FROM ndg_group', function (err, results) {
        if(err) {
            console.log(err);
            emitter.emit('err', util.inspect(err,{ depth: null}));
            return;
        } else {
          async.each(results, function (grp, callback) {
            conn.query('SELECT username FROM ndg_user WHERE id = ?', grp.ndg_user_id, function (err, user) {
              if(err) {
                console.log(err);
                emitter.emit('err', util.inspect(err,{ depth: null}));
                return;
              } else {
                User.findOne({username: user[0].username}, function (err, user) {
                  if(err) {
                    console.log(err);
                    emitter.emit('err', util.inspect(err,{ depth: null}));
                    return;
                  } else {
                    
                    new Group ({
                      name: grp.group_name,
                      _owner: user
                    }).save(function (err, group) {
                      if(err) {
                        console.log(err);
                        emitter.emit('err', util.inspect(err,{ depth: null}));
                        return;
                      } else {
                        groupsColl[grp.id] = group._id;
                        sendProgress(results.length);
                        callback();
                      }
                    })
                  }
                });
              }
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
  conn.query('SELECT * FROM ndg_user', function (err, usrs) {
    if(err) {
      console.log(err);
      emitter.emit('err', util.inspect(err,{ depth: null}));
      return;
    } else {
      if(usrs.length){
        msqlUsrs = usrs;
        async.each(usrs, function (usr, callback) {
          usr.password = 'password';
          usr.firstName = usr.first_name || 'missing';
          usr.lastName = usr.last_name || 'missing';
          usr.activatedCode = usr.validation_key;
          usr.activated = usr.user_validated == 'Y' ? true : false;
          if (isNaN(parseInt(usr.phone_number)) || parseInt(usr.phone_number).toString().length < 10) {
            usr.phone = 2222222222;
          } else {
            usr.phone = usr.phone_number;
          }
          async.parallel([
            function (cb) {
              conn.query('SELECT ndg_role_role_name FROM user_role WHERE username = ?',usr.username, function (err, role) {
                if(err) {
                  cb(err);
                  return;
                } else {
                  var role = role[0].ndg_role_role_name,
                  roles = {
                    'Super Admin':'superAdmin',
                    'Admin':'admin',
                    'Operator':'operator',
                    'Field Worker':'fieldWorker'
                  };
                  usr.permission = roles[role];
                  if (usr.user_admin == usr.username) {
                    usr.permission = 'superAdmin';
                  }
                  cb(null);
                }
              })
            },

            function (cb) {
              conn.query('SELECT * FROM company WHERE id = ?', usr.company_id, function (err, company) {
                if(err) {
                  cb(err);
                  return;
                } else {
                  usr.company = (company[0].company_name);
                  usr.industry = (company[0].company_industry) || 'missing';
                  usr.country = (company[0].company_country);
                  cb(null);
                }
              })
            }
          ], function (err, res) {
            if(err) {
              console.log(err);
              emitter.emit('err', util.inspect(err,{ depth: null}));
              return;
            } else {
              var user = new User(usr);
              user.save(function(err, usr) {
                if(err) {
                  console.log(err);
                  emitter.emit('err', util.inspect(err,{ depth: null}));
                  return;
                }
                var username = usr.username;
                usersColl[username] = usr;

                sendProgress(usrs.length);
                callback();
              })
            }
          })
        }, function () {
          console.log('users created');
          emitter.emit('mes', 'users created');
          emitter.emit('setOwners');
        })
      }
    }   
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
      conn.query('SELECT user_admin FROM ndg_user WHERE username = ?', user.username, function (err, owner) {
        if (err) {
          console.log(err);
          emitter.emit('err', util.inspect(err,{ depth: null}));
          return;
        }

        user._owner = usersColl[owner[0].user_admin] ? usersColl[owner[0].user_admin]._id : user._id;
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
      })
    }, function () {
      console.log('users _owner set');
      emitter.emit('mes', 'users _owner set');
      emitter.emit('createGroups');
    });
  })
}

function setGroups () {
  async.each(msqlUsrs, function (user, callback) {
    if (!user.ndg_group_id) {
      sendProgress(msqlUsrs.length);
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
      usr.save(function (err) {
        if (err) {
          console.log(err);
          emitter.emit('err', util.inspect(err,{ depth: null}));
          return;
        }
        sendProgress(msqlUsrs.length);
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
  conn.query('SELECT * FROM survey', function (err, sresults) {
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
              async.each(ctgrs, function( ctgr, ctgCallback) {
                conn.query('SELECT * FROM question WHERE category_id = ?', ctgr.id, function (err, qsts) {
                  if(err) {
                    console.log(err);
                    emitter.emit('err', util.inspect(err,{ depth: null}));
                    return;
                  } else {
                    ctgr._questions = [];
                    async.each(qsts, function ( qst, qstCallback) {
                      async.parallel([
                        function (cb) {
                          conn.query('SELECT * FROM question_option WHERE question_id = ?', qst.id, function (err, opts) {
                            if(err) {
                              console.log(err);
                              emitter.emit('err', util.inspect(err,{ depth: null}));
                              return;
                            } else {
                              qst.items = opts.map(function(item) {
                                return {
                                  text: item.label,
                                  value: item.option_value,
                                }
                              });
                            }
                            cb(null);
                          });
                        },

                        function (cb) {
                          if (qst.default_answer_id) {
                            conn.query('SELECT text_data FROM default_answer WHERE id = ?', qst.default_answer_id, function (err, answr) {
                              if(err) {
                                console.log(err);
                                emitter.emit('err', util.inspect(err,{ depth: null}));
                                return;
                              } else {
                                if (answr[0].text_data.length) {
                                  qst.defaultValue = answr[0].text_data;
                                }
                                cb(null);
                              }
                            });                        
                          } else {
                            cb(null);
                          }
                        },

                        function (cb) {
                          conn.query('SELECT type_name FROM question_type WHERE id = ?', qst.question_type_id, function (err, type) {
                            if(err) {
                              console.log(err);
                              emitter.emit('err', util.inspect(err,{ depth: null}));
                              return;
                            }
                            qst.type = type[0].type_name;
                            qst.tagName = type[0].type_name;
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
                            cb(null);
                          });
                        }
                      ], function (err, results) {
                        if(err) {
                          console.log(err);
                          emitter.emit('err', util.inspect(err,{ depth: null}));
                          return;
                        } else {
                          qst.id = qst.object_name;
                          qst.constraint = qst.constraint_text;
                          qst.required = qst.required == 0 ? false : true ;
                          ctgr._questions.push(qst);
                          qstCallback();
                        }
                      })
                    }, function () {
                      ctgr.title = ctgr.label;
                      ctgr.id = ctgr.object_name;
                      survey._categories.push(ctgr);
                      ctgCallback();
                    });
                  }
                })
              }, function () {
                conn.query('SELECT username FROM ndg_user WHERE id = ?', survey.ndg_user_id, function (err, user) {
                  if (err) {
                    console.log(err);
                    emitter.emit('err', util.inspect(err,{ depth: null}));
                    return;
                  }
                  User.findOne({username: user[0].username}, function (err, usr) {
                    if (err) {
                      console.log(err);
                      emitter.emit('err', util.inspect(err,{ depth: null}));
                      return;
                    }
                    if (usr) {                      
                      survey._owner = usr._owner;
                      survey._creator = usr;
                    }
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
  conn.query('SELECT * FROM ndg_result', function (err, results) {
    if (err) {
      console.log(err);
      emitter.emit('err', util.inspect(err,{ depth: null}));
      return;
    } else {
      if (results.length) {
        async.each(results, function (reslt, callback) {
          async.waterfall([
            function (cb) {
              conn.query('SELECT username FROM ndg_user WHERE id = ?', reslt.ndg_user_id, function (err, usr) {
                if(err) {
                  console.log(err);
                  emitter.emit('err', util.inspect(err,{ depth: null}));
                  return;
                }
                reslt._user = usersColl[usr[0].username]._id;
                reslt._owner = usersColl[usr[0].username]._owner;
                cb();
              })
            },

            function (cb) {
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
                if (!answs.length) {
                  return cb();
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
                cb();
              });
            }
          ], function () {
            new Result(reslt).save(function (err, res) {
              if(err) {
                console.log(err);
                emitter.emit('err', util.inspect(err,{ depth: null}));
                return;
              }
              sendProgress(results.length);
              
              callback();
            })
          })
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
