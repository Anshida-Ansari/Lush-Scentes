const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const Address = require('../../models/addressShema');
const Cart = require('../../models/cartSchema');

const getListOfOrders = async (req, res) => {
  try {
    console.log('Getting the order list');

    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    const skip = (page - 1) * limit;

    const orders = await Order.find()
      .populate('userId', 'name email')
      .populate('address')
      .sort({ createdOn: -1 })
      .skip(skip)
      .limit(limit);

    const totalOrders = await Order.countDocuments();
    const totalPages = Math.ceil(totalOrders / limit);

    if (!orders || orders.length === 0) {
      console.log('No orders found');
      return res.render('orders', {
        orders: [],
        totalPages: 1,
        currentPage: 1,
      });
    }

    res.render('orders', {
      orders,
      totalPages,
      currentPage: page,
    });
  } catch (error) {
    console.error('Error in getListOfOrders:', error.stack);
    res.status(500).send('Server error: ' + error.message);
  }
};

const getOrderDetails = async (req, res) => {
  try {
    console.log('Getting order details');
    const { orderId } = req.params;

    const order = await Order.findOne({ _id: orderId })
      .populate('userId', 'name email')
      .populate('orderedItems.product')
      .lean();

    if (!order) {
      return res.status(404).send('Order not found');
    }

    const addressDoc = await Address.findOne({ userID: order.userId._id });
    if (addressDoc && addressDoc.address && addressDoc.address.length > 0) {
      const selectedAddress = addressDoc.address.find(
        (addr) => addr._id.toString() === order.address.toString()
      );
      if (selectedAddress) {
        order.addressDetails = {
          name: selectedAddress.name,
          landMark: selectedAddress.landMark,
          city: selectedAddress.city,
          state: selectedAddress.state,
          pincode: selectedAddress.pincode,
          phoneNumber: selectedAddress.phoneNumber,
          altPhone: selectedAddress.altPhone,
        };
      } else {
        console.log(
          `No matching address found for order ${order._id} with address ID ${order.address}`
        );
        order.addressDetails = null;
      }
    } else {
      console.log(`No address document found for user ${order.userId._id}`);
      order.addressDetails = null;
    }

    res.render('orderDetails', { order });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).send('Server error');
  }
};

const updateStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const order = await Order.findOne({ _id: orderId });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });
    }

    const currentStatus = order.status;

    if (currentStatus === 'Delivered') {
      return res.status(400).json({
        success: false,
        message: 'Delivered orders cannot be changed to another status',
      });
    }

    if (
      currentStatus === 'Shipped' &&
      (status === 'Pending' || status === 'Processing')
    ) {
      return res.status(400).json({
        success: false,
        message: 'Shipped orders cannot be changed to Pending or Processing',
      });
    }

    if (currentStatus === 'Cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Cancelled orders cannot be changed to another status',
      });
    }

    order.status = status;

    if (status === 'Delivered') {
      order.invoiceData = new Date();
    }

    await order.save();

    res.json({
      success: true,
      message: 'Order status updated successfully',
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const approveReturn = async (req, res) => {
  try {
    const { orderId, productId } = req.body;
    const userId = req.session.user;

    const order = await Order.findOne({ _id: orderId });
    if (!order) {
      return res
        .status(400)
        .json({ success: false, message: 'Order is not found' });
    }

    const itemIndex = order.orderedItems.findIndex(
      (item) => item._id.toString() === productId
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Product not found in this order',
      });
    }

    const item = order.orderedItems[itemIndex];

    if (item.returnStatus !== 'Requested') {
      return res.status(400).json({
        success: false,
        message: 'No active return request found for this product',
      });
    }

    const refundAmount = item.price * item.variant.quantity;

    order.orderedItems[itemIndex].returnStatus = 'Approved';

    try {
      const product = await Product.findById(item.product);
      if (product) {
        const variantIndex = product.variants.findIndex(
          (v) => v.size === item.variant.size
        );
        if (variantIndex !== -1) {
          product.variants[variantIndex].quantity += item.variant.quantity;
          product.totalStock += item.variant.quantity;
          await product.save();
        }
      }
    } catch (error) {
      console.error(
        `Error updating stock for product ${item.product}: ${error.message}`
      );
    }

    const allItemsProcessed = order.orderedItems.every(
      (item) =>
        item.cancelStatus === 'Cancelled' ||
        item.returnStatus === 'Approved' ||
        item.returnStatus === 'Rejected' ||
        (item.returnStatus === 'Not Requested' && !item.cancelStatus)
    );
    if (allItemsProcessed) {
      order.status = order.orderedItems.some(
        (item) => item.returnStatus === 'Approved'
      )
        ? 'Returned'
        : 'Delivered';
    }

    let currentWalletBalance = 0;
    if (order.paymentMethod !== 'Cash on Delivery') {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }
      user.wallet = (parseFloat(user.wallet) || 0) + refundAmount;
      user.walletHistory.push({
        transactionId: `TXN${Date.now()}`,
        type: 'credit',
        amount: refundAmount,
        date: new Date(),
      });
      await user.save();
      currentWalletBalance = user.wallet;
    }

    await order.save();

    return res.status(200).json({
      success: true,
      message: 'Return request approved successfully',
      refundAmount: refundAmount,
      currentWalletBalance: currentWalletBalance,
      order: {
        status: order.status,
        finalAmount: order.finalAmount,
      },
    });
  } catch (error) {
    console.error(`Error approving return: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Error approving return',
      error: error.message,
    });
  }
};

const rejectReturn = async (req, res) => {
  try {
    const { orderId, productId } = req.body;

    const order = await Order.findOne({ _id: orderId });
    if (!order) {
      return res
        .status(400)
        .json({ success: false, message: 'Order is not found' });
    }

    const itemIndex = order.orderedItems.findIndex(
      (item) => item._id.toString() === productId
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Product not found in this order',
      });
    }

    if (order.orderedItems[itemIndex].returnStatus !== 'Requested') {
      return res.status(400).json({
        success: false,
        message: 'No active return request found for this product',
      });
    }

    order.orderedItems[itemIndex].returnStatus = 'Rejected';

    const allItemsProcessed = order.orderedItems.every(
      (item) =>
        item.cancelStatus === 'Cancelled' ||
        item.returnStatus === 'Approved' ||
        item.returnStatus === 'Rejected' ||
        (item.returnStatus === 'Not Requested' && !item.cancelStatus)
    );
    if (allItemsProcessed) {
      order.status = 'Delivered';
    }

    await order.save();

    return res.status(200).json({
      success: true,
      message: 'Return request rejected successfully',
    });
  } catch (error) {
    console.error(`Error rejecting return: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Error rejecting return',
    });
  }
};

module.exports = {
  getListOfOrders,
  updateStatus,
  getOrderDetails,
  approveReturn,
  rejectReturn,
};
