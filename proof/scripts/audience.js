// ===== AUDIÊNCIA DO PROOF — AVALIAÇÃO COM NOTAS =====
const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const socketUrl = isDevelopment ? 'http://localhost:3000/proof' : 'https://profalexv-alexluza.onrender.com/proof';
const socket = io(socketUrl, {
    transports: ['websocket', 'polling'],
    withCredentials: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5
});

const sessionCode = new URLSearchParams(window.location.search).get('session');
let currentQuestionId = null;

const state = {
    totalQuestions: 0,
    maxGrade: 10,
    passingGrade: 5,
    questionIndex: 0,     // para exibir "Pergunta X de N"
    skipAvailable: false,
    currentTimer: null,
};

// Elementos
const loginScreen = document.getElementById('login-screen');
const quizScreen = document.getElementById('quiz-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const questionWrapper = document.getElementById('question-wrapper');
const nameInput = document.getElementById('audience-name');
const passwordInput = document.getElementById('audience-password');
const joinBtn = document.getElementById('join-btn');
const loginFeedback = document.getElementById('login-feedback');
const questionTitle = document.getElementById('question-title');
const questionCounter = document.getElementById('question-counter');
const optionsContainer = document.getElementById('options-container');
const answerFeedback = document.getElementById('answer-feedback');
const audienceTimerEl = document.getElementById('audience-timer');
const finalGradeValue = document.getElementById('final-grade-value');
const finalGradeMax = document.getElementById('final-grade-max');
const passFailBadge = document.getElementById('pass-fail-badge');
const gradeDetail = document.getElementById('grade-detail');
const exitBtn = document.getElementById('exit-btn');

function applyTheme(theme = 'light') {
    const body = document.body;
    body.classList.remove('theme-light', 'theme-dark', 'theme-corporate', 'theme-fun', 'theme-sublime');
    body.classList.add(`theme-${theme}`);
}

function showScreen(name) {
    loginScreen.style.display = name === 'login' ? 'block' : 'none';
    quizScreen.style.display = name === 'quiz' ? 'block' : 'none';
    gameOverScreen.style.display = name === 'game-over' ? 'block' : 'none';
}

function renderMedia(question) {
    const existing = document.getElementById('media-wrapper');
    if (existing) existing.remove();

    let mediaHTML = '';
    if (question.imageUrl)
        mediaHTML += `<img src="${question.imageUrl}" alt="Imagem da pergunta" style="max-width:100%;border-radius:8px;margin-bottom:1rem;">`;
    if (question.mediaUrl) {
        try {
            const url = question.mediaUrl;
            const urlObj = new URL(url);
            if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
                const videoId = urlObj.hostname.includes('youtu.be')
                    ? urlObj.pathname.slice(1)
                    : urlObj.searchParams.get('v');
                if (videoId)
                    mediaHTML += `<div class="video-container"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe></div>`;
            } else if (url.match(/\.(mp4|webm)$/))
                mediaHTML += `<video controls src="${url}" style="max-width:100%;border-radius:8px;"></video>`;
            else if (url.match(/\.(mp3|ogg|wav)$/))
                mediaHTML += `<audio controls src="${url}" style="width:100%;"></audio>`;
        } catch {}
    }
    const wrapper = document.createElement('div');
    wrapper.id = 'media-wrapper';
    wrapper.innerHTML = mediaHTML;
    return wrapper;
}

function renderQuestion(question) {
    if (!question) { showGameOver(null); return; }

    if (state.currentTimer) { state.currentTimer.stop(); state.currentTimer = null; }
    if (audienceTimerEl) audienceTimerEl.style.display = 'none';

    currentQuestionId = question.id;
    state.skipAvailable = false;
    questionTitle.innerText = question.text;
    optionsContainer.innerHTML = '';
    answerFeedback.innerText = '';

    if (questionCounter)
        questionCounter.innerText = state.totalQuestions > 0
            ? `Pergunta ${state.questionIndex + 1} de ${state.totalQuestions}`
            : '';

    questionTitle.before(renderMedia(question));

    switch (question.questionType) {
        case 'options':
            if (question.answerConfig?.acceptMultiple) {
                question.options.forEach(opt => {
                    const label = document.createElement('label');
                    label.className = 'mcq-option-label';
                    label.innerHTML = `<input type="checkbox" name="mcq-option" value="${opt.id}"><span>${opt.text}</span>`;
                    optionsContainer.appendChild(label);
                });
                const submitBtn = document.createElement('button');
                submitBtn.textContent = 'Confirmar Resposta';
                submitBtn.onclick = () => {
                    const selected = Array.from(optionsContainer.querySelectorAll('input[name="mcq-option"]:checked')).map(cb => cb.value);
                    if (selected.length > 0) submitAnswer(selected);
                    else answerFeedback.innerText = 'Selecione pelo menos uma opção.';
                };
                optionsContainer.appendChild(submitBtn);
            } else {
                question.options.forEach(opt => {
                    const btn = document.createElement('button');
                    btn.textContent = opt.text;
                    btn.onclick = () => submitAnswer(opt.id);
                    optionsContainer.appendChild(btn);
                });
            }
            break;
        case 'yes_no': {
            const yes = document.createElement('button'); yes.textContent = 'Sim'; yes.onclick = () => submitAnswer('yes');
            const no = document.createElement('button'); no.textContent = 'Não'; no.onclick = () => submitAnswer('no');
            optionsContainer.append(yes, no);
            break;
        }
        default: {
            const input = document.createElement('input');
            input.id = 'text-answer';
            input.type = (question.questionType === 'number' || question.questionType === 'integer') ? 'number' : 'text';
            input.placeholder = 'Sua resposta';
            if (question.charLimit) input.maxLength = question.charLimit;

            const btn = document.createElement('button');
            btn.textContent = 'Confirmar';
            btn.onclick = () => { if (input.value.trim()) submitAnswer(input.value.trim()); };
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && input.value.trim()) submitAnswer(input.value.trim()); });
            optionsContainer.append(input, btn);
        }
    }

    if (question.endTime && question.timer?.showToAudience && audienceTimerEl) {
        audienceTimerEl.style.display = 'flex';
        state.currentTimer = new Cronometro(question.endTime, audienceTimerEl, () => {
            answerFeedback.innerText = 'Tempo esgotado!';
        });
        state.currentTimer.start();
    }
}

