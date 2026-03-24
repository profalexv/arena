// ===== PRESENTER DO PROOF =====
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

const sessionCode = sessionStorage.getItem('proof_session_code');
const presenterPass = sessionStorage.getItem('proof_presenter_pass');
const sessionPass = sessionStorage.getItem('proof_session_pass');

let presenterState = {
    users: {},
    questions: [],
    maxGrade: 10,
    passingGrade: 5,
    sessionCode: '',
    theme: 'light',
};

// Elementos
const loginSection = document.getElementById('login-section');
const mainSection = document.getElementById('main-section');
const presenterPassInput = document.getElementById('presenter-pass-input');
const presenterCodeInput = document.getElementById('presenter-code-input');
const joinBtn = document.getElementById('join-presenter-btn');
const loginFeedback = document.getElementById('login-feedback');
const sessionCodeDisplay = document.getElementById('session-code-display');
const gradesDisplay = document.getElementById('grades-display');
const approvedList = document.getElementById('approved-list');
const failedList = document.getElementById('failed-list');
const approvedCount = document.getElementById('approved-count');
const failedCount = document.getElementById('failed-count');
const avgDisplay = document.getElementById('avg-display');
const pendingCount = document.getElementById('pending-count');

function applyTheme(theme = 'light') {
    document.body.classList.remove('theme-light', 'theme-dark', 'theme-corporate', 'theme-fun', 'theme-sublime', 'theme-neon');
    document.body.classList.add(`theme-${theme}`);
    presenterState.theme = theme;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderGradeDistribution() {
    const users = Object.values(presenterState.users).filter(u => u.status === 'approved');
    const finished = users.filter(u => u.finalGrade !== null && u.finalGrade !== undefined);
    const inProgress = users.filter(u => u.finalGrade === null || u.finalGrade === undefined);

    const getGrade = (u) => typeof u.finalGrade === 'object' ? u.finalGrade?.grade : u.finalGrade;
    const getPassed = (u) => typeof u.finalGrade === 'object' ? u.finalGrade?.passed : getGrade(u) >= presenterState.passingGrade;

    const approved = finished.filter(u => getPassed(u));
    const failed = finished.filter(u => !getPassed(u));

    const avg = finished.length > 0
        ? (finished.reduce((s, u) => s + (getGrade(u) || 0), 0) / finished.length).toFixed(1)
        : '—';

    if (approvedCount) approvedCount.textContent = approved.length;
    if (failedCount) failedCount.textContent = failed.length;
    if (avgDisplay) avgDisplay.textContent = avg;
    if (pendingCount) pendingCount.textContent = inProgress.length;

    if (approvedList) {
        approvedList.innerHTML = '';
        if (approved.length === 0) {
            approvedList.innerHTML = '<li class="empty-item">—</li>';
        } else {
            approved
                .sort((a, b) => getGrade(b) - getGrade(a))
                .forEach((u, idx) => {
                    const li = document.createElement('li');
                    li.className = 'grade-item approved-item';
                    li.innerHTML = `
                        <span class="rank-pos">${idx + 1}</span>
                        <span class="student-name">${escapeHtml(u.name)}</span>
                        <span class="grade-pill passed">${getGrade(u).toFixed(1)}</span>`;
                    approvedList.appendChild(li);
                });
        }
    }

    if (failedList) {
        failedList.innerHTML = '';
        if (failed.length === 0) {
            failedList.innerHTML = '<li class="empty-item">—</li>';
        } else {
            failed
                .sort((a, b) => getGrade(b) - getGrade(a))
                .forEach((u) => {
                    const li = document.createElement('li');
                    li.className = 'grade-item failed-item';
                    li.innerHTML = `
                        <span class="student-name">${escapeHtml(u.name)}</span>
                        <span class="grade-pill failed">${getGrade(u).toFixed(1)}</span>`;
                    failedList.appendChild(li);
                });
        }
    }
}

// ===== SOCKET EVENTS =====
socket.on('connect', () => {
    if (!sessionCode) return;
    const pass = presenterPass || sessionPass || '';
    socket.emit('joinAdminSession', { sessionCode, password: pass, role: 'presenter' });
});

socket.on('adminJoined', (data) => {
    presenterState.sessionCode = data.sessionCode;
    presenterState.users = data.users || {};
    presenterState.questions = data.questions || [];
    presenterState.maxGrade = data.maxGrade || 10;
    presenterState.passingGrade = data.passingGrade || 5;

    if (sessionCodeDisplay) sessionCodeDisplay.textContent = data.sessionCode;
    if (loginSection) loginSection.style.display = 'none';
    if (mainSection) mainSection.style.display = 'block';

    if (data.theme) applyTheme(data.theme);
    renderGradeDistribution();
});

socket.on('userListUpdated', (users) => {
    presenterState.users = users;
    renderGradeDistribution();
});

socket.on('themeChanged', ({ theme }) => applyTheme(theme));

socket.on('gradeUpdate', ({ userId, finalGrade }) => {
    if (!presenterState.users[userId]) return;
    presenterState.users[userId].finalGrade = finalGrade;
    renderGradeDistribution();
});

socket.on('error', (message) => {
    if (loginFeedback) loginFeedback.innerText = `Erro: ${message}`;
});

socket.on('sessionEnded', () => {
    alert('Sessão encerrada.');
    window.location.href = '../index.html';
});

// ===== LOGIN MANUAL =====
joinBtn?.addEventListener('click', () => {
    const code = presenterCodeInput?.value?.trim();
    const pass = presenterPassInput?.value?.trim();
    if (!code || !pass) { if (loginFeedback) loginFeedback.innerText = 'Preencha o código e a senha.'; return; }
    sessionStorage.setItem('proof_session_code', code);
    sessionStorage.setItem('proof_presenter_pass', pass);
    socket.emit('joinAdminSession', { sessionCode: code, password: pass, role: 'presenter' });
});
