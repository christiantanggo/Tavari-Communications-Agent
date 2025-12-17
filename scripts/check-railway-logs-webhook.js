// scripts/check-railway-logs-webhook.js
// Instructions for checking Railway logs

console.log("=".repeat(60));
console.log("📋 CHECK RAILWAY LOGS FOR WEBHOOK:");
console.log("=".repeat(60));
console.log("");
console.log("1. Go to Railway dashboard: https://railway.app/");
console.log("2. Select your project");
console.log("3. Click on your service");
console.log("4. Go to 'Logs' tab");
console.log("5. Make a test call to +1 (669) 240-7730");
console.log("6. Look for these log messages:");
console.log("");
console.log("   🔥 INBOUND CALL HIT");
console.log("   [VAPI Webhook] 📥 Incoming POST request");
console.log("");
console.log("If you see '🔥 INBOUND CALL HIT':");
console.log("   ✅ Webhook is working - the issue is elsewhere");
console.log("");
console.log("If you DON'T see it:");
console.log("   ❌ Webhook is not being hit - routing issue");
console.log("=".repeat(60));

