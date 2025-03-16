const User = require('../../models/userSchema')
const Product = require('../../models/productSchema')
const Category = require('../../models/categorySchema')
const Order = require('../../models/orderSchema');
const Coupon = require('../../models/couponShema')
const mongoose = require('mongoose')
const bcrypt = require('bcrypt')
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit-table');
const { format } = require('date-fns');

const pageerror = async (req, res) => {
    res.render('admin-error')
}


const loadLogin = (req, res) => {


    if (req.session.admin) {
        return res.redirect('/admin/dashboard')
    } return res.render('Admin-login', { message: null })
}


const login = async (req, res) => {
    try {

        const { email, password } = req.body
        console.log(email);

        const admin = await User.findOne({ email, isAdmin: true })
        console.log('found', admin);

        if (admin) {
            const passwordMatch = await bcrypt.compare(password, admin.password)
            console.log('password is match', passwordMatch);

            if (passwordMatch) {
                req.session.admin = true
                console.log('session:', req.session);

                return res.redirect('/admin/dashboard')
            } else {
                console.log('pass wrong');

                return res.render('Admin-login', { message: 'Invalid password' })
            }
        } else {
            console.log('admin is not found');
            return res.render('Admin-login', { message: 'Admin not found' });
        }


    } catch (error) {

        console.log('login error', error);
        return res.redirect('/pageerror')


    }
}



