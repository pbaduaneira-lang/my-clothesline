const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("./db");

const JWT_SECRET = process.env.JWT_SECRET || "sua_chave_secreta_aqui";

const app = express();
app.use(cors());
app.use(express.json());

// PASTA DE UPLOAD
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + path.extname(file.originalname);
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

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
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (name, username, password) VALUES ($1, $2, $3) RETURNING id, name, username",
      [name, username, hashedPassword]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao registrar usuário" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    if (result.rows.length === 0) return res.status(401).json({ error: "Usuário não encontrado" });

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Senha incorreta" });

    const token = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
    
    // Atualiza last_seen no login
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
    const media_url = req.file.filename;
    const type = req.file.mimetype.startsWith("video") ? "video" : "image";

    const result = await pool.query(
      "INSERT INTO posts (user_id, media_url, type, caption, author_id, created_at, expires_at) VALUES ($1,$2,$3,$4,$5,NOW(), NOW() + INTERVAL '24 hours') RETURNING *",
      [1, media_url, type, caption, author_id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao criar post" });
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
      "INSERT INTO posts (user_id, media_url, type, caption, author_id, shared_from_id, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW() + INTERVAL '24 hours')",
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
      WHERE p.expires_at > NOW()
      GROUP BY p.id, u.name, f.follower_id
      ORDER BY is_followed DESC, p.created_at ASC
    `, [userId]);
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
      WHERE p.author_id = $2 AND p.expires_at > NOW()
      GROUP BY p.id, u.name, f.follower_id
      ORDER BY p.created_at DESC
    `, [userId, targetUserId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao carregar feed do usuário" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});