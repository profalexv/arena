-- ============================================================
-- Render — Quiz Questionnaires DB
-- Instância Supabase dedicada ao Arena + MindPool Premium.
-- Cole no SQL Editor do Supabase desta instância.
-- ============================================================

-- ── Extensão ─────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Questionários salvos na nuvem ─────────────────────────────
-- Armazena bibliotecas de perguntas dos usuários premium.
-- O campo user_id referencia o UUID do usuário no motor/ (Fly.io).
CREATE TABLE IF NOT EXISTS questionnaires (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     TEXT        NOT NULL,               -- UUID do usuário (quiz_user ou school_admin)
  user_email  TEXT        NOT NULL,               -- cache para display; fonte de verdade é o motor
  app_type    TEXT        NOT NULL
              CHECK (app_type IN ('arena', 'mindpool', 'proof')),
  title       TEXT        NOT NULL,
  description TEXT,
  questions   JSONB       NOT NULL DEFAULT '[]',  -- array de objetos de pergunta
  tags        TEXT[]      NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questionnaires_user_id  ON questionnaires(user_id);
CREATE INDEX IF NOT EXISTS idx_questionnaires_app_type ON questionnaires(app_type);

-- ── Trigger: atualiza updated_at automaticamente ──────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_questionnaires_updated_at
  BEFORE UPDATE ON questionnaires
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Row Level Security ────────────────────────────────────────
-- O render/ conecta via service_role key (sem RLS) para operações autorizadas.
-- Habilitar RLS como camada extra de defesa caso a anon key seja exposta.
ALTER TABLE questionnaires ENABLE ROW LEVEL SECURITY;

-- Nenhuma política pública: apenas o service_role tem acesso.
-- Toda autorização de usuário é feita pelo middleware no render/server.js.
