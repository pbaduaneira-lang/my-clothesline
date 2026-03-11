const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("./db");
const { createClient } = require("@supabase/supabase-js");

const JWT_SECRET = process.env.JWT_SECRET || "sua_chave_secreta_aqui";
const SUPABASE_URL = process.env.SUPABASE_URL || "https://dykndppibbsklpyracuj.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || ("sb_secret_" + "qBQBs4bN6nW7MBn_PCxepQ_oM0c8xbI");
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const app = express();
app.use(cors());
app.use(express.json());

// FUNÇÃO PARA INICIALIZAR O BANCO (Cria tabelas se não existirem)
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          username VARCHAR(50) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          last_seen TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS posts (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id),
          author_id INTEGER REFERENCES users(id),
          media_url TEXT NOT NULL,
          type VARCHAR(10) DEFAULT 'image',
          caption TEXT,
          likes INTEGER DEFAULT 0,
          shares INTEGER DEFAULT 0,
          shared_from_id INTEGER REFERENCES posts(id),
          created_at TIMESTAMP DEFAULT NOW(),
          expires_at TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS comments (
          id SERIAL PRIMARY KEY,
          post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
          author_id INTEGER REFERENCES users(id),
          text TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          sender_id INTEGER REFERENCES users(id),
          receiver_id INTEGER REFERENCES users(id),
          text TEXT NOT NULL,
          is_read BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS follows (
          follower_id INTEGER REFERENCES users(id),
          followed_id INTEGER REFERENCES users(id),
          PRIMARY KEY (follower_id, followed_id)
      );
      -- Garantir que a coluna expires_at existe (Migração Automática)
      ALTER TABLE posts ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
    `);
    console.log("Banco de dados inicializado com sucesso!");
  } catch (err) {
    console.error("Erro ao inicializar banco de dados:", err);
  }
}

// Inicializa as tabelas ao subir o servidor
initDB();

// PASTA DE UPLOAD
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir)
  },
  filename: function (req, file, cb) {
    const fileExt = file.mimetype.split("/")[1] || "jpeg";
    cb(null, `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 1 * 1024 * 1024 } }); // Limite 1MB (imagens comprimidas no frontend)

// SERVIR ARQUIVOS DE UPLOAD
app.use("/uploads", express.static(uploadDir));

// SERVIR FRONTEND ESTÁTICO (WEB)
app.use(express.static(path.join(__dirname, "../web")));

/* AUTENTICAÇÃO E HEARTBEAT */

async function updateLastSeen(userId) {
  try {
    await pool.query("UPDATE users SET last_seen = NOW() WHERE id = $1", [userId]);
  } catch (err) {
    console.error("Erro ao atualizar last_seen:", err);
  }
}

app.post("/register", async (req, res) => {
  try {
    const { name, username, password } = req.body;
    const trimmedUsername = username.trim().toLowerCase();
    const trimmedPassword = password.trim();
    const hashedPassword = await bcrypt.hash(trimmedPassword, 10);
    const result = await pool.query(
      "INSERT INTO users (name, username, password) VALUES ($1, $2, $3) RETURNING id, name, username",
      [name, trimmedUsername, hashedPassword]
    );
    console.log(`Novo usuário registrado: ${trimmedUsername}`);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao registrar usuário" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const trimmedUsername = username.trim().toLowerCase();
    const trimmedPassword = password.trim();

    console.log(`Tentativa de login para: ${trimmedUsername}`);

    const result = await pool.query("SELECT * FROM users WHERE LOWER(username) = $1", [trimmedUsername]);
    
    if (result.rows.length === 0) {
      console.log(`Usuário não encontrado: ${trimmedUsername}`);
      return res.status(401).json({ error: "Usuário não encontrado" });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(trimmedPassword, user.password);
    
    if (!isMatch) {
      console.log(`Senha incorreta para: ${trimmedUsername}`);
      return res.status(401).json({ error: "Senha incorreta" });
    }

    console.log(`Login bem-sucedido: ${trimmedUsername}`);
    const token = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
    
    await updateLastSeen(user.id);
    
    res.json({ token, user: { id: user.id, name: user.name, username: user.username } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao fazer login" });
  }
});

app.post("/heartbeat", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });
    const decoded = jwt.verify(token, JWT_SECRET);
    await updateLastSeen(decoded.id);
    res.json({ success: true });
  } catch (err) {
    res.status(401).json({ error: "Token inválido" });
  }
});

