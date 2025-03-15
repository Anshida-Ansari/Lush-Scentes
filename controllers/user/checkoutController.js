const Order = require('../../models/orderSchema');
const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Address = require('../../models/addressShema.js')
const Coupon = require('../../models/couponShema.js')
const PDFDocument = require('pdfkit')
const fs = require('fs')
const Razorpay = require('razorpay')
const crypto = require('crypto')
const mongoose = require('mongoose')
require('dotenv').config();



const razorpayInstance = new Razorpay({
    key_id:process.env.RAZORPAY_KEY_ID,
    key_secret:process.env.RAZORPAY_KEY_SECRET
})



const loadCheckoutPage = async (req, res) => {
    try {
        const userId = req.session.user;
        console.log("User ID from session:", userId);

        if (!userId) {
            console.log("No user session found, redirecting to login");
            return res.redirect('/login');
        }

       
        const cart = await Cart.findOne({ userId })
            .populate({
                path: 'items.productId',
                select: 'productName productImage salesPrice variants'
            });

        if (!cart || cart.items.length === 0) {
            console.log("Cart is empty or not found, redirecting to cart");
            return res.redirect('/cart');
        }

      
        const user = await User.findById(userId);
        if (!user) {
            console.log("User not found, rendering error");
            return res.status(404).render('error', { message: 'User not found' });
        }

       
        const totals = {
            subtotal: cart.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0),
            discount: 0,
            finalAmount: cart.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0)
        };

        
        const address = await Address.findOne({ userID: userId });
        console.log("Fetched Address:", address);

       
        const coupons = await Coupon.find({
            isList: true,
            expireOn: { $gt: new Date() },
            userId: { $ne: userId } 
        });
        console.log("Fetched Coupons:", coupons);

       
        res.render('checkout', {
            cart,
            userAddress: address || {},
            totals,
            user,
            coupons 
        });

    } catch (error) {
        console.error('Error loading checkout page:', error);
        res.status(500).render('error', {
            message: 'Error loading checkout page: ' + (error.message || 'Unknown error')
        });
    }
};

const processCheckout = async (req, res) => {
    try {
        const userId = req.session.user;
        const { selectedAddress, paymentMethod ,couponCode} = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        if (!selectedAddress || !paymentMethod) {
            return res.status(400).json({
                success: false,
                message: 'Address and payment method are required'
            });
        }
        

        const cart = await Cart.findOne({ userId })
            .populate({
                path: 'items.productId',
                select: 'productName productImage variants'
            });

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Your cart is empty'
            });
        }

        const stockUpdates = [];
        for (const item of cart.items) {
            const product = item.productId;
            if (!product) {
                return res.status(400).json({
                    success: false,
                    message: 'Product not found'
                });
            }

            const quantity = Number(item.variant.quantity);

            if (isNaN(quantity) || quantity <= 0) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid quantity for ${product.productName}`
                });
            }

            const selectedVariant = product.variants.find(v => 
                v.size === item.variant.size
            );

            if (!selectedVariant) {
                return res.status(400).json({
                    success: false,
                    message: `Variant ${item.variant.size} for ${product.productName} no longer exists`
                });
            }

            if (selectedVariant.quantity < quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Only ${selectedVariant.quantity} items available for ${product.productName} (${item.variant.size})`
                });
            }

            stockUpdates.push({
                productId: item.productId._id,
                size: item.variant.size,
                quantity: quantity
            });
        }

        const totalPrice = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        const discount = 0;
        if (couponCode) {
            const coupon = await Coupon.findOne({ name: couponCode, isList: true });
            if (coupon && !coupon.userId.includes(userId) && totalPrice >= coupon.minimumPrice) {
              discount = Math.min(coupon.offerPrice, totalPrice);
              await Coupon.updateOne(
                { _id: coupon._id },
                { $push: { userId: userId } }
              );
            }
          }
        const finalAmount = totalPrice - discount;

        const { v4: uuidv4 } = require('uuid');  
        const order = new Order({
            userId,
            orderId:uuidv4(),
            orderedItems: cart.items.map(item => {
                const product = item.productId;
                const selectedVariant = product.variants.find(v => v.size === item.variant.size);

                return {
                    product: product._id,
                    variant: {
                        size: item.variant.size,
                        quantity: item.variant.quantity,
                        regularPrice: selectedVariant.regularPrice,
                        salesPrice: selectedVariant.salesPrice
                    },
                    price: item.totalPrice / item.variant.quantity,
                    name: product.productName,
                    productImage: product.productImage,
                };
            }),
            totalPrice,
            discount,
            finalAmount,
            couponApplied: !!couponCode,
            couponCode: couponCode || null,
            address: selectedAddress,
            paymentMethod,
            status: 'Pending',
            createdOn: new Date(),
        });

        const savedOrder = await order.save();

        for (const update of stockUpdates) {
            await Product.findOneAndUpdate(
                {
                    _id: update.productId,
                    "variants.size": update.size
                },
                {
                    $inc: { "variants.$.quantity": -update.quantity }
                }
            );
        }

        await Cart.findOneAndDelete({ userId });

        return res.status(200).json({
            success: true,
            orderId: savedOrder.orderId,
            message: 'Order placed successfully'
        });

    } catch (error) {
        console.error('Error processing checkout:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing order: ' + error.message
        });
    }
};
const loadThankYouPage = async (req, res) => {
    try {
        const orderId = req.query.orderId;

        if (!orderId) {
            return res.redirect('/');
        }

        const order = await Order.findOne({ orderId })
            .populate({
                path: 'orderedItems.product',
                model: 'Product',
                select: 'productName productImage'
            });

           

        if (!order) {
            return res.status(404).render('error', { message: 'Order not found' });
        }

        res.render('thankyou', {
            order: {
                orderId: order.orderId,
                status: order.status,
                name: order.name,
                paymentMethod: order.paymentMethod,
                totalPrice: order.totalPrice,
                discount: order.discount,
                finalAmount: order.finalAmount,
                createdOn: order.createdOn,
                orderedItems: order.orderedItems,
                address: order.address
            },
            orderDate: order.createdOn.toLocaleDateString()
        });

    } catch (error) {
        console.error('Error loading thank you page:', error);
        res.status(500).render('error', { message: 'Error loading thank you page' });
    }
};

