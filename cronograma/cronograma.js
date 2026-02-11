/**
 * cronograma.js
 *
 * Módulo de backend para o projeto Cronograma.
 * Fornece rotas de API para autenticação e gerenciamento de dados.
 */
const express = require('express');
const router = express.Router();

// Simulação de um banco de dados de usuários para o cronograma
const users = {
    'admin': { password: 'password123', name: 'Admin User' }
};

// Middleware para permitir que o Express parseie o corpo da requisição como JSON.
// É importante que este router tenha seu próprio middleware se necessário.
router.use(express.json());

/**
 * @route   POST /api/login
 * @desc    Autentica um superadmin para o projeto cronograma.
 * @access  Public
 */
router.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Usuário e senha são obrigatórios.' });
    }

    const user = users[username];
    if (!user || user.password !== password) {
        return res.status(401).json({ message: 'Credenciais inválidas.' });
    }

    // Em uma aplicação real, você geraria um token (JWT).
    // Por simplicidade, retornamos uma confirmação e dados do usuário.
    res.json({
        success: true,
        message: 'Login bem-sucedido!',
        user: { username: username, name: user.name }
    });
});

module.exports = router;