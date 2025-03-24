const Product = require('../../models/productSchema')
const Category = require('../../models/categorySchema')
const User = require('../../models/userSchema')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const product = require('../../models/productSchema')
const cloudinary = require('cloudinary').v2;
const { handleUpload } = require('../../config/cloudinary');
const getProductAddPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const category = await Category.find({ isListed: true })
    const totalCategories = await Category.countDocuments({ isListed: true });
    const totalPages = Math.ceil(totalCategories / limit);

    res.render('product-add', {
      cat: category,
      currentPage: page,
      totalPages: totalPages,
    });
  } catch (error) {
    res.redirect('/pageerror');
  }
};


const addProducts = async (req, res) => {
  try {
    const { productName, description, category, variants } = req.body;

    if (!productName || !description || !category || !variants) {
      return res.status(400).json({ success: false, error: 'All fields (Product Name, Description, Category, Variants) are required' });
    }

    if (!/^[a-zA-Z0-9\s]{3,100}$/.test(productName.trim())) {
      return res.status(400).json({
        success: false,
        error: 'Product name must be 3-100 characters long and contain only alphanumeric characters and spaces',
      });
    }

    if (description.trim().length < 10 || description.trim().length > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Description must be between 10 and 1000 characters',
      });
    }

    const categoryId = await Category.findOne({ name: category });
    if (!categoryId) {
      return res.status(400).json({ success: false, error: 'Invalid category name' });
    }

    let parsedVariants;
    try {
      parsedVariants = JSON.parse(variants);
      if (!Array.isArray(parsedVariants) || parsedVariants.length === 0) {
        throw new Error('Variants must be a non-empty array');
      }
    } catch (e) {
      return res.status(400).json({ success: false, error: 'Invalid variants format' });
    }

    const variantsArray = parsedVariants.map((variant) => {
      const quantity = parseInt(variant.quantity);
      const regularPrice = parseFloat(variant.regularPrice);
      const salesPrice = variant.salesPrice ? parseFloat(variant.salesPrice) : null;

      if (!['15ml', '50ml', '100ml'].includes(variant.size)) {
        throw new Error(`Invalid size: ${variant.size}`);
      }
      if (isNaN(quantity) || quantity < 0) {
        throw new Error('Quantity must be a non-negative number');
      }
      if (isNaN(regularPrice) || regularPrice <= 0) {
        throw new Error('Regular price must be a positive number');
      }
      if (salesPrice !== null && (isNaN(salesPrice) || salesPrice < 0 || salesPrice >= regularPrice)) {
        throw new Error('Sales price must be a positive number less than regular price');
      }

      return {
        size: variant.size,
        quantity,
        regularPrice,
        salesPrice,
      };
    });

    const totalStock = variantsArray.reduce((sum, variant) => sum + variant.quantity, 0);
    if (totalStock === 0) {
      return res.status(400).json({
        success: false,
        error: 'Total stock across all variants must be greater than 0',
      });
    }

    if (!req.files || !req.files.productImages || req.files.productImages.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'At least 3 product images are required',
      });
    }

    const imagePaths = [];
    for (const file of req.files.productImages) {
      const b64 = Buffer.from(file.buffer).toString('base64');
      const dataURI = `data:${file.mimetype};base64,${b64}`;
      const result = await handleUpload(dataURI);
      imagePaths.push(result.secure_url);
      console.log(`Upload to Cloudinary:`, result.secure_url);
    }

    if (imagePaths.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Failed to upload at least 3 images to Cloudinary',
      });
    }

    const productExists = await Product.findOne({ productName: productName.trim() });
    if (productExists) {
      return res.status(400).json({
        success: false,
        error: 'Product already exists, please try with another name',
      });
    }

    const newProduct = new Product({
      productName: productName.trim(),
      description: description.trim(),
      category: categoryId._id,
      productImage: imagePaths,
      variants: variantsArray,
      totalStock,
      status: totalStock > 0 ? 'Available' : 'Out of stock',
    });

    await newProduct.save();
    console.log('Product saved:', newProduct);

    return res.status(200).json({
      success: true,
      message: 'Product added successfully',
      redirectUrl: '/admin/product',
    });
  } catch (error) {
    console.error('Error saving product:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Server error while saving product',
    });
  }
};


