# SETUP HELCIM PAYMENT PAGE - DO THIS NOW

## Quick Setup (5 minutes)

### Step 1: Get Your Helcim Payment Page URL

1. **Log into Helcim Dashboard:**
   - Go to: https://secure.helcim.com
   - Login with your Helcim account

2. **Create Payment Page:**
   - Click **"All Tools"** → **"Payment Pages"**
   - Click **"New Payment Page"** or **"Create Payment Page"**
   - Choose **"Editable Amount"** page type
   - Name it: `Tavari Package Payment`
   - Set **Default Amount** to `0.00` (we'll pass amount via URL)
   - Enable **Credit Card** payment method
   - Set **Transaction Type** to `Purchase`
   - Click **"Save"** or **"Create"**

3. **Copy the Payment Page URL:**
   - After saving, you'll see the payment page URL
   - It will look like: `https://your-business.myhelcim.com/hosted/?token=xxxxx`
   - **COPY THIS ENTIRE URL**

### Step 2: Add to Environment Variables

**Local Development (.env file):**
```bash
HELCIM_PAYMENT_PAGE_URL=https://your-business.myhelcim.com/hosted/?token=xxxxx
```

**Production (Railway/Vercel):**
1. Go to your backend service (Railway)
2. Go to **Variables** tab
3. Add: `HELCIM_PAYMENT_PAGE_URL` = `https://your-business.myhelcim.com/hosted/?token=xxxxx`
4. Save

### Step 3: Restart Server

```bash
# Stop your server (Ctrl+C)
# Start it again
npm run dev
```

### Step 4: Test

1. Go to Step 5 of setup wizard
2. Select a package
3. Click "Next"
4. **You should be redirected to Helcim payment page**
5. Complete payment
6. You'll be redirected back to continue setup

## That's It!

Once `HELCIM_PAYMENT_PAGE_URL` is set, payment will work automatically.

---

**Need Help?**
- Check `HELCIM_HOSTED_PAYMENT_SETUP.md` for detailed instructions
- Make sure your Helcim account is verified (may take 1-2 days)




