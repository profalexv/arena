document.addEventListener('DOMContentLoaded', () => {
    const audienceJoinBtn = document.getElementById('audience-join-btn');
    const audienceSessionCodeInput = document.getElementById('audience-session-code');
    const controllerLoginBtn = document.getElementById('controller-login-btn');
    const presenterLoginBtn = document.getElementById('presenter-login-btn');

    // --- Entrar como participante (Audience) ---
    const joinAsAudience = () => {
        const sessionCode = audienceSessionCodeInput.value.trim().toUpperCase();
        if (sessionCode) {
            // Usa um caminho relativo para funcionar corretamente com o Live Server e em produção.
            window.location.href = `pages/audience.html?session=${sessionCode}`;
        } else {
            alert('Por favor, insira o código da sessão.');
            audienceSessionCodeInput.focus();
        }
    };

    audienceJoinBtn.addEventListener('click', joinAsAudience);

    // Atalho para entrar com a tecla Enter no campo de código
    audienceSessionCodeInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            joinAsAudience();
        }
    });

    // --- Entrar como administrador (Controller/Presenter) ---
    // Usam caminhos relativos para evitar o erro "Cannot GET /pages/..."
    controllerLoginBtn.addEventListener('click', () => window.location.href = 'pages/admin.html?role=controller');
    presenterLoginBtn.addEventListener('click', () => window.location.href = 'pages/admin.html?role=presenter');
});