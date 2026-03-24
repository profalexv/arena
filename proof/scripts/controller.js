// ===== CONTROLLER DO PROOF =====
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

// ===== ESTADO =====
const sessionCode = sessionStorage.getItem('proof_session_code');
const sessionPass = sessionStorage.getItem('proof_session_pass');
const presenterPass = sessionStorage.getItem('proof_presenter_pass');

let sessionState = {
    users: {},
    questions: [],
    currentQuestion: null,
    maxGrade: 10,
    passingGrade: 5,
    sessionCode: '',
    isAudienceUrlVisible: false,
};

// ===== ELEMENTOS =====
const loginSection = document.getElementById('login-section');
const mainSection = document.getElementById('main-section');
const sessionCodeInput = document.getElementById('session-code-input');
const controllerPassInput = document.getElementById('controller-pass-input');
const joinBtn = document.getElementById('join-admin-btn');
const loginFeedback = document.getElementById('login-feedback');

// Header
const sessionCodeDisplay = document.getElementById('session-code-display');
const headerGradesSummary = document.getElementById('header-grades-summary');
const statsApproved = document.getElementById('stats-approved');
const statsFailed = document.getElementById('stats-failed');
const statsAvg = document.getElementById('stats-avg');
const statsTotal = document.getElementById('stats-total');
const audienceCountEl = document.getElementById('audience-count');

// Usuários / Aprovação
const pendingUsersContainer = document.getElementById('pending-users-container');
const approvedUsersContainer = document.getElementById('approved-users-container');

// Questões
const questionForm = document.getElementById('question-form');
const questionsList = document.getElementById('questions-list');
const addQuestionBtn = document.getElementById('add-question-btn');

// Botões de ação
const endSessionBtn = document.getElementById('end-session-btn');
const toggleAudienceUrlBtn = document.getElementById('toggle-audience-url-btn');
const exportCsvBtn = document.getElementById('export-csv-btn');
const scholarBtn = document.getElementById('scholar-btn');

// Tema
const themeBtns = document.querySelectorAll('.theme-btn');

// ===== FUNÇÕES UTILITÁRIAS =====
function applyTheme(theme = 'light') {
    document.body.classList.remove('theme-light', 'theme-dark', 'theme-corporate', 'theme-fun', 'theme-sublime', 'theme-neon');
    document.body.classList.add(`theme-${theme}`);
    document.querySelectorAll('.theme-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.theme === theme);
    });
}

function renderGradeSummary() {
    const users = Object.values(sessionState.users).filter(u => u.status === 'approved');
    const finished = users.filter(u => u.finalGrade !== null && u.finalGrade !== undefined);
    const approved = finished.filter(u => u.finalGrade?.passed || (u.finalGrade !== null && u.finalGrade >= sessionState.passingGrade));
    const failed = finished.length - approved.length;
    const avg = finished.length > 0
        ? (finished.reduce((sum, u) => {
            const g = typeof u.finalGrade === 'object' ? u.finalGrade?.grade : u.finalGrade;
            return sum + (g || 0);
        }, 0) / finished.length).toFixed(1)
        : '—';

    if (statsApproved) statsApproved.textContent = approved.length;
    if (statsFailed) statsFailed.textContent = failed;
    if (statsAvg) statsAvg.textContent = avg;
    if (statsTotal) statsTotal.textContent = users.length;
    if (audienceCountEl) audienceCountEl.textContent = users.length;
}

