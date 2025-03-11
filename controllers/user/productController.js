
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');

const productDetails = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);

        const productId = req.query.id;
        const product = await Product.findById(productId).populate('category');
        console.log('product is:', product);


        const relatedProduct = await Product.find({ category: product.category, _id: { $ne: product._id } });

        if (!product) {
            console.error('Product not found');
            return res.redirect('/pageNotFound');
        }

        const findCategory = product.category || {};
        const categoryOffer = findCategory.categoryOffer || 0;
        const productOffer = product.productOffer || 0;
        const totalOffer = categoryOffer + productOffer;




        res.render('product-details', {
            user: userData,
            product: product,
            totalOffer: totalOffer,
            category: findCategory,
            relatedProduct
        });
    } catch (error) {
        console.error('Error fetching product details:', error);
        res.redirect('pageNotFound');
    }
};

const getProductStock = async (req, res) => {
    try {
        const { id: productId } = req.params;
        const { size } = req.query;

        console.log(`Getting stock for product: ${productId}, size: ${size}`);


        if (!productId || !size) {
            return res.status(400).json({
                success: false,
                message: 'Product ID and size are required'
            });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        const variant = product.variants.find(v => v.size === size);
        if (!variant) {
            return res.status(404).json({
                success: false,
                message: 'Variant not found'
            });
        }

        return res.status(200).json({
            success: true,
            stock: variant.quantity
        });
    } catch (error) {
        console.error('Error fetching product stock:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error while fetching stock information'
        });
    }
};


module.exports = {
    productDetails,
    getProductStock,
};

