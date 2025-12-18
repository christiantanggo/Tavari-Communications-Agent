# Admin Portal Access

## Overview
The Tavari Admin Portal allows Tavari staff to access and manage any business account, view calls, messages, usage, and troubleshoot issues.

## Access URL
**Admin Login:** `/admin/login`

Full URL examples:
- Local: `http://localhost:3000/admin/login`
- Production: `https://yourdomain.com/admin/login`

## How to Access

1. Navigate to `/admin/login` in your browser
2. Enter your admin credentials (email and password)
3. Upon successful login, you'll be redirected to `/admin/dashboard`

## Admin Features

The admin portal provides access to:

- **Account Management** (`/admin/accounts`)
  - View all business accounts
  - View individual account details
  - Add bonus minutes
  - Set custom pricing
  - Retry activation
  - Sync VAPI configuration

- **Activity Logs** (`/admin/activity`)
  - View all admin actions
  - Track changes made to accounts
  - Monitor system activity

- **Account Details** (`/admin/accounts/[id]`)
  - View complete business information
  - See all calls, messages, and usage
  - Edit business settings
  - Troubleshoot issues

## Creating Admin Users

Admin users are stored in the `admin_users` table. To create an admin user, you can:

1. Use the Supabase SQL Editor to insert directly:
```sql
INSERT INTO admin_users (email, password_hash, first_name, last_name, role)
VALUES (
  'admin@tavari.com',
  '$2b$10$...', -- Use bcrypt hash of password
  'Admin',
  'User',
  'admin'
);
```

2. Or use the AdminUser model in the codebase:
```javascript
import { AdminUser } from './models/AdminUser.js';
await AdminUser.create({
  email: 'admin@tavari.com',
  password: 'securepassword',
  first_name: 'Admin',
  last_name: 'User',
  role: 'admin'
});
```

## Security Notes

- Admin authentication uses separate tokens from regular user authentication
- Admin tokens include `adminId` in the JWT payload
- Admin routes are protected by `authenticateAdmin` middleware
- Only active admin users (`is_active = true`) can log in

## API Endpoints

Admin API endpoints are available at `/api/admin/*`:
- `POST /api/admin/login` - Admin login
- `GET /api/admin/me` - Get current admin user
- `GET /api/admin/accounts` - List all businesses
- `GET /api/admin/accounts/:id` - Get business details
- `POST /api/admin/accounts/:id/bonus-minutes` - Add bonus minutes
- `POST /api/admin/accounts/:id/custom-pricing` - Set custom pricing
- `POST /api/admin/accounts/:id/retry-activation` - Retry phone activation
- `POST /api/admin/accounts/:id/sync-vapi` - Sync VAPI configuration
- `GET /api/admin/stats` - Get system statistics
- `GET /api/admin/activity` - Get activity logs

## Troubleshooting

If you cannot access the admin portal:

1. **Check if admin user exists:**
   ```sql
   SELECT * FROM admin_users WHERE email = 'your-email@tavari.com';
   ```

2. **Verify admin user is active:**
   ```sql
   SELECT * FROM admin_users WHERE email = 'your-email@tavari.com' AND is_active = true;
   ```

3. **Check server logs** for authentication errors

4. **Verify admin routes are registered** in `server.js`:
   ```javascript
   app.use('/api/admin', adminRoutes);
   ```