function renderUserLists() {
    const pending = Object.values(sessionState.users).filter(u => u.status === 'pending');
    const approved = Object.values(sessionState.users).filter(u => u.status === 'approved');

    // Pendentes
    if (pendingUsersContainer) {
        pendingUsersContainer.innerHTML = '';
        if (pending.length === 0) {
            pendingUsersContainer.innerHTML = '<p class="empty-state">Nenhum aluno aguardando aprovação.</p>';
        } else {
            pending.forEach(user => {
                const el = document.createElement('div');
                el.className = 'user-pending-card';
                el.dataset.socketId = user.socketId;
                el.innerHTML = `
                    <span class="user-name">${escapeHtml(user.name)}</span>
                    <div class="action-btns">
                        <button class="approve-btn" data-id="${user.socketId}">✓ Aprovar</button>
                        <button class="reject-btn" data-id="${user.socketId}">✗ Rejeitar</button>
                    </div>`;
                pendingUsersContainer.appendChild(el);
            });
        }

        pendingUsersContainer.querySelectorAll('.approve-btn').forEach(btn => {
            btn.addEventListener('click', () => socket.emit('approveUser', { sessionCode: sessionState.sessionCode, targetSocketId: btn.dataset.id }));
        });
        pendingUsersContainer.querySelectorAll('.reject-btn').forEach(btn => {
            btn.addEventListener('click', () => socket.emit('rejectUser', { sessionCode: sessionState.sessionCode, targetSocketId: btn.dataset.id }));
        });
    }

    // Aprovados / Tabela de notas
    if (approvedUsersContainer) {
        approvedUsersContainer.innerHTML = '';
        if (approved.length === 0) {
            approvedUsersContainer.innerHTML = '<p class="empty-state">Nenhum aluno aprovado ainda.</p>';
            return;
        }
        const table = document.createElement('table');
        table.className = 'grades-table';
        table.innerHTML = `<thead><tr>
            <th>Nome</th>
            <th>Acertos</th>
            <th>Nota</th>
            <th>Situação</th>
            <th>Ações</th>
        </tr></thead>`;
        const tbody = document.createElement('tbody');
        approved.forEach(user => {
            const finalGradeObj = user.finalGrade;
            const isFinished = finalGradeObj !== null && finalGradeObj !== undefined;
            const grade = isFinished ? (typeof finalGradeObj === 'object' ? finalGradeObj.grade : finalGradeObj) : null;
            const passed = isFinished ? (typeof finalGradeObj === 'object' ? finalGradeObj.passed : grade >= sessionState.passingGrade) : null;
            const correct = user.correctAnswers || 0;
            const total = sessionState.questions.length;
            const gradeDisplay = isFinished ? grade.toFixed(1) : `~${calcProvisionalGrade(user).toFixed(1)}`;
            const gradeClass = isFinished
                ? (passed ? 'grade-badge passed' : 'grade-badge failed')
                : 'grade-badge pending';
            const situationDisplay = isFinished
                ? (passed ? '<span class="badge-approved">Aprovado</span>' : '<span class="badge-failed">Reprovado</span>')
                : '<span class="badge-pending">Em andamento</span>';

            const tr = document.createElement('tr');
            tr.dataset.socketId = user.socketId;
            tr.innerHTML = `
                <td class="col-name">${escapeHtml(user.name)}</td>
                <td class="col-correct">${correct}/${total}</td>
                <td class="col-grade"><span class="${gradeClass}">${gradeDisplay}</span></td>
                <td class="col-situation">${situationDisplay}</td>
                <td class="col-actions">
                    <button class="reset-btn small-btn" data-id="${user.socketId}" title="Reiniciar">↺</button>
                    <button class="remove-btn small-btn" data-id="${user.socketId}" title="Remover">✕</button>
                </td>`;
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        approvedUsersContainer.appendChild(table);

        approvedUsersContainer.querySelectorAll('.reset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (confirm('Reiniciar o progresso deste aluno?'))
                    socket.emit('resetUserProgress', { sessionCode: sessionState.sessionCode, targetSocketId: btn.dataset.id });
            });
        });
        approvedUsersContainer.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (confirm('Remover este aluno da sessão?'))
                    socket.emit('removeUser', { sessionCode: sessionState.sessionCode, targetSocketId: btn.dataset.id });
            });
        });
    }

    renderGradeSummary();
}

function calcProvisionalGrade(user) {
    const total = sessionState.questions.length;
    if (!total) return 0;
    return parseFloat(((user.correctAnswers || 0) / total * sessionState.maxGrade).toFixed(1));
}