const getAllProducts = async (req, res) => {
  try {
      const search = req.query.search || "";
      const page = parseInt(req.query.page) || 1;
      const limit = 6;

      console.log('Fetching products - Search:', search, 'Page:', page, 'Limit:', limit);

      const productData = await Product.find({
          $or: [
              {
                  productName: {
                      $regex: new RegExp('.*' + search + '.*', 'i'),
                  },
              },
          ],
      })
          .populate('category')
          .sort({ createdAt: -1 })
          .limit(limit)
          .skip((page - 1) * limit);

      console.log('Product data fetched:', productData.length, 'products');

      const totalProducts = await Product.countDocuments({
          $or: [
              {
                  productName: {
                      $regex: new RegExp('.*' + search + '.*', 'i'),
                  },
              },
          ],
      });

      console.log('Total products count:', totalProducts);

      const totalPages = Math.ceil(totalProducts / limit);
      const category = await Category.find({ isListed: true });

      console.log('Categories fetched:', category.length);

      res.render('products', {
          data: productData,
          currentPage: page,
          totalPages: totalPages,
          cat: category,
      });
  } catch (error) {
      console.error('Error in getAllProducts:', {
          message: error.message,
          stack: error.stack,
          search: req.query.search,
          page: req.query.page,
      });
      return res.redirect('/admin/pageerror');
  }
};
const blockProduct = async (req, res) => {
  try {
    console.log("ivideyum");
    let id = req.query.id
    await Product.updateOne({ _id: id }, { $set: { isBlocked: true } })
    res.redirect('/admin/product')

  } catch (error) {
    res.redirect('/admin/pageerror')

  }
}

const unblockProduct = async (req, res) => {
  try {
    console.log("ivide ethi");

    let id = req.query.id
    await Product.updateOne({ _id: id }, { $set: { isBlocked: false } })
    res.redirect('/admin/product')
  } catch (error) {
    res.redirect('/pageerror')
  }
}



const getEditProduct = async (req, res) => {
  try {
    const id = req.query.id;
    const product = await Product.findOne({ _id: id });
    const category = await Category.find({});

    res.render('edit-product', {
      product: product,
      cat: category,
    });
  } catch (error) {
    console.log('Error in getEditProduct:', error);
    res.redirect('/pageerror');
  }
};

// const editProduct = async (req, res) => {
//   try {
//     const id = req.params.id;
//     const { productName, description, category, regularPrice, salesPrice, variants } = req.body;
//     const imageUrls = req.body.imageUrls ? (Array.isArray(req.body.imageUrls) ? req.body.imageUrls : req.body.imageUrls.split(',')) : [];

//     // Log the incoming request body for debugging
//     console.log('Request Body:', req.body);
//     console.log('Variants (raw):', variants);

//     const existingProduct = await Product.findOne({
//       productName,
//       _id: { $ne: id },
//     });

//     if (existingProduct) {
//       return res.status(400).json({
//         error: 'Product with this name already exists. Please try with another name.',
//       });
//     }

//     const currentProduct = await Product.findById(id).populate('category');
//     if (!currentProduct) {
//       return res.status(404).json({ error: 'Product not found' });
//     }

//     let updatedImages = [...imageUrls]; // Start with existing images from imageUrls
//     if (req.files && req.files.productImages && req.files.productImages.length > 0) {
//       const newImages = [];
//       for (let file of req.files.productImages) {
//         const uploadResult = await handleUpload(file.path); // Upload to Cloudinary
//         newImages.push(uploadResult.secure_url);
//       }
//       updatedImages = [...updatedImages, ...newImages];
//     }

//     if (updatedImages.length === 0) {
//       return res.status(400).json({
//         error: 'Product must have at least one image',
//       });
//     }

