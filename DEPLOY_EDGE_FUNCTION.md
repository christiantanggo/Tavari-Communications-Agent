# Deploy Supabase Edge Function

## Option 1: Use npx (No Installation Required)

You can use Supabase CLI without installing it globally:

```bash
npx supabase login
npx supabase link --project-ref your-project-ref
npx supabase functions deploy mail-send
```

## Option 2: Install via Scoop (Windows Package Manager)

1. **Install Scoop** (if not already installed):
   ```powershell
   Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
   irm get.scoop.sh | iex
   ```

2. **Install Supabase CLI**:
   ```powershell
   scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
   scoop install supabase
   ```

3. **Verify installation**:
   ```powershell
   supabase --version
   ```

## Option 3: Direct Download (Windows)

1. Go to: https://github.com/supabase/cli/releases
2. Download the latest `supabase_windows_amd64.zip`
3. Extract and add to PATH, or run directly

## Deploy the mail-send Function

Once Supabase CLI is available:

1. **Login to Supabase**:
   ```bash
   supabase login
   ```

2. **Link to your project**:
   ```bash
   supabase link --project-ref your-project-ref
   ```
   (Get your project ref from Supabase Dashboard → Settings → General → Reference ID)

3. **Set Environment Variables** (in Supabase Dashboard):
   - Go to: Supabase Dashboard → Edge Functions → mail-send → Settings → Secrets
   - Add:
     - `SES_ACCESS_KEY_ID` - Your AWS IAM access key
     - `SES_SECRET_ACCESS_KEY` - Your AWS IAM secret key
     - `AWS_REGION` - AWS region (e.g., `us-east-1`)

4. **Deploy the function**:
   ```bash
   supabase functions deploy mail-send
   ```

5. **Verify deployment**:
   - Go to Supabase Dashboard → Edge Functions
   - You should see `mail-send` function listed

## Test the Function

After deployment, test it from your code or using curl:

```bash
curl -X POST "https://your-project-ref.supabase.co/functions/v1/mail-send" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "test",
    "campaignId": "test",
    "contactId": "test",
    "to": "test@example.com",
    "fromEmail": "noreply@tavari.com",
    "subject": "Test",
    "html": "<p>Test email</p>"
  }'
```

