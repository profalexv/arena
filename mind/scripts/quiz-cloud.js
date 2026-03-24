/**
 * quiz-cloud.js
 *
 * Módulo de acesso à nuvem premium para Arena e Mind.
 * Inclui: autenticação, salvar/carregar/excluir questionários.
 *
 * Uso: incluir este script antes do script principal (admin.js | controller.js).
 * Expõe o objeto global `QuizCloud`.
 *
 * Configuração:
 *   - window.QUIZ_APP_TYPE deve ser 'arena' ou 'mind' (definido via script inline)
 */

const QuizCloud = (() => {
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const MOTOR_URL = isDev ? 'http://localhost:3001' : 'https://aula-motor.fly.dev';
    const RENDER_URL = isDev ? 'http://localhost:3000' : 'https://profalexv-alexluza.onrender.com';
    const APP_TYPE = window.QUIZ_APP_TYPE || 'arena';
    const STORAGE_KEY = `quiz_token_${APP_TYPE}`;
    const USER_KEY = `quiz_user_${APP_TYPE}`;

    // ── Estado ────────────────────────────────────────────────

    function getToken() { return localStorage.getItem(STORAGE_KEY); }
    function getUser()  {
        try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
    }
    function setSession(token, user) {
        localStorage.setItem(STORAGE_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
    function clearSession() {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(USER_KEY);
    }

    function isLoggedIn() { return !!getToken(); }

    // ── HTTP helpers ──────────────────────────────────────────

    async function motorPost(path, body) {
        const res = await fetch(`${MOTOR_URL}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
        return data;
    }

    async function renderRequest(method, path, body) {
        const token = getToken();
        if (!token) throw new Error('Não autenticado.');
        const opts = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
        };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(`${RENDER_URL}/${APP_TYPE}${path}`, opts);
        if (res.status === 204) return null;
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
        return data;
    }

    // ── Auth ──────────────────────────────────────────────────

    async function login(email, password) {
        const data = await motorPost('/api/quiz-auth/login', { email, password });
        setSession(data.token, data.user);
        return data.user;
    }

    async function register(email, password, name) {
        const data = await motorPost('/api/quiz-auth/register', { email, password, name });
        setSession(data.token, data.user);
        return data.user;
    }

    function logout() {
        clearSession();
    }

    // ── Questionários ─────────────────────────────────────────

    async function listQuestionnaires() {
        return renderRequest('GET', '/questionnaires');
    }

    async function getQuestionnaire(id) {
        return renderRequest('GET', `/questionnaires/${id}`);
    }

    async function saveQuestionnaire({ title, description, questions, tags }) {
        return renderRequest('POST', '/questionnaires', { title, description, questions, tags });
    }

    async function updateQuestionnaire(id, { title, description, questions, tags }) {
        return renderRequest('PUT', `/questionnaires/${id}`, { title, description, questions, tags });
    }

    async function deleteQuestionnaire(id) {
        return renderRequest('DELETE', `/questionnaires/${id}`);
    }

    // ── Pagamento / Upgrade ───────────────────────────────────

    async function getSubscriptionStatus() {
        const token = getToken();
        if (!token) return { hasAccess: false };
        const res = await fetch(`${MOTOR_URL}/api/quiz-payments/status`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) return { hasAccess: false };
        return res.json();
    }

    async function createPaymentPreference() {
        const token = getToken();
        if (!token) throw new Error('Faça login primeiro.');
        const res = await fetch(`${MOTOR_URL}/api/quiz-payments/create-preference`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
        return data; // { preferenceId, initPoint, sandboxInitPoint, price }
    }

    // ── Interface pública ─────────────────────────────────────

    return {
        isLoggedIn,
        getUser,
        login,
        register,
        logout,
        listQuestionnaires,
        getQuestionnaire,
        saveQuestionnaire,
        updateQuestionnaire,
        deleteQuestionnaire,
        getSubscriptionStatus,
        createPaymentPreference,
        MOTOR_URL,
    };
})();

window.QuizCloud = QuizCloud;
