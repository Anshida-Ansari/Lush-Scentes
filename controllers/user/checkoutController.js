const Order = require('../../models/orderSchema');
const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Address = require('../../models/addressShema.js');
const Coupon = require('../../models/couponShema.js');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const mongoose = require('mongoose');
require('dotenv').config();

const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const loadCheckoutPage = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect('/login');

    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || !cart.items.length) return res.redirect('/cart');

    const user = await User.findById(userId);
    const address = await Address.findOne({ userID: userId });
    const coupons = await Coupon.find({
      isList: true,
      expireOn: { $gt: new Date() },
      userId: { $ne: userId },
    });

    const totals = {
      subtotal: cart.items.reduce((sum, item) => sum + item.totalPrice, 0),
      discount: 0,
      finalAmount: cart.items.reduce((sum, item) => sum + item.totalPrice, 0),
    };

    res.render('checkout', {
      cart,
      userAddress: address || {},
      totals,
      user,
      coupons,
    });
  } catch (error) {
    console.error('Error loading checkout:', error);
    res.status(500).render('error', { message: 'Server error' });
  }
};

const processCheckout = async (req, res) => {
  try {
    const userId = req.session.user;
    const { selectedAddress, paymentMethod, couponCode } = req.body;

    if (!userId || !selectedAddress || !paymentMethod) {
      return res
        .status(400)
        .json({ success: false, message: 'Missing required fields' });
    }

    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || !cart.items.length) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    const blockedProduct = cart.items.find((item) => item.productId.isBlocked);
    if (blockedProduct) {
      return res.status(400).json({
        success: false,
        message: `The product "${blockedProduct.productId.productName}" is blocked and cannot be ordered.`,
      });
    }

    const outOfStockItems = [];
    for (const item of cart.items) {
      const variant = item.productId.variants.find(
        (v) => v.size === item.variant.size
      );
      if (!variant || variant.quantity < item.variant.quantity) {
        outOfStockItems.push({
          productName: item.productId.productName,
          size: item.variant.size,
          requested: item.variant.quantity,
          available: variant ? variant.quantity : 0,
        });
      }
    }

    if (outOfStockItems.length > 0) {
      const message = outOfStockItems
        .map(
          (item) =>
            `${item.productName} (${item.size}): Requested ${item.requested}, Available ${item.available}`
        )
        .join(', ');
      return res
        .status(400)
        .json({ success: false, message: `Stock limit reached: ${message}` });
    }

    const totalPrice = cart.items.reduce(
      (sum, item) => sum + item.totalPrice,
      0
    );
    let discount = 0;
    let coupon = null;

    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode });

      if (coupon) {
        await Coupon.updateOne(
          { _id: coupon._id },
          { $addToSet: { userId: userId } } // ✅ Prevents duplicate user entries
        );
      }
    }

    if (couponCode) {
      console.log('Coupon Code Received:', couponCode);

      // Find the coupon in the database
      coupon = await Coupon.findOne({ name: couponCode, isList: true });

      if (coupon) {
        // Check if user has already used the coupon and if totalPrice meets minimum criteria
        if (
          !coupon.userId.includes(userId) &&
          totalPrice >= coupon.minimumPrice
        ) {
          discount = Math.min(coupon.offerPrice, totalPrice);
        } else {
          coupon = null; // Invalidate coupon if conditions are not met
        }
      }

      // If coupon is valid, add the userId to prevent reuse
      if (coupon) {
        await Coupon.updateOne(
          { _id: coupon._id },
          { $addToSet: { userId: userId } } // Ensures no duplicate entries
        );
      }
    }

    const finalAmount = totalPrice - discount;

    if (paymentMethod === 'Cash on Delivery' && finalAmount > 1000) {
      return res
        .status(400)
        .json({
          success: false,
          message: 'COD not allowed for orders above ₹1000',
        });
    }

    if (paymentMethod === 'wallet') {
      const user = await User.findById(userId);
      if (user.wallet < finalAmount) {
        return res
          .status(400)
          .json({ success: false, message: 'Insufficient wallet balance' });
      }
    }

    const orderId = `ORD${Date.now()}`;
    const order = new Order({
      userId,
      orderId,
      orderedItems: cart.items.map((item) => ({
        product: item.productId._id,
        variant: item.variant,
        price: item.totalPrice / item.variant.quantity,
        name: item.productId.productName,
        productImage: item.productId.productImage,
      })),
      totalPrice,
      discount,
      finalAmount,
      address: selectedAddress,
      paymentMethod,
      status: 'Pending',
      couponApplied: !!couponCode,
      couponCode: couponCode || null,
    });

    await order.save();

    if (paymentMethod === 'wallet') {
      await User.updateOne(
        { _id: userId },
        {
          $inc: { wallet: -finalAmount },
          $push: {
            walletHistory: {
              transactionId: `WAL${Date.now()}`,
              type: 'debit',
              amount: finalAmount,
              status: 'Completed',
            },
          },
        }
      );
      order.status = 'Processing';
      await order.save();
    }

    if (paymentMethod === 'Cash on Delivery') {
      order.status = 'Processing';
      await order.save();
    }

    // ✅ Add userId to coupon only AFTER successful order placement
    if (coupon) {
      await Coupon.updateOne({ _id: coupon._id }, { $push: { userId } });
    }

    // ✅ Update stock
    for (const item of cart.items) {
      await Product.updateOne(
        { _id: item.productId._id, 'variants.size': item.variant.size },
        { $inc: { 'variants.$.quantity': -item.variant.quantity } }
      );
    }

    // ✅ Clear cart
    await Cart.findOneAndDelete({ userId });

    res.status(200).json({
      success: true,
      orderId,
      redirectUrl: `/thank-you?orderId=${orderId}`,
      message: 'Order placed successfully',
    });
  } catch (error) {
    console.error('Error processing checkout:', error);
    res
      .status(500)
      .json({ success: false, message: 'Server error: ' + error.message });
  }
};

