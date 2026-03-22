/**
 * render/proof/questions.js
 *
 * Módulo responsável por registrar e gerenciar todos os eventos
 * de Socket.IO relacionados a perguntas do Proof (criar, editar, deletar, reordenar).
 *
 * Idêntico ao eamos/questions.js — reutilizado sem alteração.
 */

function registerQuestionHandlers(nsp, socket, sessions, logger) {

    const logAction = (sessionCode, action, details = '') => {
        logger.info(`[SESSION: ${sessionCode}] ${action} ${details}`);
    };

    socket.on('createQuestion', ({ sessionCode, question }, callback) => {
        const session = sessions[sessionCode];
        if (!session) return;

        const newQuestionId = (session.nextQuestionId || session.questions.length);
        session.nextQuestionId = newQuestionId + 1;

        const newQuestion = { ...question, id: newQuestionId, createdAt: Date.now() };
        session.questions.push(newQuestion);

        logAction(sessionCode, `PERGUNTA #${newQuestionId} criada`);
        nsp.to(sessionCode).emit('questionsUpdated', session.questions);
        if (callback) callback({ success: true });
    });

    socket.on('editQuestion', ({ sessionCode, questionId, updatedQuestion }, callback) => {
        const session = sessions[sessionCode];
        if (!session) return;

        const q = session.questions.find(q => q && q.id === questionId);
        if (!q) return;

        Object.assign(q, updatedQuestion);

        logAction(sessionCode, `PERGUNTA #${questionId} editada`);
        nsp.to(sessionCode).emit('questionsUpdated', session.questions);
        if (callback) callback({ success: true });
    });

    socket.on('deleteQuestion', ({ sessionCode, questionId }) => {
        const session = sessions[sessionCode];
        if (!session) return;

        const before = session.questions.length;
        session.questions = session.questions.filter(q => q && q.id !== questionId);

        if (session.questions.length < before) {
            logAction(sessionCode, `PERGUNTA #${questionId} deletada`);
            nsp.to(sessionCode).emit('questionsUpdated', session.questions);
        }
    });

    socket.on('reorderQuestions', ({ sessionCode, newQuestionOrder }) => {
        const session = sessions[sessionCode];
        if (!session || !Array.isArray(newQuestionOrder)) return;

        session.questions = newQuestionOrder;
        logAction(sessionCode, 'Perguntas reordenadas');
        nsp.to(sessionCode).emit('questionsUpdated', session.questions);
    });
}

module.exports = { registerQuestionHandlers };