//     let parsedVariants = [];
//     if (variants) {
//       try {
//         // Ensure variants is a string and not empty
//         if (typeof variants !== 'string' || variants.trim() === '') {
//           throw new Error('Variants data is empty or not a string');
//         }
//         parsedVariants = JSON.parse(variants);
//         if (!Array.isArray(parsedVariants)) {
//           throw new Error('Variants must be an array');
//         }
//         if (parsedVariants.length === 0) {
//           throw new Error('At least one variant is required');
//         }
//         const sizes = new Set();
//         for (let variant of parsedVariants) {
//           if (!variant.size) {
//             return res.status(400).json({ error: 'Each variant must have a size' });
//           }
//           if (sizes.has(variant.size)) {
//             return res.status(400).json({ error: 'Each size variant must be unique' });
//           }
//           sizes.add(variant.size);
//           if (!variant.quantity || variant.quantity < 0) {
//             return res.status(400).json({ error: 'Invalid quantity in variants' });
//           }
//           variant.quantity = parseInt(variant.quantity);
//           variant.regularPrice = parseFloat(variant.regularPrice) || 0;
//           variant.salesPrice = parseFloat(variant.salesPrice) || 0;
//         }
//       } catch (e) {
//         console.error('Error parsing variants:', e.message);
//         console.error('Variants raw data:', variants);
//         return res.status(400).json({ error: 'Invalid variants data format: ' + e.message });
//       }
//     } else {
//       return res.status(400).json({ error: 'Variants are required' });
//     }

//     const updateFields = {
//       productName: productName || currentProduct.productName,
//       description: description || currentProduct.description,
//       category: category || currentProduct.category._id,
//       regularPrice: parseFloat(regularPrice) || currentProduct.regularPrice,
//       salesPrice: parseFloat(salesPrice) || currentProduct.salesPrice || 0,
//       productImage: updatedImages,
//       variants: parsedVariants.map(variant => ({
//         size: variant.size,
//         quantity: variant.quantity,
//         regularPrice: variant.regularPrice,
//         salesPrice: variant.salesPrice,
//       })),
//       totalStock: parsedVariants.reduce((total, variant) => total + variant.quantity, 0),
//     };

//     const updatedProduct = await Product.findByIdAndUpdate(id, updateFields, {
//       new: true,
//       runValidators: true,
//     });

//     res.redirect('/admin/product');
//   } catch (error) {
//     console.error('Error in editProduct:', error.message);
//     console.error('Stack trace:', error.stack);
//     res.status(500).json({ error: 'An error occurred while updating the product: ' + error.message });
//   }
// };

// const deleteSingleImage = async (req, res) => {
//   try {
//     const { imageNameToServer, productIdToServer } = req.body;

//     const product = await Product.findByIdAndUpdate(
//       productIdToServer,
//       { $pull: { productImage: imageNameToServer } },
//       { new: true }
//     );

//     if (!product) {
//       return res.status(404).json({
//         success: false,
//         message: 'Product not found',
//       });
//     }

//     const publicId = imageNameToServer.split('/').pop().split('.')[0];

//     try {
//       await cloudinary.uploader.destroy(`perfume_images/${publicId}`);
//       console.log(`Image ${publicId} deleted from Cloudinary successfully`);
//     } catch (cloudinaryError) {
//       console.error("Error deleting from Cloudinary:", cloudinaryError);
//       return res.status(500).json({
//         success: false,
//         message: 'Error deleting image from Cloudinary',
//       });
//     }

//     res.send({
//       status: true,
//       message: "Image deleted successfully",
//     });
//   } catch (error) {
//     console.error("Error in deleteSingleImage:", error);
//     return res.status(500).json({
//       success: false,
//       message: 'Server error',
//     });
//   }
// };

// const softDeleteProduct = async (req, res) => {
//   try {
//     const { productId } = req.params;
//     const product = await Product.findById(productId);
//     if (!product) {
//       return res.status(404).json({ success: false, error: 'Product not found' });
//     }
//     product.isDeleted = true;
//     await product.save();
//     return res.status(200).json({ success: true, message: 'Product soft deleted' });
//   } catch (error) {
//     console.error('Error soft deleting product:', error);
//     return res.status(500).json({ success: false, error: 'Server error' });
//   }
// };
// const editProduct = async (req, res) => {
//   try {
//     const id = req.params.id;
//     const { productName, description, category, regularPrice, salesPrice, variants } = req.body;
//     const imageUrls = req.body.imageUrls ? (Array.isArray(req.body.imageUrls) ? req.body.imageUrls : req.body.imageUrls.split(',')) : [];

//     // Log the incoming request body for debugging
//     console.log('Request Body:', req.body);
//     console.log('Variants (raw):', variants);