function renderQuestionsList() {
    if (!questionsList) return;
    questionsList.innerHTML = '';
    if (sessionState.questions.length === 0) {
        questionsList.innerHTML = '<p class="empty-state">Sem perguntas cadastradas. Adicione abaixo.</p>';
        return;
    }
    sessionState.questions.forEach((q, idx) => {
        const el = document.createElement('div');
        el.className = 'question-card';
        el.dataset.qid = q.id;
        el.innerHTML = `
            <div class="question-card-header">
                <span class="q-num">${idx + 1}.</span>
                <span class="q-text">${escapeHtml(q.text)}</span>
                <div class="q-actions">
                    ${idx > 0 ? `<button class="move-up-btn" data-id="${q.id}">↑</button>` : ''}
                    ${idx < sessionState.questions.length - 1 ? `<button class="move-down-btn" data-id="${q.id}">↓</button>` : ''}
                    <button class="edit-q-btn" data-id="${q.id}">✏</button>
                    <button class="delete-q-btn" data-id="${q.id}">🗑</button>
                </div>
            </div>
            <div class="question-card-meta">Tipo: ${q.questionType} | Correto: ${getCorrectLabel(q)}</div>`;
        questionsList.appendChild(el);
    });

    questionsList.querySelectorAll('.move-up-btn').forEach(btn => {
        btn.addEventListener('click', () => reorderQuestion(btn.dataset.id, 'up'));
    });
    questionsList.querySelectorAll('.move-down-btn').forEach(btn => {
        btn.addEventListener('click', () => reorderQuestion(btn.dataset.id, 'down'));
    });
    questionsList.querySelectorAll('.edit-q-btn').forEach(btn => {
        btn.addEventListener('click', () => loadQuestionIntoForm(btn.dataset.id));
    });
    questionsList.querySelectorAll('.delete-q-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (confirm('Excluir esta pergunta?'))
                socket.emit('deleteQuestion', { sessionCode: sessionState.sessionCode, questionId: parseInt(btn.dataset.id) });
        });
    });
}

function getCorrectLabel(q) {
    if (q.questionType === 'yes_no') return q.correctAnswer === 'yes' ? 'Sim' : 'Não';
    if (q.questionType === 'options') {
        if (q.answerConfig?.acceptMultiple) {
            const correct = (q.options || []).filter(o => o.isCorrect).map(o => escapeHtml(o.text));
            return correct.join(', ') || 'N/A';
        }
        const c = (q.options || []).find(o => o.id === q.correctAnswer);
        return c ? escapeHtml(c.text) : '—';
    }
    return q.correctAnswer !== undefined ? String(q.correctAnswer) : '—';
}

function reorderQuestion(questionId, direction) {
    const idx = sessionState.questions.findIndex(q => String(q.id) === String(questionId));
    if (idx === -1) return;
    const newOrder = sessionState.questions.map(q => q.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= newOrder.length) return;
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    socket.emit('reorderQuestions', { sessionCode: sessionState.sessionCode, order: newOrder });
}

function loadQuestionIntoForm(questionId) {
    const q = sessionState.questions.find(q => String(q.id) === String(questionId));
    if (!q) return;
    questionForm.dataset.editId = q.id;
    document.getElementById('qf-text').value = q.text || '';
    document.getElementById('qf-type').value = q.questionType || 'options';
    document.getElementById('qf-points').value = q.points || 1;
    handleTypeChange();
    populateFormForQuestion(q);
    scrollToForm();
}

