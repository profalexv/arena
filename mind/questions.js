/**
 * questions.js
 * 
 * Módulo responsável por registrar e gerenciar todos os eventos
 * de Socket.IO relacionados a perguntas (criar, editar, deletar, etc.).
 */

function registerQuestionHandlers(nsp, socket, sessions, logger) {

    const logAction = (sessionCode, action, details = '') => {
        logger.info(`[SESSION: ${sessionCode}] ${action} ${details}`);
    };

    // CRIAR UMA NOVA PERGUNTA
    socket.on('createQuestion', ({ sessionCode, question }, callback) => {
        const session = sessions[sessionCode];
        if (!session) return;

        // Garante que cada pergunta tenha um ID único e estável, não baseado no índice.
        const newQuestionId = (session.nextQuestionId || session.questions.length);
        session.nextQuestionId = newQuestionId + 1;

        session.questions.push({
            id: newQuestionId,
            text: question.text,
            imageUrl: question.imageUrl,
            questionType: question.questionType,
            options: question.options,
            charLimit: question.charLimit,
            timer: question.timer,
            results: {},
            createdAt: Date.now(),
            isConcluded: false // Flag para saber se a pergunta já foi encerrada
        });

        logAction(sessionCode, `PERGUNTA #${newQuestionId} criada`);
        nsp.to(sessionCode).emit('questionsUpdated', session.questions);
        if (callback) callback({ success: true });
    });

    // EDITAR UMA PERGUNTA
    socket.on('editQuestion', ({ sessionCode, questionId, updatedQuestion }, callback) => {
        const session = sessions[sessionCode];
        if (!session) return;

        const questionIndex = session.questions.findIndex(q => q && q.id === questionId);
        if (questionIndex === -1) {
            if (callback) callback({ success: false, message: 'Pergunta não encontrada.' });
            return;
        }

        const question = session.questions[questionIndex];
        
        if (session.activeQuestion === questionId || question.isConcluded) {
            socket.emit('error', 'Não é possível editar uma pergunta ativa ou já encerrada.');
            if (callback) callback({ success: false, message: 'Não é possível editar uma pergunta ativa ou já encerrada.' });
            return;
        }

        // Atribuição direta para permitir limpar campos (ex: remover uma imagem)
        question.text = updatedQuestion.text;
        question.imageUrl = updatedQuestion.imageUrl;
        question.options = updatedQuestion.options;
        question.charLimit = updatedQuestion.charLimit;
        question.timer = updatedQuestion.timer;

        logAction(sessionCode, `PERGUNTA #${questionId} editada`);
        nsp.to(sessionCode).emit('questionsUpdated', session.questions);
        if (callback) callback({ success: true });
    });

    // DUPLICAR UMA PERGUNTA
    socket.on('duplicateQuestion', ({ sessionCode, questionId }) => {
        const session = sessions[sessionCode];
        if (!session) return;

        const originalQuestion = session.questions.find(q => q && q.id === questionId);
        if (!originalQuestion) return;

        const newQuestionId = (session.nextQuestionId || session.questions.length);
        session.nextQuestionId = newQuestionId + 1;

        const newQuestion = JSON.parse(JSON.stringify(originalQuestion));
        newQuestion.id = newQuestionId;
        newQuestion.results = {};
        newQuestion.createdAt = Date.now();
        newQuestion.isConcluded = false;

        session.questions.push(newQuestion);

        logAction(sessionCode, `PERGUNTA #${questionId} duplicada para #${newQuestionId}`);
        nsp.to(sessionCode).emit('questionsUpdated', session.questions);
    });

    // DELETAR UMA PERGUNTA
    socket.on('deleteQuestion', ({ sessionCode, questionId }) => {
        const session = sessions[sessionCode];
        if (!session) return;

        if (session.activeQuestion === questionId) {
            socket.emit('error', 'Não pode deletar pergunta ativa');
            return;
        }

        const initialLength = session.questions.length;
        // Filtra a pergunta pelo seu ID único, em vez de depender do índice.
        session.questions = session.questions.filter(q => q && q.id !== questionId);

        if (session.questions.length < initialLength) {
            logAction(sessionCode, `PERGUNTA #${questionId} deletada`);
            // A reordenação no cliente já lida com a atualização da UI.
            // Apenas emitimos a lista atualizada.
            nsp.to(sessionCode).emit('questionsUpdated', session.questions);
        }
    });
    // INICIAR UMA PERGUNTA
    socket.on('startQuestion', ({ sessionCode, questionId }) => {
        const session = sessions[sessionCode];
        const question = session ? session.questions.find(q => q && q.id === questionId) : null;

        if (question) {
            session.activeQuestion = questionId;
            question.results = {};
            question.acceptingAnswers = true;
            question.isConcluded = false; // Reseta o estado ao re-iniciar
            question.endTime = null;
            
            if (question.timer && question.timer.duration > 0) {
                question.endTime = Date.now() + (question.timer.duration * 1000);
            }
            
            if (question.questionType === 'options' && question.options) {
                question.options.forEach(opt => question.results[opt.id] = 0);
            } else if (question.questionType === 'yes_no') {
                question.results['yes'] = 0;
                question.results['no'] = 0;
            }
            
            logAction(sessionCode, `PERGUNTA #${questionId} iniciada`);
            logger.info(`EMITTING 'newQuestion' to room ${sessionCode}`);
            nsp.to(sessionCode).emit('newQuestion', { ...question });
        }
    });

    // PARAR UMA PERGUNTA
    socket.on('stopQuestion', ({ sessionCode, questionId }) => {
        const session = sessions[sessionCode];
        const question = session ? session.questions.find(q => q && q.id === questionId) : null;

        if (question) {
            question.acceptingAnswers = false;
            question.isConcluded = true; // Marca como encerrada
            
            logAction(sessionCode, `PERGUNTA #${questionId} parada`);
            nsp.to(sessionCode).emit('votingEnded', { questionId });
            // Envia a atualização para que a UI do controller mude os botões
            nsp.to(sessionCode).emit('questionsUpdated', session.questions);
        }
    });

    // EXIBIR RESULTADOS DE UMA PERGUNTA JÁ ENCERRADA
    socket.on('showResults', ({ sessionCode, questionId }) => {
        const session = sessions[sessionCode];
        const question = session ? session.questions.find(q => q && q.id === questionId) : null;

        if (question && question.isConcluded) {
            session.activeQuestion = questionId;
            question.acceptingAnswers = false; // Não aceita novas respostas

            logAction(sessionCode, `EXIBINDO RESULTADOS da pergunta #${questionId}`);
            nsp.to(sessionCode).emit('newQuestion', { ...question }); // Envia a pergunta para a tela
            nsp.to(sessionCode).emit('updateResults', { results: question.results, questionType: question.questionType }); // Envia os resultados
        }
    });
}

module.exports = { registerQuestionHandlers };