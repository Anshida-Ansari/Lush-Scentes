const User = require('../../models/userSchema');

const customerInfo = async (req, res) => {
  try {
    let search = '';
    if (req.query.search) {
      search = req.query.search;
    }

    let page = 1;
    if (req.query.page) {
      page = parseInt(req.query.page);
    }

    const limit = 3;

    const userData = await User.find({
      isAdmin: false,
      $or: [
        { name: { $regex: '.*' + search + '.*', $options: 'i' } },
        { email: { $regex: '.*' + search + '.*', $options: 'i' } },
        { phone: { $regex: '.*' + search + '.*', $options: 'i' } },
      ],
    })
      .limit(limit)
      .skip((page - 1) * limit)
      .exec();

    const count = await User.countDocuments({
      isAdmin: false,
      $or: [
        { name: { $regex: '.*' + search + '.*', $options: 'i' } },
        { email: { $regex: '.*' + search + '.*', $options: 'i' } },
        { phone: { $regex: '.*' + search + '.*', $options: 'i' } },
      ],
    });

    res.render('customer', {
      data: userData,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      req: req,
    });

    delete req.session.message;
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).send('Server Error');
  }
};

const customerBlocked = async (req, res) => {
  try {
    let id = req.query.id;

    const result = await User.updateOne(
      { _id: id },
      { $set: { isBlocked: true } }
    );

    if (result.modifiedCount > 0) {
      res.json({
        success: true,
        message: 'User blocked successfully!',
      });
    } else {
      res.json({
        success: false,
        message: 'User not found or already blocked!',
      });
    }
  } catch (error) {
    console.error('Error blocking user:', error);
    res.json({
      success: false,
      message: 'Error blocking user: ' + error.message,
    });
  }
};
const customerunBlocked = async (req, res) => {
  try {
    let id = req.query.id;

    const result = await User.updateOne(
      { _id: id },
      { $set: { isBlocked: false } }
    );

    if (result.modifiedCount > 0) {
      res.json({
        success: true,
        message: 'User unblocked successfully!',
      });
    } else {
      res.json({
        success: false,
        message: 'User not found or already unblocked!',
      });
    }
  } catch (error) {
    console.error('Error unblocking user:', error);
    res.json({
      success: false,
      message: 'Error unblocking user: ' + error.message,
    });
  }
};

module.exports = {
  customerInfo,
  customerBlocked,
  customerunBlocked,
};
