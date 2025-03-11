const mongoose = require('mongoose');
const { Schema } = mongoose;

const productSchema = new Schema({
  productName: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  category: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'Category',
  },
  productImage: {
    type: [String],
    required: true,
  },
  isBlocked: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ['Available', 'Out of stock', 'Discontinued'],
    required: true,
    default: 'Available',
  },
  variants: [
    {
      size: {
        type: String,
        enum: ['15ml', '50ml', '100ml'],
        required: true,
      },
      quantity: {
        type: Number,
        required: true,
        min: 0
      },
      regularPrice: {
        type: Number,
        required: true,
      },
      salesPrice: {
        type: Number,
      },

    }
  ],
  totalStock: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
