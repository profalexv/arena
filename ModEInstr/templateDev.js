// Template para conectar um app cliente ao Gateway durante o desenvolvimento local.
// Este arquivo aponta para o serviço REMOTO no Render, pois o gateway não roda localmente.

const config = {
    // URL do seu gateway no Render (pode ser a mesma de produção ou uma de staging)
    GATEWAY_URL: 'https://seu-gateway-api.onrender.com',
    // ID do projeto que este cliente irá acessar
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
            const errorMessage = responseBody.error || responseBody.message || response.statusText;
            throw new Error(errorMessage);
        }

        return responseBody;
    } catch (error) {
        console.error(`[Gateway DEV] Falha na comunicação com ${url}:`, error);
        throw error;
    }
}