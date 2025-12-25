// scripts/run-migration.js
// Run the database migration automatically

import dotenv from "dotenv";
dotenv.config();

import { supabaseClient } from "../config/database.js";
import fs from "fs";

async function runMigration() {
  try {
    console.log("🔄 Reading migration file...");
    const migrationSQL = fs.readFileSync("RUN_THIS_MIGRATION.sql", "utf8");
    
    console.log("🔄 Executing migration...");
    
    // Split by semicolons and execute each statement
    const statements = migrationSQL
      .split(";")
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith("--"));
    
    for (const statement of statements) {
      if (statement.trim().length === 0) continue;
      
      try {
        console.log(`Executing: ${statement.substring(0, 100)}...`);
        const { error } = await supabaseClient.rpc("exec_sql", { sql: statement });
        
        if (error) {
          // Try direct query if RPC doesn't work
          console.log("RPC failed, trying direct execution...");
          // Supabase doesn't support raw SQL directly, so we need to use the SQL editor
          // For now, just log what needs to be run
          console.error("❌ Cannot execute raw SQL via Supabase client");
          console.error("Please run RUN_THIS_MIGRATION.sql in Supabase SQL Editor");
          process.exit(1);
        }
      } catch (err) {
        console.error(`Error executing statement:`, err.message);
      }
    }
    
    console.log("✅ Migration completed!");
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    console.error("\n⚠️  Please run RUN_THIS_MIGRATION.sql manually in Supabase SQL Editor");
    console.error("   Go to: Supabase Dashboard → SQL Editor → New Query");
    console.error("   Paste the contents of RUN_THIS_MIGRATION.sql and run it");
    process.exit(1);
  }
}

runMigration();







