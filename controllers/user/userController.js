const User = require('../../models/userSchema')
const Category = require('../../models/categorySchema')
const Product = require('../../models/productSchema')
const env = require('dotenv').config()
const bcrypt = require('bcrypt')
const nodemailer = require('nodemailer')


const loadSignUp = async (req, res) => {
    try {
        return res.render('signup')

    } catch (error) {
        console.log('Home page not loading', error);
        res.status(500).send('Server error')


    }
}


const pageNotFound = async (req, res) => {
   res.status(400).render('page-404',{
    message:'page not found',
    status:404
   })
}
const loadHomePage = async (req, res) => {
    try {
        const user = req.session.user
        const categories = await Category.find({ isListed: true })
        
        // Find products that match all criteria
        let productData = await Product.find({
            isBlocked: false,
            category: { $in: categories.map(category => category._id) },
            totalStock: { $gt: 0 }
        }).populate('category')
        
        // Sort by creation date (newest first)
        productData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        
        // Get featured products (most recent ones)
        const featuredProducts = productData.slice(0, 4)

        if (user) {
            const userData = await User.findOne({ _id: user._id })
            return res.render('home', { 
                user: userData, 
                products: productData,
                featuredProducts: featuredProducts,
                categories: categories
            })
        } else {
            return res.render('home', { 
                products: productData,
                featuredProducts: featuredProducts,
                categories: categories
            })
        }
    } catch (error) {
        console.log('Home page not found', error);
        res.status(500).send('server error')
    }
}


function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString()
}
async function sendVerificationEmail(email, otp) {
    try {


        const transporter = nodemailer.createTransport({
            service: 'gmail',
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        })

        const info = await transporter.sendMail({
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: 'Verify Your account',
            text: `Your OTP is ${otp}`,
            html: `<b>Your OTP: ${otp}</b>`,

        })
        return info.accepted.length > 0



    } catch (error) {
        console.error('Error sending email', error)
        return false

    }

}

const signUp = async (req, res) => {

    try {

        const { name, phone, email, password, Cpassword } = req.body
        if (password !== Cpassword) {
            return res.render('signup', { message: 'Password do not match' })
        }

        const findUser = await User.findOne({ email })


        if (findUser) {
            return res.render('signup', { message: 'User with this email aldready exit' })
        }

        const otp = generateOtp()
        const emailSent = await sendVerificationEmail(email, otp)
        console.log("emailsent", emailSent);

        if (!emailSent) {
            return res.json('email-error')
        }

        req.session.userOtp = otp
        req.session.userData = { name, phone, email, password }
        console.log('anshida', req.session.userOtp)
        console.log('anshi', req.session.userData)


        res.render('verify-otp')
        console.log('OTP Sent', otp)

    } catch (error) {
        console.error('signup error', error)
        res.redirect('/pageNotFound')


    }
}


const securePassword = async (password) => {
    try {
        const passwordHash = await bcrypt.hash(password, 10)
        return passwordHash



    } catch (error) {

    }
}



const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body



        if (otp === req.session.userOtp) {
            const user = req.session.userData



            const passwordHash = await securePassword(user.password)
            const saveUserData = new User({
                name: user.name,
                email: user.email,
                phone: user.phone,
                password: passwordHash,
                googleId: user.email

            })


            await saveUserData.save()


            req.session.user = {
                _id: saveUserData._id,
                name: saveUserData.name

            }
            res.json({ success: true, redirectUrl: '/' })


        } else {
            res.status(400).json({ success: false, message: "Invalid OTP, please try again" })
        }


    } catch (error) {

        console.error("Error verifying OTP,error", error)
        res.status(500).json({ success: false, message: 'an error ocurred' })

    }
}