function scrollToForm() {
    questionForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===== FORMULÁRIO DE QUESTÕES =====
const qfType = document.getElementById('qf-type');
const yesNoSection = document.getElementById('yes-no-section');
const optionsSection = document.getElementById('options-section');
const textSection = document.getElementById('text-section');
const numberSection = document.getElementById('number-section');
const optionsList = document.getElementById('options-list');
const addOptionBtn = document.getElementById('add-option-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const submitQuestionBtn = document.getElementById('submit-question-btn');

function handleTypeChange() {
    const type = qfType?.value;
    yesNoSection.style.display = type === 'yes_no' ? 'block' : 'none';
    optionsSection.style.display = type === 'options' ? 'block' : 'none';
    textSection.style.display = (type === 'short_text' || type === 'long_text') ? 'block' : 'none';
    numberSection.style.display = (type === 'number' || type === 'integer') ? 'block' : 'none';
}
qfType?.addEventListener('change', handleTypeChange);

function buildOptionRow(opt = {}) {
    const row = document.createElement('div');
    row.className = 'option-row';
    row.innerHTML = `
        <input type="text" class="option-text" placeholder="Texto da opção" value="${escapeHtml(opt.text || '')}">
        <label><input type="checkbox" class="option-is-correct" ${opt.isCorrect ? 'checked' : ''}> Correta</label>
        <button type="button" class="remove-option-btn">✕</button>`;
    row.querySelector('.remove-option-btn').addEventListener('click', () => row.remove());
    return row;
}

addOptionBtn?.addEventListener('click', () => optionsList?.appendChild(buildOptionRow()));

function populateFormForQuestion(q) {
    if (q.questionType === 'yes_no') {
        document.getElementById('qf-yes-no-correct').value = q.correctAnswer || 'yes';
    } else if (q.questionType === 'options') {
        optionsList.innerHTML = '';
        (q.options || []).forEach(opt => optionsList.appendChild(buildOptionRow(opt)));
        const acceptMultiple = document.getElementById('qf-accept-multiple');
        if (acceptMultiple) acceptMultiple.checked = q.answerConfig?.acceptMultiple || false;
    } else {
        document.getElementById('qf-text-correct').value = q.correctAnswer !== undefined ? String(q.correctAnswer) : '';
        if (q.questionType === 'short_text' || q.questionType === 'long_text') {
            const charLimitEl = document.getElementById('qf-char-limit');
            if (charLimitEl) charLimitEl.value = q.charLimit || '';
        }
    }
}

function getQuestionPayload() {
    const type = qfType.value;
    const text = document.getElementById('qf-text')?.value?.trim();
    if (!text) { alert('O texto da pergunta é obrigatório.'); return null; }

    const payload = {
        text,
        questionType: type,
        points: parseInt(document.getElementById('qf-points')?.value) || 1,
    };

    if (type === 'yes_no') {
        payload.correctAnswer = document.getElementById('qf-yes-no-correct').value;
    } else if (type === 'options') {
        const rows = optionsList?.querySelectorAll('.option-row') || [];
        const options = Array.from(rows).map((row, idx) => ({
            id: `opt${idx}`,
            text: row.querySelector('.option-text').value.trim(),
            isCorrect: row.querySelector('.option-is-correct').checked,
        })).filter(o => o.text);
        if (options.length < 2) { alert('Adicione pelo menos 2 opções.'); return null; }
        const acceptMultiple = document.getElementById('qf-accept-multiple')?.checked;
        payload.options = options;
        payload.answerConfig = { acceptMultiple: acceptMultiple || false };
        if (!acceptMultiple) {
            const correct = options.find(o => o.isCorrect);
            if (!correct) { alert('Marque a opção correta.'); return null; }
            payload.correctAnswer = correct.id;
        }
    } else {
        payload.correctAnswer = document.getElementById('qf-text-correct')?.value?.trim() || '';
        if (type === 'short_text' || type === 'long_text') {
            const charLimit = parseInt(document.getElementById('qf-char-limit')?.value);
            if (charLimit > 0) payload.charLimit = charLimit;
        }
    }

    const timerSec = parseInt(document.getElementById('qf-timer')?.value);
    if (timerSec > 0) {
        payload.timer = {
            durationSeconds: timerSec,
            showToAudience: document.getElementById('qf-show-timer')?.checked || false,
        };
    }
    const imageUrl = document.getElementById('qf-image-url')?.value?.trim();
    if (imageUrl) payload.imageUrl = imageUrl;
    const mediaUrl = document.getElementById('qf-media-url')?.value?.trim();
    if (mediaUrl) payload.mediaUrl = mediaUrl;

    return payload;
}

function resetQuestionForm() {
    questionForm.reset();
    delete questionForm.dataset.editId;
    if (optionsList) optionsList.innerHTML = '';
    if (cancelEditBtn) cancelEditBtn.style.display = 'none';
    handleTypeChange();
}

submitQuestionBtn?.addEventListener('click', () => {
    const payload = getQuestionPayload();
    if (!payload) return;
    if (questionForm.dataset.editId) {
        socket.emit('editQuestion', { sessionCode: sessionState.sessionCode, questionId: parseInt(questionForm.dataset.editId), updates: payload });
    } else {
        socket.emit('createQuestion', { sessionCode: sessionState.sessionCode, ...payload });
    }
    resetQuestionForm();
});

cancelEditBtn?.addEventListener('click', () => { resetQuestionForm(); });

// ===== EXPORT CSV =====
function exportCsv(gradesData) {
    const rows = [['Nome', 'Acertos', 'Total', 'Nota', `Nota Máxima (${sessionState.maxGrade})`, `Nota de Aprovação (${sessionState.passingGrade})`, 'Situação']];
    gradesData.forEach(g => {
        const passed = typeof g.finalGrade === 'object' ? g.finalGrade?.passed : (g.finalGrade !== null ? g.finalGrade >= sessionState.passingGrade : false);
        const grade = typeof g.finalGrade === 'object' ? g.finalGrade?.grade : g.finalGrade;
        rows.push([
            g.name,
            g.correctAnswers || 0,
            g.totalQuestions || sessionState.questions.length,
            grade !== null && grade !== undefined ? grade.toFixed(1) : 'N/A',
            sessionState.maxGrade,
            sessionState.passingGrade,
            passed ? 'Aprovado' : (grade !== null ? 'Reprovado' : 'Em andamento'),
        ]);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notas_proof_${sessionState.sessionCode}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

exportCsvBtn?.addEventListener('click', () => {
    socket.emit('requestGrades', { sessionCode: sessionState.sessionCode }, (response) => {
        if (response?.grades) exportCsv(response.grades);
        else alert('Erro ao obter as notas.');
    });
});

// ===== SCHOLAR =====
function checkScholarAccess() {
    if (!window.QuizCloud) return;
    try {
        const user = QuizCloud.getUser ? QuizCloud.getUser() : null;
        const isAdmin = user?.role === 'school_admin';
        if (isAdmin && scholarBtn) scholarBtn.style.display = 'inline-flex';
    } catch {}
}

scholarBtn?.addEventListener('click', async () => {
    if (!window.QuizCloud || !QuizCloud.getToken) { alert('Login necessário.'); return; }
    const token = QuizCloud.getToken();
    if (!token) { alert('Faça login com sua conta escolar para enviar ao Scholar.'); return; }

    const motorUrl = isDevelopment ? 'http://localhost:3001' : 'https://aula-motor.fly.dev';
    socket.emit('requestGrades', { sessionCode: sessionState.sessionCode }, async (response) => {
        if (!response?.grades) { alert('Nenhuma nota para enviar.'); return; }
        try {
            const res = await fetch(`${motorUrl}/api/grades/proof`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    sessionCode: sessionState.sessionCode,
                    maxGrade: sessionState.maxGrade,
                    passingGrade: sessionState.passingGrade,
                    grades: response.grades,
                }),
            });
            const data = await res.json();
            if (res.ok) alert('✓ Notas enviadas ao Scholar com sucesso!');
            else alert(`Erro: ${data.message || 'Falha ao enviar.'}`);
        } catch (err) {
            alert('Erro de conexão ao enviar para o Scholar.');
        }
    });
});

// ===== TEMAS =====
themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const theme = btn.dataset.theme;
        socket.emit('changeTheme', { sessionCode: sessionState.sessionCode, theme });
    });
});

