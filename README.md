# Arena — Backend Hub (Rush, Mind, Quest, Cronos)

> **URL de produção:** https://profalexv-alexluza.onrender.com  
> **Repositório:** github.com/profalexv/arena  
> **Deploy:** push para `main` → auto-deploy no render.com

---

## O que é o Arena?

Backend Node.js + Socket.IO centralizado para as ferramentas interativas do ecossistema Axom.  
Serve exclusivamente: **Rush**, **Mind** e **Quest** — os quizzes/avaliações em tempo real.  
Também acessa o **Supabase** para persistência de questionários premium.

---

## Arquitetura

```
arena/ (render.com → profalexv-alexluza.onrender.com)
  ├── server.js               ← Express + Socket.IO; carrega módulos dinamicamente
  ├── rush/
  │   ├── rush.js             ← Socket.IO namespace /rush (Quiz competitivo)
  │   └── questions.js        ← Lógica de perguntas compartilhada
  ├── mind/
  │   ├── mind.js             ← Socket.IO namespace /mind (Quiz colaborativo)
  │   └── questions.js
  ├── quest/
  │   ├── quest.js            ← Socket.IO namespace /quest (Avaliação com notas)
  │   └── questions.js
  └── shared/
      └── questionnairesRouter.js  ← CRUD de questionários (REST + Supabase)
```

> ⚠️ O Cronos usa este backend para cloud storage (REST `/cronos/schedules`). O login ainda ocorre pelo login/ (Fly.io).

---

## Regras de Arquitetura

1. **Apenas o Arena acessa o Supabase para os projetos Rush/Mind/Quest.**  
   Nenhum frontend toca o banco diretamente.

2. **Os frontends sempre apontam para este backend remoto**, inclusive em testes locais.  
   Não existe instância local do arena — use o serviço no render.com.

3. **Autenticação premium** é validada via JWT emitido pelo login/ (Fly.io):  
   o arena chama `LOGIN_URL/api/quiz/auth/verify` para confirmar tokens.

---

## Infraestrutura

| Componente | URL |
|---|---|
| **Backend** | https://profalexv-alexluza.onrender.com |
| **Supabase** | `rgiaryfatyvsfgqjubmh` (São Paulo) — tabela `quiz_questionnaires` |
| **Login/API** (JWT verify) | https://axom.fly.dev |

---

## Namespaces Socket.IO

| Namespace | Projeto | Armazenamento |
|---|---|---|
| `/rush` | Rush | Em memória (sem banco) |
| `/mind` | Mind | Em memória (sem banco) |
| `/quest` | Quest | Em memória + notas via login/ |

---

## Rotas REST

| Rota | Descrição |
|---|---|
| `GET /rush/questionnaires` | Lista questionários salvos (Rush) |
| `POST /rush/questionnaires` | Cria questionário (Rush) |
| `GET /mind/questionnaires` | Lista questionários (Mind) |
| `POST /mind/questionnaires` | Cria questionário (Mind) |
| `GET /quest/questionnaires` | Lista questionários (Quest) |
| `POST /quest/questionnaires` | Cria questionário (Quest) |

---

## Variáveis de Ambiente (render.com)

| Variável | Descrição |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase principal (para cronos_schedules) |
| `SUPABASE_SERVICE_KEY` | Chave de serviço (service_role) Supabase principal |
| `SUPABASE_QUIZ_URL` | URL da instância Supabase de questionários (Rush/Mind/Quest) |
| `SUPABASE_QUIZ_KEY` | Chave de serviço Supabase questionários |
| `LOGIN_URL` | URL do backend para verificação de JWT (`https://axom.fly.dev`) |
| `NODE_ENV` | `production` |
| `PORT` | Atribuído pelo render.com |

---

## Deploy

```bash
# Apenas faça push para main — render.com auto-deploya
git add .
git commit -m "feat: descrição da mudança"
git push origin main
```

Não há processo de build. O render.com executa `node server.js` diretamente.

---

## Projetos Servidos

| Projeto | Frontend | Namespace / Rota |
|---|---|---|
| **Rush** | https://rush.axom.app | Socket `/rush`, REST `/rush/questionnaires` |
| **Mind** | https://mind.axom.app | Socket `/mind`, REST `/mind/questionnaires` |
| **Quest** | https://quest.axom.app | Socket `/quest`, REST `/quest/questionnaires` |
| **Cronos** | https://cronos.axom.app | REST `/cronos/schedules` (cloud storage) |