const loadCheckoutAddress = async (req, res) => {
  try {
    res.render('checkout-address');
  } catch (error) {
    console.error('Error loading checkout address:', error);
    res.redirect('/pageerror');
  }
};

const addressPost = async (req, res) => {
  try {
    const userId = req.session.user;
    const data = req.body;

    const userAddress = await Address.findOne({ userID: userId });

    const newAddress = {
      name: data.name,
      city: data.city,
      landMark: data.landMark,
      state: data.state,
      pincode: data.pincode,
      phoneNumber: data.phoneNumber,
      altPhone: data.altPhone,
      addressType: data.addressType,
      default: data.default === 'on' || false,
    };

    if (userAddress) {
      if (newAddress.default) {
        userAddress.address.forEach((addr) => (addr.default = false));
      }
      userAddress.address.push(newAddress);
      await userAddress.save();
    } else {
      const newAddressDoc = new Address({
        userID: userId,
        address: [{ ...newAddress, default: true }],
      });
      await newAddressDoc.save();
    }

    res.redirect('/checkout');
  } catch (error) {
    console.error('Error adding address:', error);
    res.redirect('/pageerror');
  }
};

const loadcheckoutEditAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const addressId = req.params.id;

    const userAddress = await Address.findOne({ userID: userId });
    if (!userAddress) return res.redirect('/pageerror');

    const addressToEdit = userAddress.address.id(addressId);
    if (!addressToEdit) return res.redirect('/pageerror');

    res.render('checkout-editAddress', { address: addressToEdit });
  } catch (error) {
    console.error('Error loading edit address:', error);
    res.redirect('/pageerror');
  }
};