const loadCheckoutAddress = async (req, res) => {
    try {

        res.render('checkout-address')

    } catch (error) {

        res.redirect('/pageerror')

    }
}


const addressPost = async (req, res) => {
    try {
        const user = req.session.user;
        const data = req.body;

        const userAddress = await Address.findOne({ userID: user._id });

        if (userAddress) {
            const newAddress = {
                name: data.name,
                city: data.city,
                landMark: data.landMark,
                state: data.state,
                pincode: data.pincode,
                phoneNumber: data.phoneNumber,
                altPhone: data.altPhone,
                addressType: data.addressType,
                default: data.default || false
            };

            if (newAddress.default) {
                userAddress.address.forEach(addr => addr.default = false);
            }

            userAddress.address.push(newAddress);
            await userAddress.save();
            res.redirect('/checkout');
        } else {
            const newAddress = new Address({
                userID: user._id,
                address: [{
                    name: data.name,
                    city: data.city,
                    landMark: data.landMark,
                    state: data.state,
                    pincode: data.pincode,
                    phoneNumber: data.phoneNumber,
                    altPhone: data.altPhone,
                    addressType: data.addressType,
                    default: true
                }]
            });
            await newAddress.save();
            res.redirect('/checkout');
        }
    } catch (error) {
        console.error('Error in address post:', error);
        res.redirect('/pageerror');
    }
};



    const loadcheckoutEditAddress = async (req, res) => {
        try {
            const userId = req.session.user._id;
            const addressId = req.params.id;
    
            const userAddress = await Address.findOne({ userID: userId });
    
            if (!userAddress) {
                return res.redirect('/pageerror');
            }
    
            const addressToEdit = userAddress.address.id(addressId);
            if (!addressToEdit) {
                return res.redirect('/pageerror');
            }
    
            res.render('checkout-editAddress', { address: addressToEdit });
        } catch (error) {
            console.error('Error loading edit address page:', error);
            res.redirect('/pageerror');
        }
    };

const editAddressCheckout = async (req,res)=>{
    try {
        const userId = req.session.user._id;
        const addressId = req.params.id;
        const data = req.body;

        const userAddress = await Address.findOne({ userID: userId });

        if (!userAddress) {
            return res.redirect('/pageerror');
        }

        const addressToEdit = userAddress.address.id(addressId);
        if (!addressToEdit) {
            return res.redirect('/pageerror');
        }

        addressToEdit.name = data.name;
        addressToEdit.city = data.city;
        addressToEdit.landMark = data.landMark;
        addressToEdit.state = data.state;
        addressToEdit.pincode = data.pincode;
        addressToEdit.phoneNumber = data.phoneNumber;
        addressToEdit.altPhone = data.altPhone;
        addressToEdit.addressType = data.addressType;

        if (data.default) {
            userAddress.address.forEach(addr => {
                if (addr._id.toString() !== addressId) {
                    addr.default = false;
                }
            });
            addressToEdit.default = true;
        }

        await userAddress.save();

        res.redirect('/checkout');
    } catch (error) {
        console.error('Error editing address:', error);
        res.redirect('/pageerror');
    }

}

