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
const { getDbPool } = require('../shared/db'); // Importa o módulo de conexão compartilhado

const router = express.Router();

// --- Configuração do Banco de Dados (TiDB Cloud) ---
// Obtém pools de conexão para os bancos de dados necessários.
// 'scholar' é usado para autenticação compartilhada (tabela shared_users).
// 'cronograma' é usado para os dados específicos deste projeto.
const scholarPool = getDbPool('scholar');
const cronogramaPool = getDbPool('cronograma');

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
        const [rows] = await scholarPool.query('SELECT * FROM shared_users WHERE username = ?', [username]);

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

        const [result] = await scholarPool.query(
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

/**
 * @route   GET /api/cronograma/data
 * @desc    Exemplo de rota que busca dados do banco de dados 'cronograma'.
 * @access  Protected (idealmente)
 */
router.get('/api/cronograma/data', async (req, res) => {
    try {
        // Esta é uma query de exemplo. Adapte conforme a estrutura da sua tabela.
        const [data] = await cronogramaPool.query('SELECT * FROM alguma_tabela_de_cronograma LIMIT 10;');
        res.json({ success: true, data });
    } catch (error) {
        console.error('[CRONOGRAMA] Erro ao buscar dados:', error);
        res.status(500).json({ message: 'Erro interno no servidor ao buscar dados do cronograma.' });
    }
});


module.exports = router;