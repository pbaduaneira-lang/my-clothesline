const pool = require("./db");

async function restorePosts() {
    try {
        // 1. Atualizar posts existentes para expirarem em 48h a partir de agora
        const updateResult = await pool.query("UPDATE posts SET expires_at = NOW() + INTERVAL '48 hours' WHERE expires_at <= NOW();");
        console.log(`Sucesso! ${updateResult.rowCount} posts restaurados por mais 48 horas.`);
        
        // 2. Verificar o status atual
        const checkResult = await pool.query("SELECT id, created_at, expires_at, (expires_at > NOW()) as is_active FROM posts;");
        console.log("Status atual dos posts:");
        console.log(JSON.stringify(checkResult.rows, null, 2));
        
        process.exit(0);
    } catch (err) {
        console.error("Erro ao restaurar posts:", err);
        process.exit(1);
    }
}

restorePosts();