app.get("/online-users", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, username FROM users WHERE last_seen > NOW() - INTERVAL '5 minutes' ORDER BY name ASC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar usuários online" });
  }
});

/* BUSCA DE USUÁRIOS */

app.get("/users/profile/stats", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;

    const followers = await pool.query("SELECT COUNT(*) FROM follows WHERE followed_id = $1", [userId]);
    const following = await pool.query("SELECT COUNT(*) FROM follows WHERE follower_id = $1", [userId]);

    res.json({
      followers: parseInt(followers.rows[0].count),
      following: parseInt(following.rows[0].count)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar estatísticas" });
  }
});

app.get("/users/followers", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;

    const result = await pool.query(`
      SELECT u.id, u.name, u.username 
      FROM users u
      JOIN follows f ON f.follower_id = u.id
      WHERE f.followed_id = $1
    `, [userId]);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar seguidores" });
  }
});

app.get("/users/search", async (req, res) => {
  try {
    const { q } = req.query;
    const result = await pool.query(
      "SELECT id, name, username FROM users WHERE name ILIKE $1 OR username ILIKE $1 LIMIT 10",
      [`%${q}%`]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar usuários" });
  }
});

app.get("/messages/:otherId", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });
    const decoded = jwt.verify(token, JWT_SECRET);
    const myId = decoded.id;
    const otherId = req.params.otherId;

    const result = await pool.query(`
      SELECT m.*, u.name as sender_name, u.username as sender_username 
      FROM messages m 
      JOIN users u ON m.sender_id = u.id 
      WHERE (m.sender_id = $1 AND m.receiver_id = $2)
         OR (m.sender_id = $2 AND m.receiver_id = $1)
      ORDER BY m.created_at ASC 
      LIMIT 100
    `, [myId, otherId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar mensagens" });
  }
});

app.get("/messages/unread/count", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const result = await pool.query(
      "SELECT COUNT(*) FROM messages WHERE receiver_id = $1 AND is_read = false",
      [decoded.id]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar contagem de não lidas" });
  }
});

app.get("/conversations", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });
    const decoded = jwt.verify(token, JWT_SECRET);
    const myId = decoded.id;

    // Busca usuários com quem houve troca de mensagens, a última mensagem e count de não lidas
    const result = await pool.query(`
      SELECT 
        u.id, 
        u.name, 
        u.username,
        (SELECT text FROM messages WHERE (sender_id = $1 AND receiver_id = u.id) OR (sender_id = u.id AND receiver_id = $1) ORDER BY created_at DESC LIMIT 1) as last_text,
        (SELECT created_at FROM messages WHERE (sender_id = $1 AND receiver_id = u.id) OR (sender_id = u.id AND receiver_id = $1) ORDER BY created_at DESC LIMIT 1) as last_date,
        (SELECT COUNT(*) FROM messages WHERE sender_id = u.id AND receiver_id = $1 AND is_read = false) as unread_count
      FROM users u
      WHERE u.id IN (
        SELECT DISTINCT receiver_id FROM messages WHERE sender_id = $1
        UNION
        SELECT DISTINCT sender_id FROM messages WHERE receiver_id = $1
      )
      ORDER BY last_date DESC
    `, [myId]);
    
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar conversas" });
  }
});

app.post("/messages/read/:otherId", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });
    const decoded = jwt.verify(token, JWT_SECRET);
    const myId = decoded.id;
    const otherId = req.params.otherId;

    await pool.query(
      "UPDATE messages SET is_read = true WHERE sender_id = $1 AND receiver_id = $2 AND is_read = false",
      [otherId, myId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao marcar como lidas" });
  }
});

app.delete("/conversations/:otherId", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });
    const decoded = jwt.verify(token, JWT_SECRET);
    const myId = decoded.id;
    const otherId = req.params.otherId;

    // Deleta as mensagens entre os dois (simplificado para o MVP)
    await pool.query(
      "DELETE FROM messages WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)",
      [myId, otherId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao deletar conversa" });
  }
});

app.post("/messages", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });
    const decoded = jwt.verify(token, JWT_SECRET);
    const { text, receiver_id } = req.body;
    
    const result = await pool.query(
      "INSERT INTO messages (sender_id, receiver_id, text) VALUES ($1, $2, $3) RETURNING *, (SELECT name FROM users WHERE id = $1) as sender_name",
      [decoded.id, receiver_id, text]
    );
    
    await updateLastSeen(decoded.id);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao enviar mensagem" });
  }
});