//     // Validate and parse variants
//     let parsedVariants = [];
//     if (variants) {
//       try {
//         // Trim the variants string to remove any leading/trailing whitespace
//         const trimmedVariants = variants.trim();
//         if (!trimmedVariants) {
//           throw new Error('Variants data is empty');
//         }
//         console.log('Trimmed Variants:', trimmedVariants); // Debug log
//         parsedVariants = JSON.parse(trimmedVariants);
//         if (!Array.isArray(parsedVariants)) {
//           throw new Error('Variants must be an array');
//         }
//         if (parsedVariants.length === 0) {
//           throw new Error('At least one variant is required');
//         }
//         const sizes = new Set();
//         for (let variant of parsedVariants) {
//           if (!variant.size) {
//             return res.status(400).json({ error: 'Each variant must have a size' });
//           }
//           if (sizes.has(variant.size)) {
//             return res.status(400).json({ error: 'Each size variant must be unique' });
//           }
//           sizes.add(variant.size);
//           if (!variant.quantity || variant.quantity < 0) {
//             return res.status(400).json({ error: 'Invalid quantity in variants' });
//           }
//           variant.quantity = parseInt(variant.quantity);
//           variant.regularPrice = parseFloat(variant.regularPrice) || 0;
//           variant.salesPrice = parseFloat(variant.salesPrice) || 0;
//         }
//       } catch (e) {
//         console.error('Error parsing variants:', e.message);
//         console.error('Variants raw data:', variants);
//         return res.status(400).json({ error: 'Invalid variants data format: ' + e.message });
//       }
//     } else {
//       return res.status(400).json({ error: 'Variants are required' });
//     }

//     const existingProduct = await Product.findOne({
//       productName,
//       _id: { $ne: id },
//     });

//     if (existingProduct) {
//       return res.status(400).json({
//         error: 'Product with this name already exists. Please try with another name.',
//       });
//     }

//     const currentProduct = await Product.findById(id).populate('category');
//     if (!currentProduct) {
//       return res.status(404).json({ error: 'Product not found' });
//     }

//     let updatedImages = [...imageUrls]; // Start with existing images from imageUrls
//     if (req.files && req.files.productImages && req.files.productImages.length > 0) {
//       const newImages = [];
//       for (let file of req.files.productImages) {
//         try {
//           const uploadResult = await handleUpload(file.path); // Upload to Cloudinary
//           newImages.push(uploadResult.secure_url);
//         } catch (uploadError) {
//           console.error('Error uploading image to Cloudinary:', uploadError);
//           return res.status(500).json({ error: 'Failed to upload image to Cloudinary: ' + uploadError.message });
//         }
//       }
//       updatedImages = [...updatedImages, ...newImages];
//     }

//     if (updatedImages.length === 0) {
//       return res.status(400).json({
//         error: 'Product must have at least one image',
//       });
//     }

//     const updateFields = {
//       productName: productName || currentProduct.productName,
//       description: description || currentProduct.description,
//       category: category || currentProduct.category._id,
//       regularPrice: parseFloat(regularPrice) || currentProduct.regularPrice,
//       salesPrice: parseFloat(salesPrice) || currentProduct.salesPrice || 0,
//       productImage: updatedImages,
//       variants: parsedVariants.map(variant => ({
//         size: variant.size,
//         quantity: variant.quantity,
//         regularPrice: variant.regularPrice,
//         salesPrice: variant.salesPrice,
//       })),
//       totalStock: parsedVariants.reduce((total, variant) => total + variant.quantity, 0),
//     };

//     const updatedProduct = await Product.findByIdAndUpdate(id, updateFields, {
//       new: true,
//       runValidators: true,
//     });

//     res.redirect('/admin/product');
//   } catch (error) {
//     console.error('Error in editProduct:', error.message);
//     console.error('Stack trace:', error.stack);
//     res.status(500).json({ error: 'An error occurred while updating the product: ' + error.message });
//   }
// };

// const deleteSingleImage = async (req, res) => {
//   try {
//     const { imageNameToServer, productIdToServer } = req.body;

//     const product = await Product.findByIdAndUpdate(
//       productIdToServer,
//       { $pull: { productImage: imageNameToServer } },
//       { new: true }
//     );

