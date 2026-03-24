'use strict';
/**
 * render/quest/quest.js
 *
 * Socket.IO namespace handler para o Quest — avaliação com notas individuais.
 *
 * Diferenças em relação ao Arena/EAMOS:
 *  - Sessão armazena `maxGrade` (default 10) e `passingGrade` (default 5)
 *  - Cada usuário rastreia `correctAnswers` além do `progress`
 *  - Ao completar todas as perguntas, a nota final é calculada e enviada
 *  - Nenhum ranking / barra de competição — foco em avaliação individual
 *  - Evento `exportGrades` permite exportar CSV ou integrar ao Scholar
 */

const { registerQuestionHandlers } = require('./questions');

const logger = {
    info:  (msg) => console.log(`[QUEST][INFO]  ${new Date().toISOString()} - ${msg}`),
    warn:  (msg) => console.warn(`[QUEST][WARN]  ${new Date().toISOString()} - ${msg}`),
    error: (msg) => console.error(`[QUEST][ERROR] ${new Date().toISOString()} - ${msg}`)
};

const sessions = {};

// ─────────────────────── avaliação de resposta ────────────────────────────
function evaluateAnswer(question, answer) {
    const correct = question.correctAnswer;

    if (!correct || correct.length === 0) return true; // sem gabarito = sempre certo

    switch (question.questionType) {
        case 'yes_no':
        case 'number':
        case 'integer':
            return String(correct[0]).trim().toLowerCase() === String(answer).trim().toLowerCase();
        case 'options': {
            if (!Array.isArray(answer)) answer = [answer];
            if (question.answerConfig?.requireAll) {
                return correct.length === answer.length &&
                    correct.every(c => answer.includes(c)) &&
                    answer.every(a => correct.includes(a));
            }
            return answer.every(a => correct.includes(a));
        }
        case 'short_text':
        case 'long_text':
        default:
            return correct.some(c =>
                c.trim().toLowerCase() === String(answer).trim().toLowerCase()
            );
    }
}

function calcGrade(correctAnswers, totalQuestions, maxGrade) {
    if (totalQuestions === 0) return maxGrade;
    return parseFloat(((correctAnswers / totalQuestions) * maxGrade).toFixed(1));
}

