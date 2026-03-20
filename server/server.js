const path = require("path");
const envPath = path.resolve(__dirname, '..', '.env');
require('dotenv').config({ path: envPath });
console.log(`[Config] Carregando ambiente de: ${envPath}`);
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("./db");
// Supabase removido para usar armazenamento local

const { createClient } = require('@supabase/supabase-js');

// Prevenir crash silencioso em caso de erros de inicialização ou promessas
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED REJECTION]:', err);
});

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("ERRO: JWT_SECRET não configurado!");
}
const PORT = process.env.PORT || 3000;

// Inicialização do Supabase (Cloud Storage)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabaseBucket = process.env.SUPABASE_BUCKET || 'clothesline_media';

console.log("[Supabase Config] URL presente:", !!supabaseUrl);
console.log("[Supabase Config] Key presente:", !!supabaseKey);
console.log("[Supabase Config] Bucket configurado:", supabaseBucket);

let supabase = null;
if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log("[Supabase Config] Cliente inicializado com sucesso.");
  } catch (err) {
    console.error("[Supabase Config] Erro ao inicializar cliente:", err);
  }
} else {
  console.warn("[Supabase Config] AVISO: Chaves do Supabase não encontradas. Uploads irão falhar.");
}

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
          birth_date DATE,
          residence VARCHAR(255),
          varal_name VARCHAR(100) DEFAULT 'Meu Varal',
          last_seen TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS user_varal_items (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          varal_id INTEGER, -- Será preenchido para novos varais
          item_type VARCHAR(20) NOT NULL, -- 'person', 'message', 'post'
          content TEXT NOT NULL,          -- nome da pessoa, texto da msg ou ID do post
          author_name VARCHAR(100),       -- opcional para msgs
          created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS private_varais (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS private_varal_participants (
          varal_id INTEGER REFERENCES private_varais(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          PRIMARY KEY (varal_id, user_id)
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
      CREATE TABLE IF NOT EXISTS notifications (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id),
          actor_id INTEGER REFERENCES users(id),
          type VARCHAR(20) NOT NULL,
          post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
          is_read BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT NOW()
      );
      -- Garantir que as colunas novas existam (Migração Automática)
      ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS residence VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS varal_name VARCHAR(100) DEFAULT 'Meu Varal';
      ALTER TABLE user_varal_items ADD COLUMN IF NOT EXISTS varal_id INTEGER REFERENCES private_varais(id) ON DELETE CASCADE;
      ALTER TABLE posts ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
      ALTER TABLE posts ADD COLUMN IF NOT EXISTS varal_id INTEGER REFERENCES private_varais(id) ON DELETE CASCADE;
      ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false;
    `);
    console.log("Banco de dados inicializado com sucesso!");
  } catch (err) {
    console.error("Erro ao inicializar banco de dados:", err);
  }
}

// Função initDB() movida para o final para boot assíncrono seguro
// initDB() será chamado no app.listen

// Configuração do Multer para Memória (O arquivo não toca o HD do servidor, vai direto pro Supabase)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage, 
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// SERVIR ARQUIVOS DE UPLOAD ANTIGOS (LEGADO)
try {
  const uploadDir = path.join(__dirname, "uploads");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
  app.use("/uploads", express.static(uploadDir));
} catch (e) {
  console.error("[Legado] Erro ao preparar pasta de uploads:", e.message);
}

// SERVIR FRONTEND ESTÁTICO (WEB)
const webPath = path.resolve(__dirname, '..', 'web');
console.log(`[Config] Servindo frontend estático de: ${webPath}`);
app.use(express.static(webPath));

// ROTA RAIZ EXPLÍCITA (Garante que index.html carregue)
app.get("/", (req, res) => {
  const indexPath = path.join(webPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("Erro: index.html não encontrado no servidor.");
  }
});

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
    let { name, username, password, birth_date, residence } = req.body;
    
    if (!name || !username || !password) {
      return res.status(400).json({ error: "Nome, usuário e senha são obrigatórios." });
    }

    const trimmedUsername = username.trim().toLowerCase();
    const trimmedPassword = password.trim();
    
    // Tratamento para não quebrar o tipo DATE do PostgreSQL com strings vazias
    const birthDateVal = (birth_date && birth_date.trim() !== "") ? birth_date : null;
    const residenceVal = (residence && residence.trim() !== "") ? residence : null;

    const hashedPassword = await bcrypt.hash(trimmedPassword, 10);
    const result = await pool.query(
      "INSERT INTO users (name, username, password, birth_date, residence) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, username, birth_date, residence, varal_name",
      [name.trim(), trimmedUsername, hashedPassword, birthDateVal, residenceVal]
    );
    
    console.log(`[Auth] Novo usuário registrado: ${trimmedUsername}`);
    res.json(result.rows[0]);
  } catch (err) {
    console.error("[ERRO REGISTRO]:", err);
    if (err.code === '23505') {
       return res.status(409).json({ error: "Este nome de usuário já está em uso." });
    }
    res.status(500).json({ error: "Erro interno no servidor ao criar conta." });
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
    
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        name: user.name, 
        username: user.username, 
        birth_date: user.birth_date, 
        residence: user.residence,
        varal_name: user.varal_name
      } 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao fazer login" });
  }
});

// ROTA PARA LISTAR ANIVERSARIANTES DO MÊS
app.get("/anniversaries", async (req, res) => {
  try {
    // Busca usuários que fazem aniversário no mês atual
    const result = await pool.query(`
      SELECT id, name, username, birth_date, residence 
      FROM users 
      WHERE birth_date IS NOT NULL 
      AND EXTRACT(MONTH FROM birth_date) = EXTRACT(MONTH FROM CURRENT_DATE)
      ORDER BY EXTRACT(DAY FROM birth_date) ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar aniversariantes" });
  }
});

