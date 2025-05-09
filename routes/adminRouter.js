const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const customerController = require('../controllers/admin/customerController');
const categoryController = require('../controllers/admin/categoryController');
const productController = require('../controllers/admin/productController');
const orderController = require('../controllers/admin/orderController');
const offerController = require('../controllers/admin/offerController');
const couponController = require('../controllers/admin/couponController');
const upload = require('../helpers/multer');
const { isAuthenticated, isLogin } = require('../middlewares/adminAuth');

router.get('/pageerror', adminController.pageerror);

router.get('/login', isLogin, adminController.loadLogin);
router.post('/login', isLogin, adminController.login);

router.get('/dashboard', isAuthenticated, adminController.loadDashboard);
router.get(
  '/dashboard/analytics',
  isAuthenticated,
  adminController.getAnalyticsData
);
router.get(
  '/dashboard/top-performers',
  isAuthenticated,
  adminController.getTopPerformers
);
router.get(
  '/sales-report',
  isAuthenticated,
  adminController.generateSalesReport
);
router.get(
  '/download/excel',
  isAuthenticated,
  adminController.downloadExcelReport
);
router.get('/download/pdf', isAuthenticated, adminController.downloadPDFReport);

router.get('/logout', adminController.logout);

router.get('/users', isAuthenticated, customerController.customerInfo);
router.get(
  '/blockCustomer',
  isAuthenticated,
  customerController.customerBlocked
);
router.get(
  '/unblockCustomer',
  isAuthenticated,
  customerController.customerunBlocked
);

router.get('/category', isAuthenticated, categoryController.categoryInfo);
router.post('/addCategory', isAuthenticated, categoryController.addCategory);
router.get(
  '/listCategory',
  isAuthenticated,
  categoryController.getListCategory
);
router.get(
  '/unlistCategory',
  isAuthenticated,
  categoryController.getUnListCategory
);
router.get(
  '/editCategory',
  isAuthenticated,
  categoryController.getEditCategory
);
router.post(
  '/editCategory/:id',
  isAuthenticated,
  categoryController.editCategory
);

router.get(
  '/addProducts',
  isAuthenticated,
  productController.getProductAddPage
);
router.post(
  '/addProducts',
  isAuthenticated,
  upload.fields([{ name: 'productImages', maxCount: 4 }]),
  productController.addProducts
);

router.get('/product', isAuthenticated, productController.getAllProducts);
router.get('/blockProduct', isAuthenticated, productController.blockProduct);
router.get(
  '/unblockProduct',
  isAuthenticated,
  productController.unblockProduct
);
router.get('/editProduct', isAuthenticated, productController.getEditProduct);
router.post(
  '/editProduct/:id',
  isAuthenticated,
  (req, res, next) => {
    upload.array('productImages', 4)(req, res, (err) => {
      if (err) {
        console.error('Multer error:', err.message, err.stack);
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  productController.editProduct
);
router.post(
  '/deleteSingleImage',
  isAuthenticated,
  productController.deleteSingleImage
);

router.get('/order', isAuthenticated, orderController.getListOfOrders);
router.get('/order/:orderId', isAuthenticated, orderController.getOrderDetails);
router.post(
  '/updateOrderStatus/:orderId',
  isAuthenticated,
  orderController.updateStatus
);

router.post('/approve-return', isAuthenticated, orderController.approveReturn);
router.post('/reject-return', isAuthenticated, orderController.rejectReturn);

router.get('/offer', isAuthenticated, offerController.loadOffer);
router.get('/offer-list', isAuthenticated, offerController.offerList);
router.post('/offer', isAuthenticated, offerController.addOffer);
router.put(
  '/offer-update/:offerId',
  isAuthenticated,
  offerController.updateOffer
);
router.delete(
  '/offer-remove/:offerId',
  isAuthenticated,
  offerController.removeOffer
);

router.get('/coupon', isAuthenticated, couponController.loadCoupon);
router.post('/coupon', isAuthenticated, couponController.createCoupon);
router.put('/coupon/:couponId', isAuthenticated, couponController.editCoupon);
router.delete(
  '/coupon/:couponId',
  isAuthenticated,
  couponController.deleteCoupon
);

module.exports = router;
