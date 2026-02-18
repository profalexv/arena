/**
 * shared/db.js
 *
 * Módulo centralizado para gerenciar conexões com o banco de dados TiDB.
 * Ele cria e armazena em cache "pools" de conexão para diferentes bancos de dados
 * (ex: 'scholar', 'cronograma', 'aula') para serem reutilizados pela aplicação.
 */
const mysql = require('mysql2/promise');
// Garante que o .env na raiz do projeto 'render' seja carregado.
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

// Verifica se as variáveis de ambiente essenciais para o DB estão presentes
if (!process.env.TIDB_HOST || !process.env.TIDB_USERNAME || !process.env.TIDB_PASSWORD) {
    console.error('[DB_MODULE] ERRO CRÍTICO: As variáveis de ambiente do TiDB (TIDB_HOST, TIDB_USERNAME, TIDB_PASSWORD) não estão definidas no arquivo .env.');
    // Em um ambiente de produção, a aplicação não deve iniciar sem as credenciais.
    if (process.env.NODE_ENV === 'production') {
        process.exit(1);
    }
}

// Configuração base do banco de dados, sem o nome do database
const baseDbConfig = {
    host: process.env.TIDB_HOST,
    port: process.env.TIDB_PORT || 4000,
    user: process.env.TIDB_USERNAME,
    password: process.env.TIDB_PASSWORD,
    ssl: {
        rejectUnauthorized: false
    },
    connectionLimit: 10, // Limite de conexões por pool
    waitForConnections: true,
    queueLimit: 0
};

// Cache para armazenar os pools de conexão já criados (Map)
const pools = new Map();

/**
 * Obtém um pool de conexões para um banco de dados específico.
 * Reutiliza pools existentes para evitar a criação de múltiplas conexões desnecessárias.
 * @param {string} databaseName - O nome do banco de dados (ex: 'scholar', 'cronograma').
 * @returns {import('mysql2/promise').Pool} O pool de conexões para o banco de dados solicitado.
 */
function getDbPool(databaseName) {
    if (!databaseName) {
        throw new Error('O nome do banco de dados é obrigatório para obter um pool de conexão.');
    }

    // Se o pool já existe no cache, retorna-o imediatamente.
    if (pools.has(databaseName)) {
        return pools.get(databaseName);
    }

    // Cria a configuração específica para este banco de dados
    const dbConfig = { ...baseDbConfig, database: databaseName };

    // Cria um novo pool e o armazena no cache
    console.log(`[DB_MODULE] Criando novo pool de conexão para o banco de dados: '${databaseName}'`);
    const pool = mysql.createPool(dbConfig);

    // Adiciona um listener para logar erros de conexão no pool
    pool.on('error', (err) => {
        console.error(`[DB_MODULE] Erro no pool do banco '${databaseName}':`, err);
    });

    pools.set(databaseName, pool);

    return pool;
}

module.exports = { getDbPool };