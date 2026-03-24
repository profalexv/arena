// ===== CONFIGURAÇÃO DE SOCKET.IO =====
const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const socketUrl = isDevelopment ? 'http://localhost:3000/quest' : 'https://profalexv-alexluza.onrender.com/quest';
const socket = io(socketUrl, {
    transports: ['websocket', 'polling'],
    withCredentials: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5
});

const params = new URLSearchParams(window.location.search);
const role = params.get('role');
let questionsToImport = [];

// ===== ELEMENTOS DO DOM =====
const pageTitle = document.getElementById('page-title');
const errorMsg = document.getElementById('error-message');
const connectionStatusBanner = document.getElementById('connection-status-banner');
const connectionStatusText = document.getElementById('connection-status-text');
const actionButtonsDiv = document.getElementById('action-buttons');
const newSessionForm = document.getElementById('new-session-form');
const joinSessionForm = document.getElementById('join-session-form');
const createSessionMainBtn = document.getElementById('create-session-main-btn');
const joinSessionMainBtn = document.getElementById('join-session-main-btn');
const backToIndexBtn = document.getElementById('back-to-index-btn');
const loadFromFileBtn = document.getElementById('load-session-from-file-btn');
const loadSessionInput = document.getElementById('load-session-input');
const createSessionBtn = document.getElementById('create-session-btn');
const newControllerPassInput = document.getElementById('new-controller-pass');
const newPresenterPassInput = document.getElementById('new-presenter-pass');
const repeatControllerPassCheckbox = document.getElementById('repeat-controller-pass');
const noPresenterPassCheckbox = document.getElementById('no-presenter-pass');
const deadlineInput = document.getElementById('session-deadline');
const sessionThemeInput = document.getElementById('session-theme');
const maxGradeInput = document.getElementById('max-grade');
const passingGradeInput = document.getElementById('passing-grade');
const joinSessionBtn = document.getElementById('join-session-btn');
const joinSessionCodeInput = document.getElementById('join-session-code');
const joinSessionPassInput = document.getElementById('join-session-pass');
const backToMenuBtns = document.querySelectorAll('.back-to-menu-btn');

// ===== HELPERS =====
function clearError() {
    errorMsg.innerText = '';
    errorMsg.style.display = 'none';
}

function showError(message) {
    errorMsg.innerText = message;
    errorMsg.style.display = 'block';
}

function setConnectionStatus(status, message) {
    if (!connectionStatusBanner || !connectionStatusText) return;
    const buttons = [createSessionMainBtn, joinSessionMainBtn];
    switch (status) {
        case 'connecting':
            connectionStatusBanner.classList.remove('error');
            connectionStatusBanner.classList.add('visible');
            connectionStatusText.innerText = message || 'Conectando ao servidor...';
            buttons.forEach(btn => btn && (btn.disabled = true));
            break;
        case 'connected':
            connectionStatusBanner.classList.remove('visible');
            buttons.forEach(btn => btn && (btn.disabled = false));
            break;
        case 'error':
            connectionStatusBanner.classList.add('error', 'visible');
            connectionStatusText.innerText = message || 'Falha na conexão.';
            buttons.forEach(btn => btn && (btn.disabled = true));
            break;
    }
}

function showMainMenu() {
    actionButtonsDiv.classList.add('active');
    newSessionForm.classList.remove('active');
    joinSessionForm.classList.remove('active');
    clearError();
    newControllerPassInput.value = '';
    newPresenterPassInput.value = '';
    if (deadlineInput) deadlineInput.value = '';
    if (sessionThemeInput) sessionThemeInput.value = 'light';
    if (maxGradeInput) maxGradeInput.value = '10';
    if (passingGradeInput) passingGradeInput.value = '5';
    joinSessionCodeInput.value = '';
    joinSessionPassInput.value = '';
    questionsToImport = [];
}

// ===== CONFIGURAÇÃO INICIAL DA UI =====
if (!role || role === 'controller') {
    pageTitle.innerText = 'Acesso do Instrutor';
    actionButtonsDiv.classList.add('active');
} else if (role === 'presenter') {
    pageTitle.innerText = 'Acesso: Projeção';
    actionButtonsDiv.style.display = 'none';
    newSessionForm.style.display = 'none';
    joinSessionForm.classList.add('active');
    const presenterBackBtn = joinSessionForm.querySelector('.back-to-menu-btn');
    if (presenterBackBtn) {
        presenterBackBtn.innerText = 'Cancelar';
        presenterBackBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = '../index.html';
        });
    }
} else {
    pageTitle.innerText = 'Erro de Acesso';
    showError(`Função "${role}" é inválida.`);
    actionButtonsDiv.style.display = 'none';
    newSessionForm.style.display = 'none';
    joinSessionForm.style.display = 'none';
}

// ===== EVENT LISTENERS =====
createSessionMainBtn?.addEventListener('click', () => {
    actionButtonsDiv.classList.remove('active');
    newSessionForm.classList.add('active');
    clearError();
    newControllerPassInput.focus();
});

joinSessionMainBtn?.addEventListener('click', () => {
    actionButtonsDiv.classList.remove('active');
    joinSessionForm.classList.add('active');
    clearError();
    joinSessionCodeInput.focus();
});

backToIndexBtn.addEventListener('click', () => { window.location.href = '../index.html'; });

function handlePresenterPassCheckboxes() {
    const presenterInputGroup = newPresenterPassInput.closest('.form-group');
    if (!presenterInputGroup) return;
    if (repeatControllerPassCheckbox.checked || noPresenterPassCheckbox.checked) {
        newPresenterPassInput.disabled = true;
        newPresenterPassInput.required = false;
        presenterInputGroup.style.display = 'none';
    } else {
        newPresenterPassInput.disabled = false;
        newPresenterPassInput.required = true;
        presenterInputGroup.style.display = 'block';
    }
}

