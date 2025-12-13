# Tavari AI Phone Agent - Deployment Guide

## Prerequisites

- Node.js 18+ (LTS recommended)
- PostgreSQL database (Supabase or Railway)
- Voximplant account
- OpenAI API key
- Stripe account

## Environment Setup

1. Copy `.env.example` to `.env` and fill in all required values:

```bash
cp .env.example .env
```

2. Required environment variables:
   - `DATABASE_URL` - PostgreSQL connection string
   - `JWT_SECRET` - Random secret for JWT tokens
   - `OPENAI_API_KEY` - OpenAI API key
   - `VOXIMPLANT_ACCOUNT_ID` - Voximplant account ID
   - `VOXIMPLANT_APPLICATION_ID` - Voximplant application ID
   - `VOXIMPLANT_API_KEY` - Voximplant API key
   - `STRIPE_SECRET_KEY` - Stripe secret key
   - `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret

## Database Setup

1. Run migrations:
```bash
npm run migrate
```

2. Verify tables were created:
```bash
psql $DATABASE_URL -c "\dt"
```

## Stripe Setup

1. Create Stripe products and prices:
```bash
node scripts/create-stripe-products.js
```

2. Add the returned Price IDs to your `.env` file

3. Configure Stripe webhook:
   - URL: `https://your-domain.com/api/billing/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_*`

## Voximplant Setup

1. Create a Voximplant application
2. Configure inbound call scenario to point to your server
3. Set webhook URL: `https://your-domain.com/api/calls/webhook`
4. Assign phone numbers to your application

## Installation

```bash
# Install dependencies
npm install

# Run migrations
npm run migrate

# Start server (development)
npm run dev

# Start server (production)
npm start
```

## Frontend Deployment

```bash
cd frontend
npm install
npm run build
npm start
```

Or deploy to Vercel:
```bash
vercel deploy
```

## Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong `JWT_SECRET`
- [ ] Configure SSL/TLS
- [ ] Set up database backups
- [ ] Configure monitoring/logging
- [ ] Set up error alerting
- [ ] Test Stripe webhooks
- [ ] Test Voximplant integration
- [ ] Load test concurrent calls
- [ ] Set up rate limiting
- [ ] Configure CORS properly
- [ ] Set up health check monitoring

## Monitoring

- Health check: `GET /health`
- Logs: Check `logs/` directory
- Database: Monitor connection pool
- Usage: Track via `/api/usage/status`

## Troubleshooting

### Database Connection Issues
- Verify `DATABASE_URL` is correct
- Check database is accessible
- Verify SSL settings for production

### Voximplant Issues
- Check webhook URL is accessible
- Verify scenario XML format
- Check audio format compatibility

### OpenAI Issues
- Verify API key is valid
- Check rate limits
- Monitor API usage costs

### Stripe Issues
- Verify webhook secret matches
- Check webhook events are received
- Verify price IDs are correct