function submitAnswer(answer) {
    socket.emit('submitAnswer', { sessionCode, questionId: currentQuestionId, answer });
    optionsContainer.querySelectorAll('button, input').forEach(el => el.disabled = true);
    answerFeedback.innerText = 'Verificando...';
}

function renderSkipButton() {
    if (state.skipAvailable) return; // já tem
    state.skipAvailable = true;
    const skipBtn = document.createElement('button');
    skipBtn.textContent = 'Pular Pergunta';
    skipBtn.className = 'secondary-button';
    skipBtn.style.marginTop = '10px';
    skipBtn.onclick = () => {
        socket.emit('skipQuestion', { sessionCode, questionId: currentQuestionId });
        optionsContainer.querySelectorAll('button, input').forEach(el => el.disabled = true);
        answerFeedback.innerText = 'Pergunta pulada...';
    };
    optionsContainer.appendChild(skipBtn);
}

function showGameOver(finalGrade) {
    showScreen('game-over');
    if (!finalGrade) {
        if (finalGradeValue) finalGradeValue.textContent = '—';
        return;
    }
    if (finalGradeValue) finalGradeValue.textContent = finalGrade.grade.toFixed(1);
    if (finalGradeMax) finalGradeMax.textContent = `/${finalGrade.maxGrade}`;
    if (passFailBadge) {
        passFailBadge.textContent = finalGrade.passed ? '✓ Aprovado' : '✗ Reprovado';
        passFailBadge.className = 'pass-fail-badge ' + (finalGrade.passed ? 'approved' : 'failed');
    }
    if (gradeDetail)
        gradeDetail.textContent = `${finalGrade.correctAnswers} de ${finalGrade.totalQuestions} resposta(s) correta(s)`;
}

// ===== SOCKET EVENTS =====
socket.on('connect', () => {
    if (!sessionCode) { loginFeedback.innerText = 'Código da sessão não encontrado na URL.'; joinBtn.disabled = true; }
});

socket.on('joinApproved', (data) => {
    state.totalQuestions = data.totalQuestions;
    state.maxGrade = data.maxGrade || 10;
    state.passingGrade = data.passingGrade || 5;
    state.questionIndex = 0;
    if (data.theme) applyTheme(data.theme);
    loginFeedback.innerText = 'Aprovado! Carregando avaliação...';
    setTimeout(() => { showScreen('quiz'); renderQuestion(data.firstQuestion); }, 800);
});

socket.on('answerResult', ({ correct, skipped, nextQuestion, finalGrade, canSkip }) => {
    if (finalGrade) { showGameOver(finalGrade); return; }

    if (correct || skipped) {
        state.questionIndex++;
        if (correct) answerFeedback.innerText = '✓ Resposta correta!';
        else answerFeedback.innerText = 'Pergunta pulada.';

        setTimeout(() => {
            if (nextQuestion) renderQuestion(nextQuestion);
            else showGameOver(null);
        }, 1200);
    } else {
        answerFeedback.innerText = '✗ Resposta incorreta. Tente novamente.';
        optionsContainer.querySelectorAll('button, input').forEach(el => el.disabled = false);
        if (canSkip) renderSkipButton();
    }
});

socket.on('themeChanged', ({ theme }) => applyTheme(theme));

socket.on('error', (message) => {
    alert(`Erro: ${message}`);
    window.location.href = '../index.html';
});

socket.on('sessionEnded', (message) => {
    alert(message);
    window.location.href = '../index.html';
});

// ===== UI EVENTS =====
joinBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    const password = passwordInput.value.trim();
    if (!name || !password) { loginFeedback.innerText = 'Preencha seu nome e a senha.'; return; }
    joinBtn.disabled = true;
    loginFeedback.innerText = 'Enviando pedido...';
    socket.emit('requestJoin', { sessionCode, name, password }, (response) => {
        if (response.success) loginFeedback.innerText = response.message;
        else { loginFeedback.innerText = `Erro: ${response.message}`; joinBtn.disabled = false; }
    });
});

exitBtn?.addEventListener('click', () => { window.location.href = '../index.html'; });
