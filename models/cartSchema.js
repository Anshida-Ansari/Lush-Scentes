const mongoose = require('mongoose');
const { Schema } = mongoose;

const cartSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    items: [
      {
        productId: {
          type: Schema.Types.ObjectId,
          ref: 'Product',
          required: true,
        },
        variant: {
          size: {
            type: String,
            enum: ['15ml', '50ml', '100ml'],
            required: true,
          },
          quantity: {
            type: Number,
            required: true,
            min: [1, 'Quantity must be at least 1'],
          },
          regularPrice: {
            type: Number,
            required: true,
          },

          salesPrice: {
            type: Number,
          },
        },

        totalPrice: {
          type: Number,
          required: true,
        },
        status: {
          type: String,
          default: 'placed',
        },
        cancellationReason: {
          type: String,
          default: 'none',
        },
      },
    ],
  },
  { timestamps: true }
);
const Cart = mongoose.model('Cart', cartSchema);
module.exports = Cart;