// ===== AÇÕES GERAIS =====
endSessionBtn?.addEventListener('click', () => {
    if (confirm('Encerrar a sessão? Todos os alunos serão desconectados.'))
        socket.emit('endSession', { sessionCode: sessionState.sessionCode });
});

toggleAudienceUrlBtn?.addEventListener('click', () => {
    socket.emit('toggleAudienceUrl', { sessionCode: sessionState.sessionCode });
});

document.getElementById('reset-all-btn')?.addEventListener('click', () => {
    if (confirm('Reiniciar o progresso de TODOS os alunos?'))
        socket.emit('resetAllUsersProgress', { sessionCode: sessionState.sessionCode });
});

// ===== SOCKET EVENTS =====
socket.on('connect', () => {
    if (!sessionCode || !sessionPass) {
        if (loginFeedback) loginFeedback.innerText = 'Dados de sessão não encontrados.';
        return;
    }
    socket.emit('joinAdminSession', { sessionCode, password: sessionPass, role: 'controller' });
});

socket.on('adminJoined', (data) => {
    sessionState.sessionCode = data.sessionCode;
    sessionState.questions = data.questions || [];
    sessionState.users = data.users || {};
    sessionState.maxGrade = data.maxGrade || 10;
    sessionState.passingGrade = data.passingGrade || 5;
    sessionState.isAudienceUrlVisible = data.isAudienceUrlVisible || false;

    if (sessionCodeDisplay) sessionCodeDisplay.textContent = data.sessionCode;

    if (loginSection) loginSection.style.display = 'none';
    if (mainSection) mainSection.style.display = 'block';

    handleTypeChange();
    renderUserLists();
    renderQuestionsList();
    applyTheme(data.theme || 'light');
    checkScholarAccess();

    if (sessionCode !== sessionState.sessionCode) {
        sessionStorage.setItem('proof_session_code', sessionState.sessionCode);
    }
});

