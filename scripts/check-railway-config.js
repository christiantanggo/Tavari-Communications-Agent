// Check what Railway should be running
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

console.log('🔍 Railway Configuration Check\n');

// Check railway.json
try {
  const railwayConfig = JSON.parse(readFileSync(resolve(rootDir, 'railway.json'), 'utf8'));
  console.log('✅ railway.json found:');
  console.log(`   Start Command: ${railwayConfig.deploy?.startCommand || 'NOT SET'}`);
  console.log(`   Build Command: ${railwayConfig.build?.buildCommand || 'NOT SET'}`);
} catch (error) {
  console.log('❌ railway.json not found or invalid');
}

// Check package.json
try {
  const packageJson = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));
  console.log('\n✅ package.json found:');
  console.log(`   Main: ${packageJson.main || 'NOT SET'}`);
  console.log(`   Start Script: ${packageJson.scripts?.start || 'NOT SET'}`);
  
  if (packageJson.scripts?.start) {
    const startCmd = packageJson.scripts.start;
    console.log(`\n📋 What "npm start" will run: ${startCmd}`);
    
    if (startCmd.includes('server.js')) {
      console.log('   ✅ Points to server.js (correct)');
    } else {
      console.log('   ⚠️  Does NOT point to server.js');
    }
  }
} catch (error) {
  console.log('❌ package.json not found or invalid');
}

// Check which server.js exists
console.log('\n📁 Server files:');
try {
  const rootServer = readFileSync(resolve(rootDir, 'server.js'), 'utf8');
  if (rootServer.includes('Tavari server running')) {
    console.log('   ✅ Root server.js exists (VAPI version)');
    if (rootServer.includes('[VAPI VERSION]')) {
      console.log('      Contains VAPI version marker');
    }
  }
} catch (error) {
  console.log('   ❌ Root server.js NOT FOUND');
}

try {
  const legacyServer = readFileSync(resolve(rootDir, 'archive/legacy-implementation/server.js'), 'utf8');
  if (legacyServer.includes('Ready to receive calls')) {
    console.log('   ⚠️  Legacy server.js exists (Telnyx version)');
    console.log('      This should NOT be running!');
  }
} catch (error) {
  console.log('   ✅ Legacy server.js not found (good)');
}

console.log('\n💡 Railway should be running:');
console.log('   Command: npm start');
console.log('   Which runs: node server.js');
console.log('   From directory: / (project root)');
console.log('   Expected output: "✅ Tavari server running on port 5001 [VAPI VERSION]"');
console.log('\n❌ If logs show "✅ Ready to receive calls!" then Railway is running the WRONG file!');

