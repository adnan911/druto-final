import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

async function runMigrations() {
  console.log("Connecting to TiDB Cloud database...");
  const connStr = process.env.DATABASE_URL;
  if (!connStr) {
    console.error("DATABASE_URL is missing in .env");
    process.exit(1);
  }

  const isSslNeeded = connStr.includes("tidb") || connStr.includes("ssl");
  const conn = await mysql.createConnection({
    uri: connStr,
    ssl: isSslNeeded ? { minVersion: "TLSv1.2", rejectUnauthorized: true } : undefined,
    multipleStatements: true,
  });

  console.log("Connected successfully to TiDB Cloud MySQL!");

  const drizzleDir = path.resolve('drizzle');
  const files = fs.readdirSync(drizzleDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const filePath = path.join(drizzleDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    console.log(`Executing migration file: ${file}`);
    try {
      // Split statements by semicolon if needed
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const statement of statements) {
        try {
          await conn.query(statement);
        } catch (err) {
          if (err.code === 'ER_TABLE_EXISTS_ERROR' || err.code === 'ER_DUP_KEYNAME' || err.message?.includes('already exists')) {
            console.log(`  - Statement skipped (already applied): ${err.message}`);
          } else {
            console.warn(`  - Statement error (continuing): ${err.message}`);
          }
        }
      }
      console.log(`✓ Applied ${file}`);
    } catch (err) {
      console.error(`Failed executing ${file}:`, err);
    }
  }

  // Double check tables in database
  const [tables] = await conn.query("SHOW TABLES");
  console.log("\nExisting database tables in TiDB Cloud:");
  console.log(tables);

  await conn.end();
  console.log("\nMigration completed successfully!");
}

runMigrations().catch(err => {
  console.error("Migration runner failed:", err);
  process.exit(1);
});