const editAddressCheckout = async (req, res) => {
  try {
    const userId = req.session.user;
    const addressId = req.params.id;
    const data = req.body;

    const userAddress = await Address.findOne({ userID: userId });
    if (!userAddress) return res.redirect('/pageerror');

    const addressToEdit = userAddress.address.id(addressId);
    if (!addressToEdit) return res.redirect('/pageerror');

    addressToEdit.name = data.name;
    addressToEdit.city = data.city;
    addressToEdit.landMark = data.landMark;
    addressToEdit.state = data.state;
    addressToEdit.pincode = data.pincode;
    addressToEdit.phoneNumber = data.phoneNumber;
    addressToEdit.altPhone = data.altPhone;
    addressToEdit.addressType = data.addressType;

    if (data.default === 'on') {
      userAddress.address.forEach(
        (addr) => (addr.default = addr._id.toString() === addressId)
      );
    }

    await userAddress.save();
    res.redirect('/checkout');
  } catch (error) {
    console.error('Error editing address:', error);
    res.redirect('/pageerror');
  }
};

const createRazorpayOrder = async (req, res) => {
  try {
    const { selectedAddress, amount, couponCode } = req.body;
    const userId = req.session.user;

    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || !cart.items.length) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }
    const blockedProduct = cart.items.find((item) => item.productId.isBlocked);
    if (blockedProduct) {
      return res.status(400).json({
        success: false,
        message: `The product "${blockedProduct.productId.productName}" is blocked and cannot be ordered.`,
      });
    }
    const outOfStockItems = [];
    for (const item of cart.items) {
      const variant = item.productId.variants.find(
        (v) => v.size === item.variant.size
      );
      if (!variant || variant.quantity < item.variant.quantity) {
        outOfStockItems.push({
          productName: item.productId.productName,
          size: item.variant.size,
          requested: item.variant.quantity,
          available: variant ? variant.quantity : 0,
        });
      }
    }

    if (outOfStockItems.length > 0) {
      const message = outOfStockItems
        .map(
          (item) =>
            `${item.productName} (${item.size}): Requested ${item.requested}, Available ${item.available}`
        )
        .join(', ');
      return res
        .status(400)
        .json({ success: false, message: `Stock limit reached: ${message}` });
    }

    const orderId = `ORD${Date.now()}`;
    const order = new Order({
      userId,
      orderId,
      orderedItems: cart.items.map((item) => ({
        product: item.productId._id,
        variant: item.variant,
        price: item.totalPrice / item.variant.quantity,
        name: item.productId.productName,
        productImage: item.productId.productImage,
      })),
      totalPrice: cart.items.reduce((sum, item) => sum + item.totalPrice, 0),
      discount: couponCode
        ? amount - cart.items.reduce((sum, item) => sum + item.totalPrice, 0)
        : 0,
      finalAmount: amount,
      address: selectedAddress,
      paymentMethod: 'razorpay',
      status: 'Payment Pending',
      couponApplied: !!couponCode,
      couponCode: couponCode || null,
    });

    await order.save();

    const razorpayOrder = await razorpayInstance.orders.create({
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: orderId,
    });

    await Cart.findOneAndDelete({ userId });

    res.status(200).json({
      success: true,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      orderId,
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res
      .status(500)
      .json({ success: false, message: 'Failed to create Razorpay order' });
  }
};

// const verifyRazorpayPayment = async (req, res) => {
//     try {
//         const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

//         const expectedSignature = crypto
//             .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
//             .update(`${razorpayOrderId}|${razorpayPaymentId}`)
//             .digest('hex');

//         if (expectedSignature !== razorpaySignature) {
//             return res.status(400).json({ success: false, message: 'Invalid payment signature' });
//         }

//         const order = await Order.findOneAndUpdate(
//             { orderId },
//             {
//                 status: 'Pending',
//                 'paymentDetails.razorpayOrderId': razorpayOrderId,
//                 'paymentDetails.razorpayPaymentId': razorpayPaymentId,
//                 'paymentDetails.razorpaySignature': razorpaySignature,
//                 'paymentDetails.succeededAt': new Date(),
//                 'paymentDetails.failureReason': null
//             },
//             { new: true }
//         );

