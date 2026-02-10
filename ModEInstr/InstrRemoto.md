# Instruções: Conectar um App Cliente (Remoto/Produção)

Para que seu aplicativo (seja ele web, mobile ou outro serviço) se comunique com o backend no Gateway, siga estes passos:

1.  **Copie o Template**: Copie o arquivo `ModEInstr/templateRemoto.js` para dentro da estrutura de pastas do seu projeto cliente (ex: para uma pasta `src/api/` ou `src/services/`).

2.  **Configure o Arquivo**: Abra o arquivo copiado no seu projeto e edite as duas constantes no topo:
    *   `GATEWAY_URL`: Insira a URL completa do seu serviço no Render (ex: `https://meu-gateway-api.onrender.com`).
    *   `PROJECT_ID`: Insira o `projectId` exato que você definiu no arquivo de configuração correspondente na pasta `Conect/` do gateway.

3.  **Use a Função `callBackend`**: Importe e use a função `callBackend` para fazer chamadas à sua API de forma simplificada.

    **Exemplo de uso em um projeto React/Vue/Svelte:**

    ```javascript
    import { callBackend } from './services/gateway'; // Ajuste o caminho

    async function buscarUsuario() {
      try {
        // Faz uma chamada GET para /api/{PROJECT_ID}/user/1
        const user = await callBackend('/user/1');
        console.log('Usuário encontrado:', user);
      } catch (error) {
        console.error('Falha ao buscar usuário:', error);
      }
    }

    async function enviarDados(novosDados) {
      try {
        // Faz uma chamada POST para /api/{PROJECT_ID}/data
        const response = await callBackend('/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(novosDados),
        });
        console.log('Resposta do servidor:', response);
      } catch (error) {
        console.error('Falha ao enviar dados:', error);
      }
    }
    ```