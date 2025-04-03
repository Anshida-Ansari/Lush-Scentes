const cloudinary = require('cloudinary').v2;
const dotenv = require('dotenv');

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function handleUpload(file) {
  try {
    const res = await cloudinary.uploader.upload(file, {
      resource_type: 'auto',
      folder: 'perfume_images',
    });
    return res;
  } catch (error) {
    console.error('Error in Cloudinary upload:', error.message, error.stack);
    throw new Error('Failed to upload image to Cloudinary: ' + error.message);
  }
}
module.exports = { handleUpload };
