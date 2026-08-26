import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function reset() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await conn.query("SHOW TABLES");
  const tables = rows.map(r => Object.values(r)[0]);
  console.log("Dropping tables:", tables);
  await conn.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of tables) {
    await conn.query(`DROP TABLE IF EXISTS \`${table}\``);
  }
  await conn.query("SET FOREIGN_KEY_CHECKS = 1");
  console.log("Done");
  process.exit(0);
}
reset();
