const mongoose = require('mongoose')
const {Schema}=mongoose

const userSchema = new Schema({
    name:{
        type:String,
        required : true
    },
    email:{
        type:String,
        required:true,
        unique:true
    },
    phone:{
        type:String,
        required:false,
        unique: false,
        sparce:true,  
        default:null
    },
    googleId:{
        type:String,
        unique:true
    },
    password:{
        type:String,
        required:false
    },
    isBlocked:{
        type:Boolean,
        default:false
    },
    isAdmin:{
        type:Boolean,
        default:false
    },
    cart:[{
        type:Schema.Types.ObjectId,
        ref:'Cart'

    }],
    wishlist:[{
        type:Schema.Types.ObjectId,
        ref:'Wishlist'

    }],
    wallet: {
        type: Number,
        default: 0
    },
    walletHistory: [{
        transactionId: String,
        date: {
            type: Date,
            default: Date.now
        },
        type: {
            type: String,
            enum: ["credit", "debit"],
            required: true
        },
        amount: {
            type: Number,
            required: true
        },
        status: {
            type: String,
            enum: ["Completed", "Pending"],
            default: "Completed"
        }
    }],
    orderHistory:[{
        type:Schema.Types.ObjectId,
    ref:'Orders'
    }],
    createdOn:{
        type:Date,
        default:Date.now
    },
    referalCode:{
        type:String
    },
    redeemed:{
        type:Boolean
    },
    redeemedUsers:[{
        type:Schema.Types.ObjectId,
        ref:'User'
    }],
    searchHistory:[{
        category:{
            type:Schema.Types.ObjectId,
            ref:'Category'
        },
        searchOn:{
            type:Date,
            default:Date.now
        }
    }]


})



const User=mongoose.model('User',userSchema)
module.exports = User