# SMS Compliance Implementation Priorities

## 🔴 **Priority 1: Critical (Implement Immediately)**

### 1. Opt-In/Consent Tracking
**Why**: TCPA requires express written consent. Without tracking consent, you cannot prove compliance.

**Implementation**:
- Add consent fields to `contacts` table (migration provided)
- Require consent before adding contacts to campaigns
- Store consent timestamp, method, and IP address
- Block sending to contacts without consent

**Risk if Missing**: 
- $500-$1,500 per violation
- Class action lawsuits
- Account suspension by carriers

---

### 2. Express Written Consent Requirement
**Why**: TCPA explicitly requires express written consent for marketing SMS.

**Implementation**:
- Add consent checkbox to contact upload forms
- Require explicit consent before sending
- Store proof of consent (timestamp, IP, method)
- Cannot send without consent

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
**Why**: Federal requirement - cannot send to DNC numbers.

**Implementation**:
- Integrate with DNC API (or maintain list)
- Check before sending
- Block sending to DNC numbers
- Log DNC violations

**Risk if Missing**:
- $500-$1,500 per violation
- FTC enforcement actions

---

## 🟢 **Priority 3: Medium (Implement When Possible)**

### 5. State-Specific Rules
**Why**: Some states have stricter rules than federal.

**Implementation**:
- Detect recipient state from phone number
- Apply state-specific quiet hours
- Apply state-specific consent requirements

**Risk if Missing**: State-level fines

---

### 6. Message Type Classification
**Why**: Transactional vs promotional have different rules.

**Implementation**:
- Add `message_type` to campaigns
- Different consent requirements
- Different quiet hours rules

**Risk if Missing**: Lower - mainly organizational

---

## 📋 **Recommended Implementation Order**

1. ✅ **Done**: Quiet hours, opt-out handling, business identification
2. 🔴 **Next**: Consent tracking (Priority 1)
3. 🔴 **Next**: Express written consent requirement (Priority 1)
4. 🟡 **Then**: Frequency limits (Priority 2)
5. 🟡 **Then**: DNC checking (Priority 2)
6. 🟢 **Later**: State-specific rules, message types (Priority 3)

---

## 💡 **Quick Wins**

1. **Add consent checkbox** to contact upload form (frontend)
2. **Add consent fields** to database (migration provided)
3. **Block sending** to contacts without consent (backend)
4. **Track last_sms_sent_at** to enable frequency limits

These can be implemented quickly and provide significant compliance improvement.

