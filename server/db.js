const { Pool } = require("pg");

// Em produção no Render, DATABASE_URL será fornecido automaticamente.
const connectionString = process.env.DATABASE_URL;

const pool = new Pool(
    connectionString 
    ? { connectionString, ssl: { rejectUnauthorized: false } } 
    : {
        user: process.env.DB_USER || "postgres",
        host: process.env.DB_HOST || "localhost",
        database: process.env.DB_NAME || "clothesline",
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 5432
    }
);

module.exports = pool;