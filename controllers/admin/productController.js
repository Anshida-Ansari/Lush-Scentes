const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const product = require('../../models/productSchema');
const cloudinary = require('cloudinary').v2;
const { handleUpload } = require('../../config/cloudinary');

const getProductAddPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const category = await Category.find({ isListed: true });
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
      return res
        .status(400)
        .json({
          success: false,
          error:
            'All fields (Product Name, Description, Category, Variants) are required',
        });
    }

    if (!/^[a-zA-Z0-9\s]{3,100}$/.test(productName.trim())) {
      return res.status(400).json({
        success: false,
        error:
          'Product name must be 3-100 characters long and contain only alphanumeric characters and spaces',
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
      return res
        .status(400)
        .json({ success: false, error: 'Invalid category name' });
    }

    let parsedVariants;
    try {
      parsedVariants = JSON.parse(variants);
      if (!Array.isArray(parsedVariants) || parsedVariants.length === 0) {
        throw new Error('Variants must be a non-empty array');
      }
    } catch (e) {
      return res
        .status(400)
        .json({ success: false, error: 'Invalid variants format' });
    }

    const variantsArray = parsedVariants.map((variant) => {
      const quantity = parseInt(variant.quantity);
      const regularPrice = parseFloat(variant.regularPrice);
      const salesPrice = variant.salesPrice
        ? parseFloat(variant.salesPrice)
        : null;

      if (!['15ml', '50ml', '100ml'].includes(variant.size)) {
        throw new Error(`Invalid size: ${variant.size}`);
      }
      if (isNaN(quantity) || quantity < 0) {
        throw new Error('Quantity must be a non-negative number');
      }
      if (isNaN(regularPrice) || regularPrice <= 0) {
        throw new Error('Regular price must be a positive number');
      }
      if (
        salesPrice !== null &&
        (isNaN(salesPrice) || salesPrice < 0 || salesPrice >= regularPrice)
      ) {
        throw new Error(
          'Sales price must be a positive number less than regular price'
        );
      }

      return {
        size: variant.size,
        quantity,
        regularPrice,
        salesPrice,
      };
    });

    const totalStock = variantsArray.reduce(
      (sum, variant) => sum + variant.quantity,
      0
    );
    if (totalStock === 0) {
      return res.status(400).json({
        success: false,
        error: 'Total stock across all variants must be greater than 0',
      });
    }

    if (
      !req.files ||
      !req.files.productImages ||
      req.files.productImages.length < 3
    ) {
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

    const productExists = await Product.findOne({
      productName: productName.trim(),
    });
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
    const search = req.query.search || '';
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
    console.log('ivideyum');
    let id = req.query.id;
    await Product.updateOne({ _id: id }, { $set: { isBlocked: true } });
    res.redirect('/admin/product');
  } catch (error) {
    res.redirect('/admin/pageerror');
  }
};

const unblockProduct = async (req, res) => {
  try {
    console.log('ivide ethi');

    let id = req.query.id;
    await Product.updateOne({ _id: id }, { $set: { isBlocked: false } });
    res.redirect('/admin/product');
  } catch (error) {
    res.redirect('/pageerror');
  }
};

const getEditProduct = async (req, res) => {
  try {
    console.log('i am reached here ');
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
  console.log('editProduct: Request received');
  try {
    const productId = req.params.id;
    const { productName, description, category } = req.body;

    let variants;
    if (!req.body.variants || typeof req.body.variants !== 'string') {
      throw new Error('Variants field is missing or invalid');
    }

    const sanitizedVariants = req.body.variants.trim().replace(/[\n\r\t]/g, '');

    try {
      variants = JSON.parse(sanitizedVariants);
      console.log('Parsed variants:', variants);
    } catch (parseError) {
      console.error('Variants parsing error:', parseError);
      throw new Error('Invalid variants data: ' + parseError.message);
    }

    if (!Array.isArray(variants) || variants.length === 0) {
      throw new Error('Variants must be a non-empty array');
    }

    const validSizes = ['15ml', '50ml', '100ml'];
    for (const variant of variants) {
      if (!validSizes.includes(variant.size))
        throw new Error(`Invalid size: ${variant.size}`);
      if (typeof variant.quantity !== 'number' || variant.quantity < 0)
        throw new Error('Quantity must be a non-negative number');
      if (typeof variant.regularPrice !== 'number' || variant.regularPrice <= 0)
        throw new Error('Regular price must be a positive number');
      if (
        variant.salesPrice &&
        (typeof variant.salesPrice !== 'number' ||
          variant.salesPrice < 0 ||
          variant.salesPrice >= variant.regularPrice)
      ) {
        throw new Error(
          'Sales price must be a positive number less than regular price'
        );
      }
    }

    const newImageUrls = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const b64 = Buffer.from(file.buffer).toString('base64');
        const dataURI = 'data:' + file.mimetype + ';base64,' + b64;
        console.log('Uploading to Cloudinary:', dataURI.substring(0, 50));
        const uploadResponse = await handleUpload(dataURI);
        console.log('Cloudinary upload response:', uploadResponse);
        newImageUrls.push(uploadResponse.secure_url);
      }
    }

    const existingImageUrls = req.body.imageUrls
      ? [].concat(req.body.imageUrls)
      : [];
    const finalImageUrls = [...existingImageUrls, ...newImageUrls];
    console.log('Final image URLs to save:', finalImageUrls);

    if (finalImageUrls.length === 0) {
      throw new Error('At least one product image is required');
    }

    const totalStock = variants.reduce(
      (sum, variant) => sum + variant.quantity,
      0
    );
    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      {
        productName,
        description,
        category,
        productImage: finalImageUrls,
        variants,
        totalStock,
        status: totalStock > 0 ? 'Available' : 'Out of stock',
      },
      { new: true, runValidators: true }
    );

    if (!updatedProduct) {
      console.error(
        'Database update failed: Product not found for ID:',
        productId
      );
      throw new Error('Product not found or update failed');
    }

    console.log('Updated product:', updatedProduct);
    return res
      .status(200)
      .json({ message: 'Product Updated Successfully', updatedProduct });
  } catch (error) {
    console.error('Error in editProduct:', error.message, error.stack);
    return res
      .status(500)
      .json({ error: error.message || 'Internal Server Error' });
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
      console.error('Error deleting from Cloudinary:', cloudinaryError);
      return res.status(500).json({
        success: false,
        message: 'Error deleting image from Cloudinary',
      });
    }

    res.send({
      status: true,
      message: 'Image deleted successfully',
    });
  } catch (error) {
    console.error('Error in deleteSingleImage:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
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
};
