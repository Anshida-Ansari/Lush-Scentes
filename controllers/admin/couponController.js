const User = require('../../models/userSchema')
const Order = require('../../models/orderSchema')
const Coupon = require('../../models/couponShema')
const Category = require('../../models/categorySchema')
const Product = require('../../models/productSchema')


const loadCoupon = async(req,res)=>{
    try {
        if(!req.session.admin){
            return res.redirect('/admin/login')
        }

        const page = parseInt(req.query.page) || 1
        const limit = 5
        const skip = (page-1)* limit

        const coupons = await Coupon.find({isList:true})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();

        const count = await Coupon.countDocuments({isList:true})

        return res.render('coupon',{
            coupons,
            totalPages: Math.ceil(count / limit),
            currentPage: page

        })

        
    } catch (error) {
        console.error('Error in loadCoupon:', error);
        return res.status(500).json({
            success: false,
            message: 'Can’t access coupon page',
            error: error.message
        });
    }
}


const createCoupon = async(req,res)=>{
    try {

        const {name,offerPrice,minimumPrice,expireOn} = req.body

        if(!name || !offerPrice || !minimumPrice || !expireOn){
            return res.status(201).json({
                status:false,
                message:'There is no requires fields'})
        }

        couponExist = await Coupon.findOne({name})

        if(couponExist){

            return res.status(201).json({
                status:false,
                message:'Coupon already exist'})

        }
        if (name.length < 3 || name.length > 50 || !/^[a-zA-Z0-9 ]+$/.test(name)) {
            return res.status(201).json({
                status: false,
                message: 'Invalid name',
            });
        }

        const expirationDate = new Date(expireOn);
        if (isNaN(expirationDate) || expirationDate <= new Date()) {
            return res.status(201).json({
                status: false,
                message: 'Expiration date must be in the future',
            });
        }

        const parsedOfferPrice = parseFloat(offerPrice);
        if (isNaN(parsedOfferPrice) || parsedOfferPrice <= 0 || parsedOfferPrice > 10000) {
            return res.status(201).json({
                status: false,
                message: 'Offer price and minimum price must be greater than zero',
            });
        }
        const parsedMinimumPrice = parseFloat(minimumPrice);
        if (isNaN(parsedMinimumPrice) || parsedMinimumPrice <= 0 || parsedMinimumPrice > 100000) {
            return res.status(201).json({
                status: false,
                message: 'Invalid minimum amount. Please enter a valid number greater than 0 and less than or equal to 100,000'
            });
        }
        const newCoupon = new Coupon({
            name,
            expireOn:expirationDate,
            offerPrice:parsedOfferPrice,
            minimumPrice:parsedMinimumPrice,
            isList:true,       

        })

        await newCoupon.save()
        console.log("Coupon created successfully");
        return res.status(200).json({
            status: true,
            message: 'Coupon created successfully',
            coupon: newCoupon,
        });

        
    } catch (error) {
        return res.status(404).json({
            status: false,
            message: 'Error in creating the coupon',
            error: error.message,
        });
        
    }
}
const editCoupon = async(req,res)=>{
    try {

        const {couponId} = req.params
        const {expireOn,offerPrice,minimumPrice} = req.body


        if (!offerPrice || !minimumPrice || !expireOn) {
            return res.status(201).json({
                status: false,
                message: 'No requires fields'
            });
        }
        const parsedOfferPrice = parseFloat(offerPrice);
        if (isNaN(parsedOfferPrice) || parsedOfferPrice <= 0 || parsedOfferPrice > 10000) {
            return res.status(201).json({
                status: false,
                message:'Invalid discount amount. Please enter a valid number greater than 0 and less than or equal to 10,000.'
            });
        }
        const parsedMinimumPrice = parseFloat(minimumPrice);
        if (isNaN(parsedMinimumPrice) || parsedMinimumPrice <= 0 || parsedMinimumPrice > 100000) {
            return res.status(201).json({
                status: false,
                message:' Invalid minimum amount. Please enter a valid number greater than 0 and not exceeding 100,000.'
            });
        }
        if (parsedOfferPrice >= parsedMinimumPrice) {
            return res.status(201).json({
                status: false,
                message:' Invalid discount amount. The offer price must be less than the minimum price.'
            });
        }
        const expirationDate = new Date(expireOn);
        if (isNaN(expirationDate) || expirationDate <= new Date()) {
            return res.status(201).json({
                status: false,
                message: 'Invalid expiration date. Please provide a valid future date.'
            });
        }

        const couponUpdate = await Coupon.findByIdAndUpdate(couponId,{
            offerPrice:parsedOfferPrice,
            minimumPrice:parsedMinimumPrice,
            expireOn:expirationDate

        },
    {new:true})

    if (!couponUpdate) {
        return res.status(201).json({
            status: false,
            message:'Coupon not found. Please check the coupon details and try again.'
        });
    }

    res.status(200).json({
        status: true,
        message:'Coupon is updated',
        coupon: couponUpdate
    });
    } catch (error) {
        console.error("Error in edit coupon:", error);
        res.status(404).json({
            status: false,
            message:'There is an error in updating Coupon',
            error: error.message
        });
    }
}

const deleteCoupon = async(req,res)=>{
    try {
        const {couponId} = req.params
        
        const coupon = await Coupon.findByIdAndDelete(couponId)
        if (!coupon) {
            return res.status(statusCode.NOT_FOUND).json({
                status: false,
                message: 'Coupon does not Found'
            });
        }

        res.status(200).json({
            status: true,
            message: 'Coupon deleted Successfully'
        });

    } catch (error) {

        console.error("Error in delete coupon", error);
        res.status(404).json({
            status: false,
            message: 'Error in Deleting the Coupon'
        });
        
    }
}


module.exports={
    loadCoupon,
    createCoupon,
    editCoupon,
    deleteCoupon
}