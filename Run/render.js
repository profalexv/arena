const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middlewares Globais ---
// Habilita CORS para permitir que seus outros apps acessem esta API
app.use(cors());
// Habilita o parsing de JSON no corpo das requisições
app.use(express.json());

// --- Carregamento Dinâmico dos Projetos ---
const projects = {};
const conectPath = path.join(__dirname, '..', 'Conect');

console.log('--- Iniciando Gateway API ---');
try {
    console.log(`Lendo configurações da pasta: ${conectPath}`);
    // Lê todos os arquivos .js na pasta 'Conect'
    const projectFiles = fs.readdirSync(conectPath).filter(file => file.endsWith('.js'));

    for (const file of projectFiles) {
        const filePath = path.join(conectPath, file);
        try {
            const projectConfig = require(filePath);
            if (projectConfig && projectConfig.id && typeof projectConfig.handler === 'function') {
                projects[projectConfig.id] = projectConfig;
                console.log(`[OK] Projeto "${projectConfig.id}" carregado do arquivo: ${file}`);
            } else {
                console.warn(`[AVISO] Arquivo de configuração inválido ou incompleto: ${file}. 'id' e 'handler' são obrigatórios.`);
            }
        } catch (loadError) {
            console.error(`[ERRO] Falha ao carregar o arquivo de projeto ${file}:`, loadError);
        }
    }
} catch (error) {
    console.error(`[ERRO FATAL] Não foi possível ler a pasta 'Conect'. Verifique se ela existe.`, error);
}
console.log('--- Carregamento de projetos finalizado ---');


// --- Rota Principal do Gateway ---
// Esta rota captura qualquer método (GET, POST, etc.) para /api/{id_do_projeto}/*
app.all('/api/:projectId*', (req, res) => {
    const { projectId } = req.params;
    const project = projects[projectId];

    if (project) {
        // Log da requisição
        console.log(`> Roteando requisição para o projeto: ${projectId} | Método: ${req.method} | Caminho: ${req.originalUrl}`);
        
        // Remove o prefixo da URL para que o handler do projeto receba um caminho relativo
        // Ex: /api/meu-app/users -> /users
        req.url = req.originalUrl.replace(`/api/${projectId}`, '') || '/';
        
        // Chama a função handler do projeto correspondente
        return project.handler(req, res);
    } else {
        // Se o projeto não for encontrado, retorna um erro 404
        return res.status(404).json({
            error: 'Project Not Found',
            message: `Nenhum projeto com o ID '${projectId}' está configurado neste gateway.`
        });
    }
});

// --- Rota de Health Check ---
// Rota raiz para verificar se o serviço está online
app.get('/', (req, res) => {
    res.status(200).json({
        status: 'Gateway API está operacional',
        loadedProjects: Object.keys(projects),
        projectCount: Object.keys(projects).length
    });
});

// Inicia o servidor
app.listen(PORT, () => {
    console.log(`Servidor Gateway rodando na porta ${PORT}`);
});