# Strictest SMS Compliance Rules - US & Canada

## 🇺🇸🇨🇦 **Cross-Border Compliance Strategy**

This document summarizes the **strictest rules** implemented across both United States (TCPA/CTIA) and Canada (CASL) to ensure full compliance.

---

## ✅ **Implemented: Strictest Rules**

### 1. Quiet Hours
**Strictest Rule Applied**: **9:00 AM - 8:00 PM** (recipient's local time)

**Rationale**:
- **US Federal (TCPA)**: 8:00 AM - 9:00 PM
- **US Florida**: 8:00 AM - 8:00 PM (strictest end time)
- **US Texas**: 9:00 AM - 9:00 PM (strictest start time)
- **Canada (CASL)**: No specific rule, but best practice is 8:00 AM - 9:00 PM

**Result**: **9:00 AM - 8:00 PM** covers:
- ✅ All US states (including Florida and Texas)
- ✅ Canada best practice
- ✅ Most restrictive combination

**Implementation**:
- Detects recipient timezone from phone number area code
- Blocks sending outside 9 AM - 8 PM
- Queues blocked recipients for automatic sending when quiet hours end

---

### 2. Business Identification
**Strictest Rule Applied**: Business name required in every message

**US (TCPA)**: ✅ Required
**Canada (CASL)**: ✅ Required

**Implementation**: Automatic prepending: `BusinessName: Message text...`

---

### 3. Opt-Out Instructions
**Strictest Rule Applied**: Bilingual for Canada, English for US

**US (TCPA)**: English-only footer required
**Canada (CASL)**: Bilingual (English/French) required for opt-out responses

**Implementation**:
- Footer: `MSG & Data Rates Apply\nSTOP=stop, START=start` (all messages)
- Opt-out confirmation: Bilingual for Canadian numbers, English for US numbers
- Format (Canada): "You have been unsubscribed... / Vous avez été désabonné..."

---

### 4. Consent Requirements
**Strictest Rule Applied**: Express written consent (both countries)

**US (TCPA)**: Express written consent required
**Canada (CASL)**: Express consent required (cannot be implied)

**Status**: ⚠️ **NOT YET IMPLEMENTED** (Priority 1)

---

### 5. Do Not Call Registry
**Strictest Rule Applied**: Check both registries

**US**: National Do Not Call Registry
**Canada**: National Do Not Call List (DNCL)

**Status**: ⚠️ **NOT YET IMPLEMENTED** (Priority 2)

---

## 📊 **Compliance Matrix**

| Requirement | US (TCPA) | Canada (CASL) | Strictest Rule | Status |
|------------|-----------|----------------|----------------|--------|
| **Quiet Hours** | 8 AM - 9 PM | Best practice: 8 AM - 9 PM | **9 AM - 8 PM** | ✅ Implemented |
| **Business ID** | Required | Required | Required | ✅ Implemented |
| **Opt-Out** | English | Bilingual (EN/FR) | **Bilingual for CA** | ✅ Implemented |
| **Consent** | Express written | Express (no implied) | **Express written** | ⚠️ Not implemented |
| **DNC Registry** | Required | Required | **Both registries** | ⚠️ Not implemented |
| **Frequency Limits** | Best practice | Best practice | Recommended | ⚠️ Not implemented |
| **Content Restrictions** | Prohibited content | Prohibited content | **Both lists** | ⚠️ Not implemented |
| **Toll-Free Verify** | Recommended | **Required** | **Required** | ⚠️ Partial |

---

## 🎯 **Key Takeaways**

1. **Quiet Hours**: Using **9 AM - 8 PM** (strictest) ensures compliance with all US states and Canada
2. **Opt-Out**: Bilingual confirmation for Canadian numbers meets CASL requirements
3. **Country Detection**: System automatically detects US vs Canada from phone numbers
4. **Timezone**: Uses recipient's timezone (not business timezone) for accurate compliance

---

## 📋 **Next Steps**

1. **Consent Tracking** (Priority 1) - Required by both countries
2. **Express Written Consent** (Priority 1) - Required by both countries
3. **DNC Registry Checking** (Priority 2) - Required by both countries
4. **Frequency Limits** (Priority 2) - Best practice for both countries

---

## 🚨 **Legal Disclaimer**

This document is for informational purposes only and does not constitute legal advice. Consult with legal counsel to ensure full compliance with:
- **United States**: TCPA, CTIA, and state-specific regulations
- **Canada**: CASL (Canada's Anti-Spam Legislation) and provincial regulations

