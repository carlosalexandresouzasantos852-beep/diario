-- ══════════════════════════════════════════════════════════
-- SCHEMA v1 - Sistema de Campeonato
-- Execute no SQL Editor do Supabase
-- ══════════════════════════════════════════════════════════

-- Configurações gerais do campeonato
CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT
);

INSERT INTO config VALUES ('title',            'CAMPEONATO')          ON CONFLICT (key) DO NOTHING;
INSERT INTO config VALUES ('admin_password',   '1234')                ON CONFLICT (key) DO NOTHING;
INSERT INTO config VALUES ('mp_token',         '')                    ON CONFLICT (key) DO NOTHING;
INSERT INTO config VALUES ('mode',             'free')                ON CONFLICT (key) DO NOTHING;
INSERT INTO config VALUES ('inscription_value','0')                   ON CONFLICT (key) DO NOTHING;
INSERT INTO config VALUES ('prize_value',      '0')                   ON CONFLICT (key) DO NOTHING;
INSERT INTO config VALUES ('hero_image',       '')                    ON CONFLICT (key) DO NOTHING;
INSERT INTO config VALUES ('reg_open',         'true')                ON CONFLICT (key) DO NOTHING;
INSERT INTO config VALUES ('reg_open_time',    '')                    ON CONFLICT (key) DO NOTHING;
INSERT INTO config VALUES ('reg_close_time',   '')                    ON CONFLICT (key) DO NOTHING;
INSERT INTO config VALUES ('reg_closed_msg',   'As inscrições estão encerradas no momento. Fique de olho nas nossas redes sociais para saber quando abriremos novamente!') ON CONFLICT (key) DO NOTHING;

-- Equipes confirmadas
CREATE TABLE IF NOT EXISTS teams (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT      NOT NULL UNIQUE,
  leader        TEXT      NOT NULL,
  members       TEXT[]    NOT NULL,
  reserves      TEXT[],
  slot          INTEGER   NOT NULL UNIQUE,
  registered_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pagamentos (pendentes e confirmados)
CREATE TABLE IF NOT EXISTS payments (
  id         BIGSERIAL PRIMARY KEY,
  payment_id TEXT      NOT NULL UNIQUE,
  team_name  TEXT      NOT NULL,
  leader     TEXT      NOT NULL,
  members    TEXT[]    NOT NULL,
  reserves   TEXT[],
  slot       INTEGER   NOT NULL UNIQUE,
  status     TEXT      DEFAULT 'pending',  -- pending | approved | cancelled
  amount     NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Desabilitar RLS (para acesso público via anon key)
ALTER TABLE config   DISABLE ROW LEVEL SECURITY;
ALTER TABLE teams    DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;
