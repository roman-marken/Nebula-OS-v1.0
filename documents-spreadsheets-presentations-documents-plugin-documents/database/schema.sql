CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE game_status AS ENUM ('waiting', 'in_progress', 'finished');
CREATE TYPE vote_decision AS ENUM ('keep', 'kick', 'abstain');
CREATE TYPE trade_status AS ENUM ('pending', 'accepted', 'declined', 'expired');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nickname VARCHAR(16) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  avatar_color VARCHAR(16) NOT NULL DEFAULT '#00F0FF',
  total_games INT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  rating INT NOT NULL DEFAULT 1000,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE friendships (
  id BIGSERIAL PRIMARY KEY,
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (requester_id, addressee_id)
);

CREATE TABLE game_sessions (
  session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_code VARCHAR(16) NOT NULL UNIQUE,
  invite_code VARCHAR(16),
  host_id UUID NOT NULL REFERENCES users(id),
  status game_status NOT NULL DEFAULT 'waiting',
  current_turn_player_id UUID REFERENCES users(id),
  catastrophe JSONB NOT NULL,
  phase VARCHAR(24) NOT NULL DEFAULT 'waiting',
  phase_ends_at TIMESTAMP,
  round INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  finished_at TIMESTAMP
);

CREATE TABLE player_states (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  session_id UUID NOT NULL REFERENCES game_sessions(session_id) ON DELETE CASCADE,
  character_data JSONB NOT NULL,
  revealed_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  is_alive BOOLEAN NOT NULL DEFAULT true,
  is_ready BOOLEAN NOT NULL DEFAULT false,
  is_connected BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);

CREATE INDEX idx_player_states_session_user ON player_states(session_id, user_id);
CREATE INDEX idx_player_states_alive ON player_states(session_id, is_alive);

CREATE TABLE votes (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES game_sessions(session_id) ON DELETE CASCADE,
  round INT NOT NULL,
  voter_id UUID NOT NULL REFERENCES users(id),
  target_id UUID NOT NULL REFERENCES users(id),
  decision vote_decision NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (session_id, round, voter_id)
);

CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES game_sessions(session_id) ON DELETE CASCADE,
  from_id UUID NOT NULL REFERENCES users(id),
  to_id UUID NOT NULL REFERENCES users(id),
  item_name TEXT NOT NULL,
  status trade_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP
);

CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  event_name VARCHAR(64) NOT NULL,
  user_id UUID,
  ip INET,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_event_created ON audit_logs(event_name, created_at DESC);