const createDateFilter = (filter, startDate, endDate) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let dateFilter = {};
  
    switch (filter?.toLowerCase()) {
      case 'daily':
        dateFilter = { createdOn: { $gte: today, $lte: new Date(now.setHours(23, 59, 59, 999)) } };
        break;
      case 'weekly':
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - 6);
        dateFilter = { createdOn: { $gte: weekStart, $lte: new Date(now.setHours(23, 59, 59, 999)) } };
        break;
      case 'monthly':
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        dateFilter = { createdOn: { $gte: monthStart, $lte: new Date(now.setHours(23, 59, 59, 999)) } };
        break;
      case 'yearly':
        const yearStart = new Date(today.getFullYear(), 0, 1);
        dateFilter = { createdOn: { $gte: yearStart, $lte: new Date(now.setHours(23, 59, 59, 999)) } };
        break;
      case 'custom':
        if (startDate && endDate) {
          dateFilter = { 
            createdOn: { 
              $gte: new Date(startDate), 
              $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)) 
            } 
          };
        }
        break;
      default:
        dateFilter = { createdOn: { $gte: today, $lte: new Date(now.setHours(23, 59, 59, 999)) } };
    }
    return dateFilter;
  };
  
  const getBestSellingProducts = async (dateFilter) => {
    return await Order.aggregate([
      { $match: { ...dateFilter, status: 'Delivered' } },
      { $unwind: '$orderedItems' },
      {
        $group: {
          _id: '$orderedItems.product',
          unitsSold: { $sum: '$orderedItems.quantity' },
          revenue: { $sum: { $multiply: ['$orderedItems.price', '$orderedItems.quantity'] } }
        }
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'productInfo'
        }
      },
      {
        $project: {
          name: { $arrayElemAt: ['$productInfo.productName', 0] },
          unitsSold: 1,
          revenue: 1
        }
      }
    ]);
  };
  
  const getBestCategories = async (dateFilter) => {
    return await Order.aggregate([
      { $match: { ...dateFilter, status: 'Delivered' } },
      { $unwind: '$orderedItems' },
      {
        $lookup: {
          from: 'products',
          localField: 'orderedItems.product',
          foreignField: '_id',
          as: 'productInfo'
        }
      },
      {
        $lookup: {
          from: 'categories',
          localField: 'productInfo.category',
          foreignField: '_id',
          as: 'categoryInfo'
        }
      },
      {
        $group: {
          _id: { $arrayElemAt: ['$categoryInfo._id', 0] },
          name: { $first: { $arrayElemAt: ['$categoryInfo.name', 0] } },
          unitsSold: { $sum: '$orderedItems.quantity' },
          revenue: { $sum: { $multiply: ['$orderedItems.price', '$orderedItems.quantity'] } }
        }
      },
      { $match: { _id: { $ne: null } } },
      { $sort: { revenue: -1 } },
      { $limit: 10 }
    ]);
  };
  
  const getSalesData = async (dateFilter) => {
    const format = '%Y-%m-%d'; 
    return await Order.aggregate([
      { $match: { ...dateFilter, status: 'Delivered' } },
      { $unwind: '$orderedItems' },
      {
        $group: {
          _id: { $dateToString: { format, date: '$createdOn' } },
          revenue: { $sum: { $multiply: ['$orderedItems.price', '$orderedItems.quantity'] } },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } },
      { $project: { date: '$_id', revenue: 1, orderCount: 1, _id: 0 } }
    ]);
  };
  
  const loadDashboard = async (req, res) => {
    try {
      const { page = 1, filter = 'daily', startDate, endDate } = req.query;
      const limit = 6;
      const dateFilter = createDateFilter(filter, startDate, endDate);
  
      const [
        totalOrders,
        salesSummary,
        orders,
        totalUsers,
        totalProducts,
        totalCoupons,
        bestSellingProducts,
        bestCategories,
        salesData
      ] = await Promise.all([
        Order.countDocuments(dateFilter),
        Order.aggregate([
          { $match: dateFilter },
          {
            $group: {
              _id: null,
              totalSales: { $sum: '$finalAmount' },
              totalDiscount: { $sum: '$discount' }
            }
          }
        ]),
        Order.find(dateFilter)
          .populate('orderedItems.product', 'productName')
          .sort({ createdOn: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        User.countDocuments(),
        Product.countDocuments(),
        Coupon.countDocuments(),
        getBestSellingProducts(dateFilter),
        getBestCategories(dateFilter),
        getSalesData(dateFilter)
      ]);
  
      const responseData = {
        totalOrders,
        totalSales: salesSummary[0]?.totalSales || 0,
        totalDiscount: salesSummary[0]?.totalDiscount || 0,
        orders,
        totalUsers,
        totalProducts,
        totalCoupons,
        bestSellingProducts,
        bestCategories,
        salesData,
        totalPages: Math.ceil(totalOrders / limit),
        currentPage: parseInt(page),
        selectedFilter: filter,
        startDate,
        endDate
      };
  
      res.render('dashboard', responseData);
    } catch (error) {
      console.error('Error loading dashboard:', error);
      res.redirect('/admin/pageerror');
    }
  };
  
  const getAnalyticsData = async (req, res) => {
    try {
      const { filter = 'daily', startDate, endDate } = req.query;
      const dateFilter = createDateFilter(filter, startDate, endDate);
  
      const [bestSellingProducts, bestCategories, salesData] = await Promise.all([
        getBestSellingProducts(dateFilter),
        getBestCategories(dateFilter),
        getSalesData(dateFilter)
      ]);
  
      res.json({ bestSellingProducts, bestCategories, salesData });
    } catch (error) {
      console.error('Error fetching analytics:', error);
      res.status(500).json({ error: error.message });
    }
  };
  
  const getTopPerformers = async (req, res) => {
    try {
      const { filter = 'daily', startDate, endDate } = req.query;
      const dateFilter = createDateFilter(filter, startDate, endDate);
  
      const [products, categories] = await Promise.all([
        getBestSellingProducts(dateFilter),
        getBestCategories(dateFilter)
      ]);
  
      res.json({ products, categories });
    } catch (error) {
      console.error('Error fetching top performers:', error);
      res.status(500).json({ error: error.message });
    }
  };
  
  const generateSalesReport = async (req, res) => {
    try {
      const { filter = 'daily', startDate, endDate } = req.query;
      const dateFilter = createDateFilter(filter, startDate, endDate);
  
      const orders = await Order.aggregate([
        { $match: dateFilter },
        { $unwind: '$orderedItems' },
        {
          $lookup: {
            from: 'products',
            localField: 'orderedItems.product',
            foreignField: '_id',
            as: 'productInfo'
          }
        },
        {
          $group: {
            _id: '$_id',
            orderId: { $first: '$orderId' },
            createdOn: { $first: '$createdOn' },
            totalPrice: { $first: '$totalPrice' },
            discount: { $first: '$discount' },
            finalAmount: { $first: '$finalAmount' },
            couponCode: { $first: '$couponCode' },
            items: {
              $push: {
                productName: { $arrayElemAt: ['$productInfo.productName', 0] },
                quantity: '$orderedItems.quantity',
                price: '$orderedItems.price'
              }
            }
          }
        }
      ]);
  
      const summary = await Order.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalAmount: { $sum: '$totalPrice' },
            totalDiscount: { $sum: '$discount' },
            finalAmount: { $sum: '$finalAmount' }
          }
        }
      ]);
  
      res.render('admin/sales-report', {
        filter,
        startDate,
        endDate,
        orders,
        summary: summary[0] || {}
      });
    } catch (error) {
      console.error('Error generating sales report:', error);
      res.redirect('/admin/pageerror');
    }
  };
  
  const downloadExcelReport = async (req, res) => {
    try {
      const { filter = 'daily', startDate, endDate } = req.query;
      const dateFilter = createDateFilter(filter, startDate, endDate);
      
      const orders = await Order.find(dateFilter).populate('orderedItems.product');
      const summary = await Order.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalAmount: { $sum: '$totalPrice' },
            totalDiscount: { $sum: '$discount' },
            finalAmount: { $sum: '$finalAmount' }
          }
        }
      ]);
  
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sales Report');
  
      worksheet.addRow(['Sales Report']);
      worksheet.addRow(['Filter:', filter]);
      worksheet.addRow(['Date Range:', `${format(dateFilter.createdOn.$gte, 'yyyy-MM-dd')} to ${format(dateFilter.createdOn.$lte, 'yyyy-MM-dd')}`]);
      worksheet.addRow([]);
  
      worksheet.columns = [
        { header: 'Order ID', key: 'orderId', width: 20 },
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Product', key: 'product', width: 25 },
        { header: 'Quantity', key: 'quantity', width: 10 },
        { header: 'Price', key: 'price', width: 12 },
        { header: 'Discount', key: 'discount', width: 12 },
        { header: 'Final Amount', key: 'finalAmount', width: 12 },
        { header: 'Coupon', key: 'coupon', width: 15 }
      ];
  
      orders.forEach(order => {
        order.orderedItems.forEach(item => {
          worksheet.addRow({
            orderId: order.orderId,
            date: format(order.createdOn, 'yyyy-MM-dd'),
            product: item.product?.productName || 'N/A',
            quantity: item.quantity,
            price: item.price,
            discount: order.discount,
            finalAmount: order.finalAmount,
            coupon: order.couponCode || 'N/A'
          });
        });
      });
  
      worksheet.addRow([]);
      worksheet.addRow(['Summary']);
      const sum = summary[0] || {};
      worksheet.addRow(['Total Orders:', sum.totalOrders || 0]);
      worksheet.addRow(['Total Amount:', sum.totalAmount || 0]);
      worksheet.addRow(['Total Discount:', sum.totalDiscount || 0]);
      worksheet.addRow(['Final Amount:', sum.finalAmount || 0]);
  
      ['price', 'discount', 'finalAmount'].forEach(key => {
        worksheet.getColumn(key).numFmt = '₹#,##0.00';
      });
  
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=SalesReport.xlsx');
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('Error generating Excel:', error);
      res.redirect('/admin/pageerror');
    }
  };
  


