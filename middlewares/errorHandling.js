const errorHandler = (err, req, res, next) => {
  const statusCode = err.status || 500;
  const message = err.message || 'something went wrong ';

  const adminRoute = req.originalUrl.startsWith('/admin');

  if (adminRoute) {
    return res.status(statusCode).render('admin-error', {
      message: message,
      status: statusCode,
    });
  } else {
    return res.status(statusCode).render('page-404', {
      message: message,
      status: statusCode,
    });
  }
};

module.exports = errorHandler;
