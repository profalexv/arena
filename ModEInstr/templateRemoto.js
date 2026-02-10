// Template para conectar um app cliente ao Gateway em produção.
// Copie este arquivo para o seu projeto cliente (ex: /src/services/gateway.js)

const config = {
    // IMPORTANTE: Substitua pela URL real do seu gateway no Render
    GATEWAY_URL: 'https://seu-gateway-api.onrender.com',
    // IMPORTANTE: Substitua pelo ID do projeto que este cliente irá acessar
    PROJECT_ID: 'id-do-projeto-alvo'
};

/**
 * Função helper para fazer chamadas à API do gateway.
 * @param {string} path - O caminho da API dentro do seu projeto (ex: '/user/1').
 * @param {RequestInit} options - Opções padrão da API Fetch (method, body, headers, etc.).
 * @returns {Promise<any>} O JSON retornado pela API.
 */
export async function callBackend(path = '/', options = {}) {
    const url = `${config.GATEWAY_URL}/api/${config.PROJECT_ID}${path}`;

    const defaultHeaders = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    try {
        const response = await fetch(url, { ...options, headers: defaultHeaders });

        const responseBody = await response.json();

        if (!response.ok) {
            // Tenta usar a mensagem de erro da API, ou o status text como fallback
            const errorMessage = responseBody.error || responseBody.message || response.statusText;
            throw new Error(errorMessage);
        }

        return responseBody;
    } catch (error) {
        console.error(`[Gateway] Falha na comunicação com ${url}:`, error);
        // Re-lança o erro para que o código que chamou a função possa tratá-lo
        throw error;
    }
}