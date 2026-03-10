const { Pool } = require("pg");

const pool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "clothesline",
    password: "Edju@1016@10",
    port: 5432
});

module.exports = pool;