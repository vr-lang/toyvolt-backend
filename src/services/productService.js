import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';
import { AppError } from '../utils/AppError.js';
import { deleteCloudinaryImage } from '../config/cloudinary.js';

class ProductService {
  async getProducts({
    search,
    category,
    inStockOnly,
    includeArchived,
    sort = 'newest',
    page = 1,
    limit = 12,
    isAdmin = false
  }) {
    const filter = {};
    if (!(isAdmin && (includeArchived === 'true' || includeArchived === true))) {
      filter.isArchived = false;
    }

    if (!isAdmin) {
      filter.isActive = true;
    }

    if (category) {
      filter.category = category;
    }

    if (inStockOnly === 'true' || inStockOnly === true) {
      filter.availableStock = { $gt: 0 };
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions = {};
    if (sort === 'price_asc') sortOptions.sellingPrice = 1;
    else if (sort === 'price_desc') sortOptions.sellingPrice = -1;
    else if (sort === 'name_asc') sortOptions.name = 1;
    else sortOptions.createdAt = -1; // Default newest

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 12));
    const skip = (pageNum - 1) * limitNum;

    // For public calls, exclude internal costPrice
    let projection = {};
    if (!isAdmin) {
      projection = { costPrice: 0 };
    }

    const [products, totalCount] = await Promise.all([
      Product.find(filter, projection).sort(sortOptions).skip(skip).limit(limitNum),
      Product.countDocuments(filter)
    ]);

    return {
      products,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(totalCount / limitNum)
      }
    };
  }

  async getProductBySlug(slug, isAdmin = false) {
    const filter = { slug, isArchived: false };
    if (!isAdmin) filter.isActive = true;

    const query = Product.findOne(filter);
    if (!isAdmin) query.select('-costPrice');

    const product = await query;
    if (!product) {
      throw new AppError('Product not found.', 404);
    }

    return product;
  }

  async getProductById(id, isAdmin = false) {
    const query = Product.findById(id);
    if (!isAdmin) query.select('-costPrice');

    const product = await query;
    if (!product || (!isAdmin && product.isArchived)) {
      throw new AppError('Product not found.', 404);
    }

    return product;
  }

  async getCategories() {
    const categories = await Product.distinct('category', { isActive: true, isArchived: false });
    return categories;
  }

  async createProduct(data) {
    const existingSku = await Product.findOne({ sku: data.sku.toUpperCase() });
    if (existingSku) {
      throw new AppError(`A product with SKU "${data.sku}" already exists.`, 409);
    }

    const existingSlug = await Product.findOne({ slug: data.slug.toLowerCase() });
    if (existingSlug) {
      throw new AppError(`A product with slug "${data.slug}" already exists.`, 409);
    }

    const product = await Product.create(data);
    return product;
  }

  async updateProduct(id, data) {
    const existingProduct = await Product.findById(id);
    if (!existingProduct) {
      throw new AppError('Product not found.', 404);
    }

    if (data.sku) {
      const existingSku = await Product.findOne({
        sku: data.sku.toUpperCase(),
        _id: { $ne: id }
      });
      if (existingSku) throw new AppError(`SKU "${data.sku}" is already in use.`, 409);
    }

    if (data.slug) {
      const existingSlug = await Product.findOne({
        slug: data.slug.toLowerCase(),
        _id: { $ne: id }
      });
      if (existingSlug) throw new AppError(`Slug "${data.slug}" is already in use.`, 409);
    }

    const nextSellingPrice = data.sellingPrice !== undefined ? data.sellingPrice : existingProduct.sellingPrice;
    const nextCompareAtPrice = data.compareAtPrice !== undefined ? data.compareAtPrice : existingProduct.compareAtPrice;
    if (nextCompareAtPrice !== null && nextCompareAtPrice !== undefined && nextCompareAtPrice < nextSellingPrice) {
      throw new AppError('Compare-at price cannot be less than selling price.', 400);
    }

    // Track removed Cloudinary images if images array is being updated
    let removedPublicIds = [];
    if (Array.isArray(data.images) && Array.isArray(existingProduct.images)) {
      const newPublicIds = new Set(data.images.map(img => img.publicId).filter(Boolean));
      removedPublicIds = existingProduct.images
        .map(img => img.publicId)
        .filter(pubId => pubId && !newPublicIds.has(pubId));
    }

    const product = await Product.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true
    });

    if (removedPublicIds.length > 0) {
      await Promise.allSettled(removedPublicIds.map(pubId => deleteCloudinaryImage(pubId)));
    }

    return product;
  }

  async deleteProduct(id) {
    const product = await Product.findById(id);
    if (!product) {
      throw new AppError('Product not found.', 404);
    }

    // Check if product exists in any existing orders
    const orderWithProduct = await Order.findOne({ 'items.productId': id });

    if (orderWithProduct) {
      // Soft-delete / safe archive (preserve images for historical orders)
      product.isActive = false;
      product.isArchived = true;
      await product.save();
      return { message: 'Product has associated orders and was safely archived.', isArchived: true };
    } else {
      const publicIds = (product.images || [])
        .map(img => img.publicId)
        .filter(Boolean);

      await Product.findByIdAndDelete(id);

      if (publicIds.length > 0) {
        await Promise.allSettled(publicIds.map(pubId => deleteCloudinaryImage(pubId)));
      }

      return { message: 'Product permanently deleted.', isArchived: false };
    }
  }
}

export const productService = new ProductService();

