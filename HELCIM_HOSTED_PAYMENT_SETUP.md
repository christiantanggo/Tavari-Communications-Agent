# Helcim Hosted Payment Pages Setup

This guide explains how to set up Helcim's hosted payment pages to avoid PCI compliance requirements.

## ✅ Benefits

- **No PCI Compliance Required** - Helcim handles all card data
- **No Helcim.js CDN Issues** - No external scripts to load
- **Secure** - All payments processed on Helcim's secure servers
- **Simple Integration** - Just redirect users to the payment page URL

## 📋 Step-by-Step Setup

### Step 1: Create Payment Page in Helcim Dashboard

1. Log into [Helcim Dashboard](https://secure.helcim.com)
2. Navigate to **"All Tools"** → **"Payment Pages"**
3. Click **"New Payment Page"**
4. Choose page type:
   - **"Fixed Amount"** ⭐ **RECOMMENDED FOR SECURITY** - Amount is locked and cannot be changed by customers. However, this requires creating a new page for each price point OR using Helcim API to create checkout links dynamically.
   - **"Editable Amount"** ⚠️ **NOT RECOMMENDED** - Allows customers to change the amount, which is a security risk. Only use if Helcim API checkout link creation is not available.
   - **"Product Purchase"** - Requires creating products in Helcim for each package (not recommended for dynamic pricing)
5. Configure the page:
   - **Name**: `Tavari Payment Page` (or any name)
   - **Payment Methods**: Enable Credit Card
   - **Transaction Type**: `Purchase` (for package purchases)
   - **Amount Settings**: 
     - Set **Default Amount** to `0.00` (will be overridden by URL parameter)
     - Leave **Minimum** and **Maximum** empty or set reasonable limits
   - **Customer Information**: Collect email, name, phone (optional)
6. **Customize Theme** (optional):
   - Upload your logo
   - Set brand colors
   - Adjust layout
7. Click **"Save"**

### Step 2: Get Payment Page URL

After saving, Helcim will show you:
- **Payment Page URL** - Copy this URL
- Example: `https://secure.helcim.com/pay/your-page-id`

### Step 3: Add Environment Variable

Add the payment page URL to your backend environment variables:

**Railway:**
1. Go to Railway Dashboard → Your backend service → Variables
2. Add: `HELCIM_PAYMENT_PAGE_URL` = `https://your-business-name.myhelcim.com/hosted/?token=xxxxx`
3. Example: `HELCIM_PAYMENT_PAGE_URL=https://off-the-wall-kids.myhelcim.com/hosted/?token=77f3a70e791bde1bc7ea98`

**Local `.env`:**
```bash
HELCIM_PAYMENT_PAGE_URL=https://your-business-name.myhelcim.com/hosted/?token=xxxxx
```

**Important:** Include the full URL with the `?token=` parameter. The system will automatically append `&amount=XX.XX` for dynamic pricing.

### Step 4: Test the Integration

1. Deploy your backend with the new environment variable
2. Log into your app and go to `/dashboard/billing`
3. Click **"Add Payment Method"** or **"Update Payment Method"**
4. You should be redirected to Helcim's hosted payment page
5. Enter test card details (Helcim provides test cards in their docs)
6. Complete the payment
7. You'll be redirected back to your app

## 🔄 How It Works

### For Adding Payment Methods:
1. User clicks "Add Payment Method" in your app
2. Your backend calls `/api/billing/hosted-payment`
3. Backend returns the Helcim payment page URL
4. User is redirected to Helcim's secure payment page
5. User enters payment details on Helcim's page (you never see card data)
6. Helcim processes the payment
7. User is redirected back to your app

### For Package Purchases (Dynamic Pricing):
1. User selects a package and clicks "Upgrade" or "Select"
2. Your backend calls `/api/billing/checkout` with the `packageId`
3. Backend:
   - Fetches package details (including price)
   - Appends `?amount=XX.XX&package_id=...` to the payment page URL
   - Returns the URL with the dynamic amount
4. User is redirected to Helcim's payment page with the amount pre-filled
5. User completes payment on Helcim's secure page
6. User is redirected back to your app

**No need to create products in Helcim!** The amount is passed dynamically via URL parameter.

## ⚙️ Configuration Options

### Return URL (After Payment)

In Helcim Dashboard → Payment Pages → Your Page → Settings:
- Set **Return URL** to: `https://www.tavarios.com/dashboard/billing/success`
- Or: `https://www.tavarios.com/dashboard/billing`

### Webhook URL (For Payment Notifications)

1. In Helcim Dashboard → **"All Tools"** → **"Webhooks"**
2. Add webhook URL: `https://api.tavarios.com/api/billing/webhook`
3. Select events: Payment completed, Payment failed, etc.
4. Copy the webhook secret
5. Add to Railway: `HELCIM_WEBHOOK_SECRET`

## 🎯 Multiple Payment Pages

You can create multiple payment pages for different purposes:

1. **Payment Method Addition** - $0 verification page
2. **Package Purchase** - Pre-filled amount page
3. **Invoice Payment** - Dynamic amount page

Set different `HELCIM_PAYMENT_PAGE_URL` values or create separate environment variables:
- `HELCIM_PAYMENT_PAGE_URL_ADD_METHOD`
- `HELCIM_PAYMENT_PAGE_URL_CHECKOUT`

## ✅ Testing

Use Helcim's test card numbers:
- **Success**: `4111111111111111`
- **Decline**: `4000000000000002`
- **CVV**: Any 3 digits
- **Expiry**: Any future date

## 📝 Notes

- Payment pages are PCI-DSS compliant (Helcim handles compliance)
- No card data touches your servers
- Works on mobile and desktop
- Can be customized to match your brand
- Supports multiple payment methods (credit card, ACH, etc.)

---

**Last Updated**: December 2025