const cancelOrder = async (req,res) =>{
    console.log("reached cancelorder")
    try {

        const { orderId , reason} = req.body
        const userId = req.session.user;


        const order = await Order.findOne({ orderId }).populate('orderedItems.product')
        console.log("ordercancle",order)
        
        if(!order){
            return res.status(404).json({success: false , message: 'Order is not found'})
        }

        if(order.status !== 'Pending'  && order.status !=='Processing'){
            return res.status(400).json({
                success: false,
                message: 'Cannot cancel order.Order status must be Pending or Processing '
            })
        }

        let refundAmount = order.finalAmount
        console.log("cancel prduct",refundAmount)

        order.status = 'Cancelled'
        order.cancellationReason = reason || 'No reason provided';
        order.cancelledAt = new Date();

        for(const item of order.orderedItems){
            const product = await Product.findById(item.product);
            if (product) {
                const variantIndex = product.variants.findIndex(
                    v => v.size === item.variant.size
                );
                if (variantIndex !== -1) {
                    product.variants[variantIndex].quantity += item.variant.quantity;
                    product.totalStock += item.variant.quantity;
                    await product.save();
                }
            }
        }
        
        let currentWalletBalance = 0;
        if (order.paymentMethod !== 'Cash on Delivery') {
console.log("order cancel reashced aller")
            const user = await User.findById(userId);
            user.wallet = (parseFloat(user.wallet) || 0) + refundAmount;            user.walletHistory.push({
                transactionId: `TXN${Date.now()}`,
                type: 'credit',
                amount: refundAmount,
                date: new Date(),
            });
            await user.save();
            currentWalletBalance = user.wallet;
            console.log('jfalsjdf',currentWalletBalance)
        }

        
    

        await order.save()
        return res.status(200).json({
            success: true,
            message: 'Order cancelled successfully',
            refundDetails: {
                itemPrice: order.finalAmount,
            },
            orderTotals: {
                finalAmount: order.finalAmount
            },
            currentWalletBalance
        })


    } catch (error) {

        console.error(`Error cancelling order: ${error.message}`);
        return res.status(500).json({ 
            success: false, 
            message: 'Error cancelling order'
        });

        
    }


}


const cancelProduct = async (req, res) => {
    try {
        const userId = req.session.user
        const { orderId, productId, reason } = req.body;

        const order = await Order.findOne({ orderId }).populate('orderedItems.product');
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const itemIndex = order.orderedItems.findIndex(
            item => item._id.toString() === productId
        );
        
        if (itemIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                message: 'Product not found in order' 
            });
        }

        if (order.status !== 'Pending' && order.status !== 'Processing') {
            return res.status(400).json({ 
                success: false, 
                message: 'Product can only be cancelled when order is Pending or Processing' 
            });
        }
        
        const item = order.orderedItems[itemIndex];
        const refundAmount = item.price * item.variant.quantity;
        item.cancelStatus = 'Cancelled';
        item.cancellationReason = reason || 'No reason provided';
        item.cancelledAt = new Date();

        
        const product = await Product.findById(item.product);
        if (product) {
            const variantIndex = product.variants.findIndex(
                v => v.size === item.variant.size
            );
            if (variantIndex !== -1) {
                product.variants[variantIndex].quantity += item.variant.quantity;
                product.totalStock += item.variant.quantity;
                await product.save();
            }
        }

        
        const allCancelled = order.orderedItems.every(item => item.cancelStatus === 'Cancelled');
        if (allCancelled) {
            order.status = 'Cancelled';
        } else {
            
            order.finalAmount = order.orderedItems
                .filter(item => item.cancelStatus !== 'Cancelled')
                .reduce((sum, item) => sum + (item.price * item.variant.quantity), 0);
        }

        let currentWalletBalance = 0;
        if (order.paymentMethod !== 'Cash on Delivery') {
        console.log("order cancel reashced aller")
            const user = await User.findById(userId);
            user.wallet = (parseFloat(user.wallet) || 0) + refundAmount;            user.walletHistory.push({
                transactionId: `TXN${Date.now()}`,
                type: 'credit',
                amount: refundAmount,
                date: new Date(),
            });
            await user.save();
            currentWalletBalance = user.wallet;
            console.log('jfalsjdf',currentWalletBalance)
        }

        await order.save();

        return res.status(200).json({ 
            success: true, 
            message: 'Product cancelled successfully',
            order: {
                status: order.status,
                finalAmount: order.finalAmount
            }
        });

    } catch (error) {
        console.error(`Error cancelling product: ${error.message}`);
        return res.status(500).json({ 
            success: false, 
            message: 'Server error while cancelling product',
            error: error.message 
        });
    }
};



