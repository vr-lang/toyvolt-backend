import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/database.js';
import { User } from '../models/User.js';

// Parse CLI args like --email=... or --email ...
const parseArgs = () => {
  const args = process.argv.slice(2);
  const params = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.replace(/^--/, '');
      if (key.includes('=')) {
        const [k, v] = key.split('=');
        params[k] = v;
      } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        params[key] = args[i + 1];
        i++;
      } else {
        params[key] = true;
      }
    }
  }
  return params;
};

const seedAdmin = async () => {
  try {
    const params = parseArgs();

    const email = (params.email || process.env.ADMIN_EMAIL || 'admin@toyvolt.com').toLowerCase().trim();
    const password = params.password || process.env.ADMIN_PASSWORD || 'ToyvoltAdmin2026!';
    const name = params.name || process.env.ADMIN_NAME || 'Toyvolt SuperAdmin';

    if (password.length < 8) {
      console.error('❌ Admin password must be at least 8 characters.');
      process.exit(1);
    }

    console.log('⚡ Connecting to database...');
    await connectDB();

    let admin = await User.findOne({ email });

    if (admin) {
      console.log(`⚠️ User with email "${email}" already exists. Updating to verified admin role...`);
      admin.role = 'admin';
      admin.isEmailVerified = true;
      admin.accountStatus = 'active';
      admin.password = password;
      await admin.save();
      console.log(`✅ Admin account updated successfully: ${email}`);
    } else {
      admin = await User.create({
        name,
        email,
        password,
        role: 'admin',
        isEmailVerified: true,
        accountStatus: 'active'
      });
      console.log(`✅ Initial Admin created successfully: ${email}`);
    }

    console.log(`
=========================================
TOYVOLT ADMIN CREDENTIALS:
Email:    ${email}
Password: ${password}
Role:     admin
Status:   active & verified
=========================================
`);

    await disconnectDB();
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to seed admin:', error.message);
    process.exit(1);
  }
};

seedAdmin();
