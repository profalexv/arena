const express = require('express');
const router = express.Router();
require('dotenv').config();

const { registerQuestionHandlers } = require('./questions');

// ===== CONFIGURAÇÃO DE AMBIENTE =====
const NODE_ENV = process.env.NODE_ENV || 'local';
const LOG_LEVEL = process.env.LOG_LEVEL || 'INFO';
const ENABLE_PASSWORD_HASHING = process.env.ENABLE_PASSWORD_HASHING === 'true';
const ENABLE_RATE_LIMITING = process.env.ENABLE_RATE_LIMITING === 'true';
const SESSION_TIMEOUT = (process.env.SESSION_TIMEOUT || 1440) * 60 * 1000; // converter minutos para ms
const RATE_LIMIT_MAX_ATTEMPTS = parseInt(process.env.RATE_LIMIT_MAX_ATTEMPTS || '5');
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000');

// ===== DEPENDÊNCIAS =====
let bcrypt;
if (ENABLE_PASSWORD_HASHING) {
    try {
        bcrypt = require('bcryptjs');
    } catch (e) {
        console.warn('bcryptjs não instalado. Instale com: npm install bcryptjs');
        console.warn('Continuando sem hash de senhas...');
    }
}

// ===== LOGGER CUSTOMIZADO =====
const loggerLevels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const currentLogLevel = loggerLevels[LOG_LEVEL] || 1;

const logger = {
    levels: loggerLevels,
    level: currentLogLevel,
    
    debug: (msg) => logger.level <= 0 && console.log(`[EAMOS][DEBUG] ${new Date().toISOString()} - ${msg}`),
    info: (msg) => logger.level <= 1 && console.log(`[EAMOS][INFO] ${new Date().toISOString()} - ${msg}`),
    warn: (msg) => logger.level <= 2 && console.warn(`[EAMOS][WARN] ${new Date().toISOString()} - ${msg}`),
    error: (msg) => logger.level <= 3 && console.error(`[EAMOS][ERROR] ${new Date().toISOString()} - ${msg}`)
};

// ===== ARMAZENAMENTO DE SESSÕES (EM MEMÓRIA) =====
const sessions = {}; // { sessionCode: { ... } }