// ──────────────────────── inicialização ────────────────────────────────────
function initializeSocket(nsp) {

    const logAction = (sessionCode, action, details = '') =>
        logger.info(`[SESSION: ${sessionCode}] ${action} ${details}`);

    nsp.on('connection', (socket) => {
        logger.info(`Conexão Quest: ${socket.id}`);

        registerQuestionHandlers(nsp, socket, sessions, logger);

        // ── CRIAR SESSÃO ──────────────────────────────────────────────────
        socket.on('createSession', (payload, callback) => {
            const {
                controllerPassword,
                presenterPassword,
                deadline,
                theme,
                repeatControllerPass,
                noPresenterPass,
                questions: importedQuestions,
                maxGrade,
                passingGrade
            } = payload;

            if (!controllerPassword)
                return callback({ success: false, message: 'Senha do controller é obrigatória.' });

            let finalPresenterPassword = '';
            if (repeatControllerPass) {
                finalPresenterPassword = controllerPassword;
            } else if (!noPresenterPass) {
                if (!presenterPassword)
                    return callback({ success: false, message: 'Senha do presenter é obrigatória ou marque uma opção.' });
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
                maxGrade: maxGrade || 10,
                passingGrade: passingGrade || 5,
                questions: [],
                nextQuestionId: 0,
                users: {},
                isAudienceUrlVisible: false,
                presenterMode: { mode: 'grades' },
                createdAt: Date.now()
            };

            if (importedQuestions && Array.isArray(importedQuestions)) {
                importedQuestions.forEach(q => {
                    sessions[sessionCode].questions.push({
                        ...q,
                        id: sessions[sessionCode].nextQuestionId++,
                        createdAt: Date.now()
                    });
                });
            }

            logAction(sessionCode, 'CRIADA');
            callback({ success: true, sessionCode });
        });

        // ── ENTRAR NA SESSÃO (controller / presenter) ─────────────────────
        socket.on('joinAdminSession', ({ sessionCode, password, role }, callback) => {
            const session = sessions[sessionCode];
            if (!session)
                return callback({ success: false, message: 'Sessão não encontrada.' });

            const expected = role === 'controller' ? session.controllerPassword : session.presenterPassword;
            if (!(role === 'presenter' && expected === '' && password === '') && password !== expected)
                return callback({ success: false, message: 'Senha incorreta.' });

            if (role === 'controller' && session.controllerSocketId && session.controllerSocketId !== socket.id) {
                const old = nsp.sockets.get(session.controllerSocketId);
                if (old) { old.emit('controllerDisplaced'); old.disconnect(); }
            }

            socket.join(sessionCode);
            socket.sessionCode = sessionCode;
            socket.role = role;

            if (role === 'controller') {
                session.controllerSocketId = socket.id;
            } else {
                if (!session.presenterSocketIds.includes(socket.id))
                    session.presenterSocketIds.push(socket.id);
            }

            logAction(sessionCode, `${role.toUpperCase()} conectado`);

            callback({
                success: true,
                theme: session.theme,
                users: session.users,
                totalQuestions: session.questions.length,
                maxGrade: session.maxGrade,
                passingGrade: session.passingGrade,
                isAudienceUrlVisible: session.isAudienceUrlVisible,
                presenterMode: session.presenterMode
            });

            nsp.to(sessionCode).emit('questionsUpdated', session.questions);
        });

        // ── PEDIDO DE ENTRADA (audience) ──────────────────────────────────
        socket.on('requestJoin', ({ sessionCode, name, password }, callback) => {
            const session = sessions[sessionCode];
            if (!session)
                return callback({ success: false, message: 'Sessão não encontrada.' });

            if (session.deadline && Date.now() > session.deadline)
                return callback({ success: false, message: 'Esta sessão já foi encerrada.' });

            if (session.presenterPassword && session.presenterPassword !== password)
                return callback({ success: false, message: 'Senha da sessão incorreta.' });

            session.users[socket.id] = {
                socketId: socket.id,
                name,
                status: 'pending',
                progress: 0,
                correctAnswers: 0,
                attemptCount: 0,
                finalGrade: null,
                answers: {}
            };
            socket.sessionCode = sessionCode;
            socket.role = 'audience';
            socket.join(sessionCode);

            logAction(sessionCode, `Pedido de entrada: "${name}"`);
            if (session.controllerSocketId)
                nsp.to(session.controllerSocketId).emit('userListUpdated', {
                    users: session.users,
                    totalQuestions: session.questions.length
                });

            callback({ success: true, message: 'Aguardando aprovação do instrutor.' });
        });

        // ── APROVAR USUÁRIO ───────────────────────────────────────────────
        socket.on('approveUser', ({ sessionCode, userIdToApprove }) => {
            const session = sessions[sessionCode];
            const user = session?.users[userIdToApprove];
            const userSocket = nsp.sockets.get(userIdToApprove);
            if (!session || !user || !userSocket || socket.id !== session.controllerSocketId) return;

            user.status = 'approved';
            logAction(sessionCode, `"${user.name}" aprovado`);

            userSocket.emit('joinApproved', {
                firstQuestion: session.questions[0] || null,
                totalQuestions: session.questions.length,
                maxGrade: session.maxGrade,
                passingGrade: session.passingGrade,
                theme: session.theme,
                audienceView: []
            });

            nsp.to(sessionCode).emit('userListUpdated', {
                users: session.users,
                totalQuestions: session.questions.length
            });
        });

        // ── REJEITAR USUÁRIO ─────────────────────────────────────────────
        socket.on('rejectUser', ({ sessionCode, userIdToReject }) => {
            const session = sessions[sessionCode];
            if (!session || socket.id !== session.controllerSocketId) return;

            const user = session.users[userIdToReject];
            const userSocket = nsp.sockets.get(userIdToReject);
            if (userSocket) {
                userSocket.emit('error', 'Sua entrada foi recusada pelo instrutor.');
                userSocket.disconnect();
            }
            if (user) delete session.users[userIdToReject];

            nsp.to(session.controllerSocketId).emit('userListUpdated', {
                users: session.users,
                totalQuestions: session.questions.length
            });
        });

        // ── REMOVER USUÁRIO ───────────────────────────────────────────────
        socket.on('removeUser', ({ sessionCode, userIdToRemove }) => {
            const session = sessions[sessionCode];
            if (!session || socket.id !== session.controllerSocketId) return;

            const userSocket = nsp.sockets.get(userIdToRemove);
            if (userSocket) {
                userSocket.emit('error', 'Você foi removido da sessão pelo instrutor.');
                userSocket.disconnect();
            }
            delete session.users[userIdToRemove];

            nsp.to(session.controllerSocketId).emit('userListUpdated', {
                users: session.users,
                totalQuestions: session.questions.length
            });
        });

        // ── RESPONDER PERGUNTA ────────────────────────────────────────────
        socket.on('submitAnswer', ({ sessionCode, questionId, answer }) => {
            const session = sessions[sessionCode];
            const user = session?.users[socket.id];
            if (!session || !user || user.status !== 'approved') return;

            const question = session.questions.find(q => q && q.id === questionId);
            if (!question) return;

            user.attemptCount = (user.attemptCount || 0) + 1;

            const isCorrect = evaluateAnswer(question, answer);

            if (isCorrect) {
                user.correctAnswers++;
                user.progress++;
                user.attemptCount = 0;

                const nextQuestion = session.questions[user.progress] || null;
                let finalGrade = null;

                if (!nextQuestion) {
                    // Aluno concluiu todas as perguntas
                    const grade = calcGrade(user.correctAnswers, session.questions.length, session.maxGrade);
                    user.finalGrade = grade;
                    finalGrade = {
                        grade,
                        maxGrade: session.maxGrade,
                        passingGrade: session.passingGrade,
                        correctAnswers: user.correctAnswers,
                        totalQuestions: session.questions.length,
                        passed: grade >= session.passingGrade
                    };
                    logAction(sessionCode, `"${user.name}" concluiu — nota ${grade}/${session.maxGrade}`);
                }

                socket.emit('answerResult', { correct: true, nextQuestion, finalGrade });
            } else {
                // Verifica skip logic
                let shouldSkip = false;
                const { skipConfig } = question;

                if (skipConfig) {
                    if (skipConfig.autoSkipOnWrong) {
                        shouldSkip = true;
                    } else if (skipConfig.autoSkipAfter && user.attemptCount >= skipConfig.autoSkipAfter) {
                        shouldSkip = true;
                    }
                }

                if (shouldSkip) {
                    user.progress++;
                    user.attemptCount = 0;
                    const nextQuestion = session.questions[user.progress] || null;
                    let finalGrade = null;

                    if (!nextQuestion) {
                        const grade = calcGrade(user.correctAnswers, session.questions.length, session.maxGrade);
                        user.finalGrade = grade;
                        finalGrade = {
                            grade,
                            maxGrade: session.maxGrade,
                            passingGrade: session.passingGrade,
                            correctAnswers: user.correctAnswers,
                            totalQuestions: session.questions.length,
                            passed: grade >= session.passingGrade
                        };
                    }
                    socket.emit('answerResult', { correct: false, skipped: true, nextQuestion, finalGrade });
                } else {
                    // Permite novo intento
                    const allowSkipAfter = skipConfig?.allowSkipAfter;
                    const canSkip = allowSkipAfter && user.attemptCount >= allowSkipAfter;
                    socket.emit('answerResult', { correct: false, skipped: false, canSkip: !!canSkip });
                }
            }

            if (session.controllerSocketId) {
                nsp.to(session.controllerSocketId).emit('userListUpdated', {
                    users: session.users,
                    totalQuestions: session.questions.length
                });
            }
            session.presenterSocketIds.forEach(pid => {
                nsp.to(pid).emit('userListUpdated', {
                    users: session.users,
                    totalQuestions: session.questions.length,
                    maxGrade: session.maxGrade,
                    passingGrade: session.passingGrade
                });
            });
        });

        // ── PULAR PERGUNTA MANUALMENTE ────────────────────────────────────
        socket.on('skipQuestion', ({ sessionCode, questionId }) => {
            const session = sessions[sessionCode];
            const user = session?.users[socket.id];
            if (!session || !user || user.status !== 'approved') return;

            user.progress++;
            user.attemptCount = 0;
            const nextQuestion = session.questions[user.progress] || null;
            let finalGrade = null;

            if (!nextQuestion) {
                const grade = calcGrade(user.correctAnswers, session.questions.length, session.maxGrade);
                user.finalGrade = grade;
                finalGrade = {
                    grade, maxGrade: session.maxGrade, passingGrade: session.passingGrade,
                    correctAnswers: user.correctAnswers, totalQuestions: session.questions.length,
                    passed: grade >= session.passingGrade
                };
            }

            socket.emit('answerResult', { correct: false, skipped: true, nextQuestion, finalGrade });

            if (session.controllerSocketId)
                nsp.to(session.controllerSocketId).emit('userListUpdated', {
                    users: session.users, totalQuestions: session.questions.length
                });
        });

        // ── ZERAR PROGRESSO (individual) ─────────────────────────────────
        socket.on('resetUserProgress', ({ sessionCode, userIdToReset }) => {
            const session = sessions[sessionCode];
            if (!session || socket.id !== session.controllerSocketId) return;

            const user = session.users[userIdToReset];
            if (!user) return;

            user.progress = 0;
            user.correctAnswers = 0;
            user.attemptCount = 0;
            user.finalGrade = null;
            user.answers = {};

            const userSocket = nsp.sockets.get(userIdToReset);
            if (userSocket) {
                userSocket.emit('joinApproved', {
                    firstQuestion: session.questions[0] || null,
                    totalQuestions: session.questions.length,
                    maxGrade: session.maxGrade,
                    passingGrade: session.passingGrade,
                    theme: session.theme,
                    audienceView: []
                });
            }

            logAction(sessionCode, `Progresso de "${user.name}" zerado`);
            nsp.to(session.controllerSocketId).emit('userListUpdated', {
                users: session.users, totalQuestions: session.questions.length
            });
        });

        // ── ZERAR PROGRESSO (todos) ───────────────────────────────────────
        socket.on('resetAllUsersProgress', ({ sessionCode }) => {
            const session = sessions[sessionCode];
            if (!session || socket.id !== session.controllerSocketId) return;

            Object.values(session.users).forEach(user => {
                user.progress = 0;
                user.correctAnswers = 0;
                user.attemptCount = 0;
                user.finalGrade = null;
                user.answers = {};

                if (user.status === 'approved') {
                    const userSocket = nsp.sockets.get(user.socketId);
                    if (userSocket) {
                        userSocket.emit('joinApproved', {
                            firstQuestion: session.questions[0] || null,
                            totalQuestions: session.questions.length,
                            maxGrade: session.maxGrade,
                            passingGrade: session.passingGrade,
                            theme: session.theme,
                            audienceView: []
                        });
                    }
                }
            });

            logAction(sessionCode, 'Progresso de TODOS zerado');
            nsp.to(session.controllerSocketId).emit('userListUpdated', {
                users: session.users, totalQuestions: session.questions.length
            });
        });

        // ── ENCERRAR SESSÃO ───────────────────────────────────────────────
        socket.on('endSession', ({ sessionCode }) => {
            const session = sessions[sessionCode];
            if (!session || socket.id !== session.controllerSocketId) return;

            logAction(sessionCode, 'ENCERRADA');
            nsp.to(sessionCode).emit('sessionEnded', 'A sessão foi encerrada pelo instrutor.');
            delete sessions[sessionCode];
        });

        // ── MUDAR TEMA ────────────────────────────────────────────────────
        socket.on('changeTheme', ({ sessionCode, theme }) => {
            const session = sessions[sessionCode];
            if (!session || socket.id !== session.controllerSocketId) return;

            session.theme = theme;
            logAction(sessionCode, `Tema alterado: ${theme}`);
            nsp.to(sessionCode).emit('themeChanged', { theme });
        });

        // ── ALTERNAR URL DA PLATEIA ───────────────────────────────────────
        socket.on('toggleAudienceUrl', ({ sessionCode, visible }) => {
            const session = sessions[sessionCode];
            if (!session || socket.id !== session.controllerSocketId) return;

            session.isAudienceUrlVisible = visible;
            nsp.to(sessionCode).emit('audienceUrlVisibilityChanged', { visible });
        });

        // ── EXPORTAR NOTAS (CSV payload para o controller) ───────────────
        socket.on('requestGrades', ({ sessionCode }) => {
            const session = sessions[sessionCode];
            if (!session || socket.id !== session.controllerSocketId) return;

            const grades = Object.values(session.users)
                .filter(u => u.status === 'approved' || u.status === 'disconnected')
                .map(u => ({
                    name: u.name,
                    correctAnswers: u.correctAnswers,
                    totalQuestions: session.questions.length,
                    grade: u.finalGrade !== null
                        ? u.finalGrade
                        : calcGrade(u.correctAnswers, session.questions.length, session.maxGrade),
                    maxGrade: session.maxGrade,
                    passingGrade: session.passingGrade,
                    passed: (u.finalGrade !== null ? u.finalGrade : calcGrade(u.correctAnswers, session.questions.length, session.maxGrade)) >= session.passingGrade
                }));

            socket.emit('gradesData', {
                grades,
                maxGrade: session.maxGrade,
                passingGrade: session.passingGrade,
                totalQuestions: session.questions.length
            });
        });

        // ── DESCONEXÃO ────────────────────────────────────────────────────
        socket.on('disconnect', () => {
            const sessionCode = socket.sessionCode;
            const session = sessions[sessionCode];
            if (!session) return;

            if (socket.role === 'audience') {
                const user = session.users[socket.id];
                if (user) {
                    user.status = 'disconnected';
                    logAction(sessionCode, `"${user.name}" desconectado`);
                    if (session.controllerSocketId)
                        nsp.to(session.controllerSocketId).emit('userListUpdated', {
                            users: session.users, totalQuestions: session.questions.length
                        });
                }
            } else if (socket.role === 'controller' && session.controllerSocketId === socket.id) {
                session.controllerSocketId = null;
                logAction(sessionCode, 'Controller desconectado');
            } else if (socket.role === 'presenter') {
                session.presenterSocketIds = session.presenterSocketIds.filter(id => id !== socket.id);
                logAction(sessionCode, 'Presenter desconectado');
            }

            logger.info(`Desconectado do Quest: ${socket.id}`);
        });
    });

    logger.info('Quest Socket.IO Namespace Initialized');
}

module.exports = { initializeSocket };
