// ===== CONSTANTES E CONFIGURAÇÃO =====
const socketUrl = 'https://profalexv-alexluza.onrender.com/mind';

const ROLES = {
    CONTROLLER: 'controller',
    PRESENTER: 'presenter',
};

const CONNECTION_STATUS = {
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    ERROR: 'error',
};

const SESSION_STORAGE_KEYS = {
    CODE: 'mind_session_code',
    CONTROLLER_PASS: 'mind_session_pass',
    PRESENTER_PASS: 'mind_presenter_pass',
};

// ===== MÓDULO DE UI =====
const UI = {
    elements: {},

    cacheElements() {
        this.elements = {
            pageTitle: document.getElementById('page-title'),
            errorMsg: document.getElementById('error-message'),
            connectionStatusBanner: document.getElementById('connection-status-banner'),
            connectionStatusText: document.getElementById('connection-status-text'),
            actionButtonsDiv: document.getElementById('action-buttons'),
            newSessionForm: document.getElementById('new-session-form'),
            joinSessionForm: document.getElementById('join-session-form'),
            createSessionMainBtn: document.getElementById('create-session-main-btn'),
            joinSessionMainBtn: document.getElementById('join-session-main-btn'),
            backToIndexBtn: document.getElementById('back-to-index-btn'),
            loadFromFileBtn: document.getElementById('load-session-from-file-btn'),
            loadSessionInput: document.getElementById('load-session-input'),
            createSessionBtn: document.getElementById('create-session-btn'),
            newControllerPassInput: document.getElementById('new-controller-pass'),
            newPresenterPassInput: document.getElementById('new-presenter-pass'),
            repeatControllerPassCheckbox: document.getElementById('repeat-controller-pass'),
            deadlineInput: document.getElementById('session-deadline'),
            sessionThemeInput: document.getElementById('session-theme'),
            joinSessionBtn: document.getElementById('join-session-btn'),
            joinSessionCodeInput: document.getElementById('join-session-code'),
            joinSessionPassInput: document.getElementById('join-session-pass'),
            backToMenuBtns: document.querySelectorAll('.back-to-menu-btn'),
        };
    },

    clearError() {
        if (this.elements.errorMsg) {
            this.elements.errorMsg.innerText = '';
            this.elements.errorMsg.style.display = 'none';
        }
    },

    showError(message) {
        if (this.elements.errorMsg) {
            this.elements.errorMsg.innerText = message;
            this.elements.errorMsg.style.display = 'block';
        }
    },

    setConnectionStatus(status, message) {
        const { connectionStatusBanner, connectionStatusText, createSessionMainBtn, joinSessionMainBtn } = this.elements;
        if (!connectionStatusBanner || !connectionStatusText) return;

        const buttonsToDisable = [createSessionMainBtn, joinSessionMainBtn];

        connectionStatusBanner.classList.remove('error', 'visible');

        switch (status) {
            case CONNECTION_STATUS.CONNECTING:
                connectionStatusBanner.classList.add('visible');
                connectionStatusText.innerText = message || 'Conectando ao servidor...';
                buttonsToDisable.forEach(btn => btn && (btn.disabled = true));
                break;
            case CONNECTION_STATUS.CONNECTED:
                buttonsToDisable.forEach(btn => btn && (btn.disabled = false));
                break;
            case CONNECTION_STATUS.ERROR:
                connectionStatusBanner.classList.add('error', 'visible');
                connectionStatusText.innerText = message || 'Falha na conexão.';
                buttonsToDisable.forEach(btn => btn && (btn.disabled = true));
                break;
        }
    },

    showMainMenu() {
        this.elements.actionButtonsDiv.classList.add('active');
        this.elements.newSessionForm.classList.remove('active');
        this.elements.joinSessionForm.classList.remove('active');
        this.clearError();
        
        // Resetar formulários para o estado inicial
        this.elements.newSessionForm.reset();
        this.elements.joinSessionForm.reset();
        
        if (this.elements.sessionThemeInput) this.elements.sessionThemeInput.value = 'light';
        if (this.elements.repeatControllerPassCheckbox) this.elements.repeatControllerPassCheckbox.checked = true;
        
        this.handlePresenterPassCheckboxes();
        AdminApp.questionsToImport = []; // Limpa perguntas importadas
    },

    handlePresenterPassCheckboxes() {
        const { newPresenterPassInput, repeatControllerPassCheckbox } = this.elements;
        const presenterInputGroup = newPresenterPassInput?.closest('.form-group');
        if (!presenterInputGroup || !repeatControllerPassCheckbox) return;

        const useSamePassword = repeatControllerPassCheckbox.checked;
        newPresenterPassInput.disabled = useSamePassword;
        newPresenterPassInput.required = !useSamePassword;
        presenterInputGroup.style.display = useSamePassword ? 'none' : 'block';
        if (useSamePassword) {
            newPresenterPassInput.value = '';
        }
    },

    /**
     * Define o estado de carregamento de um botão, adicionando um spinner e desabilitando-o.
     * @param {HTMLButtonElement} button - O elemento do botão a ser modificado.
     * @param {boolean} isLoading - True para ativar o estado de carregamento, false para desativar.
     * @param {string} [loadingText='Processando...'] - O texto a ser exibido ao lado do spinner.
     */
    setButtonLoadingState(button, isLoading, loadingText = 'Processando...') {
        if (!button) return;

        if (isLoading) {
            // Armazena o texto original para restauração, caso ainda não tenha sido armazenado.
            button.dataset.originalText = button.innerHTML;
            button.disabled = true;
            button.innerHTML = `<span class="spinner"></span> ${loadingText}`;
        } else {
            // Restaura o texto original e reabilita o botão.
            if (button.dataset.originalText) {
                button.innerHTML = button.dataset.originalText;
            }
            button.disabled = false;
        }
    }
};

