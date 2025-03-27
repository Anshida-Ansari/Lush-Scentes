const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const Offer = require('../../models/offerSchema')

const productDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);

    const productId = req.query.id;
    const product = await Product.findById(productId)
      .populate('category')
      .populate('reviews.user');
    console.log('Product:', product);

    if (!product) {
      console.error('Product not found');
      return res.redirect('/pageNotFound');
    }

    const relatedProducts = await Product.find({
      category: product.category,
      _id: { $ne: product._id },
    });

  
    const currentDate = new Date();
    const offers = await Offer.find({
      status: true,
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate },
      $or: [
        { productId: product._id }, 
        { categoryId: product.category._id }, 
      ],
    });

    let appliedOffer = null;
    let highestDiscount = 0;
    let offerType = null;

    offers.forEach((offer) => {
      if (offer.discount > highestDiscount) {
        highestDiscount = offer.discount;
        appliedOffer = offer.name;
        offerType = offer.type;
      }
    });

    const variantsWithDiscount = product.variants.map((variant) => {
      const regularPrice = variant.regularPrice;
      const discountAmount = (highestDiscount / 100) * regularPrice;
      const discountedPrice = regularPrice - discountAmount;

      return {
        ...variant._doc,
        regularPrice,
        discountedPrice: discountedPrice.toFixed(2),
        discountPercentage: highestDiscount,
      };
    });

    const totalRatings = product.reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = product.reviews.length > 0 ? (totalRatings / product.reviews.length).toFixed(1) : 0;

    res.render('product-details', {
      user: userData,
      product: {
        ...product._doc,
        variants: variantsWithDiscount,
      },
      appliedOffer,
      offerType,
      highestDiscount,
      category: product.category,
      relatedProduct: relatedProducts,
      averageRating,
    });
  } catch (error) {
    console.error('Error fetching product details:', error);
    res.redirect('/pageNotFound');
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



// const submitReview = async (req, res) => {
//     try {
//       const userId = req.session.user;
//       if (!userId) {
//         return res.status(401).json({
//           success: false,
//           message: 'Please log in to submit a review',
//         });
//       }
  
//       const { productId, review, rating } = req.body;
//       const user = await User.findById(userId);
//       if (!user) {
//         return res.status(404).json({ success: false, message: 'User not found' });
//       }
  
//       const product = await Product.findById(productId);
//       if (!product) {
//         return res.status(404).json({ success: false, message: 'Product not found' });
//       }
  
//       const newReview = {
//         user: userId,
//         name: user.name,
//         email: user.email,
//         review,
//         rating: parseInt(rating),
//       };
  
//       product.reviews.push(newReview);
  
//       const totalRatings = product.reviews.reduce((sum, review) => sum + review.rating, 0);
//       product.rating = product.reviews.length > 0 ? (totalRatings / product.reviews.length).toFixed(1) : 0;
  
//       await product.save();
  
//       res.status(200).json({
//         success: true,
//         message: 'Review submitted successfully',
//         averageRating: product.rating,
//         newReview: newReview, 
//       });
//     } catch (error) {
//       console.error('Error submitting review:', error);
//       res.status(500).json({ success: false, message: 'Error submitting review' });
//     }
//   };



// const submitReview = async (req, res) => {
//   try {
//       const userId = req.session.user;
//       if (!userId) {
//           return res.status(401).json({
//               success: false,
//               message: 'Please log in to submit a review',
//           });
//       }

//       const { productId, review, rating } = req.body;
//       const user = await User.findById(userId);
//       if (!user) {
//           return res.status(404).json({ success: false, message: 'User not found' });
//       }

//       const product = await Product.findById(productId);
//       if (!product) {
//           return res.status(404).json({ success: false, message: 'Product not found' });
//       }

//       // Check if user has purchased and received this product
//       const order = await Order.findOne({
//           userId: userId,
//           'orderedItems.product': productId,
//           status: 'Delivered'
//       });

//       if (!order) {
//           return res.status(403).json({
//               success: false,
//               message: 'You can only review products you have purchased and received'
//           });
//       }

//       // Check for duplicate review
//       const existingReview = product.reviews.find(r => r.user.toString() === userId.toString());
//       if (existingReview) {
//           return res.status(400).json({
//               success: false,
//               message: 'You have already reviewed this product'
//           });
//       }

//       const newReview = {
//           user: userId,
//           name: user.name,
//           email: user.email,
//           review,
//           rating: parseInt(rating),
//       };

//       product.reviews.push(newReview);

//       const totalRatings = product.reviews.reduce((sum, review) => sum + review.rating, 0);
//       product.rating = product.reviews.length > 0 ? (totalRatings / product.reviews.length).toFixed(1) : 0;

//       await product.save();

//       res.status(200).json({
//           success: true,
//           message: 'Review submitted successfully',
//           averageRating: product.rating,
//           newReview: newReview,
//       });
//   } catch (error) {
//       console.error('Error submitting review:', error);
//       res.status(500).json({ success: false, message: 'Error submitting review' });
//   }
// };
const submitReview = async (req, res) => {
  try {
      // Assuming user ID comes from authentication middleware (e.g., JWT or session)
      const userId = req.session.user
      if (!userId) {
          return res.status(401).json({
              success: false,
              message: 'Please log in to submit a review',
          });
      }

      const { productId, orderId, review, rating } = req.body;

      // Validate input
      if (!productId || !orderId || !review || !rating) {
          return res.status(400).json({
              success: false,
              message: 'All fields (productId, orderId, review, rating) are required',
          });
      }

      if (isNaN(rating) || rating < 1 || rating > 5) {
          return res.status(400).json({
              success: false,
              message: 'Rating must be a number between 1 and 5',
          });
      }

      // Find the user
      const user = await User.findById(userId);
      if (!user) {
          return res.status(404).json({
              success: false,
              message: 'User not found',
          });
      }

      // Find the product
      const product = await Product.findById(productId);
      if (!product) {
          return res.status(404).json({
              success: false,
              message: 'Product not found',
          });
      }

      // Verify the order exists, is delivered, and contains the product
      const order = await Order.findOne({
          _id: orderId,
          user: userId, // Match user ID
          status: 'Delivered',
          orderedItems: {
              $elemMatch: {
                  _id: productId, // Assuming product ID is stored as `_id` in orderedItems
              },
          },
      });

      if (!order) {
          return res.status(403).json({
              success: false,
              message: 'You can only review products from delivered orders you purchased',
          });
      }

      // Check for duplicate review
      const existingReview = product.reviews.find(
          (r) => r.user.toString() === userId.toString()
      );
      if (existingReview) {
          return res.status(400).json({
              success: false,
              message: 'You have already reviewed this product',
          });
      }

      // Create new review
      const newReview = {
          user: userId,
          name: user.name,
          email: user.email,
          review,
          rating: parseInt(rating),
          createdAt: new Date(),
      };

      product.reviews.push(newReview);

      // Update average rating
      const totalRatings = product.reviews.reduce((sum, rev) => sum + rev.rating, 0);
      product.rating = product.reviews.length > 0 ? totalRatings / product.reviews.length : 0;

      await product.save();

      return res.status(200).json({
          success: true,
          message: 'Review submitted successfully',
          averageRating: product.rating,
          newReview,
      });
  } catch (error) {
      console.error('Error submitting review:', error);
      return res.status(500).json({
          success: false,
          message: 'Server error while submitting review',
      });
  }
};

module.exports = {
    productDetails,
    getProductStock,
    submitReview
};

