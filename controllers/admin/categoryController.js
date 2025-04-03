const Category = require('../../models/categorySchema.js');
const Product = require('../../models/productSchema.js');

const categoryInfo = async (req, res) => {
  try {
    let search = '';
    if (req.query.search) {
      search = req.query.search;
    }

    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;

    const query = search ? { name: { $regex: search, $options: 'i' } } : {};

    const categoryData = await Category.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalCategories = await Category.countDocuments(query);
    const totalPages = Math.ceil(totalCategories / limit);

    res.render('category', {
      cat: categoryData,
      currentPage: page,
      totalPages: totalPages,
      totalCategories: totalCategories,
      req: req,
    });
  } catch (error) {
    console.error(error);
    return res.redirect('/pageerror');
  }
};

const addCategory = async (req, res) => {
  const { name, description } = req.body;

  try {
    if (!name || !description) {
      return res
        .status(400)
        .json({ error: 'Name and description are required' });
    }

    const nameRegex = /^[a-zA-Z0-9\s]+$/;
    if (!nameRegex.test(name)) {
      return res
        .status(400)
        .json({
          error: 'Category name can only contain letters, numbers, and spaces',
        });
    }

    const existingCategory = await Category.findOne({
      name: { $regex: `^${name}$`, $options: 'i' },
    });
    if (existingCategory) {
      return res.status(400).json({ error: 'Category already exists' });
    }

    const newCategory = new Category({
      name: name.trim(),
      description: description.trim(),
    });
    await newCategory.save();

    return res
      .status(200)
      .json({ success: true, message: 'Category added successfully' });
  } catch (error) {
    console.error('Error adding category:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const getListCategory = async (req, res) => {
  try {
    let id = req.query.id;
    await Category.updateOne({ _id: id }, { $set: { isListed: true } });
    res.redirect('/admin/category');
  } catch (error) {
    res.redirect('/pageerror');
  }
};
const getUnListCategory = async (req, res) => {
  try {
    let id = req.query.id;
    await Category.updateOne({ _id: id }, { $set: { isListed: false } });
    res.redirect('/admin/category');
  } catch (error) {
    res.redirect('/pageerror');
  }
};

const getEditCategory = async (req, res) => {
  try {
    const id = req.query.id;
    console.log('Fetching category with ID:', id);
    const category = await Category.findOne({ _id: id });
    if (!category) {
      console.log('Category not found for ID:', id);
      return res
        .status(404)
        .render('pageerror', { message: 'Category not found' });
    }
    console.log('Category found:', category);
    res.render('edit-category', { category: category });
  } catch (error) {
    console.error('Error fetching category:', error);
    res.redirect('/pageerror');
  }
};

const editCategory = async (req, res) => {
  try {
    console.log('Edit Category Request Received');
    console.log('Request Params:', req.params);
    console.log('Request Body:', req.body);

    const id = req.params.id;
    const { categoryName, description } = req.body;

    if (!categoryName || !description) {
      console.log('Validation Failed: Missing fields');
      return res
        .status(400)
        .json({ error: 'Name and description are required' });
    }

    const nameRegex = /^[a-zA-Z0-9\s]+$/;
    if (!nameRegex.test(categoryName)) {
      console.log('Validation Failed: Invalid characters in category name');
      return res
        .status(400)
        .json({
          error: 'Category name can only contain letters, numbers, and spaces',
        });
    }

    const existingCategory = await Category.findOne({
      name: { $regex: `^${categoryName}$`, $options: 'i' },
      _id: { $ne: id },
    });

    if (existingCategory) {
      console.log('Validation Failed: Category name already exists');
      return res
        .status(400)
        .json({
          error: 'Category name already exists, please choose another name',
        });
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      {
        name: categoryName.trim(),
        description: description.trim(),
      },
      { new: true }
    );

    if (updatedCategory) {
      console.log('Category Updated Successfully:', updatedCategory);
      return res
        .status(200)
        .json({ success: true, message: 'Category updated successfully' });
    } else {
      console.log('Category Not Found');
      return res.status(404).json({ error: 'Category not found' });
    }
  } catch (error) {
    console.error('Error updating category:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
module.exports = {
  categoryInfo,
  addCategory,
  getListCategory,
  getUnListCategory,
  getEditCategory,
  editCategory,
};
