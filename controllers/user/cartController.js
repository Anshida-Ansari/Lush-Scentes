const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const Cart = require('../../models/cartSchema')

const calculateCartTotals = (items) => {

    const subtotal = items.reduce((sum, item) => {
        if (!item.productId || !item.variant) return sum;

        const itemPrice = parseFloat(item.variant.salesPrice || item.variant.regularPrice) || 0;
        const quantity = parseInt(item.variant.quantity) || 0;
        const itemTotal = itemPrice * quantity;
        return sum + itemTotal;
    }, 0);


    const discount = 0;
    const total = subtotal - discount;

    return {
        subtotal: parseFloat(subtotal.toFixed(2)),
        discount: parseFloat(discount.toFixed(2)),
        total: parseFloat(total.toFixed(2))
    };
};

const loadcartPage = async (req, res) => {
    try {

        if (!req.session.user) {
            return res.redirect('/login');
        }
        const userId = req.session.user;
        const cart = await Cart.findOne({ userId })
            .populate({
                path: 'items.productId',
                select: 'productName productImage salesPrice variants isBlocked'
            });

        if (cart && cart.items) {
            cart.items = cart.items.filter(item => item.productId != null);
            await cart.save();
        }

        let totals = {
            subtotal: 0,
            discount: 0,
            total: 0
        };
       
        if (cart && cart.items && cart.items.length > 0) {
            totals = calculateCartTotals(cart.items);
            
        }
        

        return res.render('cart', {
            cart: cart || { items: [] },
            ...totals
        });
    } catch (error) {
        console.error('Error loading cart:', error);
        const message = error.message || 'Error loading cart page';
        return res.status(500).render('error', {
            message: 'Error loading cart page'
        });
    }
};




const addToCart = async (req, res) => {
    try {
      const { productId, variant } = req.body;
      const userId = req.session.user;
  
      if (!productId || !variant || !variant.size || !variant.quantity) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields',
        });
      }
  
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found',
        });
      }
  
      const selectedVariant = product.variants.find((v) => v.size === variant.size);
      if (!selectedVariant) {
        return res.status(404).json({
          success: false,
          message: 'Variant not found',
        });
      }
      const priceToUse = selectedVariant.salesPrice || selectedVariant.regularPrice;
  
      let cart = await Cart.findOne({ userId });
      if (!cart) {
        cart = new Cart({ userId, items: [] });
      }
  
      const existingItemIndex = cart.items.findIndex(
        (item) => item.productId.toString() === productId && item.variant.size === variant.size
      );
  
      let newQuantity = variant.quantity;
      if (existingItemIndex > -1) {
        newQuantity = cart.items[existingItemIndex].variant.quantity + variant.quantity;
      }
  
      if (newQuantity > 5) {
        return res.status(400).json({
          status: false,
          message: 'Maximum quantity allowed is 5 items',
        });
      }
  
      if (newQuantity > selectedVariant.quantity) {
        return res.status(400).json({
          success: false,
          message: 'Stock limit reached',
          availableStock: selectedVariant.quantity,
          currentCartQuantity: existingItemIndex > -1 ? cart.items[existingItemIndex].variant.quantity : 0,
        });
      }
  
      if (existingItemIndex > -1) {
        cart.items[existingItemIndex].variant.quantity = newQuantity;
        cart.items[existingItemIndex].totalPrice = newQuantity * priceToUse;
      } else {
        cart.items.push({
          productId,
          variant: {
            size: variant.size,
            quantity: variant.quantity,
            regularPrice: selectedVariant.regularPrice,
            salesPrice: selectedVariant.salesPrice,
          },
          totalPrice: variant.quantity * priceToUse,
        });
      }
  
      await cart.save();
  
      return res.status(200).json({
        success: true,
        message: 'Item added to cart successfully',
        cart: cart,
      });
    } catch (error) {
      console.error('Cart validation error details:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error while adding to cart',
      });
    }
  };

const updateCart = async (req, res) => {
    try {
      const { productId, size } = req.params;
      const { quantity } = req.body;
      const userId = req.session.user;
  
      const newQuantity = parseInt(quantity);
      if (isNaN(newQuantity) || newQuantity < 1) {
        return res.status(400).json({ message: 'Invalid quantity' });
      }
  
      if (newQuantity > 5) {
        return res.status(400).json({
          status: false,
          message: 'Maximum quantity allowed is 5 items',
        });
      }
  
      const cart = await Cart.findOne({ userId });
      if (!cart) {
        return res.status(404).json({ message: 'Cart not found' });
      }
  
      const itemIndex = cart.items.findIndex(
        (item) => item.productId.toString() === productId && item.variant.size === size
      );
  
      if (itemIndex === -1) {
        return res.status(404).json({ message: 'Item not found in cart' });
      }
  
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }
  
      const variant = product.variants.find((v) => v.size === cart.items[itemIndex].variant.size);
      if (!variant) {
        return res.status(404).json({ message: 'Variant not found' });
      }
  
      if (newQuantity > variant.quantity) {
        return res.status(400).json({
          message: 'Stock limit reached',
          availableStock: variant.quantity,
        });
      }
  
      cart.items[itemIndex].variant.quantity = newQuantity;
      const priceToUse = variant.salesPrice || variant.regularPrice;
      cart.items[itemIndex].totalPrice = newQuantity * priceToUse;
  
      await cart.save();
  
      const totals = calculateCartTotals(cart.items);
  
      res.status(200).json({
        message: 'Cart updated successfully',
        cart,
        totals,
      });
    } catch (error) {
      console.error('Error updating cart:', error);
      res.status(500).json({ message: 'Server error' });
    }
  };

const removeFromCart = async (req, res) => {
    try {
        const { productId  , size} = req.params
        const userId = req.session.user

        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        let cart = await Cart.findOne({ userId });
        if (!cart) return res.status(404).json({ message: 'Cart not found' });


        cart.items = cart.items.filter(item =>
            !(item.productId.toString() === productId && item.variant.size === size)
        );

        await cart.save();
        const totals = calculateCartTotals(cart.items);
        res.status(200).json({ message: 'Product removed from cart', cart, totals });

    } catch (error) {
        console.error('Error in removeFromCart:', error);
        res.status(500).json({ message: 'Server error' })
    }
}

module.exports = {
    loadcartPage,
    addToCart,
    updateCart,
    removeFromCart


}