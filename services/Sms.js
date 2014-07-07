var
  Configuration = require('../config').config,
  twilioClient;

if (Configuration.twilio.accountSid && Configuration.twilio.authToken && Configuration.twilio.phoneNumber) {
  twilioClient = require('twilio')(Configuration.twilio.accountSid, Configuration.twilio.authToken);
}

exports.sendSms = function (text, phone) {
  if (twilioClient) {
    twilioClient.sendSms({
      to: '+' + phone,
      from: Configuration.twilio.phoneNumber,
      body: text
    }, function (err) {
      if (err) {
        console.log(err);
      }
    });
  }
};