// ===== MÓDULO DE SOCKET =====
const SocketClient = {
    socket: null,

    initialize() {
        const socketOptions = {
            transports: ['websocket', 'polling'],
            withCredentials: true,
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5
        };
        this.socket = io(socketUrl, socketOptions);
        this.bindEvents();
        UI.setConnectionStatus(CONNECTION_STATUS.CONNECTING);
    },

    bindEvents() {
        this.socket.on('connect', () => {
            console.log('✅ Conectado ao servidor');
            UI.clearError();
            UI.setConnectionStatus(CONNECTION_STATUS.CONNECTED);
        });

        this.socket.on('connect_error', (error) => {
            console.error('❌ Erro de conexão:', error);
            UI.showError('Não foi possível conectar ao servidor. Verifique a internet e tente novamente.');
            UI.setConnectionStatus(CONNECTION_STATUS.ERROR, 'Falha na conexão. Tentando reconectar...');
        });

        this.socket.on('disconnect', (reason) => {
            console.warn('⚠️  Desconectado do servidor:', reason);
            if (reason !== 'io client disconnect') {
                UI.setConnectionStatus(CONNECTION_STATUS.CONNECTING, 'Conexão perdida. Reconectando...');
            }
        });
    },

    emit(event, payload, callback) {
        this.socket.emit(event, payload, callback);
    },

    /**
     * Emite um evento e retorna uma Promise que resolve ou rejeita com a resposta do servidor.
     * Utiliza o método .timeout() do Socket.IO para evitar que a aplicação fique travada.
     * @param {string} event O nome do evento.
     * @param {object} payload Os dados a serem enviados.
     * @param {number} [timeout=10000] Duração em ms antes de rejeitar a Promise por timeout.
     * @returns {Promise<object>} A resposta do servidor.
     */
    emitAsync(event, payload, timeout = 10000) {
        return new Promise((resolve, reject) => {
            // O método .timeout() é nativo do Socket.IO v3+
            this.socket.timeout(timeout).emit(event, payload, (err, response) => {
                if (err) {
                    // Este bloco é executado em caso de timeout
                    return reject(new Error('O servidor não respondeu a tempo. Tente novamente.'));
                }
                
                if (response && response.success) {
                    resolve(response);
                } else {
                    // Rejeita a promise com a mensagem de erro do servidor ou uma mensagem genérica
                    reject(new Error(response?.message || `Ocorreu um erro inesperado no evento '${event}'.`));
                }
            });
        });
    },
};

