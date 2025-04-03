const User = require('../models/userSchema');

const userAuth = async (req, res, next) => {
  if (req.session.user) {
    return next();
  }
  return res.redirect('/login');
};

const userLogin = async (req, res, next) => {
  if (!req.session.user) {
    return next();
  }
  return res.redirect('/');
};

const isUserBlocked = async (req, res, next) => {
  try {
    if (req.session.user) {
      const user = await User.findById(req.session.user);

      if (!user) {
        req.session.destroy();
        return res.redirect('/login');
      }

      if (user.isBlocked) {
        req.session.destroy();
        return res.redirect('/login');
      }
    }
    next();
  } catch (error) {
    console.error('Error in isUserBlocked middleware:', error);
    next(error);
  }
};

module.exports = { userAuth, userLogin, isUserBlocked };
