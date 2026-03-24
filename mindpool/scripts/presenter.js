const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// Conecta diretamente ao backend, usando o namespace '/mindpool'
const socketUrl = isDevelopment ? 'http://localhost:3000/mindpool' : 'https://profalexv-alexluza.onrender.com/mindpool';
const socketOptions = {
    transports: ['websocket', 'polling'],
    withCredentials: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5
};

const socket = io(socketUrl, socketOptions);

/**
 * Aplica um tema visual ao body, trocando a classe de tema.
 * @param {string} theme - O nome do tema (ex: 'light', 'dark', 'corporate').
 */
function applyTheme(theme = 'light') {
    console.log(`Aplicando tema: ${theme}`);
    const body = document.body;
    // Remove temas antigos para garantir que apenas um esteja ativo
    body.classList.remove('theme-light', 'theme-dark', 'theme-corporate', 'theme-fun', 'theme-sublime');
    body.classList.add(`theme-${theme}`);
}

function getPresenterPassword() {
    // 1. Verifica se uma senha temporária foi passada pela aba do Controller via localStorage.
    const tempPass = localStorage.getItem('mindpool_temp_pass');
    if (tempPass) {
        console.log('INFO: Senha temporária do controller encontrada, movendo para sessionStorage.');
        sessionStorage.setItem('mindpool_presenter_pass', tempPass);
        // Não removemos o item do localStorage para permitir que a prévia no controller
        // funcione de forma consistente mesmo após recarregar a página.
    }

    // 2. Retorna a senha do presenter do sessionStorage.
    // Ela foi definida pelo passo 1 ou por um login direto na página de admin.
    const password = sessionStorage.getItem('mindpool_presenter_pass');
    if (!password) {
        console.error('ERRO CRÍTICO: Nenhuma senha de presenter encontrada para autenticação.');
    }
    return password;
}

const sessionInfoContainer = document.getElementById('session-info-container');
const questionScreen = document.getElementById('question-screen');
const resultsContainer = document.getElementById('results-container');
const presenterTimerEl = document.getElementById('presenter-timer');
let currentTimer = null;
let currentQuestion = null; // Armazena a pergunta atual completa
let sessionDeadline = null;
let isShowAllMode = false;

// State for dynamic text results
const MAX_ANSWERS_ON_SCREEN = 40;
const renderedTextAnswers = new Map();


// Adiciona classes ao body para controle de estado e estilo
document.body.classList.add('presenter-page', 'state-waiting');

// 1. Configuração Inicial
const sessionCodeForDisplay = new URLSearchParams(window.location.search).get('session');
const sessionCodeDisplay = document.getElementById('session-code-display');
if (sessionCodeDisplay) sessionCodeDisplay.innerText = sessionCodeForDisplay;