const returnProduct = async (req, res) => {
    try {
        console.log('there is some error');
        
        const { orderId, productId, reason } = req.body;

        const order = await Order.findOne({ orderId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order.status !== 'Delivered') {
            return res.status(400).json({
                success: false,
                message: 'Only delivered products can be returned'
            });
        }

        const itemIndex = order.orderedItems.findIndex(
            item => item._id.toString() === productId
        );

        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Product not found in order'
            });
        }

        const deliveryDate = order.deliveredAt || order.updatedAt;
        const daysSinceDelivery = Math.floor((new Date() - new Date(deliveryDate)) / (1000 * 60 * 60 * 24));
        if (daysSinceDelivery > 30) {
            return res.status(400).json({
                success: false,
                message: 'Return period has expired (30 days)'
            });
        }

        order.orderedItems[itemIndex].returnStatus = 'Requested';
        order.orderedItems[itemIndex].returnReason = reason;
        order.orderedItems[itemIndex].returnRequestedAt = new Date();

        await order.save();

        return res.status(200).json({
            success: true,
            message: 'Return request submitted successfully',
            order: {
                status: order.status,
                orderedItems: order.orderedItems
            }
        });

    } catch (error) {
        console.error(`Error processing return: ${error.message}`);
        return res.status(500).json({ 
            success: false, 
            message: 'Server error while processing return',
            error: error.message 
        });
    }
}

const createRazorpayOrder = async (req, res) => {
    try {
        const { selectedAddress, orderId,couponCode } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(404).json({ success: false, message: 'User is not found' });
        }

        
        if (orderId) {
            const existingOrder = await Order.findOne({ orderId })
            if (!existingOrder) {
                return res.status(404).json({ success: false, message: 'Order is not found' });
            }

            const order = await razorpayInstance.orders.create({
                amount: Math.round(existingOrder.finalAmount * 100),
                currency: 'INR',
                receipt: `retry_${existingOrder.orderId.substring(0, 10)}`
            });

            return res.json({
                success: true,
                razorpayKeyId: process.env.RAZORPAY_KEY_ID,
                razorpayOrderId: order.id,
                amount: order.amount,
                orderId: existingOrder.orderId
            });
        }

        
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || cart.items.length === 0) {
            return res.status(404).json({ success: false, message: 'Your Cart is Empty' });
        }

        for (const item of cart.items) {
            const product = await Product.findById(item.productId);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: `Product not found for item: ${item.productId}`
                });
            }

            
            const variant = product.variants.find(v => v.size === item.variant.size);
            if (!variant) {
                return res.status(400).json({
                    success: false,
                    message: `Size variant ${item.variant.size} not found for product: ${product.productName}`
                });
            }

            
            if (variant.quantity < item.variant.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for ${product.productName} (${item.variant.size}). Only ${variant.quantity} available.`
                });
            }
        }

        
        const totalPrice = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        let discountAmount = 0;
        if (couponCode) {
            const coupon = await Coupon.findOne({ name: couponCode, isList: true });
            if (coupon && !coupon.userId.includes(userId) && totalPrice >= coupon.minimumPrice) {
              discountAmount = Math.min(coupon.offerPrice, totalPrice);
              await Coupon.updateOne(
                { _id: coupon._id },
                { $push: { userId: userId } }
              );
            }
          }

        
        const finalAmount = totalPrice - discountAmount;

        
        const receiptId = Math.random().toString(36).substring(2, 10);
        const razorpayOrder = await razorpayInstance.orders.create({
            amount: Math.round(finalAmount * 100),
            currency: "INR",
            receipt: receiptId,
            payment_capture: 1
        });

        
        const newOrder = new Order({
            userId,
            orderedItems: cart.items.map(item => ({
                product: item.productId,
                variant: {
                    size: item.variant.size,
                    quantity: item.variant.quantity,
                    regularPrice: item.variant.regularPrice,
                    salesPrice: item.variant.salesPrice
                },
                price: item.totalPrice / item.variant.quantity, 
                name: item.productId.productName, 
                productImage: item.productId.productImage 
            })),
            totalPrice,
            discount: discountAmount,
            finalAmount,
            finalAmount,
            couponApplied: !!couponCode,
            couponCode: couponCode || null,
            address: selectedAddress,
            paymentMethod: 'razorpay',
            status: 'Pending',
            paymentDetails: {
                razorpayOrderId: razorpayOrder.id,
                createdAt: new Date()
            }
        });

        await newOrder.save();

        
        const stockUpdatePromises = cart.items.map(async (item) => {
            return await Product.findOneAndUpdate(
                {
                    _id: item.productId, 
                    'variants.size': item.variant.size
                },
                {
                    $inc: { 'variants.$.quantity': -item.variant.quantity }
                },
                { new: true }
            );
        });

        await Promise.all(stockUpdatePromises);
        await Cart.findOneAndUpdate({ userId }, { $set: { items: [] } });

        res.status(200).json({
            success: true,
            razorpayKeyId: process.env.RAZORPAY_KEY_ID,
            razorpayOrderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            orderId: newOrder.orderId,
            discountAmount
        });

    } catch (error) {
        console.error("Error creating Razorpay order:", error);
        res.status(500).json({ success: false, message: "Failed to create order" });
    }
};



const verifyRazorpayPayment = async (req, res) => {
    try {
        const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
        const userId = req.session.user;

        console.log('Verifying Razorpay Payment:', { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature });

        if (!userId) {
            console.error('User session not found in verifyRazorpayPayment');
            return res.status(404).json({ success: false, message: 'User is not found' });
        }

        console.log('Generating expected signature...');
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest("hex");

        console.log('Expected Signature:', expectedSignature);
        console.log('Received Signature:', razorpaySignature);

        if (expectedSignature !== razorpaySignature) {
            console.error('Invalid payment signature');
            return res.status(400).json({ success: false, message: "Invalid payment signature" });
        }

        console.log('Fetching order with orderId:', orderId);
        const order = await Order.findOne({ orderId }).populate('orderedItems.product');
        if (!order) {
            console.error('Order not found for orderId:', orderId);
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        console.log('Order found:', order);

        console.log('Validating stock for ordered items...');
        for (const item of order.orderedItems) {
            const product = await Product.findById(item.product);
            const variant = product.variants.find(v => v.size === item.variant.size);
            
            if (!variant || variant.quantity < item.variant.quantity) {
                console.error(`Insufficient stock for ${item.name} (${item.variant.size})`);
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for ${item.name} (${item.variant.size})`
                });
            }
        }

        console.log('Updating order status to Processing...');
        const updatedOrder = await Order.findOneAndUpdate(
            { orderId },
            {
                status: 'Processing',
                'paymentDetails.razorpayOrderId': razorpayOrderId,
                'paymentDetails.razorpayPaymentId': razorpayPaymentId,
                'paymentDetails.razorpaySignature': razorpaySignature,
                'paymentDetails.succeededAt': new Date()
            },
            { new: true }
        );

        console.log('Order updated:', updatedOrder);

        res.status(200).json({
            success: true,
            message: "Payment verified successfully",
            orderId: updatedOrder.orderId
        });

    } catch (error) {
        console.error("Error verifying payment:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Payment verification failed",
            status: 'Payment Pending'
        });
    }
};

