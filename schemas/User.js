var
  mongoose = require('mongoose'),
  ownerPlugin =  require('../plugins/owner'),

  UserService = require('../services/User'),
  Schema;

Schema =  new mongoose.Schema({
  username: {
    type: String,
    unique: true,
    index: true,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  email: {
    type: String,
    set: toLower
  },
  phone: {
    type: Number,
    required: true,
    set: setPhone
  },
  permission: {
    type: String,
    required: true,
    enum: [ 'superAdmin', 'admin', 'operator', 'fieldWorker' ]
  },
  country: {
    type: String
  },
  company: {
    type: String
  },
  industry: {
    type: String
  },
  _group: {
    type: mongoose.Schema.ObjectId,
    ref: 'Group'
  },
  timeCreated: {
    type: Date,
    default: Date.now
  },
  activatedCode: {
    type: String
  },
  activated: {
    type: Boolean,
    default: false
  },
  _surveys: {
    type: Object,
    default: {}
  },
  deleted: {
    type: Boolean,
    default: false
  }
}, {
  toObject: { virtuals: true }
});

Schema.plugin(ownerPlugin);

Schema.virtual('owner').get(function () {
  return this._owner ? this._owner : this._id;
});


Schema.path('phone').validate(function (phone) {
  return UserService.checkPhoneNumberLength(phone);
}, 'format');


Schema.path('country').validate(function (country) {
  if (this.permission === 'superAdmin' && !country) {
    return false;
  }

  return true;
}, 'required');

Schema.path('industry').validate(function (industry) {
  if (this.permission === 'superAdmin' && !industry) {
    return false;
  }

  return true;
}, 'required');

Schema.path('company').validate(function (company) {
  if (this.permission === 'superAdmin' && !company) {
    return false;
  }

  return true;
}, 'required');

function setPhone (phone) {
  if (UserService.checkPhoneNumberFormat(phone)) {
    return parseInt(phone.replace(new RegExp("[^0-9]", 'g'), ''), 10);
  }

  return phone;
}

function toLower (value) {
  return value.toLowerCase();
}

module.exports = Schema;