socket.on('userListUpdated', (users) => {
    sessionState.users = users;
    renderUserLists();
});

socket.on('questionsUpdated', ({ questions }) => {
    sessionState.questions = questions;
    renderQuestionsList();
});

socket.on('questionCreated', ({ question }) => {
    sessionState.questions.push(question);
    renderQuestionsList();
});

socket.on('questionEdited', ({ question }) => {
    sessionState.questions = sessionState.questions.map(q => q.id === question.id ? question : q);
    renderQuestionsList();
});

socket.on('questionDeleted', ({ questionId }) => {
    sessionState.questions = sessionState.questions.filter(q => q.id !== questionId);
    renderQuestionsList();
});

socket.on('themeChanged', ({ theme }) => applyTheme(theme));

socket.on('audienceUrlToggled', ({ visible }) => {
    sessionState.isAudienceUrlVisible = visible;
    if (toggleAudienceUrlBtn)
        toggleAudienceUrlBtn.textContent = visible ? '🔒 Ocultar URL' : '🔗 Mostrar URL';
});

socket.on('gradeUpdate', ({ userId, finalGrade }) => {
    if (!sessionState.users[userId]) return;
    sessionState.users[userId].finalGrade = finalGrade;
    renderUserLists();
});

socket.on('error', (message) => {
    if (loginFeedback) loginFeedback.innerText = `Erro: ${message}`;
    alert(`Erro: ${message}`);
});

socket.on('sessionEnded', () => {
    alert('Sessão encerrada.');
    sessionStorage.removeItem('proof_session_code');
    sessionStorage.removeItem('proof_session_pass');
    sessionStorage.removeItem('proof_presenter_pass');
    window.location.href = '../index.html';
});

// ===== LOGIN MANUAL (fallback) =====
joinBtn?.addEventListener('click', () => {
    const code = sessionCodeInput?.value?.trim();
    const pass = controllerPassInput?.value?.trim();
    if (!code || !pass) { if (loginFeedback) loginFeedback.innerText = 'Preencha o código e a senha.'; return; }
    sessionStorage.setItem('proof_session_code', code);
    sessionStorage.setItem('proof_session_pass', pass);
    socket.emit('joinAdminSession', { sessionCode: code, password: pass, role: 'controller' });
});

// ===== QUIZ CLOUD UI INTEGRATION =====
if (window.QuizCloudUI) {
    QuizCloudUI.onQuestionsLoaded((questions) => {
        if (!questions?.length) return;
        socket.emit('importQuestions', { sessionCode: sessionState.sessionCode, questions });
    });
}
