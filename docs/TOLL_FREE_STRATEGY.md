# Toll-Free Number Strategy for Tavari

## Overview
This document outlines the strategy for managing toll-free numbers for SMS messaging across multiple businesses.

## Current System
- **Opt-outs are per business**: When a user opts out, they're opted out from that specific business, not from the phone number
- **Multiple numbers per business**: Businesses can have multiple phone numbers assigned
- **Load balancing**: Messages are distributed across available numbers

## Recommended Strategy: Pre-Verified Pool

### Phase 1: Pre-Verification (Initial Setup)
1. **Purchase 5-10 toll-free numbers** upfront
2. **Verify all numbers** with Tavari's business information:
   - Business Name: "Tavari Communications"
   - Use Case: "Business SMS messaging platform for customer communications"
   - Website: `www.tavarios.com`
   - Privacy Policy: `/privacy`
   - Terms: `/terms`
   - Opt-In Workflow: `/opt-in-workflow`
3. **Store verified numbers** in a "pool" table or mark as available

### Phase 2: Assignment Strategy
- **Local numbers first**: New businesses get local numbers by default (cheaper, no verification needed)
- **Toll-free on demand**: Assign toll-free numbers only when:
  - Business requests it
  - Business needs high-volume SMS (campaigns > 1000 messages)
  - Business explicitly signs up for SMS features
- **Manual assignment**: Admin assigns verified toll-free numbers from the pool

### Phase 3: Compliance Considerations
- **Sender identification**: Messages should clearly identify the business name
- **Opt-out handling**: Current system (per-business) is compliant
- **Verification tied to Tavari**: Acceptable as long as messages identify the actual sender business

## Alternative: Shared Temporary Assignment (NOT RECOMMENDED)
- **Why not**: 
  - Opt-out complexity (user opts out from one business, affects all)
  - TCPA compliance concerns
  - Verification tied to specific business/use case
  - Message routing complexity

## Database Schema Addition
Consider adding a `toll_free_pool` table:
```sql
CREATE TABLE toll_free_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(50) NOT NULL UNIQUE,
  verification_status VARCHAR(50) DEFAULT 'pending',
  verified_at TIMESTAMP,
  assigned_to_business_id UUID REFERENCES businesses(id),
  assigned_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Implementation Steps
1. ✅ Create pre-verified pool table
2. ✅ Purchase initial toll-free numbers
3. ✅ Verify all numbers with Tavari's info
4. ✅ Update assignment logic to check pool first
5. ✅ Add admin UI to manage pool
6. ✅ Add business-level opt-out handling (already done)

## Cost Analysis
- **Toll-free number**: ~$2-5/month per number
- **Verification**: Free (one-time manual process)
- **Local number**: ~$1-2/month per number
- **Recommendation**: Start with 5-10 toll-free numbers, scale as needed

## Industry Comparison
- **Twilio**: Pre-verified pool, assigns on demand
- **MessageBird**: Pre-verified pool, assigns on demand
- **Telnyx**: Similar approach recommended

