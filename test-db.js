import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  try {
    console.log("URL:", process.env.DATABASE_URL);
    const conn = await mysql.createConnection(process.env.DATABASE_URL);
    console.log("Connected successfully!");
    const [rows] = await conn.query("SELECT 1+1 AS result");
    console.log("Result:", rows);
    await conn.end();
  } catch (e) {
    console.error("Connection failed:", e);
  }
}
test();
