# Render — Backend Hub (Arena, MindPool, Proof)

> **URL de produção:** https://profalexv-alexluza.onrender.com  
> **Repositório:** github.com/profalexv/render  
> **Deploy:** push para `main` → auto-deploy no render.com

---

## O que é o Render?

Backend Node.js + Socket.IO centralizado para as ferramentas interativas do ecossistema Axom.  
Serve exclusivamente: **Arena**, **MindPool** e **Proof** — os quizzes/avaliações em tempo real.  
Também acessa o **Supabase** para persistência de questionários premium.

---

## Arquitetura

```
render/ (render.com → profalexv-alexluza.onrender.com)
  ├── server.js               ← Express + Socket.IO; carrega módulos dinamicamente
  ├── arena/
  │   ├── arena.js            ← Socket.IO namespace /arena (Arena)
  │   └── questions.js        ← Lógica de perguntas compartilhada
  ├── mindpool/
  │   ├── mindpool.js         ← Socket.IO namespace /mindpool
  │   └── questions.js
  ├── proof/
  │   ├── proof.js            ← Socket.IO namespace /proof
  │   └── questions.js
  └── shared/
      └── questionnairesRouter.js  ← CRUD de questionários (REST + Supabase)
```

> ⚠️ O Cronos usa este backend para cloud storage (REST `/cronos/schedules`). O login ainda ocorre pelo motor (Fly.io).

---

## Regras de Arquitetura

1. **Apenas o render acessa o Supabase para os projetos Arena/MindPool/Proof.**  
   Nenhum frontend toca o banco diretamente.

2. **Os frontends sempre apontam para este backend remoto**, inclusive em testes locais.  
   Não existe instância local do render — use o serviço no render.com.

3. **Autenticação premium** é validada via JWT emitido pelo motor (Fly.io):  
   o render chama `MOTOR_URL/api/quiz/auth/verify` para confirmar tokens.

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
| `/arena` | Arena | Em memória (sem banco) |
| `/mindpool` | MindPool | Em memória (sem banco) |
| `/proof` | Proof | Em memória + notas via motor |

---

## Rotas REST

| Rota | Descrição |
|---|---|
| `GET /arena/questionnaires` | Lista questionários salvos (Arena) |
| `POST /arena/questionnaires` | Cria questionário (Arena) |
| `GET /mindpool/questionnaires` | Lista questionários (MindPool) |
| `POST /mindpool/questionnaires` | Cria questionário (MindPool) |
| `GET /proof/questionnaires` | Lista questionários (Proof) |
| `POST /proof/questionnaires` | Cria questionário (Proof) |

---

## Variáveis de Ambiente (render.com)

| Variável | Descrição |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase principal (para cronos_schedules) |
| `SUPABASE_SERVICE_KEY` | Chave de serviço (service_role) Supabase principal |
| `SUPABASE_QUIZ_URL` | URL da instância Supabase de questionários (Arena/MindPool/Proof) |
| `SUPABASE_QUIZ_KEY` | Chave de serviço Supabase questionários |
| `MOTOR_URL` | URL do backend para verificação de JWT (`https://axom.fly.dev`) |
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
| **Arena** | https://arena.axom.app | Socket `/arena`, REST `/arena/questionnaires` |
| **MindPool** | https://mindpool.axom.app | Socket `/mindpool`, REST `/mindpool/questionnaires` |
| **Proof** | https://proof.axom.app | Socket `/proof`, REST `/proof/questionnaires` |
| **Cronos** | https://cronos.axom.app | REST `/cronos/schedules` (cloud storage) |