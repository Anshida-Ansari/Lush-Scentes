const mongoose = require('mongoose');
const { Schema } = mongoose;
const { v4: uuidv4 } = require('uuid');

const orderSchema = new Schema({
    orderId: {
        type: String,
        default: () => uuidv4(),
        unique: true
    },
    orderedItems: [{
        product: {
            type: Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        variant: {
            size: {
                type: String,
                enum: ['15ml', '50ml', '100ml'],
                required: true
            },
            quantity: {
                type: Number,
                required: true,
                min: 0
            },
            regularPrice: {
                type: Number,
                required: true
            },
            salesPrice: {
                type: Number
            }
        },
        price: {
            type: Number,
            default: 0
        },
        name: {
            type: String,
            required: true
        },
        returnStatus: {
            type: String,
            enum: ['Not Requested', 'Requested', 'Approved', 'Rejected'],
            default: 'Not Requested'
        },
        cancelStatus: {
            type: String,
            enum: ['completed', 'Cancelled'],
            default: 'completed'
        },
        cancellationReason: { 
            type: String
        },
        returnReason: { 
            type: String
        },
        returnRequestedAt: {
            type: Date
        },
        productImage: {
            type: [String],
            required: true
        }
    }],
    totalPrice: {
        type: Number,
        required: true
    },
    discount: {
        type: Number,
        default: 0
    },
    finalAmount: {
        type: Number,
        required: true
    },
    address: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    paymentMethod: {
        type: String,
        required: true,
        enum: ['razorpay', 'Cash on Delivery', 'wallet']
    },
    paymentDetails: {
        razorpayOrderId: String,
        razorpayPaymentId: String,
        razorpaySignature: String,
        failureReason: String,
        succeededAt: Date,
        attempts: [{
            razorpayOrderId: String,
            razorpayPaymentId: String,
            failureReason: String,
            attemptedAt: Date
        }]
    },

    status: {
        type: String,
        required: true,
        enum: ['Pending','Payment Pending' , 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Requested', 'Returned']
    },
    createdOn: {
        type: Date,
        default: Date.now,
        required: true
    },
    invoiceData: {
        type: Date
    },
    return: {
        type: String,
        enum: ['Not Requested', 'Requested', 'Approved', 'Rejected'],
        default: 'Not Requested'
    },
    couponApplied: {
        type: Boolean,
        default: false
    },
    couponCode:{
        type: String,
        default:null
    }
});

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;

