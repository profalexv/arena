/**
 * cronograma.js
 *
 * Módulo de backend para o projeto Cronograma.
 * Fornece rotas de API para autenticação e gerenciamento de dados.
 */
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();

const router = express.Router();

// Verifica se as variáveis de ambiente essenciais para o DB estão presentes
if (!process.env.TIDB_HOST) {
    console.error('[CRONOGRAMA] ERRO CRÍTICO: A variável de ambiente TIDB_HOST não está definida.');
    console.error('[CRONOGRAMA] Adicione as credenciais do banco de dados ao seu arquivo .env (localmente) ou às variáveis de ambiente do serviço (Render).');
}

// --- Configuração do Banco de Dados (TiDB Cloud) ---
// As credenciais são carregadas das variáveis de ambiente (.env localmente, ou nas configurações do serviço no Render)
const dbConfig = {
    host: process.env.TIDB_HOST,
    port: process.env.TIDB_PORT || 4000,
    user: process.env.TIDB_USERNAME,
    password: process.env.TIDB_PASSWORD,
    // Conecta-se ao banco de dados definido na variável de ambiente.
    // Para autenticação, usaremos o banco 'scholar'.
    database: process.env.TIDB_DATABASE,
    ssl: {
        // TiDB Cloud requer conexão SSL. `rejectUnauthorized: false` é usado para simplificar a conexão
        // em ambientes de desenvolvimento e produção sem a necessidade de gerenciar um arquivo de certificado CA.
        // Para segurança máxima, o ideal seria baixar o CA do TiDB Cloud e usar `rejectUnauthorized: true`.
        rejectUnauthorized: false
    }
};

// Cria um "pool" de conexões para reutilizar e melhorar a performance
const pool = mysql.createPool(dbConfig);

// --- Verificação da Conexão com o Banco de Dados ---
// Tenta obter uma conexão do pool para verificar se as credenciais estão corretas.
pool.getConnection()
    .then(connection => {
        console.log('[CRONOGRAMA] Conexão com o banco de dados TiDB estabelecida com sucesso.');
        connection.release(); // Libera a conexão de volta para o pool
    })
    .catch(err => {
        console.error('[CRONOGRAMA] ERRO FATAL: Não foi possível conectar ao banco de dados TiDB.');
        console.error('[CRONOGRAMA] Verifique as variáveis de ambiente no arquivo .env (TIDB_HOST, TIDB_USER, etc).');
        console.error(`[CRONOGRAMA] Detalhes do erro: ${err.message}`);
    });

// Opções de CORS mais explícitas para garantir compatibilidade com `file://`
const corsOptions = {
  origin: (origin, callback) => {
    // Permite requisições sem 'origin' (ex: de file://, mobile apps, Postman)
    // Em um ambiente de produção, isso seria mais restrito.
    callback(null, true);
  },
  optionsSuccessStatus: 204
};

// --- Middlewares ---
router.use(cors(corsOptions)); // Habilita o CORS com opções explícitas.
router.use(express.json());

/**
 * @route   POST /api/login
 * @desc    Autentica um superadmin para o projeto cronograma.
 * @access  Public
 */
router.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Usuário e senha são obrigatórios.' });
    }

    try {
        const [rows] = await pool.query('SELECT * FROM shared_users WHERE username = ?', [username]);

        if (rows.length === 0) {
            return res.status(401).json({ message: 'Credenciais inválidas.' });
        }

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ message: 'Credenciais inválidas.' });
        }

        // Em uma aplicação real, você geraria um token JWT aqui.
        res.json({
            success: true,
            message: 'Login bem-sucedido!',
            user: { username: user.username, name: user.name, role: user.role }
        });

    } catch (error) {
        console.error('[CRONOGRAMA] Login error:', error);
        res.status(500).json({ message: 'Erro interno no servidor.' });
    }
});

/**
 * @route   POST /api/register
 * @desc    Registra um novo usuário (superadmin, admin, etc.)
 * @access  Protected (idealmente)
 */
router.post('/api/register', async (req, res) => {
    const { username, password, name, role } = req.body;

    if (!username || !password || !name) {
        return res.status(400).json({ message: 'Usuário, senha e nome são obrigatórios.' });
    }

    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const [result] = await pool.query(
            'INSERT INTO shared_users (username, password, name, role) VALUES (?, ?, ?, ?)',
            [username, hashedPassword, name, role || 'admin']
        );

        res.status(201).json({ message: 'Usuário criado com sucesso!', userId: result.insertId });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Este nome de usuário já existe.' });
        }
        console.error('[CRONOGRAMA] Register error:', error);
        res.status(500).json({ message: 'Erro interno no servidor.' });
    }
});

module.exports = router;