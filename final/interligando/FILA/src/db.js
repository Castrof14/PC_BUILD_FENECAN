// Configuração da conexão com o MySQL
// Use variáveis de ambiente para não deixar credenciais no código.

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Dev_2026!seguro',
  database: process.env.DB_NAME || 'montagens_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = pool;