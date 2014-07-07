var
  mandrill = require('mandrill-api/mandrill'),
  fs = require('fs'),
  jade = require('jade'),
  config = require('../config').config,
  tpl,
  from,
  mandrill_client = new mandrill.Mandrill(config.mail.mandrill_key);

tpl = function (templateName, locals) {
  var
    fileName = process.cwd() + '/templates/mail/' + templateName + '.jade',
    fn = jade.compile(fs.readFileSync(fileName, 'utf8'), {
      filename: fileName,
      pretty: true
    });

  locals = locals || {};
  locals.title = "New NDG password";

  return fn(locals);
};

exports.sendPassword = function (user) {
  var
    subject = 'Password',
    html = tpl('password', {
      subject: subject,
      user: user
    });
  
  var message = {
    "html": html,
    "subject": subject,
    "from_email": config.mail.from,
    "from_name": "NDG",
    "to": [{
            "email": user.email,
            "name": user.firstName + user.lastName
        }],
    "important": false,
    "track_opens": null,
    "track_clicks": null,
    "auto_text": null,
    "auto_html": null,
    "inline_css": null,
    "url_strip_qs": null,
    "preserve_recipients": null,
    "tracking_domain": null,
    "signing_domain": null
  };
  mandrill_client.messages.send(
    {"message": message},
    function(result) {
      //console.log(result);
    },
    function(e) {
      console.log('A mandrill error occurred: ' + e.name + ' - ' + e.message);
  });
};
