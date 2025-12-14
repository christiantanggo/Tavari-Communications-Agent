import dotenv from 'dotenv';
import { TelnyxService } from './services/telnyx.js';
import { Business } from './models/Business.js';
import readline from 'readline';

dotenv.config();

/**
 * Assign existing Telnyx phone numbers to a business
 * This is for numbers that were purchased but not assigned to a business
 */
async function assignExistingNumbers() {
  console.log('=== ASSIGNING EXISTING PHONE NUMBERS TO BUSINESS ===\n');
  
  // Get all phone numbers from Telnyx
  console.log('Fetching phone numbers from Telnyx...');
  const result = await TelnyxService.makeAPIRequest('GET', '/phone_numbers?page[size]=100');
  
  if (!result.data || result.data.length === 0) {
    console.log('❌ No phone numbers found in Telnyx account');
    return;
  }
  
  console.log(`Found ${result.data.length} phone number(s) in Telnyx:\n`);
  result.data.forEach((num, index) => {
    console.log(`${index + 1}. ${num.phone_number} (ID: ${num.id})`);
    console.log(`   Connection: ${num.connection_id || 'NOT SET'}`);
    console.log(`   Messaging Profile: ${num.messaging_profile_id || 'NOT SET'}`);
    console.log('');
  });
  
  // Get business email to find the business
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question('Enter your business email address: ', async (email) => {
      try {
        // Find business by email
        const business = await Business.findByEmail(email);
        
        if (!business) {
          console.log(`❌ No business found with email: ${email}`);
          rl.close();
          resolve();
          return;
        }
        
        console.log(`\nFound business: ${business.name} (ID: ${business.id})`);
        console.log(`Current Telnyx number: ${business.telnyx_number || 'NOT SET'}\n`);
        
        // Show unassigned numbers
        const unassignedNumbers = result.data.filter(num => {
          // Numbers that don't match the current business number
          return num.phone_number !== business.telnyx_number;
        });
        
        if (unassignedNumbers.length === 0) {
          console.log('✅ All numbers are already assigned to this business');
          rl.close();
          resolve();
          return;
        }
        
        console.log(`Found ${unassignedNumbers.length} number(s) that could be assigned:\n`);
        unassignedNumbers.forEach((num, index) => {
          console.log(`${index + 1}. ${num.phone_number}`);
        });
        console.log('');
        
        rl.question(`Assign ${unassignedNumbers[0].phone_number} to this business? (yes/no): `, async (answer) => {
          if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
            console.log('\n❌ Assignment cancelled');
            rl.close();
            resolve();
            return;
          }
          
          // Assign the first unassigned number
          const numberToAssign = unassignedNumbers[0];
          console.log(`\nAssigning ${numberToAssign.phone_number} to business ${business.id}...`);
          
          try {
            await Business.setTelnyxNumber(business.id, numberToAssign.phone_number);
            console.log('✅ Phone number assigned successfully!');
            
            // Verify
            const updatedBusiness = await Business.findById(business.id);
            console.log(`\nUpdated business:`);
            console.log(`  Name: ${updatedBusiness.name}`);
            console.log(`  Telnyx Number: ${updatedBusiness.telnyx_number || 'NOT SET'}`);
            console.log('\n✅ The number should now appear in your Tavari dashboard!');
          } catch (error) {
            console.error('❌ Failed to assign number:', error.message);
          }
          
          rl.close();
          resolve();
        });
      } catch (error) {
        console.error('❌ Error:', error.message);
        rl.close();
        resolve();
      }
    });
  });
}

assignExistingNumbers().catch(console.error);

