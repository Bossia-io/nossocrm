-- WhatsApp Integration Tables
-- Created: 2026-01-23
-- Purpose: Support WhatsApp lead reception, messaging, and conversation management

-- ============================================================================
-- TABLE: whatsapp_conversations
-- ============================================================================
-- Tracks individual conversation threads with contacts
-- One row per contact per organization

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- WhatsApp contact identifier (e.g., "5511987654321")
  wa_id TEXT NOT NULL,
  
  -- Normalized phone number (e.g., "+55 11 98765-4321")
  phone TEXT NOT NULL,
  
  -- Conversation status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'blocked')),
  
  -- Metadata
  last_message_at TIMESTAMP WITH TIME ZONE,
  message_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Unique constraint: one conversation per wa_id per organization
  CONSTRAINT uq_whatsapp_conversations_org_wa_id UNIQUE (organization_id, wa_id)
);

-- Indexes for performance
CREATE INDEX idx_whatsapp_conversations_organization_id 
  ON whatsapp_conversations(organization_id);

CREATE INDEX idx_whatsapp_conversations_lead_id 
  ON whatsapp_conversations(lead_id);

CREATE INDEX idx_whatsapp_conversations_organization_last_message_at 
  ON whatsapp_conversations(organization_id, last_message_at DESC NULLS LAST);

-- ============================================================================
-- TABLE: whatsapp_messages
-- ============================================================================
-- Individual messages within conversations

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  
  -- Message direction: customer or CRM user
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  
  -- Message content
  content TEXT NOT NULL,
  
  -- Message type (text is most common, others for future media support)
  type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'image', 'document', 'audio', 'video')),
  
  -- Optional media URL (for non-text messages)
  media_url TEXT,
  
  -- Media ID from Baileys/Meta (for reference/debugging)
  media_id TEXT,
  
  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_whatsapp_messages_conversation_id 
  ON whatsapp_messages(conversation_id);

CREATE INDEX idx_whatsapp_messages_conversation_created_at 
  ON whatsapp_messages(conversation_id, created_at DESC);

-- ============================================================================
-- TABLE: whatsapp_webhook_logs
-- ============================================================================
-- Audit trail for webhook deliveries (for idempotency and debugging)

CREATE TABLE IF NOT EXISTS whatsapp_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Unique message ID from webhook (used for deduplication)
  -- Examples: Meta's wamid, Baileys' timestamp-based ID
  message_id TEXT NOT NULL,
  
  -- Processing status
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'processed', 'failed')),
  
  -- Full webhook payload (for replay/debugging if needed)
  payload JSONB NOT NULL,
  
  -- Result of processing (what was created/updated)
  result JSONB,
  
  -- Error message if processing failed
  error_message TEXT,
  
  -- Number of processing attempts
  attempts INTEGER DEFAULT 1,
  
  -- When processing completed (NULL if still processing)
  processed_at TIMESTAMP WITH TIME ZONE,
  
  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Unique constraint: one entry per message_id (enforces exactly-once semantics)
  CONSTRAINT uq_whatsapp_webhook_logs_message_id UNIQUE (message_id)
);

-- Indexes for performance
CREATE INDEX idx_whatsapp_webhook_logs_organization_id 
  ON whatsapp_webhook_logs(organization_id);

CREATE INDEX idx_whatsapp_webhook_logs_status 
  ON whatsapp_webhook_logs(organization_id, status);

CREATE INDEX idx_whatsapp_webhook_logs_created_at 
  ON whatsapp_webhook_logs(created_at DESC);

-- ============================================================================
-- EXTEND leads TABLE
-- ============================================================================
-- Add WhatsApp-specific fields to existing leads table

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS wa_id TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'whatsapp', 'webhook', 'api')),
  ADD CONSTRAINT uq_leads_organization_wa_id UNIQUE (organization_id, wa_id) DEFERRABLE INITIALLY DEFERRED;

-- Index for WhatsApp deduplication
CREATE INDEX IF NOT EXISTS idx_leads_organization_wa_id 
  ON leads(organization_id, wa_id);

CREATE INDEX IF NOT EXISTS idx_leads_source 
  ON leads(organization_id, source);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all WhatsApp tables
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_webhook_logs ENABLE ROW LEVEL SECURITY;

-- WhatsAppConversation: Organization isolation
CREATE POLICY IF NOT EXISTS whatsapp_conversations_org_isolation 
  ON whatsapp_conversations
  FOR ALL
  USING (organization_id = COALESCE(
    (current_setting('app.current_org_id', true)::uuid),
    auth.uid()  -- Fallback to user ID (should be mapped to org elsewhere)
  ));

-- WhatsAppMessage: Access via conversation's organization
CREATE POLICY IF NOT EXISTS whatsapp_messages_org_isolation 
  ON whatsapp_messages
  FOR ALL
  USING (
    conversation_id IN (
      SELECT id FROM whatsapp_conversations
      WHERE organization_id = COALESCE(
        (current_setting('app.current_org_id', true)::uuid),
        auth.uid()
      )
    )
  );

-- WhatsAppWebhookLog: Organization isolation
CREATE POLICY IF NOT EXISTS whatsapp_webhook_logs_org_isolation 
  ON whatsapp_webhook_logs
  FOR ALL
  USING (organization_id = COALESCE(
    (current_setting('app.current_org_id', true)::uuid),
    auth.uid()
  ));

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp on whatsapp_conversations
CREATE OR REPLACE FUNCTION update_whatsapp_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_whatsapp_conversations_updated_at 
  ON whatsapp_conversations;

CREATE TRIGGER trigger_whatsapp_conversations_updated_at
  BEFORE UPDATE ON whatsapp_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_conversations_updated_at();

-- Update conversation's last_message_at when new message inserted
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE whatsapp_conversations
  SET 
    last_message_at = NEW.created_at,
    message_count = message_count + 1,
    updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_conversation_last_message 
  ON whatsapp_messages;

CREATE TRIGGER trigger_update_conversation_last_message
  AFTER INSERT ON whatsapp_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_last_message();

-- ============================================================================
-- COMMENTS (Documentation)
-- ============================================================================

COMMENT ON TABLE whatsapp_conversations IS 
  'Tracks individual conversation threads with WhatsApp contacts. One row per contact per organization.';

COMMENT ON TABLE whatsapp_messages IS 
  'Individual messages within conversations. Supports text and media messages.';

COMMENT ON TABLE whatsapp_webhook_logs IS 
  'Audit trail for webhook deliveries. Used for idempotency checking and debugging.';

COMMENT ON COLUMN whatsapp_conversations.wa_id IS 
  'WhatsApp contact ID (e.g., "5511987654321"). Unique per organization.';

COMMENT ON COLUMN whatsapp_conversations.status IS 
  'Conversation status: active (receiving messages), archived (hidden), blocked (no further messages).';

COMMENT ON COLUMN whatsapp_messages.direction IS 
  'Message direction: inbound (from customer), outbound (from CRM user).';

COMMENT ON COLUMN whatsapp_webhook_logs.message_id IS 
  'Unique webhook message ID. Used for exactly-once processing semantics.';

COMMENT ON COLUMN whatsapp_webhook_logs.status IS 
  'Processing status: processing (in-flight), processed (success), failed (error).';