const resendOtp = async (req, res) => {
    try {

        console.log('Resend OTP function called')
        const { email } = req.session.userData
        if (!email) {
            return res.status(400).json({ sucess: false, message: 'Email not found in session' })
        }
        const otp = generateOtp()
        console.log('Generated OTP:', otp);
        console.log('User email:', email);
        req.session.userOtp =
            otp
        console.log('Session OTP stored:', req.session.userOtp);

        const emailSent = await sendVerificationEmail(email, otp)
        if (emailSent) {
            console.log('Resend:OTP', otp);
            res.status(200).json({ success: true, message: 'OTP Resend SUccessfully' })

        } else {
            res.status(500).json({ success: false, message: 'Failed to resent OTP, Please try again' })

        }





    } catch (error) {
        console.error('Error resending OTP', error)
        res.status(500).json({ success: false, message: 'Internal Server Error. Please try again' })
    }
}

const loadLogin = async (req, res) => {
    try {
        console.log('loding');


        if (!req.session.user) {
            return res.render('login')
        } else {
            res.redirect('/')
        }

    } catch (error) {
        res.redirect('/pageNotFound')

    }
}

const login = async (req, res) => {
    try {

        const { email, password } = req.body

        const findUser = await User.findOne({ isAdmin: 0, email: email })

        if (!findUser) {
            return res.render('login', { message: 'User not found' })
        }
        if (findUser.isBlocked) {
            return res.render('login', { message: 'User is blocked by admin' })
        }
        const passwordMatch = await bcrypt.compare(password, findUser.password)

        if (!passwordMatch) {
            return res.render('login', { message: 'Incorrect Password' })
        }
        req.session.user = findUser._id
        res.redirect('/')

    } catch (error) {
        console.error('login error', error);
        res.render('login', { message: 'login failed.Please try again later' })

    }
}


const logout = async (req, res) => {
    try {

        req.session.destroy((err) => {
            if (err) {
                console.log('Session destruction errror', err.message);
                return res.redirect('/pageNotFound')

            }
            return res.redirect('login')
        })

    } catch (error) {

        console.log('Logout error');
        res.redirect('pageNotFound')

    }
}


// const loadShoppingPage = async (req, res) => {
//     try {
//         const user = req.session.user;
//         const userData = await User.findOne({ _id: user });
//         const categories = await Category.find({ isListed: true });
//         const page = parseInt(req.query.page) || 1;
//         const limit = 9;
//         const skip = (page - 1) * limit;

     
//         let filters = {
//             isBlocked: false,
//             totalStock: { $gt: 0 }
//         };

       
//         const selectedCategory = req.query.category;
//         if (selectedCategory) {
//             filters.category = selectedCategory;
//         } else {
//             const categoryIds = categories.map(category => category._id);
//             filters.category = { $in: categoryIds };
//         }

//         const priceRange = req.query.priceRange;
//         if (priceRange) {
//             const [min, max] = priceRange.split('-').map(Number);
//             if (max) {
//                 filters.salesPrice = { $gte: min, $lte: max };
//             } else {
//                 filters.salesPrice = { $gte: min };
//             }
//         }

       
//         const searchQuery = req.query.search;
//         if (searchQuery) {
//             filters.productName = { 
//                 $regex: new RegExp(searchQuery, 'i') 
//             };
//         }

        
//         let sortOptions = { createdAt: -1 }
//         const sortBy = req.query.sortBy;
//         if (sortBy) {
//             switch (sortBy) {
//                 case 'priceLowToHigh':
//                     sortOptions = { salesPrice: 1 };
//                     break;
//                 case 'nameAZ':
//                     sortOptions = { productName: 1 };
//                     break;
//                 case 'newest':
//                     sortOptions = { createdAt: -1 };
//                     break;
//             }
//         }

       
//         const products = await Product.find(filters)
//             .sort(sortOptions)
//             .skip(skip)
//             .limit(limit);

//             const noProductsFound = products.length === 0

//         const totalProducts = await Product.countDocuments(filters);
//         const totalPages = Math.ceil(totalProducts / limit);

//         const categoriesWithIds = categories.map(category => ({
//             _id: category._id,
//             name: category.name
//         }));

