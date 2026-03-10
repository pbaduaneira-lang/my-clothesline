const { Pool } = require("pg");

// Em produção no Render, DATABASE_URL será fornecido automaticamente.
const connectionString = process.env.DATABASE_URL;

const pool = new Pool(
    connectionString 
    ? { connectionString, ssl: { rejectUnauthorized: false } } 
    : {
        user: "postgres",
        host: "localhost",
        database: "clothesline",
        password: "Edju@1016@10",
        port: 5432
    }
);

module.exports = pool;