//     if (!product) {
//       return res.status(404).json({
//         success: false,
//         message: 'Product not found',
//       });
//     }

//     const publicId = imageNameToServer.split('/').pop().split('.')[0];

//     try {
//       await cloudinary.uploader.destroy(`perfume_images/${publicId}`);
//       console.log(`Image ${publicId} deleted from Cloudinary successfully`);
//     } catch (cloudinaryError) {
//       console.error("Error deleting from Cloudinary:", cloudinaryError);
//       return res.status(500).json({
//         success: false,
//         message: 'Error deleting image from Cloudinary',
//       });
//     }

//     res.send({
//       status: true,
//       message: "Image deleted successfully",
//     });
//   } catch (error) {
//     console.error("Error in deleteSingleImage:", error);
//     return res.status(500).json({
//       success: false,
//       message: 'Server error',
//     });
//   }
// };

// const softDeleteProduct = async (req, res) => {
//   try {
//     const { productId } = req.params;
//     const product = await Product.findById(productId);
//     if (!product) {
//       return res.status(404).json({ success: false, error: 'Product not found' });
//     }
//     product.isDeleted = true;
//     await product.save();
//     return res.status(200).json({ success: true, message: 'Product soft deleted' });
//   } catch (error) {
//     console.error('Error soft deleting product:', error);
//     return res.status(500).json({ success: false, error: 'Server error' });
//   }
// };

const editProduct = async (req, res) => {
  try {
    const id = req.params.id;
    const { productName, description, category, regularPrice, salesPrice, variants } = req.body;
    const imageUrls = req.body.imageUrls
      ? Array.isArray(req.body.imageUrls)
        ? req.body.imageUrls
        : req.body.imageUrls.split(',')
      : [];

    // Log the incoming request body and files for debugging
    console.log('Request Body:', req.body);
    console.log('Request Files:', req.files);
    console.log('Variants (raw):', variants);

    // Validate and parse variants
    let parsedVariants = [];
    if (variants) {
      try {
        // Trim the variants string to remove any leading/trailing whitespace
        const trimmedVariants = variants.trim();
        if (!trimmedVariants) {
          throw new Error('Variants data is empty');
        }
        console.log('Trimmed Variants:', trimmedVariants); // Debug log
        parsedVariants = JSON.parse(trimmedVariants);
        if (!Array.isArray(parsedVariants)) {
          throw new Error('Variants must be an array');
        }
        if (parsedVariants.length === 0) {
          throw new Error('At least one variant is required');
        }
        const sizes = new Set();
        for (let variant of parsedVariants) {
          if (!variant.size) {
            return res.status(400).json({ error: 'Each variant must have a size' });
          }
          if (sizes.has(variant.size)) {
            return res.status(400).json({ error: 'Each size variant must be unique' });
          }
          sizes.add(variant.size);
          if (!variant.quantity || variant.quantity < 0) {
            return res.status(400).json({ error: 'Invalid quantity in variants' });
          }
          variant.quantity = parseInt(variant.quantity);
          variant.regularPrice = parseFloat(variant.regularPrice) || 0;
          variant.salesPrice = parseFloat(variant.salesPrice) || 0;
        }
      } catch (e) {
        console.error('Error parsing variants:', e.message);
        console.error('Variants raw data:', variants);
        return res.status(400).json({ error: 'Invalid variants data format: ' + e.message });
      }
    } else {
      return res.status(400).json({ error: 'Variants are required' });
    }

    const existingProduct = await Product.findOne({
      productName,
      _id: { $ne: id },
    });

    if (existingProduct) {
      return res.status(400).json({
        error: 'Product with this name already exists. Please try with another name.',
      });
    }

    const currentProduct = await Product.findById(id).populate('category');
    if (!currentProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }

    let updatedImages = [...imageUrls]; // Start with existing images from imageUrls
    if (req.files && req.files.length > 0) {
      const newImages = [];
      for (let file of req.files) {
        try {
          const uploadResult = await handleUpload(file.path); // Upload to Cloudinary
          newImages.push(uploadResult.secure_url);
        } catch (uploadError) {
          console.error('Error uploading image to Cloudinary:', uploadError);
          return res.status(500).json({ error: 'Failed to upload image to Cloudinary: ' + uploadError.message });
        }
      }
      updatedImages = [...updatedImages, ...newImages];
    }

    if (updatedImages.length === 0) {
      return res.status(400).json({
        error: 'Product must have at least one image',
      });
    }

    const updateFields = {
      productName: productName || currentProduct.productName,
      description: description || currentProduct.description,
      category: category || currentProduct.category._id,
      regularPrice: parseFloat(regularPrice) || currentProduct.regularPrice,
      salesPrice: parseFloat(salesPrice) || currentProduct.salesPrice || 0,
      productImage: updatedImages,
      variants: parsedVariants.map(variant => ({
        size: variant.size,
        quantity: variant.quantity,
        regularPrice: variant.regularPrice,
        salesPrice: variant.salesPrice,
      })),
      totalStock: parsedVariants.reduce((total, variant) => total + variant.quantity, 0),
    };

    const updatedProduct = await Product.findByIdAndUpdate(id, updateFields, {
      new: true,
      runValidators: true,
    });

    res.redirect('/admin/product');
  } catch (error) {
    console.error('Error in editProduct:', error.message);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ error: 'An error occurred while updating the product: ' + error.message });
  }
};

