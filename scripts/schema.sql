-- AI Business Agent - Production Schema for Neon PostgreSQL
-- 14 Tables supporting Leads, Contacts, Activities, Clients, Projects,
-- Onboarding, Requirements, Milestones, Project Tasks, Messages, Templates,
-- Communication Events, Security Audit, and Users.

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'VIEWER',
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Leads
CREATE TABLE IF NOT EXISTS leads (
  id VARCHAR(64) PRIMARY KEY,
  company_name VARCHAR(255) NOT NULL,
  website VARCHAR(255),
  industry VARCHAR(255),
  location VARCHAR(255),
  contact_name VARCHAR(255),
  contact_role VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(255),
  source VARCHAR(255),
  source_type VARCHAR(50) DEFAULT 'USER_INPUT',
  evidence TEXT,
  qualification_status VARCHAR(50) DEFAULT 'NEEDS_RESEARCH',
  fit_reason TEXT,
  pain_points TEXT,
  potential_need TEXT,
  pipeline_status VARCHAR(50) DEFAULT 'NOT_CONTACTED',
  outreach_status VARCHAR(50) DEFAULT 'NOT_CONTACTED',
  pipeline JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  qualification JSONB,
  communication_opt_out BOOLEAN DEFAULT FALSE,
  preferred_channel VARCHAR(50),
  custom_fields JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Clients
CREATE TABLE IF NOT EXISTS clients (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  company VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(255),
  status VARCHAR(50) DEFAULT 'ACTIVE',
  tier VARCHAR(50) DEFAULT 'STANDARD',
  converted_from_lead_id VARCHAR(64) REFERENCES leads(id) ON DELETE SET NULL,
  billing JSONB DEFAULT '{}'::jsonb,
  delivery_profile JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Contacts
CREATE TABLE IF NOT EXISTS contacts (
  id VARCHAR(64) PRIMARY KEY,
  lead_id VARCHAR(64) REFERENCES leads(id) ON DELETE SET NULL,
  client_id VARCHAR(64) REFERENCES clients(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(255),
  role VARCHAR(255),
  is_primary BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Activities
CREATE TABLE IF NOT EXISTS activities (
  id VARCHAR(64) PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  type VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Projects
CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(64) PRIMARY KEY,
  client_id VARCHAR(64) NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'PLANNED',
  description TEXT,
  start_date DATE,
  target_end_date DATE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Onboarding
CREATE TABLE IF NOT EXISTS onboarding (
  id VARCHAR(64) PRIMARY KEY,
  client_id VARCHAR(64) NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_id VARCHAR(64) REFERENCES projects(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'NOT_STARTED',
  checklist JSONB DEFAULT '[]'::jsonb,
  current_step VARCHAR(100),
  kickoff_notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Requirements
CREATE TABLE IF NOT EXISTS requirements (
  id VARCHAR(64) PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  priority VARCHAR(50) DEFAULT 'MEDIUM',
  status VARCHAR(50) DEFAULT 'PENDING',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Milestones
CREATE TABLE IF NOT EXISTS milestones (
  id VARCHAR(64) PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'PENDING',
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Project Tasks
CREATE TABLE IF NOT EXISTS project_tasks (
  id VARCHAR(64) PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_id VARCHAR(64) REFERENCES milestones(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'TODO',
  priority VARCHAR(50) DEFAULT 'MEDIUM',
  owner VARCHAR(255),
  due_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Templates
CREATE TABLE IF NOT EXISTS templates (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  channel VARCHAR(50) DEFAULT 'EMAIL',
  purpose VARCHAR(100),
  subject VARCHAR(255),
  body TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Messages
CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(64) PRIMARY KEY,
  lead_id VARCHAR(64) REFERENCES leads(id) ON DELETE SET NULL,
  client_id VARCHAR(64) REFERENCES clients(id) ON DELETE SET NULL,
  project_id VARCHAR(64) REFERENCES projects(id) ON DELETE SET NULL,
  direction VARCHAR(50) DEFAULT 'OUTBOUND',
  channel VARCHAR(50) DEFAULT 'EMAIL',
  provider VARCHAR(50) DEFAULT 'local',
  recipient_type VARCHAR(50),
  recipient_id VARCHAR(64),
  recipient_name VARCHAR(255),
  recipient_address VARCHAR(255),
  recipient VARCHAR(255),
  template_id VARCHAR(64),
  subject VARCHAR(255),
  body TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'DRAFT',
  purpose VARCHAR(100) DEFAULT 'GENERAL',
  source VARCHAR(50) DEFAULT 'AI-GENERATED',
  conversation_id VARCHAR(100),
  provider_message_id VARCHAR(255),
  error_code VARCHAR(100),
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  inbound_replies JSONB DEFAULT '[]'::jsonb,
  error_details TEXT,
  approved_by VARCHAR(255),
  approved_at TIMESTAMPTZ,
  copied_at TIMESTAMPTZ,
  send_requested_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Communication Events
CREATE TABLE IF NOT EXISTS communication_events (
  id VARCHAR(64) PRIMARY KEY,
  idempotency_key VARCHAR(255) UNIQUE NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  message_id VARCHAR(64) REFERENCES messages(id) ON DELETE SET NULL,
  provider_message_id VARCHAR(255),
  provider VARCHAR(50),
  channel VARCHAR(50) DEFAULT 'EMAIL',
  status VARCHAR(50),
  recipient VARCHAR(255),
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. Security Audit
CREATE TABLE IF NOT EXISTS security_audit (
  id VARCHAR(64) PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  email VARCHAR(255),
  ip_address VARCHAR(100),
  user_agent TEXT,
  status VARCHAR(50) DEFAULT 'SUCCESS',
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance & frequent queries
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_status ON leads(pipeline_status);
CREATE INDEX IF NOT EXISTS idx_leads_qualification_status ON leads(qualification_status);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_contacts_lead_id ON contacts(lead_id);
CREATE INDEX IF NOT EXISTS idx_contacts_client_id ON contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_activities_entity ON activities(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_client_id ON onboarding(client_id);
CREATE INDEX IF NOT EXISTS idx_requirements_project_id ON requirements(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_project_id ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_milestone_id ON project_tasks(milestone_id);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_type, recipient_id);
CREATE INDEX IF NOT EXISTS idx_communication_events_message_id ON communication_events(message_id);
CREATE INDEX IF NOT EXISTS idx_communication_events_idempotency ON communication_events(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_security_audit_user_id ON security_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_event_type ON security_audit(event_type);
CREATE INDEX IF NOT EXISTS idx_security_audit_created_at ON security_audit(created_at);
