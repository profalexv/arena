// Template para um novo projeto no Gateway.
// Copie este arquivo para a pasta /Conect e renomeie-o.

// 1. Defina um ID único para o seu projeto.
// Este ID será usado na URL: /api/{projectId}
const projectId = 'painel';

/**
 * Handler principal para este projeto. Toda a lógica de backend vai aqui.
 * O Express Router já está implícito. Você pode tratar as rotas com if/else ou switch.
 * @param {import('express').Request} req - Objeto da requisição do Express.
 * @param {import('express').Response} res - Objeto da resposta do Express.
 */
const handler = (req, res) => {
    const { method, path, body, query } = req;

    console.log(`[${projectId}] Recebida requisição: ${method} ${path}`);

    // --- Exemplo de Roteamento ---

    // Rota: GET /api/{projectId}/user/123
    if (path.startsWith('/user/') && method === 'GET') {
        const userId = path.split('/')[2];
        return res.status(200).json({ id: userId, name: `Usuário ${userId}`, project: projectId });
    }

    // Rota: POST /api/{projectId}/data
    if (path === '/data' && method === 'POST') {
        if (!body || Object.keys(body).length === 0) {
            return res.status(400).json({ error: 'Corpo da requisição está vazio.' });
        }
        console.log(`[${projectId}] Dados recebidos:`, body);
        return res.status(201).json({ message: 'Dados recebidos com sucesso!', receivedData: body });
    }

    // Rota padrão para este projeto
    // GET /api/{projectId}/
    if (path === '/' && method === 'GET') {
        return res.status(200).json({
            message: `Bem-vindo ao backend do projeto '${projectId}'!`,
            availableRoutes: ['GET /user/:id', 'POST /data']
        });
    }

    // Se nenhuma rota corresponder, retorne 404
    return res.status(404).json({ error: 'Rota não encontrada neste projeto.' });
};

// Exporta a configuração para o gateway principal
module.exports = {
    id: projectId,
    handler: handler
};