// --- VARAL PARTICULAR SINCRONIZADO ---

app.get("/varal", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
    const userId = decoded.id;

    const userRes = await pool.query("SELECT varal_name FROM users WHERE id = $1", [userId]);
    const itemsRes = await pool.query("SELECT * FROM user_varal_items WHERE user_id = $1 ORDER BY created_at ASC", [userId]);
    
    res.json({
      name: userRes.rows[0]?.varal_name || "Meu Varal",
      items: itemsRes.rows.map(item => ({
        id: item.id,
        type: item.item_type,
        content: item.content,
        author: item.author_name,
        created_at: item.created_at
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao carregar Varal Particular" });
  }
});

app.post("/varal/name", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
    const { name } = req.body;
    
    await pool.query("UPDATE users SET varal_name = $1 WHERE id = $2", [name, decoded.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao atualizar nome do varal" });
  }
});

app.post("/varal/item", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
    const { type, content, author_name } = req.body;

    const result = await pool.query(
      "INSERT INTO user_varal_items (user_id, item_type, content, author_name) VALUES ($1, $2, $3, $4) RETURNING *",
      [decoded.id, type, content, author_name || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erro ao adicionar item ao varal" });
  }
});

app.delete("/varal/item/:id", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
    
    await pool.query("DELETE FROM user_varal_items WHERE id = $1 AND user_id = $2", [req.params.id, decoded.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao remover item" });
  }
});

// --- MÚLTIPLOS VARAIS PRIVADOS (GRUPOS) ---

app.get("/varais", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
    const userId = decoded.id;

    const result = await pool.query(`
      SELECT v.*, 
             u.name as owner_name,
             (SELECT COUNT(*) FROM private_varal_participants WHERE varal_id = v.id) as participants_count
      FROM private_varais v
      JOIN private_varal_participants vp ON v.id = vp.varal_id
      JOIN users u ON v.owner_id = u.id
      WHERE vp.user_id = $1
      ORDER BY v.created_at DESC
    `, [userId]);
    
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao listar varais" });
  }
});

app.post("/varais", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
    const { name, participants } = req.body; // participants: array de IDs

    const result = await pool.query(
      "INSERT INTO private_varais (name, owner_id) VALUES ($1, $2) RETURNING *",
      [name, decoded.id]
    );
    const varalId = result.rows[0].id;

    // Adiciona o dono como participante
    await pool.query(
      "INSERT INTO private_varal_participants (varal_id, user_id) VALUES ($1, $2)",
      [varalId, decoded.id]
    );

    // Adiciona outros participantes se houver
    if (participants && Array.isArray(participants)) {
      for (const pId of participants) {
        if (pId !== decoded.id) {
          await pool.query(
            "INSERT INTO private_varal_participants (varal_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [varalId, pId]
          );
        }
      }
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao criar varal" });
  }
});