const handlePaymentDismissal = async (req, res) => {
    try {
        const { orderId, selectedAddress } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({ success: false, message: "User session expired" });
        }

        
        if (orderId) {
            const updatedOrder = await Order.findOneAndUpdate(
                { orderId },
                { 
                    status: 'Pending',
                    'paymentDetails.failureReason': 'Payment dismissed by user'
                },
                { new: true }
            );
            return res.json({
                success: true,
                message: 'Order status updated',
                orderId: updatedOrder.orderId
            });
        }

        
        const cart = await Cart.findOne({ userId }).populate('items.product');
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: "Cart is empty" });
        }

        const totalPrice = cart.items.reduce((sum, item) => sum + item.price * item.variant.quantity, 0);
        let discountAmount = 0;

        if (selectedCoupon) {
            const coupon = await Coupon.findOne({ name: selectedCoupon, isList: true });
            if (coupon) {
                discountAmount = coupon.offerPrice;
            }
        }
        
        const finalAmount = totalPrice - discountAmount 

        const newOrder = new Order({
            userId,
            orderedItems: cart.items.map(item => ({
                product: item.productId,
                variant: {
                    size: item.variant.size,
                    quantity: item.variant.quantity,
                    regularPrice: item.product.variants.find(v => v.size === item.variant.size).regularPrice,
                    salesPrice: item.product.variants.find(v => v.size === item.variant.size).salesPrice
                },
                price: item.price,
                name: item.name,
                productImage: item.productImage
            })),
            totalPrice,
            discount: discountAmount,
            finalAmount,
            address: selectedAddress,
            paymentMethod: 'razorpay',
            status: 'Pending',
            couponApplied: !!selectedCoupon,
            couponCode: selectedCoupon || null,
            paymentDetails: {
                failureReason: 'Payment dismissed by user'
            }
        });

        await newOrder.save();
        await Cart.findOneAndUpdate({ userId }, { $set: { items: [] } });

        res.json({
            success: true,
            message: 'Order created with pending status',
            orderId: newOrder.orderId
        });

    } catch (error) {
        console.error("Error in payment dismissal:", error);
        return res.status(500).json({ success: false, message: "Failed to handle payment dismissal" });
    }
};

