const Offer = require('../../models/offerSchema');
const Category = require('../../models/categorySchema.js');
const Product = require('../../models/productSchema.js');

const loadOffer = async (req, res) => {
    try {

        if(!req.session.admin){
            return res.redirect('/admin/login')
        }

        const products = await Product.find({ isBlocked: false });
        const categories = await Category.find({ isListed: true });
        
        return res.render("offer", { products, categories });
        
    } catch (error) {
        console.error("Error in LoadOffer:", error);
        res.status(500).json({ 
            success: false, 
            message: 'Server Error' 
        });
        
    }
};

const offerList = async (req, res) => {
    try {
        if(!req.session.admin){
            return res.redirect('/admin/login')
        }

        const page = parseInt(req.query.page)
        const limit = 5
        const skip = (page-1) * limit 

        const totalOffers = await Offer.countDocuments({ status: true });
        const totalPages = Math.ceil(totalOffers / limit);

        const offers = await Offer.find({ status: true })
            .skip(skip)
            .limit(limit);

         let productName = null
         if (offers.length > 0 && offers[0].productId) {
            const product = await Product.findById(offers[0].productId);
            productName = product?.productName;
        }
        
        return res.render('offerList',{
            offers,
            productName: productName || null,
            currentPage: page,
            totalPages : totalPages,
            totalOffers : totalOffers
        })


    } catch (error) {
        console.error('Error in offerList:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server Error' 
        });
        
    }
   
};

// const addOffer = async (req, res) => {
//    try {
//     const { name, type, discount, productId, categoryId, referralCode , startDate, endDate} = req.body

//     if(discount <= 0 || discount > 100){
//         return res.status(200).json({success:false,message:'Discount must be between 1% and 100%'})
//     }

//     let offerData = new Offer({
//         name,
//         type,
//         discount,
//         startDate,
//         endDate,
//         status:true
//     })

//     if(type === 'product' && productId){
//     const product = await Product.findOne({productName: productId})
//         if(!product){
//             return res.status(404).json({message:'Prooduct not found'})
//         }
//         offerData.productId = product._id
//         offerData.originalPrice = product.salesPrice

//         const newOffer = await offerData.save()

//         product.variants.for
//         const bestDiscount  = Math.max(discount,product.categoryOffer || 0)

//         const discountedPrice = product.regularPrice - (product.regularPrice * bestDiscount / 100 )
//         product.salesPrice = Number(discountedPrice.toFixed(2))

//         await product.save()

//         return res.status(201).json({
//             success: true,
//             message: 'Product offer added Successfully',
//             offer: newOffer
//         })
//     }

//     if(type === 'category' && categoryId){

//         const category = await Category.findById(categoryId)       
//         if (!category) {
//             return res.status(404).json({ 
//                 success: false,
//                 message: 'Category not found with ID: ' + categoryId 
//             });
//         }

//         offerData.categoryId = categoryId
//         const newOffer = await offerData.save()

//         const productsInCategory = await Product.find({category: categoryId})

//         for(let product of productsInCategory){
//             if(!offerData.originalPrice){
//                 offerData.originalPrice = product.salesPrice
                 
//             }

//             const bestDiscount = Math.max(discount, product.productOffer || 0)
//             product.categoryOffer = discount

//             const discountedPrice = product.regularPrice - (product.regularPrice * bestDiscount / 100)
//             product.salesPrice = Number(discountedPrice.toFixed(2))

//             await product.save()
//         }
//         if(!category.offers){
//             category.offers = []
//         }
//         category.offers.push(newOffer._id)
//         await category.save()


//         return res.status(201).json({
//             success:true,
//             message:'category offer added successfully',
//             offer:newOffer
//         })


//     }
//     return res.status(200).json({
//         success:false,
//         message:'Invalid offer type or missing reqiuires fields'

//     })
    
//    } catch (error) {
//     console.error('Error in addOffer:', error.message,error.stack);
//     return res.status(500).json({ 
//         success: false, 
//         message: 'Server Error',
//         error:error.message 
//     });

