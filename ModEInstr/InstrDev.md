# Instruções: Conectar um App Cliente (Desenvolvimento Local)

O projeto do Gateway **não foi projetado para rodar localmente**. Ele deve estar sempre rodando no Render.

Portanto, o "desenvolvimento local" do seu app cliente (frontend, etc.) consiste em rodar o seu cliente na sua máquina, mas **conectando-se ao Gateway que está no ar, no Render**.

A lógica é exatamente a mesma do `templateRemoto.js`. O uso de um arquivo separado (`templateDev.js`) é uma boa prática para o caso de você, no futuro, querer apontar para um ambiente de "staging" ou "development" do gateway, diferente do de produção.

1.  **Copie o Template**: Copie o arquivo `ModEInstr/templateDev.js` para a pasta de serviços do seu projeto cliente.

2.  **Configure**: Edite as constantes `GATEWAY_URL` e `PROJECT_ID` para apontar para o seu serviço no Render.

3.  **Use**: Importe e use a função `callBackend` da mesma forma descrita nas instruções do `InstrRemoto.md`.