const downloadPDFReport = async (req, res) => {
    try {
        const { filter = 'daily', startDate, endDate } = req.query;
        const dateFilter = createDateFilter(filter, startDate, endDate);
        
        console.log('Date Filter in PDF:', dateFilter);

        const orders = await Order.find(dateFilter).populate('orderedItems.product');
        console.log('Orders fetched for PDF:', orders.map(order => ({
            orderId: order.orderId,
            createdOn: order.createdOn,
            orderedItems: order.orderedItems,
            totalPrice: order.totalPrice,
            discount: order.discount,
            finalAmount: order.finalAmount,
            couponCode: order.couponCode
        })));

        const summary = await Order.aggregate([
            { $match: dateFilter },
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    totalAmount: { $sum: '$totalPrice' },
                    totalDiscount: { $sum: '$discount' },
                    finalAmount: { $sum: '$finalAmount' }
                }
            }
        ]);
        console.log('Summary for PDF:', summary);

        const doc = new PDFDocument({ margin: 30 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=SalesReport.pdf');
        doc.pipe(res);

        doc.fontSize(20).text('Sales Report', { align: 'center' });
        doc.fontSize(12)
           .text(`Filter: ${filter}`)
           .text(`Date Range: ${format(dateFilter.createdOn.$gte, 'yyyy-MM-dd')} to ${format(dateFilter.createdOn.$lte, 'yyyy-MM-dd')}`);
        doc.moveDown();

        const tableData = orders.flatMap(order => 
            order.orderedItems.map(item => ({
                orderId: order.orderId.slice(0, 12),
                date: format(order.createdOn, 'yyyy-MM-dd'),
                product: item.product?.productName || 'N/A',
                qty: item.quantity,
                price: `₹${item.price.toFixed(2)}`,
                discount: `₹${order.discount.toFixed(2)}`,
                final: `₹${order.finalAmount.toFixed(2)}`
            }))
        );

        console.log('Table Data:', tableData);

        if (tableData.length === 0) {
            doc.fontSize(12).text('No orders found for the selected date range.', { align: 'center' });
        } else {
            const table = {
                headers: [
                    { label: 'Order ID', property: 'orderId', width: 100 },
                    { label: 'Date', property: 'date', width: 80 },
                    { label: 'Product', property: 'product', width: 120 },
                    { label: 'Qty', property: 'qty', width: 40 },
                    { label: 'Price', property: 'price', width: 60 },
                    { label: 'Discount', property: 'discount', width: 60 },
                    { label: 'Final', property: 'final', width: 60 }
                ],
                datas: tableData
            };

            await doc.table(table, {
                prepareHeader: () => doc.font('Helvetica-Bold').fontSize(10),
                prepareRow: () => doc.font('Helvetica').fontSize(9)
            });
        }

        doc.moveDown()
           .fontSize(12)
           .text('Summary', { underline: true })
           .fontSize(11);
        const sum = summary[0] || {};
        doc.text(`Total Orders: ${sum.totalOrders || 0}`)
           .text(`Total Amount: ₹${(sum.totalAmount || 0).toFixed(2)}`)
           .text(`Total Discount: ₹${(sum.totalDiscount || 0).toFixed(2)}`)
           .text(`Final Amount: ₹${(sum.finalAmount || 0).toFixed(2)}`);

        doc.end();
    } catch (error) {
        console.error('Error generating PDF:', {
            message: error.message,
            stack: error.stack,
            filter,
            startDate,
            endDate
        });
        res.redirect('/admin/pageerror');
    }
};



const logout = async (req, res) => {
    try {

        req.session.destroy(err => {
            if (err) {
                console.log('Error destroying session', err);
                return res.redirect('/pageerror')
            } else {
                res.redirect('/admin/login')
            }
        })

    } catch (error) {

        console.log('unexpected error during logout', error);
        res.redirect('/pageerror')


    }
}






module.exports = {
    loadLogin,
    login,
    pageerror,
    logout,
    loadDashboard,
    getAnalyticsData,
    getTopPerformers,
    generateSalesReport,
    downloadExcelReport,
    downloadPDFReport
}
