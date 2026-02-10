# Instruções: Adicionar um Novo Backend ao Gateway

Para implementar um novo backend que rodará através da API Gateway no Render, siga estes passos:

1.  **Copie o Template**: Faça uma cópia do arquivo `ModEInstr/templateLocal.js`.

2.  **Mova e Renomeie**: Cole o arquivo copiado na pasta `Conect/`. Renomeie o arquivo para algo que identifique seu projeto (ex: `meu-app-de-vendas.js`). O nome do arquivo é apenas para organização.

3.  **Edite o ID do Projeto**: Abra o novo arquivo (`Conect/meu-app-de-vendas.js`) e altere o valor da variável `projectId`. **Este ID é crucial**, pois será usado na URL pública do seu backend. **Ele deve ser único e não pode conter espaços ou caracteres especiais**.

    ```javascript
    // Altere 'id-do-template' para o ID do seu projeto
    const projectId = 'meu-app-de-vendas';
    ```

4.  **Implemente a Lógica do Backend**: Dentro da função `handler`, escreva toda a lógica do seu backend.
    *   Use `req.path` para criar sub-rotas (ex: `/users`, `/products`).
    *   Use `req.method` para tratar diferentes verbos HTTP (`GET`, `POST`, `PUT`, `DELETE`).
    *   Acesse dados enviados no corpo da requisição com `req.body`.
    *   Acesse parâmetros de query com `req.query`.

5.  **Commit e Deploy**: Adicione o novo arquivo ao Git, faça o commit e o push para o seu repositório.

    ```bash
    git add Conect/meu-app-de-vendas.js
    git commit -m "feat: Adiciona backend para o app de vendas"
    git push
    ```

O Render detectará a alteração, fará o deploy automaticamente e seu novo backend estará disponível em: `https://seu-gateway.onrender.com/api/meu-app-de-vendas`.