//         if (!order) {
//             return res.status(404).json({ success: false, message: 'Order not found' });
//         }

//         res.status(200).json({ success: true, orderId: order.orderId, message: 'Payment verified' });
//     } catch (error) {
//         console.error('Error verifying payment:', error);
//         res.status(500).json({ success: false, message: 'Payment verification failed' });
//     }
// };

const verifyRazorpayPayment = async (req, res) => {
  try {
    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } =
      req.body;

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid payment signature' });
    }

    const order = await Order.findOne({ orderId }).populate(
      'orderedItems.product'
    );
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });
    }

    order.status = 'Processing';
    order.paymentDetails = {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      succeededAt: new Date(),
      failureReason: null,
    };

    const stockUpdates = order.orderedItems.map((item) => ({
      productId: item.product._id,
      size: item.variant.size,
      quantity: item.variant.quantity,
    }));

    for (const update of stockUpdates) {
      const product = await Product.findOne({ _id: update.productId });
      const variant = product.variants.find((v) => v.size === update.size);
      if (!variant || variant.quantity < update.quantity) {
        order.status = 'Cancelled';
        order.paymentDetails.failureReason = `Insufficient stock for ${product.productName}`;
        await order.save();
        return res
          .status(400)
          .json({
            success: false,
            message: `Insufficient stock for ${product.productName}`,
          });
      }

      await Product.updateOne(
        { _id: update.productId, 'variants.size': update.size },
        { $inc: { 'variants.$.quantity': -update.quantity } }
      );
    }

    await order.save();

    res
      .status(200)
      .json({
        success: true,
        orderId: order.orderId,
        message: 'Payment verified and order processing started',
      });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res
      .status(500)
      .json({ success: false, message: 'Payment verification failed' });
  }
};

const loadThankYouPage = async (req, res) => {
  try {
    console.log('Accessing /thank-you route');
    const { orderId } = req.query;
    console.log('Order ID from query:', orderId);

    if (!orderId) {
      console.log('Order ID not provided');
      return res
        .status(400)
        .render('error', { message: 'Order ID is required' });
    }

    console.log('Fetching order from database...');
    const order = await Order.findOne({ orderId }).populate(
      'orderedItems.product'
    );

    if (!order) {
      console.log('Order not found for orderId:', orderId);
      return res.status(404).render('error', { message: 'Order not found' });
    }

    console.log('Order found:', order);

    if (order.status === 'Payment Pending') {
      console.log('Updating order status to Pending for orderId:', orderId);
      order.status = 'Pending';
      await order.save();
      console.log('Order status updated:', order);
    }

    const orderDate = order.createdAt
      ? order.createdAt.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : 'Date not available';

    console.log('Formatted order date:', orderDate);

    const orderData = {
      orderId: order.orderId,
      paymentMethod: order.paymentMethod || 'Razorpay',
      status: order.status || 'Pending',
      totalPrice: order.totalPrice || 0,
      discount: order.discount || 0,
      finalAmount: order.finalAmount || 0,
      orderedItems: order.orderedItems
        ? order.orderedItems.map((item) => ({
            name:
              item.name || (item.product ? item.product.name : 'Unnamed Item'),
            price: item.price || 0,
            variant: {
              size: item.variant?.size || 'N/A',
              quantity: item.variant?.quantity || 1,
            },
            productImage:
              item.productImage ||
              (item.product?.image ? [item.product.image] : []),
          }))
        : [],
    };

    console.log('Rendering thank-you page with data:', orderData);
    res.render('thankyou', { order: orderData, orderDate });
  } catch (error) {
    console.error('Error loading thank-you page:', error);
    res
      .status(500)
      .render('error', { message: 'Server error: ' + error.message });
  }
};

