const { Pool } = require('pg');
const pool = new Pool(); // Picks up from standard env vars on this machine mapped inside server.js

async function fix() {
    try {
        console.log("Iniciando correção de posts privados antigos...");
        // Em user_varal_items, o campo content tem um JSON com o ID original do post ou os dados dele.
        // O PostgreSQL pode não permitir cross query direta facilmente sem cast se for text,
        // Então vamos atualizar posts criados HOJE que não deveriam estar públicos como guestimation
        // Ou melhor, uma query baseada em LIKE:
        
        const res = await pool.query(`
            UPDATE posts p
            SET is_private = true
            WHERE is_private = false
            AND EXISTS (
                SELECT 1 FROM user_varal_items uvi
                WHERE uvi.item_type = 'post'
                AND uvi.content LIKE '%' || p.media_url || '%'
            )
            RETURNING id;
        `);
        console.log(`Corrigidos ${res.rows.length} posts retroativamente.`);
    } catch(e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
fix();