app.get("/varais/:id/items", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
    const varalId = req.params.id;

    // Verificar se o usuário participa deste varal
    const check = await pool.query(
      "SELECT 1 FROM private_varal_participants WHERE varal_id = $1 AND user_id = $2",
      [varalId, decoded.id]
    );
    if (check.rows.length === 0) return res.status(403).json({ error: "Acesso negado" });

    const itemsRes = await pool.query(
      "SELECT * FROM user_varal_items WHERE varal_id = $1 ORDER BY created_at ASC",
      [varalId]
    );
    
    res.json(itemsRes.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao carregar itens do varal" });
  }
});

app.post("/varais/item", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
    const { varal_id, type, content, author_name } = req.body;

    // Verificar se o usuário participa deste varal
    const check = await pool.query(
      "SELECT 1 FROM private_varal_participants WHERE varal_id = $1 AND user_id = $2",
      [varal_id, decoded.id]
    );
    if (check.rows.length === 0) return res.status(403).json({ error: "Acesso negado" });

    const result = await pool.query(
      "INSERT INTO user_varal_items (user_id, varal_id, item_type, content, author_name) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [decoded.id, varal_id, type, content, author_name || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao adicionar item ao varal" });
  }
});

app.get("/varais/:id/participants", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
    const varalId = req.params.id;

    // Verificar se o usuário participa deste varal
    const check = await pool.query(
      "SELECT 1 FROM private_varal_participants WHERE varal_id = $1 AND user_id = $2",
      [varalId, decoded.id]
    );
    if (check.rows.length === 0) return res.status(403).json({ error: "Acesso negado" });

    const result = await pool.query(`
      SELECT u.id, u.name, u.username, u.last_seen
      FROM users u
      JOIN private_varal_participants vp ON u.id = vp.user_id
      WHERE vp.varal_id = $1
      ORDER BY u.name ASC
    `, [varalId]);
    
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao listar participantes" });
  }
});

app.post("/heartbeat", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
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
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
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
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
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
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
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
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
    
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
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
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
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
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
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
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
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
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

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
    const author_id = decoded.id;
    await updateLastSeen(author_id);

    if (!req.file) {
      return res.status(400).json({ error: "Nenhum arquivo enviado" });
    }
    const caption = req.body.caption || "";
    const isPrivateFlag = typeof req.body.is_private === "string" ? req.body.is_private === "true" : !!req.body.is_private;
    
    // Configurações do arquivo para o Supabase
    const fileExt = req.file.originalname.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = fileName; // Vai direto para a raiz do bucket 'media'
    
    const isVideo = req.file.mimetype.startsWith("video") || 
                    ['mp4', 'webm', 'ogg', 'mov', 'quicktime'].some(ext => fileExt.toLowerCase() === ext);
    const type = isVideo ? "video" : "image";

    if (!supabase) {
      return res.status(500).json({ error: "Serviço de Storage (Supabase) não configurado no servidor." });
    }

    console.log(`[Upload Cloud] Iniciando: ${req.file.originalname} | Mime: ${req.file.mimetype} | Tipo: ${type}`);

    // UPLOAD PARA SUPABASE STORAGE
    const { data, error: uploadError } = await supabase.storage
      .from(supabaseBucket)
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (uploadError) {
      console.error("[ERRO SUPABASE UPLOAD]:", uploadError);
      throw uploadError;
    }

    // Gerar URL Pública
    const { data: publicData } = supabase.storage.from(supabaseBucket).getPublicUrl(filePath);
    const media_url = publicData.publicUrl;

    console.log(`[Upload Cloud] Sucesso! URL: ${media_url}`);

    const result = await pool.query(
      "INSERT INTO posts (user_id, media_url, type, caption, author_id, created_at, expires_at, is_private) VALUES ($1,$2,$3,$4,$5,NOW(), NOW() + INTERVAL '48 hours', $6) RETURNING *",
      [author_id, media_url, type, caption, author_id, isPrivateFlag]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("[ERRO GERAL NO POST]:", err);
    
    // Fornece o erro real para o cliente temporariamente para ajudar no debug
    res.status(500).json({ 
      error: `Erro no servidor: ${err.message}`, 
      detail: err.detail || err.hint || null 
    });
  }
});