const cancelOrder = async (req, res) => {
  try {
    const { orderId, reason } = req.body;
    const userId = req.session.user;

    const order = await Order.findOne({ orderId }).populate(
      'orderedItems.product'
    );
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });

    if (order.status !== 'Pending' && order.status !== 'Processing') {
      return res
        .status(400)
        .json({ success: false, message: 'Cannot cancel order at this stage' });
    }

    order.status = 'Cancelled';
    order.cancellationReason = reason || 'No reason provided';
    order.cancelledAt = new Date();

    for (const item of order.orderedItems) {
      const product = item.product;
      const variant = product.variants.find(
        (v) => v.size === item.variant.size
      );
      if (variant) {
        variant.quantity += item.variant.quantity;
        product.totalStock += item.variant.quantity;
        await product.save();
      }
    }

    let refundAmount = order.finalAmount;
    if (order.paymentMethod !== 'Cash on Delivery') {
      const user = await User.findById(userId);
      user.wallet += refundAmount;
      user.walletHistory.push({
        transactionId: `TXN${Date.now()}`,
        type: 'credit',
        amount: refundAmount,
        date: new Date(),
      });
      await user.save();
    }

    await order.save();
    res
      .status(200)
      .json({ success: true, message: 'Order cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const cancelProduct = async (req, res) => {
  try {
    const { orderId, productId, reason } = req.body;
    const userId = req.session.user;

    const order = await Order.findOne({ orderId }).populate(
      'orderedItems.product'
    );
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });

    const item = order.orderedItems.find((i) => i._id.toString() === productId);
    if (!item)
      return res
        .status(404)
        .json({ success: false, message: 'Product not found in order' });

    if (order.status !== 'Pending' && order.status !== 'Processing') {
      return res
        .status(400)
        .json({
          success: false,
          message: 'Cannot cancel product at this stage',
        });
    }

    item.cancelStatus = 'Cancelled';
    item.cancellationReason = reason || 'No reason provided';
    item.cancelledAt = new Date();

    const product = item.product;
    const variant = product.variants.find((v) => v.size === item.variant.size);
    if (variant) {
      variant.quantity += item.variant.quantity;
      product.totalStock += item.variant.quantity;
      await product.save();
    }

    const allCancelled = order.orderedItems.every(
      (i) => i.cancelStatus === 'Cancelled'
    );
    if (allCancelled) order.status = 'Cancelled';
    else
      order.finalAmount = order.orderedItems.reduce(
        (sum, i) =>
          i.cancelStatus !== 'Cancelled'
            ? sum + i.price * i.variant.quantity
            : sum,
        0
      );

    if (order.paymentMethod !== 'Cash on Delivery') {
      const refundAmount = item.price * item.variant.quantity;
      const user = await User.findById(userId);
      user.wallet += refundAmount;
      user.walletHistory.push({
        transactionId: `TXN${Date.now()}`,
        type: 'credit',
        amount: refundAmount,
        date: new Date(),
      });
      await user.save();
    }

    await order.save();
    res
      .status(200)
      .json({ success: true, message: 'Product cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling product:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const returnProduct = async (req, res) => {
  try {
    const { orderId, productId, reason } = req.body;

    const order = await Order.findOne({ orderId });
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });

    if (order.status !== 'Delivered') {
      return res
        .status(400)
        .json({
          success: false,
          message: 'Only delivered products can be returned',
        });
    }

    const item = order.orderedItems.find((i) => i._id.toString() === productId);
    if (!item)
      return res
        .status(404)
        .json({ success: false, message: 'Product not found in order' });

    const daysSinceDelivery = Math.floor(
      (new Date() - new Date(order.deliveredAt)) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceDelivery > 30) {
      return res
        .status(400)
        .json({
          success: false,
          message: 'Return period (30 days) has expired',
        });
    }

    item.returnStatus = 'Requested';
    item.returnReason = reason;
    item.returnRequestedAt = new Date();

    await order.save();
    res
      .status(200)
      .json({
        success: true,
        message: 'Return request submitted successfully',
      });
  } catch (error) {
    console.error('Error processing return:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const handlePaymentDismissal = async (req, res) => {
  try {
    const { orderId } = req.body;

    const order = await Order.findOneAndUpdate(
      { orderId },
      {
        status: 'Payment Pending',
        'paymentDetails.failureReason': 'Payment dismissed by user',
      },
      { new: true }
    );

    if (!order)
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });

    res.json({
      success: true,
      message: 'Order status updated to Payment Pending',
      orderId: order.orderId,
    });
  } catch (error) {
    console.error('Error handling payment dismissal:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const handlePaymentFailure = async (req, res) => {
  try {
    const { orderId, failureReason } = req.body;

    const order = await Order.findOneAndUpdate(
      { orderId },
      {
        status: 'Payment Pending',
        'paymentDetails.failureReason': failureReason,
        'paymentDetails.succeededAt': null,
      },
      { new: true }
    );

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });
    }

    res
      .status(200)
      .json({ success: true, message: 'Payment failure recorded' });
  } catch (error) {
    console.error('Error handling payment failure:', error);
    res
      .status(500)
      .json({ success: false, message: 'Failed to handle payment failure' });
  }
};

