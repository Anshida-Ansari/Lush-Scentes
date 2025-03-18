const mongoose = require('mongoose')
const {Schema}=mongoose

const addressSchema = new Schema({
    userID: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    address: [{
        addressType: {
            type: String,
            required: false
        },
        name: {
            type: String,
            required: true
        },
        city: {
            type: String,
            required: true
        },
        landMark: {
            type: String,
            required: true
        },
        state: {
            type: String,
            required: true
        },
        pincode: {
            type: Number,
            required: true
        },
        phoneNumber: {
            type: String,
            required: true
        },
        altPhone: {    
            type: String,
            required: true
        },
        default: { 
            type: Boolean,
            default: false
        }
    }]
});

const Address = mongoose.model('Address', addressSchema);
module.exports = Address;