import { Cart } from '../models/Cart.js';
import { Product } from '../models/Product.js';
import { AppError } from '../utils/AppError.js';
import { paiseToRupees } from '../utils/money.js';

class CartService {
  async getOrCreateCart(userId) {
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = await Cart.create({ userId, items: [] });
    }
    return cart;
  }

  async getCart(userId) {
    const cart = await this.getOrCreateCart(userId);
    await cart.populate({
      path: 'items.productId',
      select: 'name slug sku images sellingPrice compareAtPrice availableStock isActive isArchived weightGrams dimensions'
    });

    let subtotalPaise = 0;
    const validatedItems = [];

    for (const item of cart.items) {
      const product = item.productId;
      if (!product || product.isArchived || !product.isActive) {
        continue; // Skip archived/inactive products
      }

      const itemTotal = product.sellingPrice * item.quantity;
      subtotalPaise += itemTotal;

      validatedItems.push({
        product: {
          id: product._id,
          name: product.name,
          slug: product.slug,
          sku: product.sku,
          image: product.images?.[0]?.url || '',
          sellingPrice: product.sellingPrice,
          sellingPriceInRupees: paiseToRupees(product.sellingPrice),
          availableStock: product.availableStock,
          weightGrams: product.weightGrams,
          dimensions: product.dimensions
        },
        quantity: item.quantity,
        itemTotal,
        itemTotalInRupees: paiseToRupees(itemTotal),
        isAvailable: product.availableStock >= item.quantity
      });
    }

    return {
      items: validatedItems,
      itemCount: validatedItems.reduce((acc, i) => acc + i.quantity, 0),
      subtotal: subtotalPaise,
      subtotalInRupees: paiseToRupees(subtotalPaise)
    };
  }

  async addItem(userId, { productId, quantity = 1 }) {
    const product = await Product.findById(productId);
    if (!product || !product.isActive || product.isArchived) {
      throw new AppError('Product not found or unavailable.', 404);
    }

    if (product.availableStock < quantity) {
      throw new AppError(`Only ${product.availableStock} units available in stock.`, 400);
    }

    const cart = await this.getOrCreateCart(userId);
    const existingIndex = cart.items.findIndex(
      item => item.productId.toString() === productId.toString()
    );

    if (existingIndex > -1) {
      const newQuantity = cart.items[existingIndex].quantity + quantity;
      if (newQuantity > product.availableStock) {
        throw new AppError(`Cannot add more. Only ${product.availableStock} units available.`, 400);
      }
      cart.items[existingIndex].quantity = newQuantity;
    } else {
      cart.items.push({ productId, quantity });
    }

    await cart.save();
    return this.getCart(userId);
  }

  async updateItemQuantity(userId, productId, quantity) {
    const cart = await this.getOrCreateCart(userId);
    const itemIndex = cart.items.findIndex(
      item => item.productId.toString() === productId.toString()
    );

    if (itemIndex === -1) {
      throw new AppError('Item not found in cart.', 404);
    }

    if (quantity <= 0) {
      cart.items.splice(itemIndex, 1);
    } else {
      const product = await Product.findById(productId);
      if (!product || product.availableStock < quantity) {
        throw new AppError(`Only ${product?.availableStock || 0} units available in stock.`, 400);
      }
      cart.items[itemIndex].quantity = quantity;
    }

    await cart.save();
    return this.getCart(userId);
  }

  async removeItem(userId, productId) {
    const cart = await this.getOrCreateCart(userId);
    cart.items = cart.items.filter(
      item => item.productId.toString() !== productId.toString()
    );
    await cart.save();
    return this.getCart(userId);
  }

  async clearCart(userId) {
    const cart = await this.getOrCreateCart(userId);
    cart.items = [];
    await cart.save();
    return { items: [], itemCount: 0, subtotal: 0, subtotalInRupees: 0 };
  }
}

export const cartService = new CartService();