//         res.render('shop', {
//             user: userData,
//             products: products,
//             categories: categoriesWithIds,
//             totalProducts: totalProducts,
//             currentPage: page,
//             totalPages: totalPages,
//             selectedCategory: selectedCategory,
//             selectedPriceRange: priceRange,
//             sortBy: sortBy,
//             query: req.query,
//             noProductsFound: noProductsFound
//         });

//     } catch (error) {
//         console.error('Shop page error:', error);
//         res.redirect('/pageerror');
//     }
// };
const loadShoppingPage = async (req, res) => {
    try {
      console.log('Entering loadShoppingPage');
      const user = req.session.user;
      console.log('User from session:', user);
      const userData = await User.findOne({ _id: user });
      console.log('User data:', userData);
      const categories = await Category.find({ isListed: true });
      console.log('Categories:', categories);
  
      const page = parseInt(req.query.page) || 1;
      const limit = 9;
      const skip = (page - 1) * limit;
  
      let filters = {
        isBlocked: false,
        totalStock: { $gt: 0 }
      };
  
      const selectedCategory = req.query.category;
      if (selectedCategory) {
        filters.category = selectedCategory;
      } else {
        const categoryIds = categories.map(category => category._id);
        filters.category = { $in: categoryIds };
      }
  
      // Adjust price range to 500 - 15000 with custom values
      const priceMin = parseInt(req.query.priceMin) || 500; // Default to 500 if not provided
      const priceMax = parseInt(req.query.priceMax) || 15000; // Default to 15000 if not provided
      console.log('Raw price inputs:', { priceMin, priceMax });
  
      // Apply price filter if custom values are provided, otherwise use default range
      if (req.query.priceMin || req.query.priceMax) {
        filters['variants.salesPrice'] = { $gte: priceMin, $lte: priceMax }; // Assuming price is in variants
        console.log('Applied price filter on variants:', filters['variants.salesPrice']);
      } else {
        console.log('No custom price filter applied, using default range');
      }
  
      const searchQuery = req.query.search;
      if (searchQuery) {
        filters.productName = { $regex: new RegExp(searchQuery, 'i') };
      }
  
      let sortOptions = { createdAt: -1 };
      const sortBy = req.query.sortBy;
      if (sortBy) {
        switch (sortBy) {
          case 'priceLowToHigh':
            sortOptions = { 'variants.salesPrice': 1 }; // Sort by variant price
            break;
          case 'nameAZ':
            sortOptions = { productName: 1 };
            break;
          case 'newest':
            sortOptions = { createdAt: -1 };
            break;
        }
      }
  
      const allProducts = await Product.find({ isBlocked: false, totalStock: { $gt: 0 } });
      console.log('All products (for debug):', allProducts.map(p => ({ name: p.productName, variants: p.variants })));
  
      const products = await Product.find(filters)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit);
      console.log('Filtered products:', products);
  
      const noProductsFound = products.length === 0;
  
      const totalProducts = await Product.countDocuments(filters);
      const totalPages = Math.ceil(totalProducts / limit);
  
      const categoriesWithIds = categories.map(category => ({
        _id: category._id,
        name: category.name
      }));
  
      console.log('Rendering shop page');
      res.render('shop', {
        user: userData,
        products: products,
        categories: categoriesWithIds,
        totalProducts: totalProducts,
        currentPage: page,
        totalPages: totalPages,
        selectedCategory: selectedCategory,
        selectedPriceRange: `${priceMin}-${priceMax}`,
        sortBy: sortBy,
        query: req.query,
        noProductsFound: noProductsFound
      });
    } catch (error) {
      console.error('Shop page error:', error);
      res.redirect('/pageerror');
    }
  };
module.exports = {
    loadHomePage,
    pageNotFound,
    loadSignUp,
    signUp,
    verifyOtp,
    resendOtp,
    loadLogin,
    login,
    logout,
    loadShoppingPage,
}