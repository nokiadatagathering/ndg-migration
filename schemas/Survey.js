var
  mongoose = require('mongoose'),

  ownerPlugin = require('../plugins/owner'),

  Category = require('./Category'),

  Schema;

Schema =  new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  published: {
    type: Boolean,
    required: true,
    default: false
  },
  _creator: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  dateCreated: {
    type: Date,
    default: Date.now
  },
  _categories: {
    type: [ Category ]
  },
  resultsCount: {
    type: Number,
    default: 0
  }
}, {
  toObject: { virtuals: true }
});


Schema.plugin(ownerPlugin);


module.exports = Schema;
