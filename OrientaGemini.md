Esse repositório (pasta `render`) funciona como um backend centralizado para múltiplos projetos, hospedado como uma única instância no `render.com`.

**Diretrizes Gerais:**
1.  **Estrutura:** Cada projeto integrado possui uma pasta dedicada dentro deste repositório (`render`). O arquivo de backend principal de cada projeto deve seguir o padrão `nome-do-projeto.js` dentro de sua respectiva pasta.
2.  **Domínios:** Os projetos são servidos sob subdomínios específicos, como `painel.alexandre.pro.br`, `eamos.alexandre.pro.br`, etc.
3.  **Ambientes:** O backend deve funcionar tanto localmente para desenvolvimento quanto em produção no `profalexv-alexluza.onrender.com`.
4.  **Isolamento:** É crucial não misturar a lógica de backend entre os diferentes projetos. Ao adicionar um novo projeto, mantenha o padrão e não modifique arquivos de outros projetos.

**Projetos Não Integrados:**
Os projetos a seguir, embora possam estar no mesmo workspace, **não** utilizam este backend centralizado e suas pastas não devem ser modificadas no contexto do repositório `render`:
*   `cronos`
*   `igreja`
*   `fastfood`
*   `vaievem`