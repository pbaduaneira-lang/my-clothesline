const pool = require("./db");

async function checkPosts() {
    try {
        const result = await pool.query("SELECT id, created_at, expires_at, (expires_at > NOW()) as is_active FROM posts;");
        console.log(JSON.stringify(result.rows, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkPosts();
