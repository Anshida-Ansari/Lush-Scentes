const Order = require('../../models/orderSchema');
const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Address = require('../../models/addressShema.js')
const mongoose = require('mongoose');


const loadCheckoutPage = async (req, res) => {
    try {
        const userId = req.session.user;
        console.log("userid", userId);


        const cart = await Cart.findOne({ userId })
            .populate({
                path: 'items.productId',
                select: 'productName productImage salesPrice variants'
            });

        if (!cart || cart.items.length === 0) {
            return res.redirect('/cart');
        }

        const user = await User.findById(userId);

        const totals = {
            subtotal: cart.items.reduce((sum, item) => sum + item.totalPrice, 0),
            discount: 0,
            finalAmount: cart.items.reduce((sum, item) => sum + item.totalPrice, 0)
        };

        const address = await Address.findOne({ userID: userId });
        console.log("The ADDRESS", address);

        res.render('checkout', {
            cart,
            userAddress: address,
            totals,
            user
        });

    } catch (error) {
        console.error('Error loading checkout page:', error);
        res.status(500).render('error', { message: 'Error loading checkout page: ' + error.message });
    }
};



const processCheckout = async (req, res) => {
    try {
        const userId = req.session.user;
        const { addressId, paymentMethod } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        if (!addressId || !paymentMethod) {
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
        const finalAmount = totalPrice + discount;

        const order = new Order({
            userId,
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
                    price: item.totalPrice,
                    name: product.productName,
                    productImage: product.productImage,
                };
            }),
            totalPrice,
            discount,
            finalAmount,
            address: addressId,
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
    try {

        const { orderId , reason} = req.body

        const order = await Order.findOne({ orderId }).populate('orderedItems.product')
        
        if(!order){
            return res.status(404).json({success: false , message: 'Order is not found'})
        }

        if(order.status !== 'Pending'  && order.status !=='Processing'){
            return res.status(400).json({
                success: false,
                message: 'Cannot cancel order.Order status must be Pending or Processing '
            })
        }

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
            
        
    

        await order.save()
        return res.status(200).json({
            success: true,
            message: 'Order cancelled successfully'
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
        item.cancelStatus = 'Cancelled';
        item.cancellationReason = reason || 'No reason provided';
        item.cancelledAt = new Date();

        // Update product stock
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

        // Check if all items are cancelled
        const allCancelled = order.orderedItems.every(item => item.cancelStatus === 'Cancelled');
        if (allCancelled) {
            order.status = 'Cancelled';
        } else {
            // Recalculate order total
            order.finalAmount = order.orderedItems
                .filter(item => item.cancelStatus !== 'Cancelled')
                .reduce((sum, item) => sum + (item.price * item.variant.quantity), 0);
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
   
};