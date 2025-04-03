const User = require('../../models/userSchema');
const Address = require('../../models/addressShema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const env = require('dotenv').config();
const session = require('express-session');

function generateOtp() {
  const digits = '1234567890';
  let otp = '';
  for (let i = 0; i < 6; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
  console.log('otp:', otp);
}

const sendVerificationEmail = async (email, otp) => {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
      },
    });

    const mailOptions = {
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: 'Your OTP for password reset',
      text: `Your OTP is ${otp}`,
      html: `<b><h4>Your OTP: ${otp}</h4><br></b>`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

const getForgetPassPage = async (req, res) => {
  try {
    res.render('forgot-password', { message: '' });
  } catch (error) {
    res.redirect('/pageNotFound');
  }
};

const forgotEmailValid = async (req, res) => {
  try {
    console.log('Received email:', req.body.email);
    const { email } = req.body;
    const findUser = await User.findOne({ email: email });

    if (findUser) {
      const otp = generateOtp();
      const emailSent = await sendVerificationEmail(email, otp);
      console.log('otp:', otp);
      console.log('email sent', emailSent);

      if (emailSent) {
        req.session.userOtp = otp;
        req.session.email = email;
        return res.json({
          success: true,
          message: 'OTP sent successfully',
        });
      } else {
        return res.json({
          success: false,
          message: 'Failed to send OTP. Please try again',
        });
      }
    } else {
      return res.json({
        success: false,
        message: 'User with this email does not exist',
      });
    }
  } catch (error) {
    console.error('Error in forgotEmailValid:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred. Please try again.',
    });
  }
};

const getForgotPassOtpPage = async (req, res) => {
  try {
    if (!req.session.userOtp || !req.session.email) {
      return res.redirect('/forgot-password');
    }
    res.render('forgotPass-otp', { message: '' });
  } catch (error) {
    console.error('Error loading OTP page:', error);
    res.redirect('/pageNotFound');
  }
};
const verifyForgotPassOtp = async (req, res) => {
  try {
    const enteredOtp = req.body.otp;
    console.log('enteredOtp', enteredOtp);
    if (enteredOtp === req.session.userOtp) {
      res.json({ success: true, redirectUrl: '/reset-password' });
    } else {
      res.json({ success: false, message: 'OTP not matching ' });
    }
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: 'An error occured. Please try again' });
  }
};

const getResetPassPage = async (req, res) => {
  try {
    res.render('reset-password');
  } catch (error) {
    res.redirect('/pageNotFound');
  }
};