const retryPayment = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res
        .status(400)
        .json({ success: false, message: 'Order ID is required' });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });
    }

    if (!['Payment Pending', 'Pending'].includes(order.status)) {
      return res
        .status(400)
        .json({ success: false, message: 'Order is not eligible for retry' });
    }

    const razorpayOrder = await razorpayInstance.orders.create({
      amount: Math.round(order.finalAmount * 100),
      currency: 'INR',
      receipt: order.orderId,
    });

    const razorpayOptions = {
      key: process.env.RAZORPAY_KEY_ID,
      amount: razorpayOrder.amount,
      currency: 'INR',
      name: 'Lush Scents',
      description: `Retry Payment for Order #${order.orderId}`,
      order_id: razorpayOrder.id,
      prefill: {
        name: req.session.user ? req.session.user.name : '',
        email: req.session.user ? req.session.user.email : '',
        contact: req.session.user ? req.session.user.mobile : '',
      },
      notes: {
        orderId: order.orderId,
      },
      theme: {
        color: '#ff5733',
      },
    };

    res.status(200).json({
      success: true,
      paymentMethod: 'razorpay',
      razorpayOptions,
    });
  } catch (error) {
    console.error('Error in retryPayment:', error);
    res
      .status(500)
      .json({ success: false, message: 'Server error: ' + error.message });
  }
};
const loadTransactionFailurePage = async (req, res) => {
  try {
    const { orderId } = req.query;

    if (!orderId) {
      return res
        .status(400)
        .render('error', { message: 'Order ID is required' });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).render('error', { message: 'Order not found' });
    }

    res.render('transaction-failure', { orderId });
  } catch (error) {
    res.status(500).render('error', { message: 'Server error' });
  }
};

