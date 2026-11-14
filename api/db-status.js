const { Pool } = require("pg");

let pool;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: true },
      max: 1,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ connected: false, error: "Method not allowed" });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(200).json({
      configured: false,
      connected: false,
      database: "ambitionaction",
      size_bytes: null,
      size_pretty: null,
    });
  }

  try {
    const result = await getPool().query(
      "SELECT current_database() AS database, pg_database_size(current_database())::text AS size_bytes, pg_size_pretty(pg_database_size(current_database())) AS size_pretty"
    );
    const row = result.rows[0];
    return res.status(200).json({
      configured: true,
      connected: true,
      database: row.database,
      size_bytes: row.size_bytes,
      size_pretty: row.size_pretty,
    });
  } catch (error) {
    // Do not return connection strings, hostnames, or provider error details to the browser.
    return res.status(503).json({
      configured: true,
      connected: false,
      database: null,
      size_bytes: null,
      size_pretty: null,
      error: "Database connection could not be established",
    });
  }
};