const resetPassword = async (req, res) => {
  try {
    const { newPass1 } = req.body;
    const email = req.session.email;

    if (!newPass1) {
      return res.render('reset-password', {
        message: 'Please provide a new password.',
      });
    }

    if (!email) {
      return res.render('reset-password', {
        message:
          'Session expired. Please start the password reset process again.',
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.render('reset-password', {
        message: 'User not found. Please try again.',
      });
    }

    const hashedPassword = await bcrypt.hash(newPass1, 10);

    await User.findByIdAndUpdate(user._id, { password: hashedPassword });

    req.session.userOtp = null;
    req.session.email = null;

    req.session.loginMessage =
      'Password has been reset successfully. Please login with your new password.';
    return res.redirect('/login');
  } catch (error) {
    console.error('Error resetting password:', error);
    return res.render('reset-password', {
      message: 'An error occurred. Please try again.',
    });
  }
};

const userProfile = async (req, res) => {
  try {
    console.log('Session user:', req.session.user);
    const userId = req.session.user._id;

    const orderPage = parseInt(req.query.page) || 1;
    const orderLimit = parseInt(req.query.limit) || 3;
    const orderSkip = (orderPage - 1) * orderLimit;

    const walletPage = parseInt(req.query.walletPage) || 1;
    const walletLimit = 5;
    const walletSkip = (walletPage - 1) * walletLimit;

    const addressPage = parseInt(req.query.addressPage) || 1;
    const addressLimit = 2;
    const addressSkip = (addressPage - 1) * addressLimit;

    const activeTab = req.query.tab || 'profile';

    const userData = await User.findById(userId).lean();
    if (!userData) throw new Error('User not found');

    const addressData = await Address.findOne({ userID: userId });
    let paginatedAddresses = [];
    let totalAddresses = 0;
    let totalAddressPages = 0;

    if (addressData && addressData.address && addressData.address.length > 0) {
      totalAddresses = addressData.address.length;
      totalAddressPages = Math.ceil(totalAddresses / addressLimit);
      paginatedAddresses = addressData.address.slice(
        addressSkip,
        addressSkip + addressLimit
      );
    }

    const totalOrders = await Order.countDocuments({ userId: userId });
    const totalOrderPages = Math.ceil(totalOrders / orderLimit);

    const orders = await Order.find({ userId: userId })
      .sort({ createdOn: -1 })
      .skip(orderSkip)
      .limit(orderLimit)
      .populate({
        path: 'orderedItems.product',
        select: 'productName productImage variants',
      })
      .lean();

    for (let order of orders) {
      const addressDoc = await Address.findOne({ userID: userId });
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
          order.addressDetails = null;
        }
      } else {
        order.addressDetails = null;
      }
      for (let item of order.orderedItems) {
        const product = item.product;
        if (product && product.reviews) {
          const hasReviewed = product.reviews.some(
            (review) => review.user.toString() === userId.toString()
          );
          item.hasReviewed = hasReviewed;
        } else {
          item.hasReviewed = false;
        }
      }
    }

    const sortedWalletHistory = userData.walletHistory
      ? [...userData.walletHistory].sort(
          (a, b) => new Date(b.date) - new Date(a.date)
        )
      : [];
    const paginatedWalletHistory = sortedWalletHistory.slice(
      walletSkip,
      walletSkip + walletLimit
    );
    const totalWalletTransactions = userData.walletHistory
      ? userData.walletHistory.length
      : 0;
    const totalWalletPages = Math.ceil(totalWalletTransactions / walletLimit);
    console.log('i reached the profile page area');

    res.render('profile', {
      user: { ...userData, walletHistory: paginatedWalletHistory },
      userAddress: { ...addressData, address: paginatedAddresses },
      orders: orders,
      pagination: {
        orderPage,
        orderLimit,
        totalOrders,
        totalOrderPages,
      },
      walletPagination: {
        walletPage,
        walletLimit,
        totalWalletTransactions,
        totalWalletPages,
      },
      addressPagination: {
        addressPage,
        addressLimit,
        totalAddresses,
        totalAddressPages,
      },
      activeTab,
    });

    console.log('byeee');
  } catch (error) {
    console.error('Error retrieving profile data:', error);
    res.status(500).send('Internal Server Error: ' + error.message);
  }
};
const changePassWord = async (req, res) => {
  try {
    console.log('reched change password');
    res.render('change-pass');
  } catch (error) {
    console.log('Error in loading the page');
    res.redirect('/pageerror');
  }
};

const changePassWordValid = async (req, res) => {
  try {
    const { email } = req.body;
    console.log('email:', email);
    const userExist = await User.findOne({ email });
    console.log('hii:', userExist);
    if (!req.session.user) {
      return res.redirect('/login');
    }

    if (email !== req.session.user.email) {
      return res.json({
        success: false,
        message: 'The email does not match your logged in email',
      });
    }
    if (userExist) {
      const otp = generateOtp();
      const emailSent = await sendVerificationEmail(email, otp);
      if (emailSent) {
        req.session.userOtp = otp;
        req.session.userData = req.body;
        req.session.email = email;
        console.log('OTP:', otp);
        res.render('change-password-otp');
      } else {
        res.json({
          success: false,
          message: 'Failed to send OTP. Please try again',
        });
      }
    } else {
      res.render('change-pass', {
        message: 'User with this email does not exist',
      });
    }
  } catch (error) {
    console.error('Error in change password validation', Error);
    res.redirect('/pageNotFound');
  }
};