// ===== LÓGICA PRINCIPAL DA APLICAÇÃO =====
const AdminApp = {
    role: null,
    questionsToImport: [],

    init() {
        const params = new URLSearchParams(window.location.search);
        this.role = params.get('role');

        UI.cacheElements();
        this.setupInitialUI();
        this.bindEvents();
        SocketClient.initialize();
        UI.handlePresenterPassCheckboxes();
    },

    setupInitialUI() {
        const { pageTitle, actionButtonsDiv, newSessionForm, joinSessionForm } = UI.elements;

        if (!this.role || this.role === ROLES.CONTROLLER) {
            pageTitle.innerText = 'Acesso Administrativo';
            actionButtonsDiv.classList.add('active');
        } else if (this.role === ROLES.PRESENTER) {
            pageTitle.innerText = `Acesso: ${this.role.charAt(0).toUpperCase() + this.role.slice(1)}`;
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
                }, { once: true }); // Evita múltiplos listeners se a UI for re-renderizada
            }
        } else {
            pageTitle.innerText = 'Erro de Acesso';
            UI.showError(`Função (role) "${this.role}" é inválida.`);
            actionButtonsDiv.style.display = 'none';
            newSessionForm.style.display = 'none';
            joinSessionForm.style.display = 'none';
        }
    },

    bindEvents() {
        const {
            createSessionMainBtn, joinSessionMainBtn, backToIndexBtn, backToMenuBtns,
            repeatControllerPassCheckbox, loadFromFileBtn, loadSessionInput,
            createSessionBtn, joinSessionBtn
        } = UI.elements;

        createSessionMainBtn?.addEventListener('click', () => {
            UI.elements.actionButtonsDiv.classList.remove('active');
            UI.elements.newSessionForm.classList.add('active');
            UI.clearError();
            UI.elements.newControllerPassInput.focus();
        });

        joinSessionMainBtn?.addEventListener('click', () => {
            UI.elements.actionButtonsDiv.classList.remove('active');
            UI.elements.joinSessionForm.classList.add('active');
            UI.clearError();
            UI.elements.joinSessionCodeInput.focus();
        });

        backToIndexBtn?.addEventListener('click', () => {
            window.location.href = '../index.html';
        });

        backToMenuBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                UI.showMainMenu();
            });
        });

        repeatControllerPassCheckbox?.addEventListener('change', () => UI.handlePresenterPassCheckboxes());
        loadFromFileBtn?.addEventListener('click', () => loadSessionInput.click());
        loadSessionInput?.addEventListener('change', (e) => this.handleFileLoad(e));
        createSessionBtn?.addEventListener('click', () => this.handleCreateSession());
        joinSessionBtn?.addEventListener('click', () => this.handleJoinSession());
    },

    handleFileLoad(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (data.sessionSettings) {
                    const { theme, controllerPassword, presenterPassword } = data.sessionSettings;
                    const { sessionThemeInput, newControllerPassInput, newPresenterPassInput } = UI.elements;
                    if (theme) sessionThemeInput.value = theme;
                    if (controllerPassword) newControllerPassInput.value = controllerPassword;
                    if (presenterPassword) {
                        newPresenterPassInput.value = presenterPassword;
                        UI.elements.repeatControllerPassCheckbox.checked = false;
                        UI.handlePresenterPassCheckboxes();
                    }
                }
                if (data.questions && Array.isArray(data.questions)) {
                    this.questionsToImport = data.questions;
                    alert(`${this.questionsToImport.length} pergunta(s) carregada(s) e prontas para serem incluídas na nova sessão.`);
                } else {
                    this.questionsToImport = [];
                }
            } catch (error) {
                UI.showError('Erro ao processar o arquivo. Verifique se é um JSON válido.');
                this.questionsToImport = [];
            } finally {
                UI.elements.loadSessionInput.value = '';
            }
        };
        reader.onerror = () => {
            UI.showError('Não foi possível ler o arquivo.');
            UI.elements.loadSessionInput.value = '';
        };
        reader.readAsText(file);
    },

    async handleCreateSession() {
        const {
            newControllerPassInput, newPresenterPassInput, repeatControllerPassCheckbox,
            sessionThemeInput, deadlineInput, createSessionBtn
        } = UI.elements;

        const controllerPassword = newControllerPassInput.value.trim();
        let presenterPassword = newPresenterPassInput.value.trim();
        const theme = sessionThemeInput ? sessionThemeInput.value : 'light';
        const deadlineValue = deadlineInput.value;
        const deadline = deadlineValue ? new Date(new Date().toDateString() + ' ' + deadlineValue).getTime() : null;

        UI.clearError();

        if (!controllerPassword || controllerPassword.length < 4) {
            UI.showError('A senha de Controller deve ter pelo menos 4 caracteres.');
            return;
        }

        if (!repeatControllerPassCheckbox.checked) {
            if (!presenterPassword || presenterPassword.length < 4) {
                UI.showError('A senha de Presenter deve ter pelo menos 4 caracteres.');
                return;
            }
        } else {
            presenterPassword = controllerPassword;
        }

        UI.setButtonLoadingState(createSessionBtn, true, 'Criando...');

        const payload = { controllerPassword, presenterPassword, deadline, theme, questions: this.questionsToImport };

        try {
            const response = await SocketClient.emitAsync('createSession', payload);
            
            this.questionsToImport = [];
            sessionStorage.setItem(SESSION_STORAGE_KEYS.CODE, response.sessionCode);
            sessionStorage.setItem(SESSION_STORAGE_KEYS.CONTROLLER_PASS, controllerPassword);
            sessionStorage.setItem(SESSION_STORAGE_KEYS.PRESENTER_PASS, presenterPassword);
            window.location.href = `controller.html?session=${response.sessionCode}`;
        } catch (error) {
            UI.showError(error.message);
        } finally {
            // Garante que o botão seja reativado mesmo se o redirecionamento falhar ou ocorrer um erro.
            UI.setButtonLoadingState(createSessionBtn, false);
        }
    },

    handleJoinSession() {
        const { joinSessionCodeInput, joinSessionPassInput, joinSessionBtn } = UI.elements;
        const sessionCode = joinSessionCodeInput.value.toUpperCase().trim();
        const password = joinSessionPassInput.value.trim();

        UI.clearError();

        if (!sessionCode || !password) {
            UI.showError('Código e senha são obrigatórios.');
            return;
        }

        // Ativa o estado de carregamento APÓS a validação inicial.
        UI.setButtonLoadingState(joinSessionBtn, true, 'Entrando...');

        const roleToJoin = this.role || ROLES.CONTROLLER;
        sessionStorage.setItem(SESSION_STORAGE_KEYS.CODE, sessionCode);
        if (roleToJoin === ROLES.PRESENTER) {
            sessionStorage.setItem(SESSION_STORAGE_KEYS.PRESENTER_PASS, password);
        } else {
            sessionStorage.setItem(SESSION_STORAGE_KEYS.CONTROLLER_PASS, password);
        }

        const targetPage = roleToJoin === ROLES.CONTROLLER ? 'controller' : roleToJoin;
        window.location.href = `${targetPage}.html?session=${sessionCode}`;

        // Adiciona um fallback para reativar o botão caso a navegação falhe por algum motivo (ex: bloqueador de pop-up).
        setTimeout(() => {
            UI.setButtonLoadingState(joinSessionBtn, false);
        }, 3000);
    }
};

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', () => {
    AdminApp.init();

    // --- INTEGRAÇÃO PREMIUM: NUVEM ---
    if (window.QuizCloudUI) {
        QuizCloudUI.onQuestionsLoaded((questions, title) => {
            if (!questions || questions.length === 0) return;
            AdminApp.questionsToImport = questions;
            const titleMsg = title ? ` "${title}"` : '';
            alert(`${AdminApp.questionsToImport.length} pergunta(s) do questionário${titleMsg} carregada(s) e prontas para a nova sessão.`);
        });
    }
});
