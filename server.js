const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");

const sessionStats = require('./shared/sessionStats');
const ioRef        = require('./shared/ioRef');

const app = express();
const port = process.env.PORT || 3000;
const server = http.createServer(app);

// Configuração de CORS dinâmica para Socket.IO
const getOrigins = () => {
    const origins = [
        "https://mindpool.axom.app",
        "http://mindpool.axom.app",
        "https://arena.axom.app",
        "http://arena.axom.app",
        "https://proof.axom.app",
        "http://proof.axom.app",
        "https://cronos.axom.app",
        "http://cronos.axom.app",
        "http://localhost:3000",
        "http://localhost:*"
    ];
    return origins;
};

const io = new Server(server, { // eslint-disable-line
    cors: {
        origin: getOrigins(),
        methods: ["GET", "POST"],
        credentials: true
    },
    allowEIO3: true
});

ioRef.set(io);

app.get('/', (req, res) => {
  res.send('Backend hub is running!');
});

// Middleware de parsing para rotas HTTP (REST)
app.use(express.json({ limit: '512kb' }));

// ── Rotas HTTP — Quiz Premium ──────────────────────────────────
// CRUD de questionários salvos na nuvem (requer auth premium via motor)
const createQuestionnairesRouter = require('./shared/questionnairesRouter');
app.use('/arena/questionnaires',    createQuestionnairesRouter('arena'));
app.use('/mindpool/questionnaires', createQuestionnairesRouter('mindpool'));
app.use('/proof/questionnaires',    createQuestionnairesRouter('proof'));

// Servir arquivos estáticos da pasta 'shared'
app.use('/shared', express.static(path.join(__dirname, 'shared')));

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
