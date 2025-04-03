const Order = require('../../models/orderSchema');
const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Address = require('../../models/addressShema.js')
const Coupon = require('../../models/couponShema.js')

// const applyCoupon = async (req, res) => {
//     try {
//         const { couponCode, orderTotal } = req.body;
//         const userId = req.session.user;

//         if (!userId) {
//             return res.status(404).json({ success: false, message: 'User not found' });
//         }

//         const coupon = await Coupon.findOne({
//             name: couponCode,
//             isList: true,
//             expireOn: { $gt: new Date() }
//         });

//         if (!coupon) {
//             const availableCoupons = await Coupon.find({
//                 isList: true,
//                 expireOn: { $gt: new Date() },
//                 userId: { $ne: userId }
//             });
//             return res.status(404).json({
//                 success: false,
//                 message: 'Coupon not found or expired',
//                 availableCoupons
//             });
//         }

//         if (coupon.userId.includes(userId)) {
//             return res.status(400).json({
//                 success: false,
//                 message: "You have already used this coupon"
//             });
//         }

//         if (orderTotal < coupon.minimumPrice) {
//             return res.status(400).json({
//                 success: false,
//                 message: `Minimum order amount of ₹${coupon.minimumPrice} required`
//             });
//         }
        
//         const hai = req.session.coupon
//         console.log("coupon from hai",hai)

//         coupon.userId.push(userId);
//         await coupon.save();

//         const discountAmount = Math.min(coupon.offerPrice, orderTotal);
//         const newTotal = orderTotal - discountAmount;

//         res.json({
//             success: true,
//             newTotal,
//             discountAmount,
//             message: "Coupon applied successfully!",
//         });
//     } catch (error) {
//         res.status(500).json({
//             success: false,
//             message: 'Server error',
//             error: error.message
//         });
//     }
// };
 
// const applyCoupon = async (req, res) => {
//     try {
//         const userId = req.session.user;
//         const { couponCode } = req.body;

//         if (!userId || !couponCode) {
//             return res.status(400).json({ success: false, message: "Missing user ID or coupon code" });
//         }

//         console.log("Coupon Code received:", couponCode);
//         const coupon = await Coupon.findOne({ name: couponCode, isList: true });

//         if (!coupon) {
//             return res.status(400).json({ success: false, message: "Invalid coupon code" });
//         }

//         console.log("Coupon found:", coupon);
        
//         const cart = await Cart.findOne({ userId });
//         if (!cart) {
//             return res.status(400).json({ success: false, message: "Cart not found" });
//         }

//         const totalPrice = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        
//         console.log("Total Cart Price:", totalPrice);
//         console.log("Minimum Price Required:", coupon.minimumPrice);

//         if (totalPrice < coupon.minimumPrice) {
//             return res.status(400).json({ success: false, message: `Coupon requires a minimum purchase of ₹${coupon.minimumPrice}` });
//         }

//         console.log("Coupon Used By Users:", coupon.userId);
//         console.log("Current User ID:", userId);
//         console.log("User Already Used Coupon:", coupon.userId.includes(userId));

//         if (coupon.userId.includes(userId)) {
//             return res.status(400).json({ success: false, message: "Coupon already used" });
//         }

//         const discount = Math.min(coupon.offerPrice, totalPrice);
//         const finalAmount = totalPrice - discount;

//         await Coupon.updateOne({ _id: coupon._id }, { $push: { userId } });

//         return res.status(200).json({
//             success: true,
//             discount,
//             finalAmount,
//             message: `Coupon applied successfully. Discount: ₹${discount}`
//         });

//     } catch (error) {
//         console.error("Error applying coupon:", error);
//         res.status(500).json({ success: false, message: "Server error: " + error.message });
//     }
// };

const applyCoupon = async (req, res) => {
    console.log("applycoupon")
    try {
        const userId = req.session.user;
        const { couponCode } = req.body;

        console.log(req.body)

        if (!userId || !couponCode) {
            return res.status(400).json({ success: false, message: "Missing user ID or coupon code" });
        }

        const coupon = await Coupon.findOne({ name: couponCode, isList: true });
        console.log("coupon",coupon)

        if (!coupon) {
            return res.status(400).json({ success: false, message: "Invalid coupon code" });
        }

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(400).json({ success: false, message: "Cart not found" });
        }

        const totalPrice = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);

        if (totalPrice < coupon.minimumPrice) {
            return res.status(400).json({ success: false, message: `Coupon requires a minimum purchase of ₹${coupon.minimumPrice}` });
        }

        if (coupon.userId.includes(userId)) {
            return res.status(400).json({ success: false, message: "Coupon already used" });
        }

        const discount = Math.min(coupon.offerPrice, totalPrice);
        const finalAmount = totalPrice - discount;

        return res.status(200).json({
            success: true,
            discount,
            finalAmount,
            message: `Coupon applied successfully. Discount: ₹${discount}`
        });

    } catch (error) {
        console.error("Error applying coupon:", error)
        res.status(500).json({ success: false, message: "Server error: " + error.message });
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