/* FEED */

app.post("/post/:id/like", async (req, res) => {
  try {
    const postId = req.params.id;
    const token = req.headers.authorization?.split(" ")[1];
    let actorId = null;
    if (token) {
        try {
            let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
            actorId = decoded.id;
        } catch(e) {}
    }

    await pool.query("UPDATE posts SET likes = COALESCE(likes, 0) + 1 WHERE id = $1", [postId]);
    
    // Notificação
    if (actorId) {
        const postRes = await pool.query("SELECT user_id FROM posts WHERE id = $1", [postId]);
        const postOwnerId = postRes.rows[0]?.user_id;
        if (postOwnerId && postOwnerId !== actorId) {
            await pool.query(
                "INSERT INTO notifications (user_id, actor_id, type, post_id) VALUES ($1, $2, 'like', $3)",
                [postOwnerId, actorId, postId]
            );
        }
    }

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
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
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

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
    const authorId = decoded.id;
    await updateLastSeen(authorId);

    const postId = req.params.id;
    const { text } = req.body;
    
    const result = await pool.query(
      "INSERT INTO comments (post_id, author_id, text) VALUES ($1, $2, $3) RETURNING *",
      [postId, authorId, text]
    );

    // Notificação
    const postRes = await pool.query("SELECT user_id FROM posts WHERE id = $1", [postId]);
    const postOwnerId = postRes.rows[0]?.user_id;
    if (postOwnerId && postOwnerId !== authorId) {
        await pool.query(
            "INSERT INTO notifications (user_id, actor_id, type, post_id) VALUES ($1, $2, 'comment', $3)",
            [postOwnerId, authorId, postId]
        );
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao comentar" });
  }
});

app.delete("/post/:id", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
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
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
    const followerId = decoded.id;
    const followedId = req.params.id;

    if (followerId == followedId) return res.status(400).json({ error: "Você não pode seguir você mesmo" });

    await pool.query(
      "INSERT INTO follows (follower_id, followed_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [followerId, followedId]
    );

    // Notificação
    if (followerId != followedId) {
        await pool.query(
            "INSERT INTO notifications (user_id, actor_id, type) VALUES ($1, $2, 'follow')",
            [followedId, followerId]
        );
    }

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
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
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
        let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
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
      WHERE (p.expires_at > NOW() OR p.expires_at IS NULL) AND p.is_private = false
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
        let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
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
      WHERE p.author_id = $2 AND (p.expires_at > NOW() OR p.expires_at IS NULL) AND p.is_private = false
      GROUP BY p.id, u.name, f.follower_id
      ORDER BY p.created_at DESC
    `, [userId, targetUserId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao carregar feed do usuário" });
  }
});

/* NOTIFICAÇÕES */
app.get("/notifications", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
    const userId = decoded.id;

    const result = await pool.query(`
      SELECT n.*, u.name as actor_name, u.username as actor_username 
      FROM notifications n
      JOIN users u ON n.actor_id = u.id
      WHERE n.user_id = $1
      ORDER BY n.created_at DESC
      LIMIT 50
    `, [userId]);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao carregar notificações" });
  }
});

app.post("/notifications/read-all", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Não autorizado" });
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }
    const userId = decoded.id;

    await pool.query("UPDATE notifications SET is_read = true WHERE user_id = $1", [userId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao atualizar notificações" });
  }
});

// ROTEAMENTO UNIVERSAL (Fallback para PWA/SPA) - Seguro para Express 5
app.use((req, res, next) => {
  // Se for uma requisição GET para uma rota não encontrada, serve o index.html
  if (req.method === 'GET' && !req.url.includes('.')) {
    const indexPath = path.join(webPath, "index.html");
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
  }
  // Se for qualquer outra coisa (API, Assets não encontrados), deixa o Express dar 404 padrão
  next();
});

app.listen(PORT, async () => {
  console.log(`[BOOT] Servidor rodando na porta ${PORT}`);
  console.log(`[BOOT] Modo: ${process.env.NODE_ENV || 'development'}`);
  
  // Inicialização do Banco de Dados pós-boot para evitar timeout no Render
  try {
    await initDB();
    console.log("[BOOT] Database inicializada com sucesso.");
  } catch (err) {
    console.error("[BOOT] Falha crítica na inicialização do DB:", err.message);
  }
});