// const downloadInvoice = async(req,res)=>{
//     try {
//         const orderId = req.params.orderId;

//         // Fetch the order with populated product and user data
//         const order = await Order.findOne({ orderId })
//             .populate({
//                 path: 'orderedItems.product',
//                 select: 'productName variants',
//             })
//             .populate({
//                 path: 'userId',
//                 select: 'name', 
//             })
//             .lean();

//         if (!order) return res.status(404).send('Order not found');

//         // Extract user address (assuming address is an object in the User schema)
//         const user = order.userId;
//         if (!user || !user.address) return res.status(404).send('Address not found');

//         // Initialize PDF document
//         const doc = new PDFDocument({
//             margin: 50,
//             size: 'A4',
//             bufferPages: true,
//         });

//         res.setHeader('Content-Type', 'application/pdf');
//         res.setHeader('Content-Disposition', `attachment; filename=invoice-${orderId}.pdf`);
//         doc.pipe(res);

//         // Header with "LUSH SCENTES" branding
//         doc.fontSize(24)
//             .text('LUSH SCENTES', 50, 50, { align: 'left' })
//             .fontSize(10)
//             .text('www.lushscentes.com', 50, 80, { align: 'left' }) // Replace with your actual website
//             .text('support@lushscentes.com', 50, 95, { align: 'left' }) // Replace with your actual email
//             .text('+91 98765 43210', 50, 110, { align: 'left' }); // Replace with your actual phone number

//         doc.fontSize(20)
//             .text('INVOICE', 300, 50, { align: 'right', width: 250 })
//             .fontSize(10)
//             .text(`Invoice No: ${orderId}`, 300, 80, { align: 'right', width: 250 })
//             .text(`Date: ${new Date().toLocaleDateString()}`, 300, 95, { align: 'right', width: 250 })
//             .text(`Order Date: ${new Date(order.createdOn).toLocaleDateString()}`, 300, 110, { align: 'right', width: 250 });

//         doc.moveTo(50, 140).lineTo(550, 140).stroke();

//         // Bill To Section (using user address)
//         doc.fontSize(14)
//             .text('Bill To:', 50, 170)
//             .fontSize(10)
//             .text(user.name || 'Customer', 50, 190)
//             .text(user.address.addressLine1 || '', 50, 205)
//             .text(user.address.addressLine2 || '', 50, 220)
//             .text(`${user.address.city || ''}, ${user.address.state || ''} - ${user.address.pincode || ''}`, 50, 235)
//             .text(`Phone: ${user.address.phone || 'N/A'}`, 50, 250);

//         // Items Table
//         const tableTop = 300;
//         const tableHeaders = {
//             item: { x: 50, width: 200 },   // Reduced width to fit size column
//             size: { x: 250, width: 50 },   // Added size column
//             qty: { x: 300, width: 70 },
//             price: { x: 370, width: 90 },
//             amount: { x: 460, width: 90 },
//         };

//         doc.rect(50, tableTop - 10, 500, 25).fill('#f6f6f6');
//         doc.fillColor('black')
//             .fontSize(10)
//             .text('Item Description', tableHeaders.item.x, tableTop)
//             .text('Size', tableHeaders.size.x, tableTop, { width: tableHeaders.size.width, align: 'center' })
//             .text('Qty', tableHeaders.qty.x, tableTop, { width: tableHeaders.qty.width, align: 'center' })
//             .text('Unit Price', tableHeaders.price.x, tableTop, { width: tableHeaders.price.width, align: 'right' })
//             .text('Amount', tableHeaders.amount.x, tableTop, { width: tableHeaders.amount.width, align: 'right' });

//         let yPosition = tableTop + 30;
//         let subtotal = 0;

//         order.orderedItems.forEach((item) => {
//             const price = item.variant.salesPrice || item.variant.regularPrice; // Use salesPrice if available
//             const amount = item.variant.quantity * price;
//             subtotal += amount;

//             doc.text(item.product.productName, tableHeaders.item.x, yPosition, { width: tableHeaders.item.width })
//                 .text(item.variant.size, tableHeaders.size.x, yPosition, { width: tableHeaders.size.width, align: 'center' })
//                 .text(item.variant.quantity.toString(), tableHeaders.qty.x, yPosition, { width: tableHeaders.qty.width, align: 'center' })
//                 .text(`₹${price.toFixed(2)}`, tableHeaders.price.x, yPosition, { width: tableHeaders.price.width, align: 'right' })
//                 .text(`₹${amount.toFixed(2)}`, tableHeaders.amount.x, yPosition, { width: tableHeaders.amount.width, align: 'right' });

