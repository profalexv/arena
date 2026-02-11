/**
 * cronograma.js
 *
 * Módulo de backend para o projeto Cronograma.
 * Fornece rotas de API para autenticação e gerenciamento de dados.
 */
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const router = express.Router();

// --- Configuração do Banco de Dados (TiDB Cloud) ---
const dbConfig = {
    host: process.env.DATABASE_HOST,
    port: process.env.DATABASE_PORT,
    user: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    ssl: {
        // TiDB Cloud requer conexão SSL.
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true 
    }
};

// Cria um "pool" de conexões para reutilizar e melhorar a performance
const pool = mysql.createPool(dbConfig);


// Middleware para permitir que o Express parseie o corpo da requisição como JSON.
// É importante que este router tenha seu próprio middleware se necessário.
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
        const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);

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
            'INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)',
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