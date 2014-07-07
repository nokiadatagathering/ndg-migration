exports.config = {
  mongodbUrl : 'mongodb://localhost/wuzy',
  adminUrl: 'http://admin-local.wuzy.com',
  mail: {
    mandrillPass: 'QaswsZ0123',
    mandrill_key: '6pd_9fBt1F4LpMYgPiSWew',
    from: 'ndg.newpass.mailer@gmail.com',
    mailPass: 'QAZwsx112233',
    subject : 'Password',
    title : "New NDG password",
    body: 'Your new password is',
    sign: 'NDG'
  },
  twilio: {
    "accountSid":"AC5eb47ab59b156d2a529812b8b2cd35e2",
    "authToken":"7f32140ae849193d754cf91eef840828",
    "phoneNumber":"+16123516315"
  },
  sms: 'Your new NDG password is '
}