//             yPosition += 25;
//         });

//         doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
//         yPosition += 20;

//         // Summary Section
//         const summaryX = 370;
//         const summaryWidth = 180;

//         doc.text('Subtotal:', summaryX, yPosition, { width: 90, align: 'right' })
//             .text(`₹${subtotal.toFixed(2)}`, summaryX + 90, yPosition, { width: 90, align: 'right' });

//         if (order.discount > 0) {
//             yPosition += 20;
//             doc.text('Discount:', summaryX, yPosition, { width: 90, align: 'right' })
//                 .text(`-₹${order.discount.toFixed(2)}`, summaryX + 90, yPosition, { width: 90, align: 'right' });
//         }

//         if (order.couponApplied && order.couponCode) {
//             yPosition += 20;
//             doc.text(`Coupon (${order.couponCode}):`, summaryX, yPosition, { width: 90, align: 'right' });
//         }

//         yPosition += 25;
//         doc.rect(summaryX - 10, yPosition - 5, summaryWidth, 25).fill('#f6f6f6');
//         doc.fillColor('black')
//             .fontSize(12)
//             .text('Total:', summaryX, yPosition, { width: 90, align: 'right' })
//             .text(`₹${order.finalAmount.toFixed(2)}`, summaryX + 90, yPosition, { width: 90, align: 'right' });

//         yPosition += 50;
//         doc.fontSize(10)
//             .text('Payment Information', 50, yPosition)
//             .text(`Method: ${order.paymentMethod}`, 50, yPosition + 15)
//             .text(`Status: ${order.status === 'Delivered' ? 'Paid' : order.status}`, 50, yPosition + 30);

//         doc.fontSize(10)
//             .text('Thank you for shopping with LUSH SCENTES!', 50, doc.page.height - 100, { align: 'center' })
//             .fontSize(8)
//             .text('Terms & Conditions:', 50, doc.page.height - 80)
//             .text('1. All prices are in INR and include GST where applicable.', 50, doc.page.height - 70)
//             .text('2. This is a computer-generated invoice and requires no signature.', 50, doc.page.height - 60);

//         doc.end();
//     } catch (error) {
//         console.error('Error generating invoice:', error);
//         res.status(500).send('Error generating invoice');
//     }

