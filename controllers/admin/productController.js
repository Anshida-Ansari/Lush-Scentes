const Product = require('../../models/productSchema')
const Category = require('../../models/categorySchema')
const User = require('../../models/userSchema')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const product = require('../../models/productSchema')
const cloudinary = require('../../config/cloudinary.js')

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


// const addProducts = async (req, res) => {
//   try {
//     const products = req.body;

 
//     if (!req.files || !req.files.productImages || req.files.productImages.length < 3) {
//       return res.status(400).json({ success: false, error: 'At least 3 product images are required' });
//     }

 
//     const productExists = await Product.findOne({ productName: products.productName });
//     if (productExists) {
//       return res.status(400).json({ success: false, error: 'Product already exists, please try with another name' });
//     }

    
//     const categoryId = await Category.findOne({ name: products.category });
//     if (!categoryId) {
//       return res.status(400).json({ success: false, error: 'Invalid category name' });
//     }

   
//     const variants = JSON.parse(products.variants).map((variant) => ({
//       size: variant.size,
//       quantity: variant.quantity,
//       regularPrice: variant.regularPrice,
//       salesPrice: variant.salesPrice,
//     }));

//     const totalStock = variants.reduce((sum, variant) => sum + variant.quantity, 0);

    
//     const imagePaths = [];
//     for (const file of req.files.productImages) {
//       const b64 = Buffer.from(file.buffer).toString('base64');
//       const dataURI = `data:${file.mimetype};base64,${b64}`;
//       try {
//         const result = await cloudinary.handleUpload(dataURI);
//         imagePaths.push(result.secure_url);
//         console.log(`Upload to Cloudinary:`, result.secure_url);
//       } catch (error) {
//         console.error(`Error uploading to Cloudinary:`, error);
//         return res.status(500).json({ success: false, error: 'Failed to upload image to Cloudinary' });
//       }
//     }

//     if (imagePaths.length < 3) {
//       return res.status(400).json({ success: false, error: 'Failed to upload at least 3 images' });
//     }

//     const newProduct = new Product({
//       productName: products.productName,
//       description: products.description,
//       category: categoryId._id,
//       productImage: imagePaths,
//       variants: variants,
//       totalStock: totalStock,
//       status: 'Available',
//     });

//     await newProduct.save();
//     console.log('Product saved:', newProduct);

//     return res.status(200).json({ success: true, message: 'Product added successfully', redirectUrl: '/admin/products' });
//   } catch (error) {
//     console.error('Error saving product:', error);
//     return res.status(500).json({ success: false, error: 'Server error while saving product' });
//   }
// };

const addProducts = async (req, res) => {
  try {
    const { productName, description, category, variants } = req.body;

    // Server-side validation
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

    // Validate images
    if (!req.files || !req.files.productImages || req.files.productImages.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'At least 3 product images are required',
      });
    }

    // Upload images to Cloudinary
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

    // Check for existing product
    const productExists = await Product.findOne({ productName: productName.trim() });
    if (productExists) {
      return res.status(400).json({
        success: false,
        error: 'Product already exists, please try with another name',
      });
    }

    // Create new product
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
      redirectUrl: '/admin/products',
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
      

    const totalProducts = await Product.countDocuments({
      $or: [
        {
          productName: {
            $regex: new RegExp('.*' + search + '.*', 'i'),
          },
        },
      ],
    });

    const totalPages = Math.ceil(totalProducts / limit);
    const category = await Category.find({ isListed: true });

    res.render('products', {
      data: productData,
      currentPage: page,
      totalPages: totalPages,
      cat: category,
    });
  } catch (error) {
    console.error('Error in getAllProducts:', error);
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
    res.redirect('/product')
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

const editProduct = async (req, res) => {
  try {
    const id = req.params.id;
    const data = req.body;

    const existingProduct = await Product.findOne({
      productName: data.productName,
      _id: { $ne: id },
    });

    if (existingProduct) {
      return res.status(400).json({
        error: 'Product with this name already exists. Please try with another name.',
      });
    }

   
    const currentProduct = await Product.findById(id);
    if (!currentProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }

  
    let updatedImages = [...currentProduct.productImage];
    if (req.files && req.files.images && req.files.images.length > 0) {
      const newImages = [];
      for (let file of req.files.images) {
        const originalImagePath = file.path;
        const resizedImagePath = path.join(
          'public',
          'uploads',
          'product-image',
          file.filename
        );
        await sharp(originalImagePath)
          .resize({ width: 440, height: 440 })
          .toFile(resizedImagePath);
        newImages.push(file.filename);
      }
      updatedImages = [...updatedImages, ...newImages];
    }

    if (updatedImages.length === 0) {
      return res.status(400).json({
        error: 'Product must have at least one image',
      });
    }

  
    let variants = [];
    if (data.variants) {
      variants = JSON.parse(data.variants);
      const sizes = new Set();
      for (let variant of variants) {
        if (!variant.size) {
          return res.status(400).json({
            error: 'Each variant must have a size',
          });
        }
        if (sizes.has(variant.size)) {
          return res.status(400).json({
            error: 'Each size variant must be unique',
          });
        }
        sizes.add(variant.size);
        if (!variant.quantity || variant.quantity < 0) {
          return res.status(400).json({
            error: 'Invalid quantity in variants',
          });
        }
      }
    }

   
    const updateFields = {
      productName: data.productName,
      description: data.description,
      category: data.category,
      regularPrice: data.regularPrice,
      salesPrice: data.salesPrice || 0,
      productImage: updatedImages,
      variants: variants.map((variant) => ({
        size: variant.size,
        quantity: parseInt(variant.quantity),
        regularPrice: parseFloat(variant.regularPrice) || 0,
        salesPrice: parseFloat(variant.salesPrice) || 0,
      })),
      totalStock: variants.reduce(
        (total, variant) => total + parseInt(variant.quantity),
        0
      ),
    };

   
    const updatedProduct = await Product.findByIdAndUpdate(id, updateFields, {
      new: true,
      runValidators: true,
    });

    return res.redirect('/admin/product');
  } catch (error) {
    console.error('Error in editProduct:', error);
    return res.redirect('/admin/pageerror');
  }
};
const deleteSingleImage = async (req, res) => {
  try {
    const { imageNameToServer, productIdToServer } = req.body;

    const product = await Product.findById(productIdToServer);
    if (!product) {
      return res.status(404).json({ status: false, error: 'Product not found' });
    }

    if (product.productImage.length <= 1) {
      return res.status(400).json({ status: false, error: 'Cannot delete the last image' });
    }

    await Product.findByIdAndUpdate(productIdToServer,
      { $pull: { productImage: imageNameToServer } }
    );

    const imagePath = path.join('public', 'uploads', 'product-image', imageNameToServer);

    if (fs.existsSync(imagePath)) {
      await fs.promises.unlink(imagePath);
      console.log(`Image ${imageNameToServer} deleted successfully`);
    }

    return res.json({ status: true });
  } catch (error) {
    console.error('Error deleting image:', error);
    return res.status(500).json({ status: false, error: 'Server error' });
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
