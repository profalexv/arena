require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");

const sessionStats = require('./shared/sessionStats');
const ioRef        = require('./shared/ioRef');

const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);
if (isProduction && !(process.env.MOTOR_URL || '').trim()) {
    console.error('FATAL: MOTOR_URL must be set in production (quiz auth verification).');
    process.exit(1);
}

const app = express();
const port = process.env.PORT || 3000;
const server = http.createServer(app);

// Origens públicas (fluxo de trabalho: deploy e teste em produção, sem hub local)
const SOCKET_CORS_ORIGINS = new Set([
    'https://rush.axom.app',
    'http://rush.axom.app',
    'https://mind.axom.app',
    'http://mind.axom.app',
    'https://quest.axom.app',
    'http://quest.axom.app',
    'https://arena.axom.app',
    'http://arena.axom.app',
    'https://cronos.axom.app',
    'http://cronos.axom.app',
    'https://panel.zukon.tech',
    'https://profalexv-alexluza.onrender.com',
]);

function socketCorsOriginMatcher(origin, callback) {
    if (!origin) return callback(null, true);
    if (SOCKET_CORS_ORIGINS.has(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
}

const io = new Server(server, { // eslint-disable-line
    cors: {
        origin: socketCorsOriginMatcher,
        methods: ["GET", "POST"],
        credentials: true
    },
    allowEIO3: true
});

ioRef.set(io);

// Scripts partilhados (quiz-cloud) — antes do roteamento por hostname
app.use('/shared', express.static(path.join(__dirname, 'shared')));

// ── Frontends estáticos — roteamento por hostname ─────────────
// rush.axom.app   → serve arena/rush/
// mind.axom.app   → serve arena/mind/
// quest.axom.app  → serve arena/quest/
// qualquer outro  → landing page pública em arena/public/

const APP_HOSTS = {
    'rush.axom.app':    'rush',
    'mind.axom.app':    'mind',
    'quest.axom.app':   'quest',
    'panel.zukon.tech': 'panel',
};

// Middleware de roteamento por hostname (deve vir ANTES das rotas de API)
app.use((req, res, next) => {
    const host = req.hostname;
    const appName = APP_HOSTS[host];
    if (!appName) return next();

    const frontendPath = path.join(__dirname, appName);
    const filePath = path.join(frontendPath, req.path);

    // Se o arquivo existir, serve diretamente
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return res.sendFile(filePath);
    }
    // Fallback: index.html do app (SPA)
    return res.sendFile(path.join(frontendPath, 'index.html'));
});

// Raiz → landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Servir landing page pública
app.use('/public', express.static(path.join(__dirname, 'public')));

// Middleware de parsing para rotas HTTP (REST)
app.use(express.json({ limit: '512kb' }));

// ── Rotas HTTP — Quiz Premium ──────────────────────────────────
// CRUD de questionários salvos na nuvem (requer auth premium via motor)
const createQuestionnairesRouter = require('./shared/questionnairesRouter');
app.use('/rush/questionnaires',  createQuestionnairesRouter('rush'));
app.use('/mind/questionnaires',  createQuestionnairesRouter('mind'));
app.use('/quest/questionnaires', createQuestionnairesRouter('quest'));

// Dynamically load routes and socket handlers from project folders
const projectsDir = __dirname;
fs.readdirSync(projectsDir).forEach(project => {
  const projectPath = path.join(projectsDir, project);
  if (fs.statSync(projectPath).isDirectory()) {
    const projectModulePath = path.join(projectPath, `${project}.js`);
    if (fs.existsSync(projectModulePath)) {
      const projectModule = require(projectModulePath);

      // If module exports a router, use it
      if (projectModule.router) {
          app.use(`/${project}`, projectModule.router);
          console.log(`Loaded Express routes for ${project}`);
      } else if (typeof projectModule === 'function' && projectModule.length === 2) {
          // Fallback for simple express routers
          app.use(`/${project}`, projectModule);
          console.log(`Loaded Express routes for ${project}`);
      }

      // If module exports a socket initializer, use it
      if (projectModule.initializeSocket) {
        // Create a dedicated namespace for the project
        const nsp = io.of(`/${project}`);
        projectModule.initializeSocket(nsp);
        sessionStats.hookNamespace(nsp, project);
        console.log(`Initialized Socket.IO namespace for /${project}`);
      }
    }
  }
});

server.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
