# SMS Compliance Checklist - TCPA/CTIA (US) & CASL (Canada)

## 🇺🇸🇨🇦 **Cross-Border Compliance**

This checklist covers compliance for **both United States (TCPA/CTIA) and Canada (CASL)**. We implement the **strictest rules** from both countries to ensure full compliance.

---

## ✅ **Implemented Requirements**

### 1. Business Identification
- ✅ **Status**: Implemented
- ✅ **Implementation**: Business name automatically prepended to all messages
- ✅ **Format**: `BusinessName: Message text...`

### 2. Opt-Out Instructions
- ✅ **Status**: Implemented
- ✅ **Implementation**: Footer added to all messages
- ✅ **Format**: `MSG & Data Rates Apply\nSTOP=stop, START=start`
- ✅ **Functionality**: STOP/START keywords handled via webhook

### 3. Quiet Hours Enforcement (Strictest Rules)
- ✅ **Status**: Implemented
- ✅ **Implementation**: Blocks sending outside **9 AM - 8 PM** (recipient's timezone)
- ✅ **Strictest Rules Applied**:
  - **US Federal (TCPA)**: 8 AM - 9 PM
  - **US Florida**: 8 AM - 8 PM (strictest end time)
  - **US Texas**: 9 AM - 9 PM (strictest start time)
  - **Canada (CASL)**: No specific rule, but 9 AM - 8 PM is best practice
  - **Implemented**: **9 AM - 8 PM** (covers all US states and Canada)
- ✅ **Features**: 
  - Recipient timezone detection from area code
  - Country detection (US vs Canada)
  - Automatic queuing for blocked recipients
  - Background job processes queued messages

### 4. Opt-Out Management
- ✅ **Status**: Implemented
- ✅ **Implementation**: 
  - `sms_opt_outs` table tracks opt-outs per business
  - Opt-outs are checked before sending
  - Opt-out status synced to `contacts` table

### 5. Rate Limiting
- ✅ **Status**: Implemented
- ✅ **Implementation**: 
  - Enforces Telnyx rate limits per number type
  - Load balancing across multiple numbers
  - Automatic throttling

### 6. Bilingual Opt-Out (Canada Requirement)
- ✅ **Status**: Implemented
- ✅ **Implementation**: 
  - Detects Canadian phone numbers
  - Provides bilingual opt-out confirmation (English/French)
  - Format: "You have been unsubscribed... / Vous avez été désabonné..."
  - US numbers receive English-only confirmation

---

## ⚠️ **Missing/Incomplete Requirements**

### 1. Opt-In/Consent Tracking
- ❌ **Status**: NOT IMPLEMENTED
- ⚠️ **Risk**: High - TCPA requires express written consent
- 📋 **Required**: 
  - Track when user consented
  - Track how they consented (web form, text-in, etc.)
  - Store consent timestamp and method
  - Proof of consent for compliance audits

**Recommendation**: Add `consent_timestamp`, `consent_method`, `consent_ip_address` to `contacts` table

### 2. Message Frequency Limits
- ❌ **Status**: NOT IMPLEMENTED
- ⚠️ **Risk**: Medium - Can lead to complaints and opt-outs
- 📋 **Required**: 
  - Limit messages per recipient (e.g., max 1 per day, 3 per week)
  - Track last message sent to each recipient
  - Block sending if frequency limit exceeded

**Recommendation**: Add `last_sms_sent_at` to `contacts` table and check before sending

### 3. Do Not Call Registry
- ❌ **Status**: NOT IMPLEMENTED
- ⚠️ **Risk**: Medium - Federal DNC list compliance
- 📋 **Required**: 
  - Check against National Do Not Call Registry
  - Check against state DNC lists
  - Block sending to DNC numbers

**Recommendation**: Integrate with DNC API or maintain DNC list

### 4. Content Restrictions
- ❌ **Status**: NOT IMPLEMENTED
- ⚠️ **Risk**: Medium - Prohibited content can lead to violations
- 📋 **Required**: 
  - Block prohibited content (gambling, adult content, etc.)
  - Validate message content before sending
  - Industry-specific restrictions

**Recommendation**: Add content validation/filtering

### 5. Express Written Consent
- ❌ **Status**: NOT IMPLEMENTED
- ⚠️ **Risk**: High - TCPA requirement
- 📋 **Required**: 
  - Require explicit consent checkbox
  - Store consent proof (IP, timestamp, method)
  - Cannot send without consent

**Recommendation**: Add consent requirement to contact upload/campaign creation

### 6. Message Type Classification
- ❌ **Status**: NOT IMPLEMENTED
- ⚠️ **Risk**: Low - Different rules for transactional vs promotional
- 📋 **Required**: 
  - Classify messages as "transactional" or "promotional"
  - Different consent requirements
  - Different quiet hours rules

**Recommendation**: Add `message_type` field to campaigns

### 7. State-Specific Rules
- ⚠️ **Status**: PARTIALLY IMPLEMENTED
- ⚠️ **Risk**: Medium - State laws vary
- 📋 **Required**: 
  - Florida: 8 PM - 8 AM restrictions
  - Texas: 9 PM - 9 AM (Mon-Sat), stricter Sundays
  - Other state-specific rules

**Recommendation**: Enhance quiet hours to detect recipient state and apply state-specific rules

### 8. Double Opt-In
- ❌ **Status**: NOT IMPLEMENTED
- ⚠️ **Risk**: Low - Some industries require double opt-in
- 📋 **Required**: 
  - Send confirmation message after initial opt-in
  - Require confirmation before sending marketing messages
  - Track double opt-in status

**Recommendation**: Add `double_opt_in_verified` field to contacts

### 9. Age Verification
- ❌ **Status**: NOT IMPLEMENTED
- ⚠️ **Risk**: Low - Only needed for certain content types
- 📋 **Required**: 
  - Verify recipient is 18+ for certain campaigns
  - Store age verification status

**Recommendation**: Add age verification for age-restricted content

### 10. Message Delivery Tracking
- ⚠️ **Status**: PARTIALLY IMPLEMENTED
- ⚠️ **Risk**: Low - Good for compliance audits
- 📋 **Required**: 
  - Track delivery status (sent, delivered, failed, bounced)
  - Store delivery receipts from Telnyx
  - Log delivery failures

**Recommendation**: Enhance recipient status tracking with delivery status

---

## 🔴 **Critical Missing Items (High Priority)**

1. **Opt-In/Consent Tracking** - Required for TCPA compliance
2. **Express Written Consent** - Required for TCPA compliance
3. **Message Frequency Limits** - Prevents spam complaints

---

## 📊 **Compliance Score**

- **Implemented**: 6/10 (60%)
- **Critical Missing**: 2 items (consent tracking, express written consent)
- **Recommended Next Steps**: 
  1. Add consent tracking (US & Canada)
  2. Add express written consent requirement (US & Canada)
  3. Add frequency limits
  4. Add DNC checking (US & Canada registries)

---

## 🚨 **Legal Disclaimer**

This checklist is for informational purposes only and does not constitute legal advice. Consult with legal counsel to ensure full compliance with TCPA, CTIA, and state-specific regulations.