// ===== LÓGICA DE SOCKET.IO =====
function initializeSocket(io) {
    
    // ===== RATE LIMITING =====
    const loginAttempts = new Map(); // { ip: { count, resetTime } }

    function checkRateLimit(ip) {
        if (!ENABLE_RATE_LIMITING) return true;
        
        const now = Date.now();
        const attempts = loginAttempts.get(ip);
        
        if (!attempts || now > attempts.resetTime) {
            loginAttempts.set(ip, { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS });
            return true;
        }
        
        attempts.count++;
        if (attempts.count > RATE_LIMIT_MAX_ATTEMPTS) {
            return false;
        }
        return true;
    }

    function resetRateLimitAttempts(ip) {
        loginAttempts.delete(ip);
    }

    // ===== BCRYPT ALTERNATIVO (sem dependência externa) =====
    const simpleHash = {
        hash: async (password) => {
            if (bcrypt) {
                return await bcrypt.hash(password, 10);
            }
            return Buffer.from(password).toString('base64');
        },
        compare: async (password, hash) => {
            if (bcrypt) {
                return await bcrypt.compare(password, hash);
            }
            return Buffer.from(password).toString('base64') === hash;
        }
    };
    
    // ===== FUNÇÕES AUXILIARES =====
    function generateSessionCode() {
        let code;
        do {
            code = Math.random().toString(36).substring(2, 8).toUpperCase();
        } while (sessions[code]);
        return code;
    }

    function logAction(sessionCode, action, details = '') {
        logger.info(`[SESSION: ${sessionCode}] ${action} ${details}`);
    }

    // Limpeza automática de sessões expiradas
    setInterval(() => {
        const now = Date.now();
        const expiredSessions = [];
        
        for (const [code, session] of Object.entries(sessions)) {
            if (SESSION_TIMEOUT > 0 && now - session.createdAt > SESSION_TIMEOUT) {
                expiredSessions.push(code);
            }
        }
        
        expiredSessions.forEach(code => {
            logAction(code, 'EXPIRADA', '(limpeza automática)');
            delete sessions[code];
        });
        
        if (expiredSessions.length > 0) {
            logger.warn(`${expiredSessions.length} sessão(ões) expirada(s) removida(s)`);
        }
    }, parseInt(process.env.SESSION_CLEANUP_INTERVAL || '300000'));


    // ===== SOCKET.IO EVENTS =====
    io.on('connection', (socket) => {
        const clientIp = socket.handshake.address;
        logger.info(`Usuário conectado: ${socket.id}`);

        // Registra os handlers de eventos de perguntas
        registerQuestionHandlers(io, socket, sessions, logger);

        // 1. CRIAR UMA NOVA SESSÃO
        socket.on('createSession', async ({ controllerPassword, presenterPassword, deadline, theme, repeatControllerPass, noPresenterPass }, callback) => {
            try {
                // Rate limiting
                if (!checkRateLimit(clientIp)) {
                    logger.warn(`Rate limit atingido para IP: ${clientIp}`);
                    return callback({ success: false, message: 'Muitas tentativas. Aguarde um momento.' });
                }
        
                // Validação básica
                if (!controllerPassword) {
                    return callback({ success: false, message: 'A senha de Controller é obrigatória.' });
                }
        
                if (controllerPassword.length < 4) {
                    return callback({
                        success: false, 
                        message: 'A senha do Controller deve ter pelo menos 4 caracteres.' 
                    });
                }
                // Valida a senha do presenter apenas se for obrigatória
                if (!repeatControllerPass && !noPresenterPass) {
                    if (!presenterPassword) {
                        return callback({ success: false, message: 'A senha de Presenter é obrigatória.' });
                    }
                    if (presenterPassword.length < 4) {
                        return callback({
                            success: false, 
                            message: 'A senha do Presenter deve ter pelo menos 4 caracteres.' 
                        });
                    }
                }
        
                // Hash de senhas (se habilitado)
                let hashController = controllerPassword;
                let hashPresenter;

                let finalPresenterPassword = presenterPassword;
                if (repeatControllerPass) {
                    finalPresenterPassword = controllerPassword;
                } else if (noPresenterPass) {
                    finalPresenterPassword = null; // Sinaliza que não há senha
                }
                
                if (ENABLE_PASSWORD_HASHING && bcrypt) {
                    try {
                        hashController = await simpleHash.hash(controllerPassword);
                        hashPresenter = finalPresenterPassword ? await simpleHash.hash(finalPresenterPassword) : null;
                    } catch (e) {
                        logger.error(`Erro ao fazer hash das senhas: ${e.message}`);
                    }
                } else {
                    hashController = controllerPassword;
                    hashPresenter = finalPresenterPassword;
                }

                const sessionCode = generateSessionCode();
                sessions[sessionCode] = {
                    code: sessionCode,
                    controllerPassword: hashController,
                    presenterPassword: hashPresenter,
                    controllerSocketId: null,
                    presenterSocketIds: [], // Múltiplos presenters
                    deadline: deadline || null,
                    questions: [],
                    activeQuestion: null,
                    audienceCount: 0,
                    createdAt: Date.now(),
                    createdByIp: clientIp,
                    nextQuestionId: 0, // Contador para IDs de perguntas estáveis
                    isHashed: ENABLE_PASSWORD_HASHING && bcrypt ? true : false,
                    isAudienceUrlVisible: false, // URL da plateia oculta por padrão
                    theme: theme || 'light', // Adiciona o tema à sessão
                    presenterMode: { mode: 'ranking', chartType: 'bar', showRankPosition: false }, // Padrão alterado para 'ranking'
                    audienceView: ['individual'], // Padrão de visualização para participantes
                    users: {} // Objeto para armazenar usuários da plateia
                };

                resetRateLimitAttempts(clientIp);
                logAction(sessionCode, 'CRIADA');
                
                callback({ success: true, sessionCode });
            } catch (err) {
                logger.error(`Erro ao criar sessão: ${err.message}`);
                callback({ success: false, message: 'Erro ao criar sessão. Tente novamente.' });
            }
        });

        // 2. ENTRAR EM UMA SESSÃO (CONTROLLER / PRESENTER)
        socket.on('joinAdminSession', async ({ sessionCode, password, role }, callback) => {
            try {
                if (!sessions[sessionCode]) {
                    return callback({ success: false, message: 'Sessão não encontrada.' });
                }

                const session = sessions[sessionCode];
                const expectedPassword = role === 'controller' 
                    ? session.controllerPassword 
                    : session.presenterPassword;

                // Comparar senha (com ou sem hash)
                let passwordMatch = false;
                // Caso 1: Senha do apresentador não é necessária
                if (role === 'presenter' && expectedPassword === null) {
                    passwordMatch = true;
                }
                // Caso 2: Senha com hash
                else if (session.isHashed && bcrypt) {
                    try {
                        passwordMatch = await simpleHash.compare(password || '', expectedPassword);
                    } catch (e) {
                        passwordMatch = false;
                    }
                } else { // Caso 3: Senha sem hash
                    passwordMatch = password === expectedPassword;
                }

                if (!passwordMatch) {
                    logger.warn(`Senha incorreta para sessão ${sessionCode} (role: ${role})`);
                    return callback({ success: false, message: 'Senha incorreta.' });
                }

                // Verificar se já existe um controller
                if (role === 'controller' && session.controllerSocketId && session.controllerSocketId !== socket.id) {
                    logger.warn(`Múltiplos controllers tentando acessar ${sessionCode}`);
                    const oldSocket = io.sockets.sockets.get(session.controllerSocketId);
                    if (oldSocket) {
                        oldSocket.emit('controllerDisplaced', { message: 'Novo controller conectado à sessão' });
                        oldSocket.disconnect();
                    }
                }

                socket.join(sessionCode);
                logger.info(`Socket ${socket.id} (role: ${role}) JOINED room ${sessionCode}`);
                socket.sessionCode = sessionCode;
                socket.role = role;

                if (role === 'controller') {
                    session.controllerSocketId = socket.id;
                } else if (role === 'presenter') {
                    if (!session.presenterSocketIds.includes(socket.id)) {
                        session.presenterSocketIds.push(socket.id);
                    }
                }

                logAction(sessionCode, `${role.toUpperCase()} conectado`);
                
                callback({ success: true, deadline: session.deadline, theme: session.theme, 
                    users: session.users, 
                    totalQuestions: session.questions.length,
                    isAudienceUrlVisible: session.isAudienceUrlVisible,
                    presenterMode: session.presenterMode,
                    audienceView: session.audienceView
                });

                socket.emit('questionsUpdated', session.questions);
                if (session.activeQuestion !== null) {
                    socket.emit('newQuestion', session.questions.find(q => q.id === session.activeQuestion));
                }
            } catch (err) {
                logger.error(`Erro ao entrar em sessão: ${err.message}`);
                callback({ success: false, message: 'Erro ao conectar. Tente novamente.' });
            }
        });

        // MUDAR O MODO DE EXIBIÇÃO DO PARTICIPANTE (AUDIENCE)
        socket.on('changeAudienceView', ({ sessionCode, allowedViews }) => {
            const session = sessions[sessionCode];
            if (session && socket.role === 'controller') {
                session.audienceView = allowedViews;
                logAction(sessionCode, `Visibilidade de progresso da plateia alterada para: [${allowedViews.join(', ')}]`);
                io.to(sessionCode).emit('audienceViewChanged', { 
                    allowedViews: session.audienceView 
                });
            }
        });

        // MUDAR O MODO DE EXIBIÇÃO DO PRESENTER
        socket.on('changePresenterMode', ({ sessionCode, mode, chartType, showRankPosition }) => {
            const session = sessions[sessionCode];
            if (session && socket.role === 'controller') {
                session.presenterMode = { mode, chartType, showRankPosition };
                logAction(sessionCode, `Modo do Presenter alterado para: ${mode} (${chartType || 'N/A'})`);
                io.to(sessionCode).emit('presenterModeChanged', { 
                    presenterMode: session.presenterMode,
                    users: session.users,
                    totalQuestions: session.questions.length
                });
            }
        });

        // MUDAR O TEMA DA SESSÃO
        socket.on('changeTheme', ({ sessionCode, theme }) => {
            const session = sessions[sessionCode];
            if (session && socket.role === 'controller') {
                session.theme = theme;
                logAction(sessionCode, `TEMA alterado para '${theme}'`);
                io.to(sessionCode).emit('themeChanged', { theme });
            }
        });

        // MOSTRAR/OCULTAR URL DA PLATEIA
        socket.on('toggleAudienceUrl', ({ sessionCode, visible }) => {
            const session = sessions[sessionCode];
            if (session && socket.role === 'controller') {
                session.isAudienceUrlVisible = visible;
                logAction(sessionCode, `Visibilidade da URL da plateia alterada para: ${visible}`);
                io.to(sessionCode).emit('audienceUrlVisibilityChanged', { visible });
            }
        });

        // 3. ENTRAR EM UMA SESSÃO (PARTICIPANTE - EAMOS)
        socket.on('requestJoin', async ({ sessionCode, password, name }, callback) => {
            const session = sessions[sessionCode];
            if (!session) {
                return callback({ success: false, message: 'Sessão não encontrada.' });
            }
            if (!name || name.trim().length < 2) {
                return callback({ success: false, message: 'Por favor, insira um nome válido (mínimo 2 caracteres).' });
            }
            if (!password || password.length < 4) {
                return callback({ success: false, message: 'A senha deve ter pelo menos 4 caracteres.' });
            }

            const trimmedName = name.trim();
            const existingUserEntry = Object.entries(session.users).find(([id, user]) => user.name.toLowerCase() === trimmedName.toLowerCase());

            if (existingUserEntry) {
                const [oldSocketId, existingUser] = existingUserEntry;
                const passwordMatch = await simpleHash.compare(password, existingUser.password);

                if (!passwordMatch) {
                    return callback({ success: false, message: 'Um usuário com este nome já existe com uma senha diferente.' });
                }

                const newStatus = existingUser.status === 'disconnected' ? 'approved' : existingUser.status;
                const userData = { ...existingUser, socketId: socket.id, status: newStatus };
                delete session.users[oldSocketId];
                session.users[socket.id] = userData;
                
                socket.sessionCode = sessionCode;
                socket.role = 'audience';
                socket.join(sessionCode);

                logAction(sessionCode, `RECONEXÃO de '${trimmedName}'`);
                io.to(sessionCode).emit('userListUpdated', { users: session.users, totalQuestions: session.questions.length });

                if (userData.status === 'approved') {
                    const currentQuestion = session.questions[existingUser.progress] || null;
                    socket.emit('joinApproved', {
                        firstQuestion: currentQuestion,
                        totalQuestions: session.questions.length,
                        audienceView: session.audienceView
                    });
                    return callback({ success: true, message: 'Reconectado com sucesso! Carregando seu progresso...' });

                } else {
                    return callback({ success: true, message: 'Aguardando aprovação do controller...' });
                }
            }

            let hashedPassword = password;
            if (ENABLE_PASSWORD_HASHING && bcrypt) {
                hashedPassword = await simpleHash.hash(password);
            }

            session.users[socket.id] = {
                name: trimmedName,
                password: hashedPassword,
                status: 'pending',
                progress: 0,
                currentQuestionAttempts: 0,
                socketId: socket.id
            };
            
            socket.sessionCode = sessionCode;
            socket.role = 'audience';
            socket.join(sessionCode);

            logAction(sessionCode, `PEDIDO DE ENTRADA de '${trimmedName}'`);

            if (session.controllerSocketId) {
                io.to(session.controllerSocketId).emit('userListUpdated', { users: session.users, totalQuestions: session.questions.length });
            }

            callback({ success: true, message: 'Aguardando aprovação do controller...' });
        });

        // 4. APROVAR PARTICIPANTE (EAMOS)
        socket.on('approveUser', ({ sessionCode, userIdToApprove }) => {
            const session = sessions[sessionCode];
            if (session && socket.role === 'controller' && session.users[userIdToApprove]) {
                const user = session.users[userIdToApprove];
                user.status = 'approved';
                logAction(sessionCode, `Usuário '${user.name}' APROVADO`);
                io.to(sessionCode).emit('userListUpdated', { users: session.users, totalQuestions: session.questions.length });

                const userSocket = io.sockets.sockets.get(userIdToApprove);
                if (userSocket) {
                    userSocket.emit('joinApproved', {
                        firstQuestion: session.questions.length > 0 ? session.questions[0] : null,
                        totalQuestions: session.questions.length,
                        audienceView: session.audienceView
                    });
                }
            }
        });

        // 5. REJEITAR PARTICIPANTE (EAMOS)
        socket.on('rejectUser', ({ sessionCode, userIdToReject }) => {
            const session = sessions[sessionCode];
            if (session && socket.role === 'controller' && session.users[userIdToReject]) {
                const user = session.users[userIdToReject];
                if (user.status === 'pending') {
                    logAction(sessionCode, `Usuário '${user.name}' REJEITADO`);
                    const userSocket = io.sockets.sockets.get(userIdToReject);
                    if (userSocket) {
                        userSocket.emit('error', 'Seu pedido para entrar na sessão foi rejeitado.');
                        userSocket.disconnect(true);
                    }
                    delete session.users[userIdToReject];
                    io.to(sessionCode).emit('userListUpdated', { users: session.users, totalQuestions: session.questions.length });
                }
            }
        });

        // 6. REMOVER/KICKAR PARTICIPANTE (EAMOS)
        socket.on('removeUser', ({ sessionCode, userIdToRemove }) => {
            const session = sessions[sessionCode];
            if (session && socket.role === 'controller' && session.users[userIdToRemove]) {
                const user = session.users[userIdToRemove];
                logAction(sessionCode, `Usuário '${user.name}' REMOVIDO`);
                const userSocket = io.sockets.sockets.get(userIdToRemove);
                if (userSocket) {
                    userSocket.emit('sessionEnded', { message: 'Você foi removido da sessão pelo controller.' });
                    userSocket.disconnect(true);
                }
                delete session.users[userIdToRemove];
                io.to(sessionCode).emit('userListUpdated', { users: session.users, totalQuestions: session.questions.length });
            }
        });

        // 7. ZERAR PROGRESSO DE PARTICIPANTE (EAMOS)
        socket.on('resetUserProgress', ({ sessionCode, userIdToReset }) => {
            const session = sessions[sessionCode];
            if (session && socket.role === 'controller' && session.users[userIdToReset]) {
                const user = session.users[userIdToReset];
                user.progress = 0;
                user.currentQuestionAttempts = 0;
                logAction(sessionCode, `Progresso do usuário '${user.name}' ZERADO`);
                io.to(sessionCode).emit('userListUpdated', { users: session.users, totalQuestions: session.questions.length });

                const userSocket = io.sockets.sockets.get(userIdToReset);
                if (userSocket) {
                    userSocket.emit('joinApproved', {
                        firstQuestion: session.questions.length > 0 ? session.questions[0] : null,
                        totalQuestions: session.questions.length,
                        audienceView: session.audienceView
                    });
                }
            }
        });

        // 8. ZERAR PROGRESSO DE TODOS OS PARTICIPANTES
        socket.on('resetAllUsersProgress', ({ sessionCode }) => {
            const session = sessions[sessionCode];
            if (session && socket.role === 'controller') {
                logAction(sessionCode, `Progresso de TODOS os usuários ZERADO`);
                const firstQuestion = session.questions.length > 0 ? session.questions[0] : null;

                for (const userId in session.users) {
                    const user = session.users[userId];
                    user.progress = 0;
                    user.currentQuestionAttempts = 0;

                    const userSocket = io.sockets.sockets.get(userId);
                    if (userSocket) {
                        userSocket.emit('joinApproved', {
                            firstQuestion: firstQuestion,
                            totalQuestions: session.questions.length,
                            audienceView: session.audienceView
                        });
                    }
                }
                io.to(sessionCode).emit('userListUpdated', { users: session.users, totalQuestions: session.questions.length });
            }
        });

        // 10. RECEBER RESPOSTA DO PARTICIPANTE (EAMOS)
        socket.on('submitAnswer', ({ sessionCode, questionId, answer }) => {
            const session = sessions[sessionCode];
            const user = session?.users[socket.id];
            const expectedQuestion = session?.questions[user?.progress];
            if (!user || !expectedQuestion || expectedQuestion.id !== questionId) {
                return;
            }
            
            const question = expectedQuestion;
            let isCorrect = false;

            if (answer === '__SKIP__') {
                if (question.skippable) {
                    isCorrect = true;
                    logAction(sessionCode, `Usuário '${user.name}' pulou a pergunta #${questionId}`);
                } else {
                    return;
                }
            } else {
                if (question.correctAnswer && question.correctAnswer.length > 0) {
                    const correctAnswers = question.correctAnswer;
                    if (question.questionType === 'options') {
                        const submittedAnswers = Array.isArray(answer) ? answer : [answer];
                        const config = question.answerConfig || {};
                        if (config.acceptMultiple && config.requireAll) {
                            isCorrect = submittedAnswers.length === correctAnswers.length && submittedAnswers.every(id => correctAnswers.includes(id));
                        } else if (config.acceptMultiple && !config.requireAll) {
                            const hasCorrect = submittedAnswers.some(id => correctAnswers.includes(id));
                            const hasIncorrect = submittedAnswers.some(id => !correctAnswers.includes(id));
                            isCorrect = hasCorrect && !hasIncorrect;
                        } else {
                            isCorrect = correctAnswers.length === 1 && submittedAnswers.length === 1 && correctAnswers[0] === submittedAnswers[0];
                        }
                    } else if (['short_text', 'long_text', 'number'].includes(question.questionType)) {
                        isCorrect = correctAnswers.some(correct => correct.toLowerCase() === String(answer).toLowerCase());
                    } else {
                        isCorrect = correctAnswers.includes(answer);
                    }
                } else {
                    isCorrect = true;
                }
            }

            if (!isCorrect) {
                user.currentQuestionAttempts = (user.currentQuestionAttempts || 0) + 1;
                const skipConfig = question.skipConfig || {};
                if (skipConfig.autoSkipOnWrong && question.questionType === 'yes_no') {
                    isCorrect = true;
                    logAction(sessionCode, `Usuário '${user.name}' pulou automaticamente (erro em Sim/Não)`);
                } else if (skipConfig.autoSkipAfter && user.currentQuestionAttempts >= skipConfig.autoSkipAfter) {
                    isCorrect = true;
                    logAction(sessionCode, `Usuário '${user.name}' pulou automaticamente após ${user.currentQuestionAttempts} tentativas`);
                }
            }

            if (isCorrect) {
                user.progress++;
                user.currentQuestionAttempts = 0;
                const nextQuestion = user.progress < session.questions.length ? session.questions[user.progress] : null;
                socket.emit('answerResult', { correct: true, nextQuestion });
                io.to(sessionCode).emit('userListUpdated', { users: session.users, totalQuestions: session.questions.length });
                logAction(sessionCode, `Progresso de '${user.name}' atualizado para ${user.progress}`);
            } else {
                socket.emit('answerResult', { correct: false });
            }
        });

        // 11. ENCERRAR SESSÃO
        socket.on('endSession', ({ sessionCode }) => {
            if (sessions[sessionCode]) {
                logAction(sessionCode, 'ENCERRADA pelo controller');
                io.to(sessionCode).emit('sessionEnded', { message: 'Sessão encerrada pelo controller' });
                delete sessions[sessionCode];
            }
        });

        // Disconnect automático
        socket.on('disconnect', () => {
            const sessionCode = socket.sessionCode;
            if (sessionCode && sessions[sessionCode]) {
                const session = sessions[sessionCode];
                if (socket.role === 'controller' && session.controllerSocketId === socket.id) {
                    session.controllerSocketId = null;
                } else if (socket.role === 'presenter') {
                    session.presenterSocketIds = session.presenterSocketIds.filter(id => id !== socket.id);
                } else if (socket.role === 'audience') {
                    const userEntry = Object.entries(session.users).find(([id, user]) => id === socket.id);
                    if (userEntry) {
                        const user = userEntry[1];
                        logAction(sessionCode, `Participante '${user.name}' desconectado (socket: ${socket.id})`);
                        user.status = 'disconnected';
                        io.to(sessionCode).emit('userListUpdated', { users: session.users, totalQuestions: session.questions.length });
                    }
                }
            }
            logger.info(`Usuário desconectado: ${socket.id}`);
        });

    });

    logger.info("EAMOS Socket.IO Handlers Initialized");
}