const deleteSingleImage = async (req, res) => {
  try {
    const { imageNameToServer, productIdToServer } = req.body;

    const product = await Product.findByIdAndUpdate(
      productIdToServer,
      { $pull: { productImage: imageNameToServer } },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    const publicId = imageNameToServer.split('/').pop().split('.')[0];

    try {
      await cloudinary.uploader.destroy(`perfume_images/${publicId}`);
      console.log(`Image ${publicId} deleted from Cloudinary successfully`);
    } catch (cloudinaryError) {
      console.error("Error deleting from Cloudinary:", cloudinaryError);
      return res.status(500).json({
        success: false,
        message: 'Error deleting image from Cloudinary',
      });
    }

    res.send({
      status: true,
      message: "Image deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteSingleImage:", error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

const softDeleteProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    product.isDeleted = true;
    await product.save();
    return res.status(200).json({ success: true, message: 'Product soft deleted' });
  } catch (error) {
    console.error('Error soft deleting product:', error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};
// const editProduct = async (req, res) => {
//   try {
//     const id = req.params.id;
//     const { productName, description, category, regularPrice, salesPrice, variants } = req.body;
//     const imageUrls = req.body.imageUrls
//       ? Array.isArray(req.body.imageUrls)
//         ? req.body.imageUrls
//         : req.body.imageUrls.split(',')
//       : [];

//     // Log the incoming request body and files for debugging
//     console.log('Request Body:', req.body);
//     console.log('Request Files:', req.files);
//     console.log('Variants (raw):', variants);

//     // Validate and parse variants
//     let parsedVariants = [];
//     if (variants) {
//       try {
//         // Trim the variants string to remove any leading/trailing whitespace
//         const trimmedVariants = variants.trim();
//         if (!trimmedVariants) {
//           throw new Error('Variants data is empty');
//         }
//         console.log('Trimmed Variants:', trimmedVariants); // Debug log
//         parsedVariants = JSON.parse(trimmedVariants);
//         if (!Array.isArray(parsedVariants)) {
//           throw new Error('Variants must be an array');
//         }
//         if (parsedVariants.length === 0) {
//           throw new Error('At least one variant is required');
//         }
//         const sizes = new Set();
//         for (let variant of parsedVariants) {
//           if (!variant.size) {
//             return res.status(400).json({ error: 'Each variant must have a size' });
//           }
//           if (sizes.has(variant.size)) {
//             return res.status(400).json({ error: 'Each size variant must be unique' });
//           }
//           sizes.add(variant.size);
//           if (!variant.quantity || variant.quantity < 0) {
//             return res.status(400).json({ error: 'Invalid quantity in variants' });
//           }
//           variant.quantity = parseInt(variant.quantity);
//           variant.regularPrice = parseFloat(variant.regularPrice) || 0;
//           variant.salesPrice = parseFloat(variant.salesPrice) || 0;
//         }
//       } catch (e) {
//         console.error('Error parsing variants:', e.message);
//         console.error('Variants raw data:', variants);
//         return res.status(400).json({ error: 'Invalid variants data format: ' + e.message });
//       }
//     } else {
//       return res.status(400).json({ error: 'Variants are required' });
//     }

//     const existingProduct = await Product.findOne({
//       productName,
//       _id: { $ne: id },
//     });

//     if (existingProduct) {
//       return res.status(400).json({
//         error: 'Product with this name already exists. Please try with another name.',
//       });
//     }

//     const currentProduct = await Product.findById(id).populate('category');
//     if (!currentProduct) {
//       return res.status(404).json({ error: 'Product not found' });
//     }

//     let updatedImages = [...imageUrls]; // Start with existing images from imageUrls
//     if (req.files && req.files.length > 0) {
//       const newImages = [];
//       for (let file of req.files) {
//         try {
//           const uploadResult = await handleUpload(file.path); // Upload to Cloudinary
//           newImages.push(uploadResult.secure_url);
//         } catch (uploadError) {
//           console.error('Error uploading image to Cloudinary:', uploadError);
//           return res.status(500).json({ error: 'Failed to upload image to Cloudinary: ' + uploadError.message });
//         }
//       }
//       updatedImages = [...updatedImages, ...newImages];
//     }

//     if (updatedImages.length === 0) {
//       return res.status(400).json({
//         error: 'Product must have at least one image',
//       });
//     }

//     const updateFields = {
//       productName: productName || currentProduct.productName,
//       description: description || currentProduct.description,
//       category: category || currentProduct.category._id,
//       regularPrice: parseFloat(regularPrice) || currentProduct.regularPrice,
//       salesPrice: parseFloat(salesPrice) || currentProduct.salesPrice || 0,
//       productImage: updatedImages,
//       variants: parsedVariants.map(variant => ({
//         size: variant.size,
//         quantity: variant.quantity,
//         regularPrice: variant.regularPrice,
//         salesPrice: variant.salesPrice,
//       })),
//       totalStock: parsedVariants.reduce((total, variant) => total + variant.quantity, 0),
//     };

//     const updatedProduct = await Product.findByIdAndUpdate(id, updateFields, {
//       new: true,
//       runValidators: true,
//     });

//     res.redirect('/admin/product');
//   } catch (error) {
//     console.error('Error in editProduct:', error.message);
//     console.error('Stack trace:', error.stack);
//     res.status(500).json({ error: 'An error occurred while updating the product: ' + error.message });
//   }
// };

// const deleteSingleImage = async (req, res) => {
//   try {
//     const { imageNameToServer, productIdToServer } = req.body;

//     const product = await Product.findByIdAndUpdate(
//       productIdToServer,
//       { $pull: { productImage: imageNameToServer } },
//       { new: true }
//     );

//     if (!product) {
//       return res.status(404).json({
//         success: false,
//         message: 'Product not found',
//       });
//     }

//     const publicId = imageNameToServer.split('/').pop().split('.')[0];

//     try {
//       await cloudinary.uploader.destroy(`perfume_images/${publicId}`);
//       console.log(`Image ${publicId} deleted from Cloudinary successfully`);
//     } catch (cloudinaryError) {
//       console.error("Error deleting from Cloudinary:", cloudinaryError);
//       return res.status(500).json({
//         success: false,
//         message: 'Error deleting image from Cloudinary',
//       });
//     }

//     res.send({
//       status: true,
//       message: "Image deleted successfully",
//     });
//   } catch (error) {
//     console.error("Error in deleteSingleImage:", error);
//     return res.status(500).json({
//       success: false,
//       message: 'Server error',
//     });
//   }
// };

// const softDeleteProduct = async (req, res) => {
//   try {
//     const { productId } = req.params;
//     const product = await Product.findById(productId);
//     if (!product) {
//       return res.status(404).json({ success: false, error: 'Product not found' });
//     }
//     product.isDeleted = true;
//     await product.save();
//     return res.status(200).json({ success: true, message: 'Product soft deleted' });
//   } catch (error) {
//     console.error('Error soft deleting product:', error);
//     return res.status(500).json({ success: false, error: 'Server error' });
//   }
// };

module.exports = {
  getProductAddPage,
  addProducts,
  getAllProducts,
  blockProduct,
  unblockProduct,
  getEditProduct,
  editProduct,
  deleteSingleImage,
  softDeleteProduct

} 
