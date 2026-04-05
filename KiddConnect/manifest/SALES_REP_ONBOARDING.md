# Sales rep onboarding (admin)

How to onboard someone who sells **AI Phone Agent**, **Review Reply**, and **Delivery Dispatch** packages and earns commissions.

## 1. Database prerequisites

- Affiliate tables and `affiliate_module_settings` rows exist (`add_affiliate_commission_engine.sql` and follow-ups).
- `affiliate_partners.is_sales_rep` exists (sales rep flag).
- Optional migration for older databases: `migrations/ensure_affiliate_module_settings_reviews.sql` adds the `reviews` commission row if it was never inserted.

The admin API `GET /api/admin/affiliate-commission-settings` also inserts missing rows for `phone-agent`, `reviews`, and `delivery-dispatch` when an admin opens commission settings, so the UI always has three module cards after first load.

## 2. Create the partner and mark them as a sales rep

**UI:** Admin dashboard → **Sales reps** (`/admin/sales-reps`).

1. Enter the rep’s **email** and **display name**.
2. Submit **Create sales rep**. This calls `POST /api/admin/affiliate-partners` with `is_sales_rep: true` and creates (or associates) an `affiliate_partners` row.

**Alternative:** Create or edit a partner elsewhere (e.g. affiliate flows) and set **Sales rep** via `PATCH /api/admin/affiliate-partners/:id` with `{ "is_sales_rep": true }`.

Reps must be **active** (`active: true`) to receive links and appear in sales tooling.

## 3. Send the sales portal sign-in link

On **Sales reps**, find the partner and use **Send sales login link**. That hits `POST /api/admin/affiliate-partners/:id/send-sales-login-link` and emails (or delivers) a magic link to `/sales/login` (or your deployed sales portal URL).

The rep uses that link to open the **sales portal**, create checkout invites, and see attributed sales.

## 4. Packages per product line

**UI:** **Manage Packages** (`/admin/packages`).

Use the module tabs (or `?module_key=`):

| `module_key`        | Product line        |
|---------------------|---------------------|
| `phone-agent`       | AI Phone Agent      |
| `reviews`           | Review Reply        |
| `delivery-dispatch` | Delivery Dispatch   |

Create at least one **active**, **public** package per module you sell, with the correct Stripe price IDs (or billing integration your stack expects).

## 5. Commission rules per module

**UI:** **Affiliate commission** (`/admin/affiliate-commission`).

Configure **first sale** and **recurring** percentages (or inherit from global defaults) for each of:

- `phone-agent`
- `reviews`
- `delivery-dispatch`

Delivery-specific **minimum paid checkouts** before payout applies on the **delivery-dispatch** row (and global defaults). Review Reply uses the same commission fields as the other subscription modules; it does not use the delivery volume gate unless you set overrides.

## 6. Quick reference

| Goal                         | Where / API |
|-----------------------------|-------------|
| List partners, rep flag     | `/admin/sales-reps`, `GET /api/admin/affiliate-partners` |
| Toggle `is_sales_rep`       | `PATCH /api/admin/affiliate-partners/:id` |
| Magic link to sales portal  | `POST /api/admin/affiliate-partners/:id/send-sales-login-link` |
| Packages by module          | `/admin/packages` (module tabs) |
| Commissions by module       | `/admin/affiliate-commission` |