const audienceUrl = `${window.location.origin}/pages/audience.html?session=${sessionCodeForDisplay}`;
const qrcodeContainer = document.getElementById("qrcode");
if (qrcodeContainer) {
    new QRCode(qrcodeContainer, {
        text: audienceUrl,
        width: 256,
        height: 256,
    });

    const audienceUrlDisplay = document.getElementById('audience-url-display');
    if (audienceUrlDisplay) {
        audienceUrlDisplay.innerText = audienceUrl.replace(/^https?:\/\//, '');
        audienceUrlDisplay.title = 'Clique para copiar o link';
        audienceUrlDisplay.addEventListener('click', () => {
            navigator.clipboard.writeText(audienceUrl).then(() => {
                const originalText = audienceUrlDisplay.innerText;
                audienceUrlDisplay.innerText = 'Copiado!';
                audienceUrlDisplay.style.cursor = 'default';
                setTimeout(() => {
                    audienceUrlDisplay.innerText = originalText;
                    audienceUrlDisplay.style.cursor = 'pointer';
                }, 2000);
            }).catch(err => console.error('Falha ao copiar o link: ', err));
        });
    }
}

function joinPresenterSession() {
    const sessionCode = new URLSearchParams(window.location.search).get('session');
    const sessionPassword = getPresenterPassword();

    if (!sessionPassword) {
        console.error('Falha na autenticação: senha não encontrada no sessionStorage ou localStorage.');
        alert('Erro de autenticação. A sessão pode ter expirado ou a senha não foi fornecida. Por favor, tente entrar novamente.');
        window.location.href = `admin.html?role=presenter`;
        return;
    }
    socket.emit('joinAdminSession', { sessionCode, password: sessionPassword, role: 'presenter' }, (response) => {        
        // Não remover a senha do sessionStorage para permitir que a re-autenticação em 'connect' funcione.

        if (!response.success) {
            alert(response.message);
            window.location.href = `admin.html?role=presenter`;
            return;
        }

        applyTheme(response.theme);
        isShowAllMode = response.showAllTextAnswers || false;
        // Ao entrar, verifica se a URL já deve estar visível
        if (response.isAudienceUrlVisible) {
            const audienceUrlDisplay = document.getElementById('audience-url-display');
            if (audienceUrlDisplay) {
                audienceUrlDisplay.style.display = 'block';
            }
        }
        // A lógica de deadline da sessão foi removida da tela do presenter para evitar confusão com o timer da pergunta.
    });
}

// 2. Ouvir por novas perguntas
socket.on('newQuestion', (question) => {
    currentQuestion = question; // Armazena a pergunta para uso posterior (ex: renderBarResults)
    // Para e limpa qualquer cronômetro anterior
    if (currentTimer) {
        currentTimer.stop();
        currentTimer = null;
    }
    // Limpa o estado das respostas de texto para a nova pergunta
    renderedTextAnswers.clear();

    if (presenterTimerEl) presenterTimerEl.style.display = 'none';

    document.body.classList.remove('state-waiting');
    document.body.classList.add('state-question');
    
    // Limpa os containers de resultado e prepara para a nova pergunta
    if (resultsContainer) {
        resultsContainer.innerHTML = '';
        resultsContainer.className = ''; // Reseta a classe para o padrão
    }

    const questionText = document.getElementById('question-text');
    if (questionText) questionText.innerText = question.text;

    const img = document.getElementById('question-image');
    if (img) {
        if (question.imageUrl) {
            img.src = question.imageUrl;
            img.style.display = 'block';
        } else {
            img.style.display = 'none';
        }
    }

    // Pre-renderiza as barras para perguntas de múltipla escolha
    if (question.questionType === 'options') {
        renderInitialBarResults(question.options);
    }

    // Inicia um novo cronômetro se a pergunta tiver um horário de término
    // e se estiver aceitando respostas (para não reativar em 'showResults')
    // Adicionamos a verificação 'question.timer' para garantir que o cronômetro só seja ativado se a pergunta atual o tiver.
    if (question.acceptingAnswers && question.timer && question.endTime) {
        if (presenterTimerEl) {
            presenterTimerEl.style.display = 'block';
            currentTimer = new Cronometro(question.endTime, presenterTimerEl, () => {
                console.log('Cronômetro do presenter terminou.');
            });
            currentTimer.start();
        }
    }
});

// 3. Ouvir por atualização de resultados
socket.on('updateResults', ({ results, questionType }) => {
    switch (questionType) {
        case 'options':
            updateBarResults(results);
            break;
        case 'yes_no':
            renderYesNoResults(results);
            break;
        default: // Text-based answers
            renderTextResults(results);
            break;
    }
});

/** Helper para gerar um número inteiro aleatório dentro de um intervalo */
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function renderInitialBarResults(options) {
    if (!resultsContainer) return;
    let html = '';
    options.forEach(option => {
        html += `
            <div class="result-bar-container" data-option-id="${option.id}">
                <span>${option.text}</span>
                <div class="result-bar-background">
                    <div class="result-bar" style="width: 0%;">
                        <span class="result-bar-label">0 (0%)</span>
                    </div>
                </div>
            </div>`;
    });
    resultsContainer.innerHTML = html;
}

function updateBarResults(results) {
    if (!resultsContainer) return;

    const totalVotes = Object.values(results).reduce((sum, count) => sum + count, 0);

    const barContainers = resultsContainer.querySelectorAll('.result-bar-container');

    barContainers.forEach((container, index) => {
        const optionId = container.dataset.optionId;
        if (!optionId) return;

        const count = results[optionId] || 0;
        const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;

        const bar = container.querySelector('.result-bar');
        const label = container.querySelector('.result-bar-label');

        if (bar) {
            // Adiciona um atraso escalonado para um efeito de animação mais agradável
            bar.style.transitionDelay = `${index * 50}ms`;
            bar.style.width = `${percentage}%`;
        }
        if (label) {
            label.innerText = `${count} (${percentage}%)`;
        }
    });
}

function renderTextResults(results) {
    if (!resultsContainer) return;

    if (isShowAllMode) {
        // --- MODO LISTA COM SCROLL ---
        if (!resultsContainer.classList.contains('show-all-mode')) {
            resultsContainer.innerHTML = '';
            renderedTextAnswers.clear(); // Limpa o mapa da nuvem
            resultsContainer.className = 'text-results-container show-all-mode';
        }
        
        const sortedAnswers = Object.entries(results).sort(([, countA], [, countB]) => countB - countA);
        
        // Ineficiente, mas simples e robusto: limpa e re-renderiza a lista ordenada a cada atualização
        resultsContainer.innerHTML = '';

        sortedAnswers.forEach(([answer, count]) => {
            const item = document.createElement('li');
            item.className = 'text-results-item style-default'; // Estilo simples de lista
            
            const answerText = document.createElement('span');
            answerText.innerText = answer;

            const answerCount = document.createElement('span');
            answerCount.className = 'text-results-count';
            answerCount.innerText = `x${count}`;
            answerCount.style.display = count > 1 ? 'inline-block' : 'none';
            
            item.append(answerText, answerCount);
            resultsContainer.appendChild(item);
        });
        return; // Termina aqui para o modo lista
    }

    // --- MODO NUVEM DE PALAVRAS DINÂMICA ---
    if (resultsContainer.classList.contains('show-all-mode')) {
        resultsContainer.innerHTML = '';
        resultsContainer.className = 'text-results-container';
    }

    for (const [answer, count] of Object.entries(results)) {
        if (renderedTextAnswers.has(answer)) {
            const element = renderedTextAnswers.get(answer);
            const countEl = element.querySelector('.text-results-count');
            const currentCount = parseInt(countEl.dataset.count, 10);

            if (count > currentCount) {
                countEl.innerText = `x${count}`;
                countEl.dataset.count = count;
                countEl.style.display = 'inline-block';
                element.classList.add('updated');
                setTimeout(() => element.classList.remove('updated'), 500);
            }
        } else {
            if (renderedTextAnswers.size >= MAX_ANSWERS_ON_SCREEN) {
                const oldestAnswerKey = renderedTextAnswers.keys().next().value;
                const oldestElement = renderedTextAnswers.get(oldestAnswerKey);
                if (oldestElement) {
                    oldestElement.classList.add('fading-out');
                    setTimeout(() => { oldestElement.remove(); }, 500);
                }
                renderedTextAnswers.delete(oldestAnswerKey);
            }

            const item = document.createElement('li');
            item.className = 'text-results-item';
            const styles = ['style-default', 'style-color-1', 'style-color-2', 'style-color-3', 'style-color-4'];
            const sizes = ['size-small', 'size-medium', 'size-large'];
            item.classList.add(styles[getRandomInt(0, styles.length - 1)]);
            item.classList.add(sizes[getRandomInt(0, sizes.length - 1)]);
            if (Math.random() < 0.15) item.classList.add('style-bubble');
            else if (Math.random() < 0.10) item.classList.add('style-vertical');
            const rotation = getRandomInt(-15, 15);
            item.style.setProperty('--rotation', `${rotation}deg`);
            const answerText = document.createElement('span');
            answerText.innerText = answer;
            const answerCount = document.createElement('span');
            answerCount.className = 'text-results-count';
            answerCount.innerText = `x${count}`;
            answerCount.dataset.count = count;
            answerCount.style.display = count > 1 ? 'inline-block' : 'none';
            item.append(answerText, answerCount);
            resultsContainer.appendChild(item);
            const itemWidth = item.offsetWidth;
            const itemHeight = item.offsetHeight;
            const containerWidth = resultsContainer.offsetWidth;
            const containerHeight = resultsContainer.offsetHeight;
            const x = getRandomInt(0, Math.max(0, containerWidth - itemWidth));
            const y = getRandomInt(0, Math.max(0, containerHeight - itemHeight));
            item.style.left = `${x}px`;
            item.style.top = `${y}px`;
            renderedTextAnswers.set(answer, item);
        }
    }
}

function renderYesNoResults(results) {
    if (!resultsContainer) return;
    resultsContainer.innerHTML = `
        <div class="yes-no-results">
            <div class="result-option"><span class="label">Sim</span>👍<span class="count">${results.yes || 0}</span></div>
            <div class="result-option"><span class="label">Não</span>👎<span class="count">${results.no || 0}</span></div>
        </div>
    `;
}

socket.on('themeChanged', ({ theme }) => {
    console.log(`Recebido evento de mudança de tema: ${theme}`);
    applyTheme(theme);
});

// Ouve por mudanças na visibilidade da URL
socket.on('audienceUrlVisibilityChanged', ({ visible }) => {
    const audienceUrlDisplay = document.getElementById('audience-url-display');
    if (audienceUrlDisplay) {
        audienceUrlDisplay.style.display = visible ? 'block' : 'none';
    }
});

socket.on('showAllTextAnswersToggled', ({ showAll }) => {
    isShowAllMode = showAll;
    // Re-renderiza a pergunta atual se for de texto para aplicar o novo modo
    if (currentQuestion && ['short_text', 'long_text', 'number', 'integer'].includes(currentQuestion.questionType)) {
        // Limpa o container e re-renderiza do zero
        resultsContainer.innerHTML = '';
        renderedTextAnswers.clear();
        renderTextResults(currentQuestion.results || {});
    }
});

socket.on('error', (message) => alert(message));
socket.on('sessionEnded', (message) => {
    alert(message);
    document.body.classList.remove('state-question', 'state-waiting');
    window.location.href = '../index.html';
});

socket.on('connect_error', (error) => {
    console.error('❌ Erro de conexão com o Presenter:', error);
});

socket.on('disconnect', (reason) => {
    console.warn('⚠️ Presenter desconectado do servidor:', reason);
});

socket.on('connect', () => {
    console.log('✅ Conectado ao servidor. Autenticando presenter...');
    joinPresenterSession();
});