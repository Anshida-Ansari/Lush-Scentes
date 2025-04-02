const express=require('express')
const userControllers = require('../controllers/user/userController')
const productController = require('../controllers/user/productController')
const profileController = require('../controllers/user/profileController')
const cartController = require('../controllers/user/cartController')
const checkoutController = require('../controllers/user/checkoutController')
const couponController = require('../controllers/user/couponController')
const wishlistController = require('../controllers/user/wishlistController')
const {userAuth,userLogin,isUserBlocked} = require('../middlewares/userAuth')
const passport = require('passport')
const router=express.Router()

router.get('/pageNotFound',userControllers.pageNotFound)

// router.get('/',userControllers.loadHomePage)

router.get('/signUp',userLogin,userControllers.loadSignUp)
router.post('/signUp',userLogin,userControllers.signUp)
router.post('/verify-otp',userLogin,userControllers.verifyOtp)
router.post('/resend-otp',userLogin,userControllers.resendOtp)


router.get('/auth/google',passport.authenticate('google',{scope:['profile','email']}))
router.get('/auth/google/callback',passport.authenticate('google',{failureRedirect:'/signup'}),
async (req,res)=>{
    try {

        if(req.user){
            if(req.user.isBlocked){
                return res.redirect('/login?error=Your account has been blocked by the admin')
            }
            req.session.user={
            _id:req.user._id,
            name:req.user.name
            }
        }
        res.redirect('/')
        
    } catch (error) {

        console.error('Google auth callback error:',error);
        res.redirect('/login')
        
        
    }
})

router.get('/productDetailsPage',userAuth,productController.productDetails)
router.get('/productDetailsPage/:id/stock',userAuth,productController.getProductStock)
router.post('/productDetailsPage/review',userAuth,productController.submitReview)

router.get('/login',userLogin,userControllers.loadLogin)
router.post('/login',userLogin,userControllers.login)
router.get('/logout',userControllers.logout)



router.get('/forgot-password',userLogin,profileController.getForgetPassPage)
router.post('/forgot-email-valid',userLogin,profileController.forgotEmailValid)
router.get('/forgotPass-otp',userLogin,profileController.getForgotPassOtpPage)
router.get('/reset-password',userLogin,profileController.getResetPassPage)
router.post('/reset-password',userLogin,profileController.resetPassword)
router.post('/verify-passForgot-otp',userLogin,profileController.verifyForgotPassOtp)

router.get('/',userControllers.loadHomePage)
router.get('/shop',isUserBlocked,userAuth,userControllers.loadShoppingPage)


router.get('/userProfile',userAuth,profileController.userProfile)
router.get('/change-pass',userAuth,profileController.changePassWord)
router.post('/change-pass',userAuth,profileController.changePassWordValid)
router.post('/verify-changepassword-otp',userAuth,profileController.verifyChangePassOtp)
router.get('/update-password', userAuth, profileController.renderResetPassword);
router.post('/update-password', userAuth, profileController.changeresetPassword);

router.get('/addAddress',userAuth,profileController.addAddress)
router.post('/addAddress',userAuth,profileController.postAddAddress)
router.get('/editAddress',userAuth,profileController.editAddress)
router.post('/editAddress',userAuth,profileController.postEditAddress)
router.get('/deleteAddress',userAuth,profileController.deleteAddress)

router.get('/cart',userAuth,cartController.loadcartPage)
router.post('/add',userAuth,cartController.addToCart)
router.put('/update/:productId/:size',userAuth,cartController.updateCart)
router.delete('/update/:productId/:size',cartController.removeFromCart);



router.get('/checkout', userAuth, checkoutController.loadCheckoutPage);
router.post('/checkout', userAuth, checkoutController.processCheckout);
router.get('/checkout-address',userAuth,checkoutController.loadCheckoutAddress)
router.post('/add-checkout-address',userAuth,checkoutController.addressPost)
router.get('/edit-address/:id',userAuth,checkoutController.loadcheckoutEditAddress)
router.post('/edit-address/:id', checkoutController.editAddressCheckout);
router.get('/thank-you', userAuth, checkoutController.loadThankYouPage);
router.get('/download-invoice/:orderId',userAuth,checkoutController.downloadInvoice);
router.post('/handle-payment-failure', checkoutController.handlePaymentFailure);
router.post('/retry-payment', checkoutController.retryPayment);
router.get('/transaction-failure', checkoutController.loadTransactionFailurePage);


router.post('/create-razorpay-order',checkoutController.createRazorpayOrder)
router.post('/verify-razorpay-payment',checkoutController.verifyRazorpayPayment)
router.post('/handle-payment-dismissal',checkoutController.handlePaymentDismissal)

router.post('/cancel',userAuth,checkoutController.cancelOrder)
router.post('/cancel-product',userAuth,checkoutController.cancelProduct)
router.post('/return-product',userAuth,checkoutController.returnProduct)


router.get('/wishlist',userAuth,wishlistController.loadWishlist)
router.post('/addWishlist',userAuth,wishlistController.addWishlist)
router.post('/removeFromWishlist',userAuth,wishlistController.removeFromWishlist)

router.post("/apply-coupon",userAuth,couponController.applyCoupon)
router.delete("/remove-coupon",userAuth,couponController.removeCoupon)



module.exports=router