/* CRIAR POST */

// Prevenir crash silencioso do processo Node.js
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED REJECTION]:', err);
});

app.post("/post", upload.single("media"), async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });

    const decoded = jwt.verify(token, JWT_SECRET);
    const author_id = decoded.id;
    await updateLastSeen(author_id);

    if (!req.file) {
      return res.status(400).json({ error: "Nenhum arquivo enviado" });
    }
    const caption = req.body.caption || "";
    
    const fileName = req.file.filename;
    const filePath = `${author_id}/${fileName}`;
    const type = req.file.mimetype.startsWith("video") ? "video" : "image";

    console.log(`[Upload] Arquivo recebido: ${filePath} (${req.file.size} bytes). Enviando ao Supabase...`);
    
    // Ler arquivo do disco
    const fileBuffer = fs.readFileSync(req.file.path);

    // Limpar arquivo temporário do disco ANTES do upload (já lemos para o buffer)
    fs.unlink(req.file.path, () => {});

    // Upload via SDK do Supabase
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("clothesline-uploads")
      .upload(filePath, fileBuffer, {
        contentType: req.file.mimetype,
        upsert: true,
        cacheControl: '3600'
      });

    // Liberar buffer da memória imediatamente
    // (fileBuffer sai de escopo e será coletado pelo GC)

    if (uploadError) {
      console.error("[ERRO SUPABASE]:", JSON.stringify(uploadError, null, 2));
      return res.status(502).json({ error: "Erro Supabase Storage", details: uploadError.message });
    }

    console.log(`[Upload] Sucesso!`);

    // URL pública (padrão fixo do Supabase)
    const media_url = `${SUPABASE_URL}/storage/v1/object/public/clothesline-uploads/${filePath}`;
    console.log(`[Upload] URL: ${media_url}`);

    const result = await pool.query(
      "INSERT INTO posts (user_id, media_url, type, caption, author_id, created_at, expires_at) VALUES ($1,$2,$3,$4,$5,NOW(), NOW() + INTERVAL '48 hours') RETURNING *",
      [author_id, media_url, type, caption, author_id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("[ERRO GERAL NO POST]:", err);
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, () => {});
    }
    res.status(500).json({ 
      error: "Erro no servidor ao criar post", 
      details: err.message 
    });
  }
});

/* FEED */

app.post("/post/:id/like", async (req, res) => {
  try {
    const postId = req.params.id;
    await pool.query("UPDATE posts SET likes = COALESCE(likes, 0) + 1 WHERE id = $1", [postId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao curtir" });
  }
});

app.post("/post/:id/share", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });
    const decoded = jwt.verify(token, JWT_SECRET);
    const sharerId = decoded.id;
    const originalPostId = req.params.id;

    // 1. Incrementa o contador no post original
    await pool.query("UPDATE posts SET shares = COALESCE(shares, 0) + 1 WHERE id = $1", [originalPostId]);

    // 2. Busca dados do post original para criar a cópia
    const original = await pool.query("SELECT * FROM posts WHERE id = $1", [originalPostId]);
    if (original.rows.length === 0) return res.status(404).json({ error: "Post original não encontrado" });
    
    const p = original.rows[0];

    // 3. Cria o novo post (re-postagem)
    await pool.query(
      "INSERT INTO posts (user_id, media_url, type, caption, author_id, shared_from_id, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW() + INTERVAL '48 hours')",
      [p.user_id, p.media_url, p.type, p.caption, sharerId, originalPostId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao compartilhar" });
  }
});

app.post("/post/:id/comment", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });

    const decoded = jwt.verify(token, JWT_SECRET);
    const author_id = decoded.id;
    await updateLastSeen(author_id);

    const postId = req.params.id;
    const { text } = req.body;
    await pool.query("INSERT INTO comments (post_id, text, author_id) VALUES ($1, $2, $3)", [postId, text, author_id]);
    res.json({ success: true, text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao comentar" });
  }
});

app.delete("/post/:id", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });

    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;
    const postId = req.params.id;

    // Apenas o autor pode deletar
    const postRes = await pool.query("SELECT author_id FROM posts WHERE id = $1", [postId]);
    if (postRes.rows.length === 0) return res.status(404).json({ error: "Post não encontrado" });

    if (postRes.rows[0].author_id !== userId) {
      return res.status(403).json({ error: "Você só pode excluir suas próprias postagens" });
    }

    await pool.query("DELETE FROM posts WHERE id = $1", [postId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao excluir post" });
  }
});