//    }
// };
const addOffer = async (req, res) => {
    try {
        const { name, type, discount, productId, categoryId, referralCode, startDate, endDate } = req.body;

        if (discount <= 0 || discount > 100) {
            return res.status(400).json({ success: false, message: 'Discount must be between 1% and 100%' });
        }

        let offerData = new Offer({
            name,
            type,
            discount,
            startDate,
            endDate,
            status: true
        });

        if (type === 'product' && productId) {
            const product = await Product.findOne({ productName: productId });
            if (!product) {
                return res.status(404).json({ message: 'Product not found' });
            }
            offerData.productId = product._id;
            offerData.originalPrice = product.variants[0].salesPrice || product.variants[0].regularPrice;

            const newOffer = await offerData.save();

            // Update salesPrice for all variants
            product.variants.forEach(variant => {
                const bestDiscount = Math.max(discount, variant.categoryOffer || 0);
                const discountedPrice = variant.regularPrice - (variant.regularPrice * bestDiscount / 100);
                variant.salesPrice = Number(discountedPrice.toFixed(2));
            });

            await product.save();

            return res.status(201).json({
                success: true,
                message: 'Product offer added successfully',
                offer: newOffer
            });
        }

        if (type === 'category' && categoryId) {
            const category = await Category.findById(categoryId);
            if (!category) {
                return res.status(404).json({ message: 'Category not found' });
            }

            offerData.categoryId = categoryId;
            const newOffer = await offerData.save();

            const productsInCategory = await Product.find({ category: categoryId });
            for (let product of productsInCategory) {
                if (!offerData.originalPrice) {
                    offerData.originalPrice = product.variants[0].salesPrice || product.variants[0].regularPrice;
                }

                product.variants.forEach(variant => {
                    const bestDiscount = Math.max(discount, variant.productOffer || 0);
                    variant.categoryOffer = discount;
                    const discountedPrice = variant.regularPrice - (variant.regularPrice * bestDiscount / 100);
                    variant.salesPrice = Number(discountedPrice.toFixed(2));
                });

                await product.save();
            }

            if (!category.offers) category.offers = [];
            category.offers.push(newOffer._id);
            await category.save();

            return res.status(201).json({
                success: true,
                message: 'Category offer added successfully',
                offer: newOffer
            });
        }

        return res.status(400).json({
            success: false,
            message: 'Invalid offer type or missing required fields'
        });
    } catch (error) {
        console.error('Error in addOffer:', error);
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};
// const updateOffer = async(req,res)=>{
//     try {

//         const offerId = req.params.offerId
//         const {discount , startDate , endDate} = req.body 

//         if (discount <= 0 || discount > 100) {
//             return res.status(200).json({
//                 success: false,
//                 message: 'Discount must be between 1% and 100%'
//             });
//         }

//         const existingOffer = await Offer.findById(offerId)
//         if (!existingOffer) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Offer not found'
//             });
//         }

//         existingOffer.discount = discount
//         existingOffer.startDate = startDate
//         existingOffer.endDate = endDate


//         if( existingOffer.type === 'product'){
//             const product = await Product.findById( existingOffer.productId)
//             if(!product){
//                 return res.status(404).json({
//                     success: false,
//                     message: 'Associated product not found'
//                 });
//             }

//             const bestDiscount = Math.max(discount , product.categoryOffer || 0)
//             product.productOffer = discount


//             const discountedPrice = product.regularPrice - (product.regularPrice*discount)/100
//              product.salesPrice = Number(discountedPrice.toFixed(2))

//              await product.save()
//         }else if(existingOffer.type === 'category'){
//             const category = await Category.findById(existingOffer.categoryId)
//             if (!category) {
//                 return res.status(404).json({
//                     success: false,
//                     message: 'Associated category not found'
//                 });
//             }

//             const productsInCategory = await Product.find({category:existingOffer.categoryId})

//             for(let product of productsInCategory){
//                 const bestDiscount = Math.max(discount , product.productOffer || 0)
//                 product.categoryOffer = discount;

//                 const discountedPrice = product.regularPrice - (product.regularPrice * bestDiscount / 100);
//                 product.salesPrice = Number(discountedPrice.toFixed(2));
                
//                 await product.save();
//             }
//         }

//         const updatedOffer = await existingOffer.save()

//         return res.status(200).json({
//             success: true,
//             message: `${existingOffer.type.charAt(0).toUpperCase() + existingOffer.type.slice(1)} offer updated successfully`,
//             offer: updatedOffer
//         });




//     } catch (error) {
//         console.error('Error in editOffer:', error);
//         return res.status(500).json({
//                     success: false,
//                     message: 'Server Error'
//                 });
        
//     }
// }

// const removeOffer = async(req,res)=>{

//     try {
//         const offerId = req.params.offerId;
        
//         const offer = await Offer.findById(offerId);
//         if (!offer) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'offer not found'
//             });
//         }

//         if (offer.type === "product") {
//             const product = await Product.findById(offer.productId);
//             if (product) {
//                 product.productOffer = 0;
                
//                 if (product.categoryOffer > 0) {
//                     const discountedPrice = product.regularPrice - (product.regularPrice * product.categoryOffer / 100);
//                     product.salePrice = Number(discountedPrice.toFixed(2));
//                 } else {
//                     product.salePrice = product.regularPrice;
//                 }
                
//                 await product.save();
//             }
//         }

//         if (offer.type === 'category') {
//             const category = await Category.findById(offer.categoryId);
//             if (category) {
//                 category.offers = category.offers.filter(id => id.toString() !== offerId);
//                 await category.save();
//             }

//             const productsInCategory = await Product.find({ category: offer.categoryId });
//             for (let product of productsInCategory) {
//                 product.categoryOffer = 0;
                
//                 if (product.productOffer > 0) {
//                     const discountedPrice = product.regularPrice - (product.regularPrice * product.productOffer / 100);
//                     product.salePrice = Number(discountedPrice.toFixed(2));
//                 } else {
//                     product.salePrice = product.regularPrice;
//                 }
                
//                 await product.save();
//             }
//         }

//         await Offer.findByIdAndDelete(offerId);

//         return res.status(statusCode.OK).json({ 
//             success: true, 
//             message: MESSAGES.OFFER_REMOVED 
//         });

//     } catch (error) {
//         console.error('Error in removeOffer:', error);
//         return res.status(202).json({ 
//             success: false, 
//             message:'Error removing the offer'
//         });
//     }

// }
const updateOffer = async(req,res)=>{
    try {

        const offerId = req.params.offerId
        const {discount , startDate , endDate} = req.body 

        if (discount <= 0 || discount > 100) {
            return res.status(200).json({
                success: false,
                message: 'Discount must be between 1% and 100%'
            });
        }

        const existingOffer = await Offer.findById(offerId)
        if (!existingOffer) {
            return res.status(404).json({
                success: false,
                message: 'Offer not found'
            });
        }

        existingOffer.discount = discount
        existingOffer.startDate = startDate
        existingOffer.endDate = endDate


        if( existingOffer.type === 'product'){
            const product = await Product.findById( existingOffer.productId)
            if(!product){
                return res.status(404).json({
                    success: false,
                    message: 'Associated product not found'
                });
            }

            const bestDiscount = Math.max(discount , product.categoryOffer || 0)
            product.productOffer = discount


            const discountedPrice = product.regularPrice - (product.regularPrice*discount)/100
             product.salesPrice = Number(discountedPrice.toFixed(2))

             await product.save()
        }else if(existingOffer.type === 'category'){
            const category = await Category.findById(existingOffer.categoryId)
            if (!category) {
                return res.status(404).json({
                    success: false,
                    message: 'Associated category not found'
                });
            }

            const productsInCategory = await Product.find({category:existingOffer.categoryId})

            for(let product of productsInCategory){
                const bestDiscount = Math.max(discount , product.productOffer || 0)
                product.categoryOffer = discount;

                const discountedPrice = product.regularPrice - (product.regularPrice * bestDiscount / 100);
                product.salesPrice = Number(discountedPrice.toFixed(2));
                
                await product.save();
            }
        }

        const updatedOffer = await existingOffer.save()

        return res.status(200).json({
            success: true,
            message: `${existingOffer.type.charAt(0).toUpperCase() + existingOffer.type.slice(1)} offer updated successfully`,
            offer: updatedOffer
        });




    } catch (error) {
        console.error('Error in editOffer:', error);
        return res.status(500).json({
                    success: false,
                    message: 'Server Error'
                });
        
    }
}
const removeOffer = async (req, res) => {
    try {
        const offerId = req.params.offerId;
        const offer = await Offer.findById(offerId);
        if (!offer) {
            return res.status(404).json({
                success: false,
                message: 'Offer not found'
            });
        }

        if (offer.type === "product") {
            const product = await Product.findById(offer.productId);
            if (product) {
                product.productOffer = 0;
                const bestDiscount = product.categoryOffer || 0;
                const discountedPrice = product.regularPrice - (product.regularPrice * bestDiscount / 100);
                product.salesPrice = bestDiscount > 0 ? Number(discountedPrice.toFixed(2)) : product.regularPrice;
                await product.save();
            }
        } else if (offer.type === 'category') {
            const category = await Category.findById(offer.categoryId);
            if (category) {
                // Ensure category.offers is an array
                category.offers = Array.isArray(category.offers) ? category.offers.filter(id => id.toString() !== offerId) : [];
                await category.save();
            }

            const productsInCategory = await Product.find({ category: offer.categoryId });
            for (let product of productsInCategory) {
                product.categoryOffer = 0;
                const bestDiscount = product.productOffer || 0;
                const discountedPrice = product.regularPrice - (product.regularPrice * bestDiscount / 100);
                product.salesPrice = bestDiscount > 0 ? Number(discountedPrice.toFixed(2)) : product.regularPrice;
                await product.save();
            }
        }

        await Offer.findByIdAndDelete(offerId);

        return res.status(200).json({
            success: true,
            message: 'Offer removed successfully'
        });
    } catch (error) {
        console.error('Error in removeOffer:', error);
        return res.status(500).json({
            success: false,
            message: 'Error removing the offer'
        });
    }
};



module.exports = {
    loadOffer,
    offerList,
    addOffer,
    updateOffer,
    removeOffer,
  
};