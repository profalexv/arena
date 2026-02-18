/**
 * aula.js
 *
 * Módulo de backend para o projeto Aula.
 * Segue o padrão de usar o módulo de DB compartilhado para acessar
 * o banco de dados 'scholar' para autenticação e o 'aula' para dados específicos.
 */
const express = require('express');
const cors = require('cors');
const { getDbPool } = require('../shared/db'); // Importa o módulo de conexão

const router = express.Router();

// --- Configuração do Banco de Dados ---
// Obtém pools de conexão para os bancos de dados 'scholar' (autenticação) e 'aula' (dados do projeto).
const scholarPool = getDbPool('scholar');
const aulaPool = getDbPool('aula');

// --- Middlewares ---
router.use(cors()); // Simplificado para o exemplo, use opções mais restritivas em produção se necessário
router.use(express.json());

// --- Rotas de Exemplo ---

/**
 * @route   GET /api/aula/data
 * @desc    Exemplo de rota que busca dados do banco de dados 'aula'.
 * @access  Protected (idealmente)
 */
router.get('/api/aula/data', async (req, res) => {
    try {
        // Exemplo: buscar todas as aulas da tabela 'aulas'
        const [aulas] = await aulaPool.query('SELECT * FROM aulas;');
        res.json({ success: true, data: aulas });
    } catch (error) {
        console.error('[AULA] Erro ao buscar dados:', error);
        res.status(500).json({ message: 'Erro interno no servidor ao buscar dados de aulas.' });
    }
});

/**
 * @route   POST /api/aula/login
 * @desc    Exemplo de rota de login que usa o banco 'scholar'.
 *          (Esta lógica seria similar à do projeto 'cronograma')
 * @access  Public
 */
router.post('/api/aula/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Usuário e senha são obrigatórios.' });
    }

    try {
        // A autenticação é feita contra a tabela 'shared_users' no banco 'scholar'
        const [rows] = await scholarPool.query('SELECT * FROM shared_users WHERE username = ?', [username]);

        if (rows.length === 0) {
            return res.status(401).json({ message: 'Credenciais inválidas.' });
        }

        const user = rows[0];
        // A comparação de senha (com bcrypt) foi omitida para simplificar o exemplo.
        // Em um caso real, você deve comparar as senhas com hash.
        console.log(`[AULA] Tentativa de login para o usuário: ${user.username}`);

        res.json({
            success: true,
            message: 'Login bem-sucedido (exemplo)!',
            user: { username: user.username, name: user.name, role: user.role }
        });

    } catch (error) {
        console.error('[AULA] Login error:', error);
        res.status(500).json({ message: 'Erro interno no servidor.' });
    }
});

module.exports = router;