import type { Migration } from "@repo/database";

/**
 * Help center, AI usage accounting and tickets. Appended after OPS_MIGRATIONS in each app
 * (it does not depend on app tables; ticket org/user ids are plain text like every other tenant column).
 */
export const SUPPORT_MIGRATIONS: Migration[] = [
  {
    id: "support_0001_articles",
    sql: `
CREATE TABLE IF NOT EXISTS support_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  summary text NOT NULL,
  category text NOT NULL,
  body text NOT NULL,
  updated_on date NOT NULL,
  content_hash text NOT NULL,
  search tsvector NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_articles_search_idx ON support_articles USING GIN (search);

CREATE TABLE IF NOT EXISTS support_article_chunks (
  id bigserial PRIMARY KEY,
  article_id uuid NOT NULL REFERENCES support_articles(id) ON DELETE CASCADE,
  ord integer NOT NULL,
  heading text NOT NULL,
  body text NOT NULL,
  search tsvector NOT NULL
);
CREATE INDEX IF NOT EXISTS support_article_chunks_search_idx ON support_article_chunks USING GIN (search);
CREATE INDEX IF NOT EXISTS support_article_chunks_article_idx ON support_article_chunks (article_id, ord);
`,
  },
  {
    id: "support_0002_ai_usage",
    sql: `
CREATE TABLE IF NOT EXISTS support_ai_usage (
  day date PRIMARY KEY,
  calls integer NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  cost_micros bigint NOT NULL DEFAULT 0,      -- settled estimated cost, micro-dollars
  reserved_micros bigint NOT NULL DEFAULT 0,  -- in-flight reservations, micro-dollars
  updated_at timestamptz NOT NULL DEFAULT now()
);
`,
  },
  {
    id: "support_0003_tickets",
    sql: `
CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app text NOT NULL,
  org_id text,
  user_id text,
  email text NOT NULL,
  subject text NOT NULL,
  category text NOT NULL,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'waiting_on_customer', 'waiting_on_operator', 'resolved', 'closed')),
  escalated boolean NOT NULL DEFAULT false,
  escalation_reason text,
  source text NOT NULL DEFAULT 'form',
  access_salt text NOT NULL,
  access_token_hash text NOT NULL,
  last_customer_at timestamptz,
  last_staff_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_tickets_org_idx ON support_tickets (org_id, created_at DESC) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS support_tickets_user_idx ON support_tickets (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS support_tickets_queue_idx ON support_tickets (status, escalated, priority, updated_at);

CREATE TABLE IF NOT EXISTS support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigserial NOT NULL,
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author text NOT NULL CHECK (author IN ('customer', 'operator', 'assistant', 'system')),
  body text NOT NULL,
  automated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_messages_ticket_idx ON support_messages (ticket_id, created_at);
`,
  },
];
