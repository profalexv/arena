/**
 * setup-shared-db.js
 *
 * Este script conecta-se ao banco de dados compartilhado (ex: 'scholar') e garante
 * que as tabelas de uso geral, como 'shared_users', existam.
 *
 * Como usar:
 * 1. Certifique-se de que seu arquivo .env na raiz do projeto 'render' está configurado
 *    com as credenciais e com `TIDB_DATABASE="scholar"`.
 * 2. Execute o script a partir da pasta 'render': node tools/setup-shared-db.js
 */

const mysql = require('mysql2/promise');
require('dotenv').config({ path: '../.env' }); // Carrega o .env da pasta raiz 'render'

const dbConfig = {
    host: process.env.TIDB_HOST,
    port: process.env.TIDB_PORT || 4000,
    user: process.env.TIDB_USERNAME,
    password: process.env.TIDB_PASSWORD,
    database: 'scholar', // Conecta-se diretamente ao banco 'scholar'
    ssl: {
        rejectUnauthorized: false
    }
};

const createUserTableQuery = `
CREATE TABLE IF NOT EXISTS shared_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`;

async function setupDatabase() {
    let connection;
    try {
        console.log(`🔄 Conectando ao banco de dados compartilhado '${dbConfig.database}'...`);
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Conexão bem-sucedida.');

        console.log("🔄 Verificando/Criando a tabela 'shared_users'...");
        await connection.query(createUserTableQuery);
        console.log("✅ Tabela 'shared_users' pronta para uso.");

    } catch (error) {
        console.error('❌ Erro durante o setup do banco de dados:', error.message);
    } finally {
        if (connection) await connection.end();
        console.log('🔌 Conexão com o banco de dados fechada.');
    }
}

setupDatabase();