const downloadInvoice = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const order = await Order.findOne({ orderId })
      .populate('orderedItems.product')
      .populate('userId', 'name')
      .lean();

    if (!order) return res.status(404).send('Order not found');

    const addressDoc = await Address.findOne({ userID: order.userId });
    const selectedAddress = addressDoc.address.find(
      (addr) => addr._id.toString() === order.address.toString()
    );
    if (!selectedAddress) return res.status(404).send('Address not found');

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=invoice-${orderId}.pdf`
    );
    doc.pipe(res);

    doc
      .fontSize(24)
      .text('LUSH SCENTES', 50, 50)
      .fontSize(10)
      .text('www.lushscentes.com', 50, 80)
      .text('support@lushscentes.com', 50, 95)
      .text('+91 98765 43210', 50, 110);

    doc
      .fontSize(20)
      .text('INVOICE', 300, 50, { align: 'right', width: 250 })
      .fontSize(10)
      .text(`Invoice No: ${orderId}`, 300, 80, { align: 'right', width: 250 })
      .text(`Date: ${new Date().toLocaleDateString()}`, 300, 95, {
        align: 'right',
        width: 250,
      })
      .text(
        `Order Date: ${new Date(order.createdOn).toLocaleDateString()}`,
        300,
        110,
        { align: 'right', width: 250 }
      );

    doc.moveTo(50, 140).lineTo(550, 140).stroke();

    doc
      .fontSize(14)
      .text('Bill To:', 50, 170)
      .fontSize(10)
      .text(selectedAddress.name, 50, 190)
      .text(
        `${selectedAddress.landMark}, ${selectedAddress.city}, ${selectedAddress.state} - ${selectedAddress.pincode}`,
        50,
        205
      )
      .text(`Phone: ${selectedAddress.phoneNumber}`, 50, 220);

    const tableTop = 300;
    doc.rect(50, tableTop - 10, 500, 25).fill('#f6f6f6');
    doc
      .fillColor('black')
      .fontSize(10)
      .text('Item Description', 50, tableTop)
      .text('Size', 250, tableTop, { width: 50, align: 'center' })
      .text('Qty', 300, tableTop, { width: 70, align: 'center' })
      .text('Unit Price', 370, tableTop, { width: 90, align: 'right' })
      .text('Amount', 460, tableTop, { width: 90, align: 'right' });

    let yPosition = tableTop + 30;
    let subtotal = 0;
    order.orderedItems.forEach((item) => {
      const price = item.price;
      const amount = price * item.variant.quantity;
      subtotal += amount;

      doc
        .text(item.name, 50, yPosition, { width: 200 })
        .text(item.variant.size, 250, yPosition, { width: 50, align: 'center' })
        .text(item.variant.quantity.toString(), 300, yPosition, {
          width: 70,
          align: 'center',
        })
        .text(`₹${price.toFixed(2)}`, 370, yPosition, {
          width: 90,
          align: 'right',
        })
        .text(`₹${amount.toFixed(2)}`, 460, yPosition, {
          width: 90,
          align: 'right',
        });

      yPosition += 25;
    });

    doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
    yPosition += 20;

    doc
      .text('Subtotal:', 370, yPosition, { width: 90, align: 'right' })
      .text(`₹${subtotal.toFixed(2)}`, 460, yPosition, {
        width: 90,
        align: 'right',
      });

    if (order.discount !== undefined) {
      yPosition += 20;
      doc
        .text('Discount:', 370, yPosition, { width: 90, align: 'right' })
        .text(`₹${order.discount.toFixed(2)}`, 460, yPosition, {
          width: 90,
          align: 'right',
        });
    }

    yPosition += 25;
    doc.rect(360, yPosition - 5, 190, 25).fill('#f6f6f6');
    doc
      .fillColor('black')
      .fontSize(12)
      .text('Total:', 370, yPosition, { width: 90, align: 'right' })
      .text(`₹${order.finalAmount.toFixed(2)}`, 460, yPosition, {
        width: 90,
        align: 'right',
      });

    yPosition += 40;
    doc
      .fontSize(10)
      .text(`Payment Method: ${order.paymentMethod}`, 50, yPosition);

    yPosition += 15;
    doc.text(`Order Status: ${order.status}`, 50, yPosition);

    const footerY = doc.page.height - 50;
    doc
      .fontSize(8)
      .text('Thank you for shopping with LUSH SCENTES!', 50, footerY, {
        align: 'center',
        width: 500,
      });

    doc.end();
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).send('Error generating invoice');
  }
};

module.exports = {
  loadCheckoutPage,
  processCheckout,
  loadCheckoutAddress,
  addressPost,
  loadcheckoutEditAddress,
  editAddressCheckout,
  createRazorpayOrder,
  verifyRazorpayPayment,
  loadThankYouPage,
  cancelOrder,
  cancelProduct,
  returnProduct,
  handlePaymentDismissal,
  downloadInvoice,
  handlePaymentFailure,
  retryPayment,
  loadTransactionFailurePage,
};
