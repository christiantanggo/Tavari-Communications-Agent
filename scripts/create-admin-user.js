// scripts/create-admin-user.js
// Script to create an admin user for Tavari staff

import { AdminUser } from '../models/AdminUser.js';
import { hashPassword } from '../utils/auth.js';

async function createAdminUser() {
  try {
    console.log('Creating admin user...');
    
    const email = 'christian.fournier@tanggo.ca';
    const password = '1986Cc1991!#';
    const firstName = 'Christian';
    const lastName = 'Fournier';
    const role = 'admin';
    
    // Check if admin user already exists
    try {
      const existing = await AdminUser.findByEmail(email);
      if (existing) {
        console.log('❌ Admin user already exists with this email:', email);
        console.log('   If you want to update the password, delete the user first or update it manually.');
        process.exit(1);
      }
    } catch (error) {
      // User doesn't exist, which is what we want
      if (error.code !== 'PGRST116') {
        throw error;
      }
    }
    
    // Create the admin user
    const admin = await AdminUser.create({
      email,
      password,
      first_name: firstName,
      last_name: lastName,
      role,
    });
    
    console.log('✅ Admin user created successfully!');
    console.log('   Email:', admin.email);
    console.log('   Name:', `${admin.first_name} ${admin.last_name}`);
    console.log('   Role:', admin.role);
    console.log('   ID:', admin.id);
    console.log('');
    console.log('You can now log in at: /admin/login');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    console.error('   Message:', error.message);
    console.error('   Code:', error.code);
    console.error('   Details:', error.details);
    process.exit(1);
  }
}

createAdminUser();

