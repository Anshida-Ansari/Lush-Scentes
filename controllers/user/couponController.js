const Order = require('../../models/orderSchema');
const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Address = require('../../models/addressShema.js')
const Coupon = require('../../models/couponShema.js')

const applyCoupon = async (req, res) => {
    try {
        const { couponCode, orderTotal } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const coupon = await Coupon.findOne({
            name: couponCode,
            isList: true,
            expireOn: { $gt: new Date() }
        });

        if (!coupon) {
            const availableCoupons = await Coupon.find({
                isList: true,
                expireOn: { $gt: new Date() },
                userId: { $ne: userId }
            });
            return res.status(404).json({
                success: false,
                message: 'Coupon not found or expired',
                availableCoupons
            });
        }

        if (coupon.userId.includes(userId)) {
            return res.status(400).json({
                success: false,
                message: "You have already used this coupon"
            });
        }

        if (orderTotal < coupon.minimumPrice) {
            return res.status(400).json({
                success: false,
                message: `Minimum order amount of ₹${coupon.minimumPrice} required`
            });
        }

        coupon.userId.push(userId);
        await coupon.save();

        const discountAmount = Math.min(coupon.offerPrice, orderTotal);
        const newTotal = orderTotal - discountAmount;

        res.json({
            success: true,
            newTotal,
            discountAmount,
            message: "Coupon applied successfully!"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};


const removeCoupon = async (req, res) => {
    try {
        const { couponCode } = req.body;
        const userId = req.session.user;


        if (!userId) {
            console.log('User not found in session');
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        if (!couponCode) {
            console.log('Coupon code not provided');
            return res.status(400).json({
                success: false,
                message: 'Coupon code is required'
            });
        }

        const coupon = await Coupon.findOne({ name: couponCode });

        if (!coupon) {
            console.log('Coupon not found:', couponCode);
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        const updatedCoupon = await Coupon.updateOne(
            { _id: coupon._id },
            { $pull: { userId: userId } }
        );

        console.log('Coupon updated:', updatedCoupon);

        res.json({
            success: true,
            message: 'Coupon removed successfully'
        });
    } catch (error) {
        console.error('Error in removeCoupon:', error);
        res.status(500).json({
            success: false,
            message: 'Cannot remove the coupon'
        });
    }
};

module.exports ={
    applyCoupon,
    removeCoupon
}

