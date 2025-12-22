# SMS Compliance Implementation Priorities - US & Canada

## 🇺🇸🇨🇦 **Cross-Border Compliance Strategy**

This document outlines compliance requirements for **both United States (TCPA) and Canada (CASL)**. We implement the **strictest rules** from both countries to ensure full compliance.

---

## 🔴 **Priority 1: Critical (Implement Immediately)**

### 1. Opt-In/Consent Tracking
**Why**: 
- **US (TCPA)**: Requires express written consent
- **Canada (CASL)**: Requires express consent (cannot be implied)
- **Strictest Rule**: Express written consent with proof of consent

**Implementation**:
- Add consent fields to `contacts` table (migration provided)
- Require consent before adding contacts to campaigns
- Store consent timestamp, method, and IP address
- Block sending to contacts without consent
- **Canada**: Consent must be specific to SMS (cannot use email consent)

**Risk if Missing**: 
- **US**: $500-$1,500 per violation (TCPA)
- **Canada**: Up to $10 million CAD per violation (CASL)
- Class action lawsuits
- Account suspension by carriers

---

### 2. Express Written Consent Requirement
**Why**: 
- **US (TCPA)**: Prior express written consent required
- **Canada (CASL)**: Express consent required (cannot be implied)
- **Strictest Rule**: Express written consent with documented proof

**Implementation**:
- Add consent checkbox to contact upload forms
- Require explicit consent before sending
- Store proof of consent (timestamp, IP, method)
- Cannot send without consent
- **Canada**: Must be specific to SMS communications

**Risk if Missing**: Same as above

---

## 🟡 **Priority 2: High (Implement Soon)**

### 3. Message Frequency Limits
**Why**: Prevents spam complaints and improves deliverability.

**Implementation**:
- Track `last_sms_sent_at` per contact
- Enforce limits (e.g., max 1 per day, 3 per week)
- Block sending if limit exceeded
- Reset counters weekly/monthly

**Risk if Missing**:
- High opt-out rates
- Carrier filtering
- Account reputation damage

---

### 4. Do Not Call Registry Checking
**Why**: 
- **US**: National Do Not Call Registry (federal requirement)
- **Canada**: National Do Not Call List (DNCL) (federal requirement)
- **Strictest Rule**: Check both registries

**Implementation**:
- Integrate with US DNC API (or maintain list)
- Integrate with Canada DNCL API (or maintain list)
- Detect recipient country from phone number
- Check appropriate registry before sending
- Block sending to DNC numbers
- Log DNC violations

**Risk if Missing**:
- **US**: $500-$1,500 per violation (TCPA)
- **Canada**: Up to $10 million CAD per violation (CASL)
- FTC/CRTC enforcement actions

---

## 🟢 **Priority 3: Medium (Implement When Possible)**

### 5. Quiet Hours - Strictest Rules (US & Canada)
**Why**: 
- **US Federal (TCPA)**: 8 AM - 9 PM (recipient's local time)
- **US Florida**: 8 AM - 8 PM
- **US Texas**: 9 AM - 9 PM (Mon-Sat), stricter Sundays
- **Canada (CASL)**: No specific quiet hours, but best practice is 8 AM - 9 PM
- **Strictest Rule**: **9 AM - 8 PM** (covers all US states and Canada best practice)

**Implementation**:
- Detect recipient country from phone number
- Detect recipient state/province (US) or province (Canada)
- Apply strictest quiet hours: **9 AM - 8 PM** (recipient's local time)
- Queue messages outside quiet hours
- **Note**: Currently implemented at 9 AM - 8 PM ✅

**Risk if Missing**:
- **US**: $500-$1,500 per violation (TCPA)
- **Canada**: Potential complaints and carrier filtering
- State-level fines (US)

---

### 6. Bilingual Opt-Out (Canada Requirement)
**Why**: 
- **Canada (CASL)**: Opt-out responses must be in both English and French
- **US**: English only
- **Strictest Rule**: Support both languages

**Implementation**:
- Detect recipient country from phone number
- For Canadian numbers: Provide bilingual opt-out confirmation
- Format: "You have successfully unsubscribed. Vous avez été désabonné avec succès."
- Store language preference if available

**Risk if Missing**:
- **Canada**: CASL violations, carrier filtering
- Reduced deliverability in Canada

---

### 7. State/Province-Specific Rules
**Why**: Some states/provinces have stricter rules than federal.

**Implementation**:
- Detect recipient state (US) or province (Canada) from phone number
- Apply state/province-specific quiet hours
- Apply state/province-specific consent requirements
- **US States**: Florida (8 PM), Texas (9 PM), etc.
- **Canada Provinces**: Generally follow federal CASL

**Risk if Missing**: State/province-level fines

---

### 8. Prohibited Content Restrictions
**Why**: 
- **US**: Prohibited content includes tobacco, alcohol, firearms (must be age-gated)
- **Canada**: Prohibited content includes sex, hate, alcohol, firearms, tobacco
- **Strictest Rule**: Block all prohibited content from both countries

**Implementation**:
- Content validation before sending
- Block prohibited content categories
- Age-gating for restricted content (US)
- Content filtering for Canadian compliance

**Risk if Missing**:
- **US**: Carrier filtering, account suspension
- **Canada**: CASL violations, carrier blocking
- Legal liability

---

### 9. Toll-Free Verification (Canada Requirement)
**Why**: 
- **Canada**: All commercial messages from toll-free numbers require verification
- **US**: Verification recommended but not always required
- **Strictest Rule**: Verify all toll-free numbers

**Implementation**:
- Automatically verify toll-free numbers after purchase
- Block sending from unverified toll-free numbers (Canada)
- Track verification status per number

**Risk if Missing**:
- **Canada**: Messages blocked by carriers
- Reduced deliverability

---

### 10. Message Type Classification
**Why**: Transactional vs promotional have different rules in both countries.

**Implementation**:
- Add `message_type` to campaigns (transactional, promotional)
- Different consent requirements
- Different quiet hours rules (transactional may have exceptions)
- **US**: Transactional messages have different consent rules
- **Canada**: Transactional messages still require consent but different rules

**Risk if Missing**: Lower - mainly organizational, but important for compliance

---

## 📋 **Recommended Implementation Order**

1. ✅ **Done**: Quiet hours (9 AM - 8 PM), opt-out handling, business identification
2. 🔴 **Next**: Consent tracking (Priority 1) - **US & Canada**
3. 🔴 **Next**: Express written consent requirement (Priority 1) - **US & Canada**
4. 🟡 **Then**: Frequency limits (Priority 2)
5. 🟡 **Then**: DNC checking (Priority 2) - **US & Canada registries**
6. 🟡 **Then**: Bilingual opt-out (Priority 2) - **Canada requirement**
7. 🟢 **Then**: Prohibited content filtering (Priority 3) - **US & Canada**
8. 🟢 **Then**: Toll-free verification enforcement (Priority 3) - **Canada**
9. 🟢 **Later**: State/province-specific rules, message types (Priority 3)

---

## 💡 **Quick Wins**

1. **Add consent checkbox** to contact upload form (frontend)
2. **Add consent fields** to database (migration provided)
3. **Block sending** to contacts without consent (backend)
4. **Track last_sms_sent_at** to enable frequency limits

These can be implemented quickly and provide significant compliance improvement.

