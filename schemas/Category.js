var
  mongoose = require('mongoose'),
  Question = require('./Question'),
  Schema;

Schema =  new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  id: {
    type: String,
    required: true
  },
  relevant: {
    type: String
  },
  _questions: {
    type: [ Question ]
  }
});

module.exports = Schema;