// ===== ROTAS EXPRESS =====
router.get('/health', (req, res) => {
    res.json({
        status: 'ok', 
        environment: NODE_ENV,
        timestamp: new Date().toISOString(),
        activeSessions: Object.keys(sessions).length
    });
});

router.get('/api/export/:sessionCode/:format', (req, res) => {
    const { sessionCode, format } = req.params;
    const session = sessions[sessionCode];
    
    if (!session) {
        return res.status(404).json({ error: 'Sessão não encontrada' });
    }
    
    let content, filename, contentType;
    
    if (format === 'json') {
        content = JSON.stringify(session, null, 2);
        filename = `sessao-${sessionCode}.json`;
        contentType = 'application/json';
    } else if (format === 'csv') {
        let csv = 'ID,Pergunta,Tipo,Total Respostas,Resultados\n';
        session.questions.forEach((q, idx) => {
            const results = JSON.stringify(q.results).replace(/\n/g, '').replace(/\"/g, '""');
            csv += `${idx},${q.text.replace(/\"/g, '""')},${q.questionType},${Object.values(q.results).reduce((a, b) => a + b, 0)},${results}\n`;
        });
        content = csv;
        filename = `sessao-${sessionCode}.csv`;
        contentType = 'text/csv';
    } else {
        return res.status(400).json({ error: 'Formato inválido (use json ou csv)' });
    }
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
});


module.exports = { router, initializeSocket };