/* SEGUIR USUÁRIOS */

app.post("/follow/:id", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });
    const decoded = jwt.verify(token, JWT_SECRET);
    const follower_id = decoded.id;
    const followed_id = req.params.id;

    if (follower_id == followed_id) return res.status(400).json({ error: "Você não pode seguir você mesmo" });

    await pool.query(
      "INSERT INTO follows (follower_id, followed_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [follower_id, followed_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao seguir usuário" });
  }
});

app.delete("/follow/:id", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });
    const decoded = jwt.verify(token, JWT_SECRET);
    const follower_id = decoded.id;
    const followed_id = req.params.id;

    await pool.query(
      "DELETE FROM follows WHERE follower_id = $1 AND followed_id = $2",
      [follower_id, followed_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao deixar de seguir" });
  }
});

app.get("/feed", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    let userId = null;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id;
      } catch(e) {}
    }

    const result = await pool.query(`
      SELECT p.*, u.name as author_name,
             (CASE WHEN f.follower_id IS NOT NULL THEN 1 ELSE 0 END) as is_followed,
             COALESCE(
               json_agg(
                 json_build_object('text', c.text, 'author_name', cu.name)
                 ORDER BY c.created_at ASC
               ) FILTER (WHERE c.id IS NOT NULL), 
               '[]'::json
             ) AS comments
      FROM posts p
      LEFT JOIN users u ON p.author_id = u.id
      LEFT JOIN follows f ON f.followed_id = p.author_id AND f.follower_id = $1
      LEFT JOIN comments c ON c.post_id = p.id
      LEFT JOIN users cu ON c.author_id = cu.id
      WHERE (p.expires_at > NOW() OR p.expires_at IS NULL)
      GROUP BY p.id, u.name, f.follower_id
      ORDER BY is_followed DESC, p.created_at ASC
    `, [userId]);
    console.log(`Feed carregado para usuário ${userId}: ${result.rows.length} posts encontrados.`);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao carregar feed" });
  }
});

app.get("/feed/user/:id", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    let userId = null;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id;
      } catch(e) {}
    }
    const targetUserId = req.params.id;

    const result = await pool.query(`
      SELECT p.*, u.name as author_name,
             (CASE WHEN f.follower_id IS NOT NULL THEN 1 ELSE 0 END) as is_followed,
             COALESCE(
               json_agg(
                 json_build_object('text', c.text, 'author_name', cu.name)
                 ORDER BY c.created_at ASC
               ) FILTER (WHERE c.id IS NOT NULL), 
               '[]'::json
             ) AS comments
      FROM posts p
      LEFT JOIN users u ON p.author_id = u.id
      LEFT JOIN follows f ON f.followed_id = p.author_id AND f.follower_id = $1
      LEFT JOIN comments c ON c.post_id = p.id
      LEFT JOIN users cu ON c.author_id = cu.id
      WHERE p.author_id = $2 AND (p.expires_at > NOW() OR p.expires_at IS NULL)
      GROUP BY p.id, u.name, f.follower_id
      ORDER BY p.created_at DESC
    `, [userId, targetUserId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao carregar feed do usuário" });
  }
});

/* ROTA DE EMERGÊNCIA - LIMPAR BANCO (REMOVER APÓS USO) */
app.get("/debug/clear-database-now", async (req, res) => {
  try {
    console.log("!!! SOLICITAÇÃO DE LIMPEZA DE BANCO RECEBIDA !!!");
    await pool.query("DELETE FROM comments");
    await pool.query("DELETE FROM follows");
    if (pool.options.database !== 'postgres') { // Evitar deletar drops se a tabela nao existir no mini-schema
        try { await pool.query("DELETE FROM drops"); } catch(e) {}
    }
    await pool.query("DELETE FROM posts");
    console.log("!!! BANCO LIMPO COM SUCESSO NO RENDER !!!");
    res.send("<h1>Banco de Dados Limpo com Sucesso!</h1><p>Todas as fotos Base64 foram removidas. Pode voltar ao Varal agora.</p>");
  } catch (err) {
    console.error("ERRO NA LIMPEZA:", err);
    res.status(500).send("Erro ao limpar banco: " + err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});