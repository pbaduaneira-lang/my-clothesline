const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, 'server.js');
let data = fs.readFileSync(serverFile, 'utf8');

const regex = /const decoded = jwt\.verify\(token, JWT_SECRET\);/g;
const replacement = `let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: "A sessão expirou. Faça login novamente." });
      }
      return res.status(403).json({ error: "Token inválido" });
    }`;

const count = (data.match(regex) || []).length;
console.log(`Found ${count} occurrences.`);

const updatedData = data.replace(regex, replacement);

fs.writeFileSync(serverFile, updatedData, 'utf8');
console.log('Replaced all occurrences successfully.');
