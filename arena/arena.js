const { registerQuestionHandlers } = require('./questions');

// This is a simplified version based on mindpool.js
// You should adapt it with the full logic for Arena sessions.

const logger = {
    info: (msg) => console.log(`[Arena][INFO] ${new Date().toISOString()} - ${msg}`),
    warn: (msg) => console.warn(`[Arena][WARN] ${new Date().toISOString()} - ${msg}`),
    error: (msg) => console.error(`[Arena][ERROR] ${new Date().toISOString()} - ${msg}`)
};

const sessions = {}; // In-memory session storage for Arena

function initializeSocket(nsp) {

    const logAction = (sessionCode, action, details = '') => {
        logger.info(`[SESSION: ${sessionCode}] ${action} ${details}`);
    };

    nsp.on('connection', (socket) => {
        logger.info(`User connected to Arena namespace: ${socket.id}`);

        // Register question-related event handlers
        registerQuestionHandlers(nsp, socket, sessions, logger);

        // --- SESSION MANAGEMENT ---
        socket.on('createSession', ({ controllerPassword, presenterPassword, deadline, theme, repeatControllerPass, noPresenterPass, questions: importedQuestions }, callback) => {
            if (!controllerPassword) {
                return callback({ success: false, message: 'Senha do controller é obrigatória.' });
            }

            let finalPresenterPassword = '';
            if (repeatControllerPass) {
                finalPresenterPassword = controllerPassword;
            } else if (!noPresenterPass) {
                if (!presenterPassword) {
                    return callback({ success: false, message: 'Senha do presenter é obrigatória ou marque uma opção.' });
                }
                finalPresenterPassword = presenterPassword;
            }

            const sessionCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            sessions[sessionCode] = {
                code: sessionCode,
                controllerPassword,
                presenterPassword: finalPresenterPassword,
                controllerSocketId: null,
                presenterSocketIds: [],
                deadline: deadline || null,
                theme: theme || 'light',
                questions: [],
                users: {}, // { socketId: { name, status, progress } }
                isAudienceUrlVisible: false,
                presenterMode: { mode: 'ranking', chartType: 'bar', showRankPosition: false },
                audienceView: ['individual', 'overall', 'ranking', 'position'],
                createdAt: Date.now()
            };

            // Adiciona perguntas importadas, se houver
            if (importedQuestions && Array.isArray(importedQuestions)) {
                let nextId = 0;
                importedQuestions.forEach(q => {
                    const newQuestion = {
                        ...q, // Assume que o formato da pergunta do arquivo é compatível
                        id: nextId++,
                        createdAt: Date.now()
                    };
                    sessions[sessionCode].questions.push(newQuestion);
                });
                sessions[sessionCode].nextQuestionId = nextId;
            }

            logAction(sessionCode, 'CRIADA');
            callback({ success: true, sessionCode });
        });

        socket.on('joinAdminSession', ({ sessionCode, password, role }, callback) => {
            const session = sessions[sessionCode];
            if (!session) {
                return callback({ success: false, message: 'Sessão não encontrada.' });
            }

            const expectedPassword = role === 'controller' ? session.controllerPassword : session.presenterPassword;

            // For presenters, an empty password might be valid
            if (role === 'presenter' && expectedPassword === '' && password === '') {
                // Allow connection
            } else if (password !== expectedPassword) {
                return callback({ success: false, message: 'Senha incorreta.' });
            }

            if (role === 'controller' && session.controllerSocketId && session.controllerSocketId !== socket.id) {
                const oldSocket = nsp.sockets.get(session.controllerSocketId);
                if (oldSocket) {
                    oldSocket.emit('controllerDisplaced');
                    oldSocket.disconnect();
                }
            }

            socket.join(sessionCode);
            socket.sessionCode = sessionCode;
            socket.role = role;

            if (role === 'controller') {
                session.controllerSocketId = socket.id;
            } else {
                session.presenterSocketIds.push(socket.id);
            }

            logAction(sessionCode, `${role.toUpperCase()} conectado`);
            callback({
                success: true,
                theme: session.theme,
                users: session.users,
                totalQuestions: session.questions.length,
                isAudienceUrlVisible: session.isAudienceUrlVisible,
                presenterMode: session.presenterMode,
                audienceView: session.audienceView
            });

            nsp.to(sessionCode).emit('questionsUpdated', session.questions);
        });

        // --- USER (AUDIENCE) MANAGEMENT ---
        socket.on('requestJoin', ({ sessionCode, name, password }, callback) => {
            const session = sessions[sessionCode];
            if (!session) return callback({ success: false, message: 'Sessão não encontrada.' });

            // In Arena, audience might need a password. Let's assume it's the presenter's password for now.
            // This logic might need refinement based on your exact requirements.
            if (session.presenterPassword && session.presenterPassword !== password) {
                return callback({ success: false, message: 'Senha da sessão incorreta.' });
            }

            const user = {
                socketId: socket.id,
                name,
                status: 'pending', // 'pending', 'approved', 'disconnected'
                progress: 0,
                answers: {}
            };
            session.users[socket.id] = user;
            socket.sessionCode = sessionCode;
            socket.role = 'audience';
            socket.join(sessionCode);

            logAction(sessionCode, `Pedido de entrada de "${name}"`);
            nsp.to(session.controllerSocketId).emit('userListUpdated', { users: session.users, totalQuestions: session.questions.length });
            callback({ success: true, message: 'Aguardando aprovação do instrutor.' });
        });

        socket.on('approveUser', ({ sessionCode, userIdToApprove }) => {
            const session = sessions[sessionCode];
            const user = session?.users[userIdToApprove];
            const userSocket = nsp.sockets.get(userIdToApprove);

            if (session && user && userSocket && socket.id === session.controllerSocketId) {
                user.status = 'approved';
                logAction(sessionCode, `Usuário "${user.name}" aprovado.`);
                
                userSocket.emit('joinApproved', {
                    firstQuestion: session.questions[0] || null,
                    totalQuestions: session.questions.length,
                    audienceView: session.audienceView
                });
                
                nsp.to(sessionCode).emit('userListUpdated', { users: session.users, totalQuestions: session.questions.length });
            }
        });

        // Add other handlers like 'rejectUser', 'removeUser', 'submitAnswer', 'disconnect', etc.
        // ...

        socket.on('disconnect', () => {
            const sessionCode = socket.sessionCode;
            const session = sessions[sessionCode];
            if (!session) return;

            if (socket.role === 'audience') {
                const user = session.users[socket.id];
                if (user) {
                    user.status = 'disconnected';
                    logAction(sessionCode, `Participante "${user.name}" desconectado.`);
                    nsp.to(session.controllerSocketId).emit('userListUpdated', { users: session.users, totalQuestions: session.questions.length });
                }
            } else if (socket.role === 'controller' && session.controllerSocketId === socket.id) {
                session.controllerSocketId = null;
                logAction(sessionCode, 'Controller desconectado.');
            } else if (socket.role === 'presenter') {
                session.presenterSocketIds = session.presenterSocketIds.filter(id => id !== socket.id);
                logAction(sessionCode, 'Presenter desconectado.');
            }

            logger.info(`User disconnected from Arena: ${socket.id}`);
        });

    });

    logger.info("Arena Socket.IO Namespace Initialized");
}

module.exports = { initializeSocket };