const verifyChangePassOtp = async (req, res) => {
  try {
    const enteredOtp = req.body.otp;
    console.log('Verify OTP route hit');
    console.log('Entered OTP:', enteredOtp);
    console.log('Session OTP:', req.session.userOtp);
    console.log('Full session:', req.session);

    if (String(enteredOtp) === String(req.session.userOtp)) {
      console.log('OTP matched!');
      return res.redirect('/update-password');
    } else {
      console.log('OTP mismatch!');
      return res.render('change-password-otp', {
        error: 'Invalid OTP. Please try again.',
      });
    }
  } catch (error) {
    console.error('Error in OTP verification:', error);
    return res.render('change-password-otp', {
      error: 'An error occurred. Please try again.',
    });
  }
};
const renderResetPassword = async (req, res) => {
  try {
    if (!req.session.email) {
      return res.redirect('/change-password');
    }
    res.render('password-reset', {
      email: req.session.email,
    });
  } catch (error) {
    console.error('Error rendering reset password page:', error);
    res.redirect('/pageerror');
  }
};
const changeresetPassword = async (req, res) => {
  try {
    const { email, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
      return res.render('password-reset', {
        email,
        message: 'Passwords do not match',
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.render('password-reset', {
        email,
        message: 'User not found',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await User.findByIdAndUpdate(user._id, {
      password: hashedPassword,
    });

    delete req.session.userOtp;
    delete req.session.email;

    return res.redirect('/login?message=Password updated successfully');
  } catch (error) {
    console.error('Error in password reset:', error);
    return res.render('password-reset', {
      email: req.body.email,
      message: 'An error occurred while resetting password',
    });
  }
};

const addAddress = async (req, res) => {
  try {
    const user = req.session.user;
    res.render('add-address', { user: user });
  } catch (error) {
    res.redirect('/pageNotFound');
  }
};

const postAddAddress = async (req, res) => {
  console.log('adress here');

  try {
    const userId = req.session.user;
    const userData = await User.findOne({ _id: userId });
    const {
      addressType,
      name,
      city,
      landMark,
      state,
      pincode,
      phone,
      altPhone,
    } = req.body;
    console.log('address are:', req.body);

    const userAddress = await Address.findOne({ userID: userData._id });
    console.log('user address:', userAddress);

    if (!userAddress) {
      const newAddress = new Address({
        userID: userData._id,
        address: [
          {
            addressType,
            name,
            city,
            landMark,
            state,
            pincode: Number(pincode),
            phoneNumber: phone,
            altPhone,
          },
        ],
      });
      console.log('new adress:', newAddress);

      await newAddress.save();
      console.log('i am saved');
    } else {
      userAddress.address.push({
        addressType,
        name,
        city,
        landMark,
        state,
        pincode: Number(pincode),
        phoneNumber: phone,
        altPhone,
      });
      await userAddress.save();
      console.log('i am not saved');
    }
    res.redirect('/userprofile');
    console.log('i jumbed to user profile');
  } catch (error) {
    console.error('Error adding address:', error);

    res.redirect('/pageNotFound');
  }
};

const editAddress = async (req, res) => {
  console.log('edit address');

  try {
    const addressId = req.query.id;
    const user = req.session.user;

    console.log('Debugging info:', {
      addressId,
      userId: user._id,
    });

    const currAddress = await Address.findOne({
      userID: user._id,
    });

    if (!currAddress) {
      console.log('No address document found for user');

      return res.redirect('/pageNotFound');
    }

    const addressData = currAddress.address.find((item) => {
      return item._id.toString() === addressId;
    });

    if (!addressData) {
      console.log('Specific address not found in array');
      return res.redirect('/pageNotFound');
    }
    res.render('edit-address', { address: addressData, user: user });
  } catch (error) {
    console.error('Error in edit address', error);
    res.redirect('/pageNotFound');
  }
};

const postEditAddress = async (req, res) => {
  try {
    const addressId = req.body._id;
    const user = req.session.user;

    if (!user || !user._id) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    const updatedAddress = await Address.findOneAndUpdate(
      {
        userID: user._id,
        'address._id': addressId,
      },
      {
        $set: {
          'address.$': {
            _id: addressId,
            addressType: req.body.addressType,
            name: req.body.name,
            city: req.body.city,
            landMark: req.body.landMark,
            state: req.body.state,
            pincode: req.body.pincode,
            phoneNumber: req.body.phoneNumber,
            altPhone: req.body.altPhone,
          },
        },
      },
      { new: true }
    );

    if (!updatedAddress) {
      return res.status(404).json({
        success: false,
        message: 'Address not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Address updated successfully',
    });
  } catch (error) {
    console.error('Error updating address:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
    });
  }
};
const deleteAddress = async (req, res) => {
  try {
    const addressId = req.query.id;
    const findAddress = await Address.findOne({ 'address._id': addressId });
    if (!findAddress) {
      return res.status(404).send('Address not found');
    }

    await Address.updateOne(
      {
        'address._id': addressId,
      },
      {
        $pull: {
          address: {
            _id: addressId,
          },
        },
      }
    );
    res.redirect('/userProfile');
  } catch (error) {
    console.error('Error in delete address', error);
    res.redirect('/pageNotFound');
  }
};

module.exports = {
  getForgetPassPage,
  forgotEmailValid,
  verifyForgotPassOtp,
  getResetPassPage,
  getForgotPassOtpPage,
  userProfile,
  changePassWord,
  changePassWordValid,
  verifyChangePassOtp,
  getForgotPassOtpPage,
  addAddress,
  postAddAddress,
  editAddress,
  postEditAddress,
  deleteAddress,
  renderResetPassword,
  resetPassword,
  changeresetPassword,
};
