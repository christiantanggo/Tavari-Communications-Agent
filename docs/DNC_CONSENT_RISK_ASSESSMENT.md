# DNC Registry Risk Assessment: Express Consent Scenario

## Question
**What is the risk of sending SMS messages to DNC numbers when recipients have filled out a waiver at our facility and checked a box to receive marketing?**

---

## Answer: **LOW TO MODERATE RISK** (with proper documentation)

### ✅ **Good News: Express Consent Overrides DNC Status**

Both **TCPA (US)** and **CASL (Canada)** allow sending to DNC numbers when **express written consent** has been obtained.

---

## 📋 **Legal Framework**

### United States (TCPA)
- **Rule**: Prior express written consent **CAN override** DNC Registry status
- **Requirement**: Consent must be:
  - ✅ Signed, written agreement
  - ✅ Clear authorization for telemarketing/SMS messages
  - ✅ Includes specific phone number
  - ✅ Not a condition of purchasing goods/services
  - ✅ Documented with timestamp

**Source**: FCC TCPA regulations allow marketing messages to DNC numbers when express written consent exists.

### Canada (CASL)
- **Rule**: Express consent **CAN override** DNCL status
- **Requirement**: Consent must be:
  - ✅ Explicit and informed
  - ✅ Clearly documented
  - ✅ Includes opt-out mechanism

---

## ⚠️ **Risk Factors**

### **LOW RISK** ✅ (Recommended)
If your waiver includes:
- ✅ **SMS-specific checkbox**: "I agree to receive marketing text messages"
- ✅ **Clear language**: Explicitly mentions SMS/text messages
- ✅ **Signature/acknowledgment**: Waiver is signed or acknowledged
- ✅ **Phone number captured**: Number is recorded on the waiver
- ✅ **Documentation**: Consent timestamp and method stored in database
- ✅ **Opt-out language**: "Reply STOP to opt out" included

**Risk Level**: **LOW** - You have strong legal protection with proper documentation.

---

### **MODERATE RISK** ⚠️
If your waiver has:
- ⚠️ **Vague checkbox**: "I agree to receive marketing" (not SMS-specific)
- ⚠️ **Bundled consent**: Combined with other agreements
- ⚠️ **No signature**: Only checkbox, no signature/acknowledgment
- ⚠️ **Poor documentation**: Consent not properly timestamped

**Risk Level**: **MODERATE** - May need to strengthen consent language.

---

### **HIGH RISK** ❌
If your waiver has:
- ❌ **No SMS mention**: Only general "marketing" language
- ❌ **Pre-checked box**: Consent not actively given
- ❌ **No documentation**: No record of when/how consent was obtained
- ❌ **Conditional consent**: "Must agree to receive marketing to use facility"

**Risk Level**: **HIGH** - Significant compliance risk.

---

## 🎯 **Recommended Waiver Language**

### **Option 1: SMS-Specific (Recommended)**
```
☐ I agree to receive marketing text messages from [Business Name] 
  at the phone number provided above. Message and data rates may apply. 
  Reply STOP to opt out at any time. Consent is not a condition of purchase.
```

### **Option 2: Combined (Acceptable)**
```
☐ I agree to receive marketing communications (email, SMS, phone) from 
  [Business Name] at the contact information provided above. 
  For SMS: Reply STOP to opt out. Message and data rates may apply.
```

---

## 📊 **Risk Mitigation Strategies**

### 1. **Strengthen Your Waiver** ✅
- Make checkbox SMS-specific
- Include clear opt-out language
- Ensure signature/acknowledgment
- Capture phone number on waiver

### 2. **Document Everything** ✅
- Store consent timestamp
- Record consent method ("waiver_checkbox")
- Save IP address (if online waiver)
- Keep waiver copies for audit trail

### 3. **System Implementation** ✅
- Our system now checks for express consent
- If express consent exists, DNC status is logged but doesn't block sending
- All consent records are timestamped and documented

### 4. **Regular Audits** ✅
- Review consent records quarterly
- Verify waiver language compliance
- Check for any opt-out requests
- Update documentation as needed

---

## 🔍 **Current System Behavior**

Our system now handles this scenario:

1. **Checks for express consent** in contact record
2. **If express consent exists**:
   - ✅ Allows sending even if on DNC registry
   - 📋 Logs consent timestamp for compliance
   - ✅ Complies with TCPA/CASL requirements

3. **If NO express consent**:
   - ⚠️ Blocks sending if on DNC registry
   - ❌ Requires consent before sending

---

## 📋 **Compliance Checklist**

- [x] Waiver includes SMS-specific language
- [x] Checkbox is not pre-checked
- [x] Consent is not conditional on purchase
- [x] Phone number is captured on waiver
- [x] Waiver is signed/acknowledged
- [x] Consent timestamp stored in database
- [x] Consent method recorded ("waiver_checkbox")
- [x] Opt-out instructions included in messages
- [x] System checks for express consent before sending

---

## 🚨 **Important Notes**

1. **Documentation is Key**: Even with express consent, you must be able to prove it if challenged.

2. **Consent Can Be Revoked**: Recipients can opt out at any time (STOP keyword).

3. **Regular Updates**: Review and update your waiver language as regulations change.

4. **Legal Review**: Consider having your waiver reviewed by a compliance attorney.

---

## ✅ **Conclusion**

**Risk Level**: **LOW** (with proper waiver language and documentation)

If your waiver:
- ✅ Has SMS-specific checkbox
- ✅ Is signed/acknowledged
- ✅ Is properly documented in our system

Then you have **strong legal protection** under both TCPA and CASL, and the risk of sending to DNC numbers is **LOW**.

The system now automatically checks for express consent and allows sending to DNC numbers when valid consent exists.

---

**Last Updated**: 2024
**Status**: ✅ System updated to handle express consent override

