import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB, disconnectDB } from '../config/database.js';
import { Product } from '../models/Product.js';
import { Coupon } from '../models/Coupon.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const seedProductsAndCoupons = async () => {
  try {
    console.log('⚡ Connecting to database...');
    await connectDB();

    const seedConfigPath = path.join(__dirname, '../config/seedData.json');
    const rawData = fs.readFileSync(seedConfigPath, 'utf8');
    const seedData = JSON.parse(rawData);

    // 1. Seed or update flagship RC car
    const prodData = seedData.product;
    const existingProduct = await Product.findOne({ sku: prodData.sku });

    if (existingProduct) {
      console.log(`⚠️ Product with SKU "${prodData.sku}" already exists. Updating details...`);
      Object.assign(existingProduct, prodData);
      await existingProduct.save();
      console.log(`✅ Product updated: ${existingProduct.name} (${existingProduct.sku})`);
    } else {
      const newProduct = await Product.create(prodData);
      console.log(`✅ Product seeded: ${newProduct.name} (SKU: ${newProduct.sku})`);
    }

    // 2. Seed Coupons
    if (seedData.coupons && Array.isArray(seedData.coupons)) {
      for (const couponData of seedData.coupons) {
        const existingCoupon = await Coupon.findOne({ code: couponData.code.toUpperCase() });
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + (couponData.validDays || 90));

        const payload = {
          ...couponData,
          code: couponData.code.toUpperCase(),
          expiryDate
        };
        delete payload.validDays;

        if (existingCoupon) {
          console.log(`⚠️ Coupon "${couponData.code}" already exists. Updating...`);
          Object.assign(existingCoupon, payload);
          await existingCoupon.save();
        } else {
          await Coupon.create(payload);
          console.log(`✅ Coupon created: ${couponData.code}`);
        }
      }
    }

    console.log('\n🎉 Product and coupon seeding completed successfully!\n');
    await disconnectDB();
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to seed products and coupons:', error);
    process.exit(1);
  }
};

seedProductsAndCoupons();