repeatControllerPassCheckbox?.addEventListener('change', () => {
    if (repeatControllerPassCheckbox.checked) noPresenterPassCheckbox.checked = false;
    handlePresenterPassCheckboxes();
});
noPresenterPassCheckbox?.addEventListener('change', () => {
    if (noPresenterPassCheckbox.checked) repeatControllerPassCheckbox.checked = false;
    handlePresenterPassCheckboxes();
});

loadFromFileBtn?.addEventListener('click', () => loadSessionInput.click());

loadSessionInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            const loaded = data.questions || data;
            if (Array.isArray(loaded)) {
                questionsToImport = loaded;
                alert(`${questionsToImport.length} pergunta(s) carregada(s) e pronta(s) para a nova avaliação.`);
            } else {
                questionsToImport = [];
                throw new Error('O arquivo não contém um array de perguntas válido.');
            }
            if (data.sessionSettings?.theme && sessionThemeInput)
                sessionThemeInput.value = data.sessionSettings.theme;
        } catch (error) {
            showError('Erro ao processar o arquivo: ' + error.message);
            questionsToImport = [];
        } finally {
            loadSessionInput.value = '';
        }
    };
    reader.onerror = () => { showError('Não foi possível ler o arquivo.'); loadSessionInput.value = ''; };
    reader.readAsText(file);
});

backToMenuBtns.forEach(btn => btn.addEventListener('click', (e) => { e.preventDefault(); showMainMenu(); }));

createSessionBtn?.addEventListener('click', () => {
    const controllerPassword = newControllerPassInput.value.trim();
    const presenterPassword = newPresenterPassInput.value.trim();
    const repeatControllerPass = repeatControllerPassCheckbox.checked;
    const noPresenterPass = noPresenterPassCheckbox.checked;
    const theme = sessionThemeInput ? sessionThemeInput.value : 'light';
    const deadlineValue = deadlineInput?.value;
    const deadline = deadlineValue ? new Date(new Date().toDateString() + ' ' + deadlineValue).getTime() : null;
    const maxGrade = parseFloat(maxGradeInput?.value) || 10;
    const passingGrade = parseFloat(passingGradeInput?.value) || 5;

    clearError();

    if (!controllerPassword || controllerPassword.length < 4) {
        showError('A senha do painel de controle deve ter pelo menos 4 caracteres.');
        return;
    }
    if (!repeatControllerPass && !noPresenterPass) {
        if (!presenterPassword || presenterPassword.length < 4) {
            showError('A senha de projeção é obrigatória ou marque uma das opções.');
            return;
        }
    }

    createSessionBtn.disabled = true;
    createSessionBtn.innerText = 'Criando...';

    const payload = {
        controllerPassword, presenterPassword, deadline, theme,
        repeatControllerPass, noPresenterPass,
        maxGrade, passingGrade,
        questions: questionsToImport
    };

    socket.emit('createSession', payload, (response) => {
        createSessionBtn.disabled = false;
        createSessionBtn.innerText = 'Criar e Entrar';

        if (response.success) {
            questionsToImport = [];
            sessionStorage.setItem('quest_session_code', response.sessionCode);
            sessionStorage.setItem('quest_session_pass', controllerPassword);

            let presenterPassForStorage = '';
            if (repeatControllerPass) presenterPassForStorage = controllerPassword;
            else if (!noPresenterPass) presenterPassForStorage = presenterPassword;
            sessionStorage.setItem('quest_presenter_pass', presenterPassForStorage);

            window.location.href = `controller.html?session=${response.sessionCode}`;
        } else {
            showError(response.message || 'Ocorreu um erro ao criar a avaliação.');
        }
    });
});

joinSessionBtn?.addEventListener('click', () => {
    const sessionCode = joinSessionCodeInput.value.toUpperCase().trim();
    const password = joinSessionPassInput.value.trim();
    clearError();

    if (!sessionCode) { showError('O código da avaliação é obrigatório.'); return; }
    if (role !== 'presenter' && !password) { showError('A senha é obrigatória.'); return; }

    const roleToJoin = role || 'controller';
    sessionStorage.setItem('quest_session_code', sessionCode);
    if (roleToJoin === 'presenter') {
        sessionStorage.setItem('quest_presenter_pass', password);
    } else {
        sessionStorage.setItem('quest_session_pass', password);
    }

    const targetPage = roleToJoin === 'controller' ? 'controller' : roleToJoin;
    window.location.href = `${targetPage}.html?session=${sessionCode}`;
});

// ===== EVENTOS DE CONEXÃO =====
socket.on('connect', () => { clearError(); setConnectionStatus('connected'); });
socket.on('connect_error', (error) => {
    console.error('❌ Erro de conexão:', error);
    showError('Não foi possível conectar ao servidor.');
    setConnectionStatus('error', 'Falha na conexão. Tentando reconectar...');
});
socket.on('disconnect', (reason) => {
    if (reason !== 'io client disconnect')
        setConnectionStatus('connecting', 'Conexão perdida. Reconectando...');
});

document.addEventListener('DOMContentLoaded', handlePresenterPassCheckboxes);
setConnectionStatus('connecting');

// --- INTEGRAÇÃO PREMIUM: NUVEM ---
if (window.QuizCloudUI) {
    QuizCloudUI.onQuestionsLoaded((questions, title) => {
        if (!questions || questions.length === 0) return;
        questionsToImport = questions;
        const titleMsg = title ? ` "${title}"` : '';
        alert(`${questionsToImport.length} pergunta(s)${titleMsg} carregada(s) e prontas para a nova avaliação.`);
    });
}