// }
const downloadInvoice = async (req, res) => {
    try {
        const orderId = req.params.orderId;

        // Fetch the order with populated product and user data
        const order = await Order.findOne({ orderId })
            .populate({
                path: 'orderedItems.product',
                select: 'productName variants',
            })
            .populate({
                path: 'userId',
                select: 'name', // We only need the user's name here
            })
            .lean();

        if (!order) return res.status(404).send('Order not found');

        // Fetch the address from the Address model using userId and order.address
        const addressDoc = await Address.findOne({ userID: order.userId });
        if (!addressDoc || !addressDoc.address || addressDoc.address.length === 0) {
            return res.status(404).send('Address not found');
        }

        // Find the specific address matching the order.address ObjectId
        const selectedAddress = addressDoc.address.find(addr => addr._id.toString() === order.address.toString());
        if (!selectedAddress) return res.status(404).send('Specific address not found');

        // Initialize PDF document
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4',
            bufferPages: true,
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${orderId}.pdf`);
        doc.pipe(res);

        // Header with "LUSH SCENTES" branding
        doc.fontSize(24)
            .text('LUSH SCENTES', 50, 50, { align: 'left' })
            .fontSize(10)
            .text('www.lushscentes.com', 50, 80, { align: 'left' }) // Replace with your actual website
            .text('support@lushscentes.com', 50, 95, { align: 'left' }) // Replace with your actual email
            .text('+91 98765 43210', 50, 110, { align: 'left' }); // Replace with your actual phone number

        doc.fontSize(20)
            .text('INVOICE', 300, 50, { align: 'right', width: 250 })
            .fontSize(10)
            .text(`Invoice No: ${orderId}`, 300, 80, { align: 'right', width: 250 })
            .text(`Date: ${new Date().toLocaleDateString()}`, 300, 95, { align: 'right', width: 250 })
            .text(`Order Date: ${new Date(order.createdOn).toLocaleDateString()}`, 300, 110, { align: 'right', width: 250 });

        doc.moveTo(50, 140).lineTo(550, 140).stroke();

        // Bill To Section (using selected address from Address model)
        doc.fontSize(14)
            .text('Bill To:', 50, 170)
            .fontSize(10)
            .text(selectedAddress.name || order.userId.name || 'Customer', 50, 190)
            .text(selectedAddress.landMark || '', 50, 205) // Using landMark as address line 1
            .text(`${selectedAddress.city}, ${selectedAddress.state} - ${selectedAddress.pincode}`, 50, 220)
            .text(`Phone: ${selectedAddress.phoneNumber || 'N/A'}`, 50, 235)
            .text(`Alt Phone: ${selectedAddress.altPhone || 'N/A'}`, 50, 250);

        // Items Table
        const tableTop = 300;
        const tableHeaders = {
            item: { x: 50, width: 200 },
            size: { x: 250, width: 50 },
            qty: { x: 300, width: 70 },
            price: { x: 370, width: 90 },
            amount: { x: 460, width: 90 },
        };

        doc.rect(50, tableTop - 10, 500, 25).fill('#f6f6f6');
        doc.fillColor('black')
            .fontSize(10)
            .text('Item Description', tableHeaders.item.x, tableTop)
            .text('Size', tableHeaders.size.x, tableTop, { width: tableHeaders.size.width, align: 'center' })
            .text('Qty', tableHeaders.qty.x, tableTop, { width: tableHeaders.qty.width, align: 'center' })
            .text('Unit Price', tableHeaders.price.x, tableTop, { width: tableHeaders.price.width, align: 'right' })
            .text('Amount', tableHeaders.amount.x, tableTop, { width: tableHeaders.amount.width, align: 'right' });

        let yPosition = tableTop + 30;
        let subtotal = 0;

        order.orderedItems.forEach((item) => {
            const price = item.variant.salesPrice || item.variant.regularPrice;
            const amount = item.variant.quantity * price;
            subtotal += amount;

            doc.text(item.product.productName, tableHeaders.item.x, yPosition, { width: tableHeaders.item.width })
                .text(item.variant.size, tableHeaders.size.x, yPosition, { width: tableHeaders.size.width, align: 'center' })
                .text(item.variant.quantity.toString(), tableHeaders.qty.x, yPosition, { width: tableHeaders.qty.width, align: 'center' })
                .text(`₹${price.toFixed(2)}`, tableHeaders.price.x, yPosition, { width: tableHeaders.price.width, align: 'right' })
                .text(`₹${amount.toFixed(2)}`, tableHeaders.amount.x, yPosition, { width: tableHeaders.amount.width, align: 'right' });

            yPosition += 25;
        });

        doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
        yPosition += 20;

        // Summary Section
        const summaryX = 370;
        const summaryWidth = 180;

        doc.text('Subtotal:', summaryX, yPosition, { width: 90, align: 'right' })
            .text(`₹${subtotal.toFixed(2)}`, summaryX + 90, yPosition, { width: 90, align: 'right' });

        if (order.discount > 0) {
            yPosition += 20;
            doc.text('Discount:', summaryX, yPosition, { width: 90, align: 'right' })
                .text(`-₹${order.discount.toFixed(2)}`, summaryX + 90, yPosition, { width: 90, align: 'right' });
        }

        if (order.couponApplied && order.couponCode) {
            yPosition += 20;
            doc.text(`Coupon (${order.couponCode}):`, summaryX, yPosition, { width: 90, align: 'right' });
        }

        yPosition += 25;
        doc.rect(summaryX - 10, yPosition - 5, summaryWidth, 25).fill('#f6f6f6');
        doc.fillColor('black')
            .fontSize(12)
            .text('Total:', summaryX, yPosition, { width: 90, align: 'right' })
            .text(`₹${order.finalAmount.toFixed(2)}`, summaryX + 90, yPosition, { width: 90, align: 'right' });

        // Payment Information
        yPosition += 50;
        doc.fontSize(10)
            .text('Payment Information', 50, yPosition)
            .text(`Method: ${order.paymentMethod}`, 50, yPosition + 15)
            .text(`Status: ${order.status === 'Delivered' ? 'Paid' : order.status}`, 50, yPosition + 30);

        // Footer
        doc.fontSize(10)
            .text('Thank you for shopping with LUSH SCENTES!', 50, doc.page.height - 100, { align: 'center' })
            .fontSize(8)
            .text('Terms & Conditions:', 50, doc.page.height - 80)
            .text('1. All prices are in INR and include GST where applicable.', 50, doc.page.height - 70)
            .text('2. This is a computer-generated invoice and requires no signature.', 50, doc.page.height - 60);

        doc.end();
    } catch (error) {
        console.error('Error generating invoice:', error);
        res.status(500).send('Error generating invoice');
    }
};



module.exports = {
    loadCheckoutPage,
    processCheckout,
    loadcheckoutEditAddress,
    editAddressCheckout,
    loadThankYouPage,
    loadCheckoutAddress,
    addressPost,
    cancelOrder,
    cancelProduct,
    returnProduct,
    createRazorpayOrder,
    handlePaymentDismissal,
    verifyRazorpayPayment,
    downloadInvoice
   
};