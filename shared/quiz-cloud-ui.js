/**
 * quiz-cloud-ui.js
 *
 * Interface do usuário para o recurso Premium de Questionários na Nuvem.
 * Injeta automaticamente:
 *   1. Botão "☁ Nuvem" nos locais relevantes das páginas admin e controller.
 *   2. Modal de autenticação (login / cadastro).
 *   3. Modal de biblioteca (listar, salvar, carregar, excluir questionários).
 *
 * Dependência: /shared/quiz-cloud.js (carregar antes deste script).
 * window.QUIZ_APP_TYPE opcional: 'rush' | 'mind' | 'quest' (senão, infere pelo hostname).
 *
 * Expõe: window.QuizCloudUI
 *  - onQuestionsLoaded(fn) — registra callback chamado ao carregar questionário da nuvem
 *  - onSaveRequested(fn)   — registra callback para obter as perguntas atuais ao salvar
 *  - openLibrary()         — abre o modal de biblioteca
 *  - openAuth()            — abre o modal de login
 */

const QuizCloudUI = (() => {
    let _onQuestionsLoaded = null;
    let _onSaveRequested   = null;

    // ── Injetar CSS do modal ──────────────────────────────────
    function injectStyles() {
        if (document.getElementById('qc-styles')) return;
        const style = document.createElement('style');
        style.id = 'qc-styles';
        style.textContent = `
        /* ── Quiz Cloud UI ── */
        .qc-btn {
            background: linear-gradient(135deg, #6c63ff, #48a999);
            color: #fff;
            border: none;
            border-radius: 6px;
            padding: 6px 14px;
            font-size: 0.9rem;
            cursor: pointer;
            opacity: 0.95;
            transition: opacity 0.2s;
        }
        .qc-btn:hover { opacity: 1; }
        .qc-btn.logged-in { background: linear-gradient(135deg, #28a745, #1e7e34); }
        .qc-btn.secondary { background: rgba(108, 99, 255, 0.15); color: var(--primary-color, #6c63ff); border: 1px solid var(--primary-color, #6c63ff); }
        .qc-btn.danger { background: #dc3545; }
        .qc-btn:disabled { opacity: 0.5; cursor: default; }

        #qc-overlay {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.6);
            z-index: 9000;
            justify-content: center;
            align-items: center;
        }
        #qc-overlay.open { display: flex; }

        #qc-modal {
            background: var(--container-bg, #fff);
            color: var(--text-color, #212529);
            border-radius: 12px;
            width: 92%;
            max-width: 560px;
            max-height: 88vh;
            overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            padding: 24px;
            position: relative;
        }
        #qc-modal h2 { margin: 0 0 16px; font-size: 1.2rem; }
        #qc-modal h3 { margin: 0 0 10px; font-size: 1rem; color: var(--primary-color, #6c63ff); }
        #qc-close-btn {
            position: absolute;
            top: 12px;
            right: 16px;
            background: none;
            border: none;
            font-size: 1.4rem;
            cursor: pointer;
            color: var(--text-color, #555);
            line-height: 1;
        }
        .qc-tabs { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 2px solid var(--input-border, #eee); padding-bottom: 4px; }
        .qc-tab {
            background: none;
            border: none;
            padding: 6px 14px;
            cursor: pointer;
            border-radius: 6px 6px 0 0;
            font-size: 0.9rem;
            color: var(--text-color, #555);
        }
        .qc-tab.active { background: var(--primary-color, #6c63ff); color: #fff; }
        .qc-tab-panel { display: none; }
        .qc-tab-panel.active { display: block; }

        .qc-input { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid var(--input-border, #ccc); border-radius: 6px; background: var(--input-bg, #fff); color: var(--text-color, #212529); font-size: 0.95rem; margin-bottom: 10px; }
        .qc-msg { padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; margin-bottom: 10px; }
        .qc-msg.error   { background: rgba(220,53,69,0.15);  color: #dc3545; }
        .qc-msg.success { background: rgba(40,167,69,0.15);  color: #28a745; }
        .qc-msg.info    { background: rgba(108,99,255,0.12); color: var(--primary-color, #6c63ff); }

        .qc-list { list-style: none; padding: 0; margin: 0; }
        .qc-list-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 12px;
            border: 1px solid var(--input-border, #eee);
            border-radius: 8px;
            margin-bottom: 8px;
            gap: 10px;
        }
        .qc-list-item-info { flex: 1; min-width: 0; }
        .qc-list-item-title { font-weight: bold; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .qc-list-item-meta  { font-size: 0.8rem; color: #888; margin-top: 2px; }
        .qc-list-item-actions { display: flex; gap: 6px; flex-shrink: 0; }
        .qc-empty { color: #888; text-align: center; padding: 24px 0; font-size: 0.95rem; }

        .qc-premium-notice {
            border: 2px dashed var(--primary-color, #6c63ff);
            border-radius: 10px;
            padding: 20px;
            text-align: center;
        }
        .qc-premium-notice p { margin: 0 0 14px; font-size: 0.95rem; }
        .qc-price-tag { font-size: 1.4rem; font-weight: bold; color: var(--primary-color, #6c63ff); margin: 8px 0; }
        `;
        document.head.appendChild(style);
    }

    // ── Criar estrutura do modal ──────────────────────────────
    function createModal() {
        if (document.getElementById('qc-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'qc-overlay';
        overlay.innerHTML = `
        <div id="qc-modal" role="dialog" aria-modal="true" aria-labelledby="qc-modal-title">
            <button id="qc-close-btn" aria-label="Fechar">✕</button>
            <h2 id="qc-modal-title">☁ Questionários na Nuvem</h2>
            <div id="qc-authenticated-area">
                <div class="qc-tabs">
                    <button class="qc-tab active" data-tab="library">📚 Biblioteca</button>
                    <button class="qc-tab" data-tab="save">💾 Salvar Atual</button>
                    <button class="qc-tab" data-tab="account">👤 Conta</button>
                </div>
                <!-- Tab: Biblioteca -->
                <div class="qc-tab-panel active" id="qc-tab-library">
                    <div id="qc-lib-status"></div>
                    <button class="qc-btn" id="qc-refresh-btn" style="margin-bottom:12px;font-size:0.8rem;padding:4px 10px;">↻ Atualizar</button>
                    <ul class="qc-list" id="qc-list"></ul>
                </div>
                <!-- Tab: Salvar -->
                <div class="qc-tab-panel" id="qc-tab-save">
                    <div id="qc-save-status"></div>
                    <p style="font-size:0.9rem;color:#888;margin-top:0;">Salva as perguntas da sessão atual como um questionário reutilizável.</p>
                    <label style="font-size:0.9rem;display:block;margin-bottom:4px;">Título *</label>
                    <input type="text" id="qc-save-title" class="qc-input" placeholder="Ex: Revisão de Matemática Cap. 3" maxlength="120">
                    <label style="font-size:0.9rem;display:block;margin-bottom:4px;">Descrição (opcional)</label>
                    <input type="text" id="qc-save-description" class="qc-input" placeholder="Ex: 8º ano — Frações" maxlength="240">
                    <button class="qc-btn" id="qc-save-confirm-btn">☁ Salvar na Nuvem</button>
                </div>
                <!-- Tab: Conta -->
                <div class="qc-tab-panel" id="qc-tab-account">
                    <div id="qc-account-info"></div>
                </div>
            </div>
            <div id="qc-auth-area" style="display:none;">
                <p style="font-size:0.9rem;text-align:center;">Salve e reutilize seus questionários entre sessões. Gratuito para clientes do plano Syllabus. R$ 15/mês para demais usuários.</p>
                <div id="qc-auth-status"></div>
                <div id="qc-login-form">
                    <h3>Entrar</h3>
                    <input type="email" id="qc-email" class="qc-input" placeholder="E-mail" autocomplete="email">
                    <input type="password" id="qc-password" class="qc-input" placeholder="Senha" autocomplete="current-password">
                    <button class="qc-btn" id="qc-login-btn" style="width:100%;">Entrar</button>
                    <p style="text-align:center;font-size:0.85rem;margin-top:12px;">Não tem conta? <a href="#" id="qc-show-register" style="color:var(--primary-color,#6c63ff)">Criar conta gratuita</a></p>
                </div>
                <div id="qc-register-form" style="display:none;">
                    <h3>Criar conta</h3>
                    <input type="text"  id="qc-reg-name"     class="qc-input" placeholder="Seu nome (opcional)">
                    <input type="email" id="qc-reg-email"    class="qc-input" placeholder="E-mail *" autocomplete="email">
                    <input type="password" id="qc-reg-pass"  class="qc-input" placeholder="Senha (mínimo 6 caracteres) *" autocomplete="new-password">
                    <button class="qc-btn" id="qc-register-btn" style="width:100%;">Criar conta</button>
                    <p style="text-align:center;font-size:0.85rem;margin-top:12px;"><a href="#" id="qc-show-login" style="color:var(--primary-color,#6c63ff)">← Voltar para o login</a></p>
                </div>
            </div>
        </div>
        `;
        document.body.appendChild(overlay);

        // Fechar ao clicar fora do modal
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });
        document.getElementById('qc-close-btn').addEventListener('click', closeModal);

        // Tabs
        overlay.querySelectorAll('.qc-tab').forEach(tab => {
            tab.addEventListener('click', () => switchTab(tab.dataset.tab));
        });

        // Auth forms
        document.getElementById('qc-show-register').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('qc-login-form').style.display = 'none';
            document.getElementById('qc-register-form').style.display = 'block';
        });
        document.getElementById('qc-show-login').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('qc-register-form').style.display = 'none';
            document.getElementById('qc-login-form').style.display = 'block';
        });
        document.getElementById('qc-login-btn').addEventListener('click', handleLogin);
        document.getElementById('qc-register-btn').addEventListener('click', handleRegister);

        // Biblioteca
        document.getElementById('qc-refresh-btn').addEventListener('click', loadLibrary);

        // Salvar
        document.getElementById('qc-save-confirm-btn').addEventListener('click', handleSave);

        // Enter nos inputs de auth
        ['qc-email', 'qc-password'].forEach(id => {
            document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
        });
        ['qc-reg-name', 'qc-reg-email', 'qc-reg-pass'].forEach(id => {
            document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') handleRegister(); });
        });
    }

    // ── Helpers de UI ─────────────────────────────────────────

    function showMsg(containerId, msg, type = 'info') {
        const el = document.getElementById(containerId);
        if (!el) return;
        el.innerHTML = `<div class="qc-msg ${type}">${msg}</div>`;
    }

    function clearMsg(containerId) {
        const el = document.getElementById(containerId);
        if (el) el.innerHTML = '';
    }

    function switchTab(tab) {
        document.querySelectorAll('.qc-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        document.querySelectorAll('.qc-tab-panel').forEach(p => p.classList.toggle('active', p.id === `qc-tab-${tab}`));
        if (tab === 'library') loadLibrary();
        if (tab === 'account') renderAccountInfo();
    }

    function openModal() {
        document.getElementById('qc-overlay').classList.add('open');
        renderModalState();
    }

    function closeModal() {
        document.getElementById('qc-overlay').classList.remove('open');
    }

    function renderModalState() {
        const authArea = document.getElementById('qc-auth-area');
        const authedArea = document.getElementById('qc-authenticated-area');
        if (QuizCloud.isLoggedIn()) {
            authArea.style.display = 'none';
            authedArea.style.display = 'block';
            loadLibrary();
        } else {
            authArea.style.display = 'block';
            authedArea.style.display = 'none';
        }
        updateButtons();
    }

    function updateButtons() {
        document.querySelectorAll('.qc-cloud-open-btn').forEach(btn => {
            const user = QuizCloud.getUser();
            if (user) {
                btn.classList.add('logged-in');
                btn.title = `Nuvem: ${user.email}`;
                btn.textContent = '☁ Nuvem ✓';
            } else {
                btn.classList.remove('logged-in');
                btn.title = 'Biblioteca de Questionários na Nuvem';
                btn.textContent = '☁ Nuvem';
            }
        });
    }

    // ── Auth handlers ─────────────────────────────────────────

    async function handleLogin() {
        const email = document.getElementById('qc-email').value.trim();
        const pass  = document.getElementById('qc-password').value;
        if (!email || !pass) { showMsg('qc-auth-status', 'Preencha e-mail e senha.', 'error'); return; }
        const btn = document.getElementById('qc-login-btn');
        btn.disabled = true;
        btn.textContent = 'Entrando…';
        clearMsg('qc-auth-status');
        try {
            await QuizCloud.login(email, pass);
            renderModalState();
        } catch (err) {
            showMsg('qc-auth-status', err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Entrar';
        }
    }

    async function handleRegister() {
        const name  = document.getElementById('qc-reg-name').value.trim();
        const email = document.getElementById('qc-reg-email').value.trim();
        const pass  = document.getElementById('qc-reg-pass').value;
        if (!email || !pass) { showMsg('qc-auth-status', 'Preencha e-mail e senha.', 'error'); return; }
        const btn = document.getElementById('qc-register-btn');
        btn.disabled = true;
        btn.textContent = 'Criando conta…';
        clearMsg('qc-auth-status');
        try {
            await QuizCloud.register(email, pass, name || undefined);
            renderModalState();
        } catch (err) {
            showMsg('qc-auth-status', err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Criar conta';
        }
    }

    // ── Biblioteca ────────────────────────────────────────────

    async function loadLibrary() {
        const list = document.getElementById('qc-list');
        if (!list) return;
        list.innerHTML = '<li style="text-align:center;padding:16px;color:#888;">Carregando…</li>';
        clearMsg('qc-lib-status');
        try {
            const items = await QuizCloud.listQuestionnaires();
            renderLibraryList(items);
        } catch (err) {
            if (err.message.includes('403') || err.message.toLowerCase().includes('premium')) {
                renderUpgradePrompt();
            } else {
                showMsg('qc-lib-status', err.message, 'error');
                list.innerHTML = '';
            }
        }
    }

    function renderLibraryList(items) {
        const list = document.getElementById('qc-list');
        if (!items || items.length === 0) {
            list.innerHTML = '<li class="qc-empty">Nenhum questionário salvo ainda.<br>Use "Salvar Atual" para guardar as perguntas da sessão.</li>';
            return;
        }
        list.innerHTML = '';
        items.forEach(q => {
            const li = document.createElement('li');
            li.className = 'qc-list-item';
            const date = new Date(q.updated_at).toLocaleDateString('pt-BR');
            li.innerHTML = `
                <div class="qc-list-item-info">
                    <div class="qc-list-item-title" title="${escapeHtml(q.title)}">${escapeHtml(q.title)}</div>
                    <div class="qc-list-item-meta">${q.description ? escapeHtml(q.description) + ' · ' : ''}${date}</div>
                </div>
                <div class="qc-list-item-actions">
                    <button class="qc-btn" data-id="${q.id}" data-action="load" style="font-size:0.8rem;padding:4px 10px;">Carregar</button>
                    <button class="qc-btn danger" data-id="${q.id}" data-action="delete" style="font-size:0.8rem;padding:4px 10px;">✕</button>
                </div>
            `;
            list.appendChild(li);
        });

        list.querySelectorAll('[data-action="load"]').forEach(btn => {
            btn.addEventListener('click', () => handleLoad(btn.dataset.id, btn));
        });
        list.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', () => handleDelete(btn.dataset.id, btn));
        });
    }

    function renderUpgradePrompt() {
        const list = document.getElementById('qc-list');
        list.innerHTML = `
            <div class="qc-premium-notice">
                <p>Para salvar questionários na nuvem e acessá-los em qualquer sessão, ative o plano premium.</p>
                <div class="qc-price-tag">R$ 15,00 / mês</div>
                <p style="font-size:0.85rem;color:#888;">Professores com plano Syllabus têm acesso gratuito.</p>
                <button class="qc-btn" id="qc-upgrade-btn">Assinar agora</button>
            </div>
        `;
        document.getElementById('qc-upgrade-btn').addEventListener('click', handleUpgrade);
    }

    async function handleUpgrade() {
        const btn = document.getElementById('qc-upgrade-btn');
        btn.disabled = true;
        btn.textContent = 'Abrindo pagamento…';
        try {
            const pref = await QuizCloud.createPaymentPreference();
            window.open(pref.initPoint || pref.sandboxInitPoint, '_blank');
        } catch (err) {
            showMsg('qc-lib-status', err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Assinar agora';
        }
    }

    async function handleLoad(id, btn) {
        btn.disabled = true;
        btn.textContent = '…';
        try {
            const q = await QuizCloud.getQuestionnaire(id);
            if (typeof _onQuestionsLoaded === 'function') {
                _onQuestionsLoaded(q.questions, q.title);
                showMsg('qc-lib-status', `✓ "${escapeHtml(q.title)}" carregado na sessão.`, 'success');
                closeModal();
            }
        } catch (err) {
            showMsg('qc-lib-status', err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Carregar';
        }
    }

    async function handleDelete(id, btn) {
        if (!confirm('Excluir este questionário da nuvem?')) return;
        btn.disabled = true;
        try {
            await QuizCloud.deleteQuestionnaire(id);
            await loadLibrary();
        } catch (err) {
            showMsg('qc-lib-status', err.message, 'error');
            btn.disabled = false;
        }
    }

    // ── Salvar ────────────────────────────────────────────────

    async function handleSave() {
        const title = document.getElementById('qc-save-title').value.trim();
        const description = document.getElementById('qc-save-description').value.trim();
        if (!title) { showMsg('qc-save-status', 'Informe um título para o questionário.', 'error'); return; }

        let questions = [];
        if (typeof _onSaveRequested === 'function') {
            questions = _onSaveRequested();
        }
        if (!questions || questions.length === 0) {
            showMsg('qc-save-status', 'A sessão atual não possui perguntas para salvar.', 'error');
            return;
        }

        const btn = document.getElementById('qc-save-confirm-btn');
        btn.disabled = true;
        btn.textContent = 'Salvando…';
        clearMsg('qc-save-status');
        try {
            await QuizCloud.saveQuestionnaire({ title, description: description || undefined, questions });
            document.getElementById('qc-save-title').value = '';
            document.getElementById('qc-save-description').value = '';
            showMsg('qc-save-status', `✓ Questionário "${escapeHtml(title)}" salvo na nuvem!`, 'success');
        } catch (err) {
            if (err.message.includes('403') || err.message.toLowerCase().includes('premium')) {
                renderUpgradePrompt();
                switchTab('library');
            } else {
                showMsg('qc-save-status', err.message, 'error');
            }
        } finally {
            btn.disabled = false;
            btn.textContent = '☁ Salvar na Nuvem';
        }
    }

    // ── Conta ─────────────────────────────────────────────────

    async function renderAccountInfo() {
        const el = document.getElementById('qc-account-info');
        if (!el) return;
        const user = QuizCloud.getUser();
        if (!user) return;

        el.innerHTML = `
            <div style="margin-bottom:14px;">
                <strong>Conta:</strong> ${escapeHtml(user.email)}<br>
                ${user.name ? `<strong>Nome:</strong> ${escapeHtml(user.name)}<br>` : ''}
                <strong>Tipo:</strong> ${user.role === 'quiz_user' ? 'Usuário Individual' : 'Admin Escolar'}<br>
            </div>
            <div id="qc-sub-status">Verificando assinatura…</div>
            <hr style="border-color:var(--input-border,#eee);margin:14px 0;">
            <button class="qc-btn danger" id="qc-logout-btn" style="width:100%;">Sair da conta</button>
        `;

        document.getElementById('qc-logout-btn').addEventListener('click', () => {
            QuizCloud.logout();
            renderModalState();
        });

        try {
            const sub = await QuizCloud.getSubscriptionStatus();
            const subEl = document.getElementById('qc-sub-status');
            if (!subEl) return;
            if (user.role !== 'quiz_user') {
                subEl.innerHTML = '<span class="qc-msg info">Acesso via plano escolar (Axom).</span>';
            } else if (sub.hasAccess) {
                const exp = sub.subscription?.expires_at
                    ? `Válido até ${new Date(sub.subscription.expires_at).toLocaleDateString('pt-BR')}.`
                    : 'Assinatura ativa.';
                subEl.innerHTML = `<span class="qc-msg success">✓ Premium ativo — ${exp}</span>
                    <button class="qc-btn" id="qc-renew-btn" style="margin-top:8px;font-size:0.85rem;">Renovar / Gerenciar</button>`;
                document.getElementById('qc-renew-btn')?.addEventListener('click', handleUpgrade);
            } else {
                subEl.innerHTML = `<span class="qc-msg error">Sem assinatura ativa.</span>
                    <div style="margin-top:10px;">
                        <div class="qc-price-tag">R$ 15,00 / mês</div>
                        <button class="qc-btn" id="qc-sub-upgrade-btn" style="width:100%;margin-top:8px;">Assinar agora</button>
                    </div>`;
                document.getElementById('qc-sub-upgrade-btn')?.addEventListener('click', handleUpgrade);
            }
        } catch {
            document.getElementById('qc-sub-status').innerHTML = '<span style="color:#888;font-size:0.85rem;">Não foi possível verificar a assinatura.</span>';
        }
    }

    // ── Inicialização ─────────────────────────────────────────

    function addCloudButton(container, position = 'afterbegin') {
        const btn = document.createElement('button');
        btn.className = 'qc-btn qc-cloud-open-btn';
        btn.textContent = '☁ Nuvem';
        btn.title = 'Biblioteca de Questionários na Nuvem';
        btn.addEventListener('click', openModal);
        container.insertAdjacentElement(position, btn);
        updateButtons();
        return btn;
    }

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    }

    function init() {
        injectStyles();
        createModal();

        // Adiciona botão "☁ Nuvem" próximo aos botões de salvar/carregar no controller
        const listHeaderBtns = document.querySelector('.list-header-buttons');
        if (listHeaderBtns) addCloudButton(listHeaderBtns, 'afterbegin');

        // Adiciona botão no formulário de nova sessão do admin (próximo ao load-from-file)
        const loadFileBtn = document.getElementById('load-session-from-file-btn');
        if (loadFileBtn && loadFileBtn.parentElement) {
            addCloudButton(loadFileBtn.parentElement, 'beforeend');
        }
    }

    // Auto-init quando DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ── API pública ───────────────────────────────────────────
    return {
        onQuestionsLoaded(fn) { _onQuestionsLoaded = fn; },
        onSaveRequested(fn)   { _onSaveRequested   = fn; },
        openLibrary: openModal,
        openAuth:    openModal,
    };
})();

window.QuizCloudUI = QuizCloudUI;
