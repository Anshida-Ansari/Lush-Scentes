const mongoose = require('mongoose');
const { Schema } = mongoose;

const brandSchema = new schema({
  brandName: {
    type: String,
    reqyired: true,
  },
  brandImage: {
    type: [String],
    reqyired: true,
  },
  isBlocked: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Brand = mongoose.modal('Brand', brandSchema);
module.exports = Brand;
