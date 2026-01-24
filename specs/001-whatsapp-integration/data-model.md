# Data Model: WhatsApp Integration

**Purpose**: Define entities, relationships, and database schema for WhatsApp feature
**Date**: 2026-01-23

---

## Entity Relationship Diagram

```
Organization (existing)
    │
    ├─── WhatsAppConversation ──┬──► Lead (existing)
    │                           │
    │                           └──► Contact (phone number)
    │
    └─── WhatsAppMessage (many)
         ├── inbound (from customer)
         └── outbound (from CRM user)

WhatsAppConversation
├── id: UUID (PK)
├── organization_id: UUID (FK → Organization, RLS filter)
├── lead_id: UUID (FK → Lead)
├── wa_id: TEXT (unique per org, WhatsApp contact ID)
├── phone: TEXT (formatted +55119876543)
├── status: ENUM (active, archived, blocked)
├── last_message_at: TIMESTAMP
├── created_at: TIMESTAMP
└── updated_at: TIMESTAMP

WhatsAppMessage
├── id: UUID (PK)
├── conversation_id: UUID (FK → WhatsAppConversation)
├── direction: ENUM (inbound, outbound)
├── content: TEXT
├── media_type: TEXT? (optional: image, document, audio)
├── media_url: TEXT? (optional)
├── created_at: TIMESTAMP
└── (no organization_id - inherited via conversation_id)

WhatsAppWebhookLog (audit/debug)
├── id: UUID (PK)
├── organization_id: UUID (FK → Organization)
├── message_id: TEXT (unique per webhook, for idempotency)
├── status: ENUM (processing, processed, failed)
├── payload: JSONB (raw webhook)
├── result: JSONB (what was created/updated)
├── error_message: TEXT?
├── attempts: INTEGER
├── processed_at: TIMESTAMP?
└── created_at: TIMESTAMP
```

---

## Core Entities

### 1. Lead (Extended)

**Existing entity** in NossoCRM. Extended with WhatsApp fields:

```typescript
interface Lead {
  id: UUID;
  organization_id: UUID;
  name: string;
  email?: string;
  phone?: string;
  
  // NEW: WhatsApp fields
  wa_id?: string;        // WhatsApp ID (e.g., "5511987654321")
  source: 'manual' | 'whatsapp' | 'webhook' | 'api'; // NEW value
  
  status: 'novo' | 'contato' | 'qualificado' | 'oportunidade';
  funnel_id: UUID;
  stage_id: UUID;
  created_at: TIMESTAMP;
  updated_at: TIMESTAMP;
}

// Indexes needed:
// - (organization_id, wa_id) - UNIQUE for deduplication
// - (organization_id, source)
```

### 2. WhatsAppConversation (NEW)

**Purpose**: Track individual conversation thread with a contact

```typescript
interface WhatsAppConversation {
  id: UUID;
  organization_id: UUID;           // RLS: filter by this
  lead_id: UUID;                   // FK to Lead
  
  wa_id: string;                   // "5511987654321" - unique per org
  phone: string;                   // "+55 11 98765-4321" - normalized
  
  status: 'active' | 'archived' | 'blocked';
  last_message_at: TIMESTAMP;
  message_count: INTEGER;
  
  created_at: TIMESTAMP;
  updated_at: TIMESTAMP;
  
  // Indexes:
  // - (organization_id, wa_id) - UNIQUE
  // - (lead_id)
  // - (organization_id, last_message_at DESC) - for list sorting
}
```

### 3. WhatsAppMessage (NEW)

**Purpose**: Store individual messages in conversation

```typescript
interface WhatsAppMessage {
  id: UUID;
  conversation_id: UUID;           // FK to WhatsAppConversation
  
  direction: 'inbound' | 'outbound';  // Who sent it
  content: string;                 // Message text (1-1000 chars)
  
  type: 'text' | 'image' | 'document' | 'audio' | 'video';
  media_url?: string;              // If type != text
  media_id?: string;               // For Baileys/Meta reference
  
  created_at: TIMESTAMP;
  
  // No organization_id - inherit via conversation_id
  // Indexes:
  // - (conversation_id, created_at DESC) - for message fetch
}
```

### 4. WhatsAppWebhookLog (NEW)

**Purpose**: Audit trail for webhook deliveries (idempotency debugging)

```typescript
interface WhatsAppWebhookLog {
  id: UUID;
  organization_id: UUID;           // RLS: filter by this
  
  message_id: string;              // Webhook message ID (unique per delivery)
  status: 'processing' | 'processed' | 'failed';
  
  payload: JSONB;                  // Full webhook body (for replay if needed)
  result: JSONB?;                  // What was created/updated
  error_message?: string;          // Error details if failed
  
  attempts: INTEGER;               // Number of retries
  processed_at?: TIMESTAMP;        // When completed (success or failure)
  created_at: TIMESTAMP;
  
  // Indexes:
  // - (organization_id, status)
  // - (message_id) - UNIQUE for idempotency
  // - (created_at DESC) - for log viewing
}
```

---

## Relationships & Constraints

### Foreign Keys

```sql
-- Lead → Organization (existing)
ALTER TABLE leads
  ADD CONSTRAINT fk_leads_organization_id
  FOREIGN KEY (organization_id) REFERENCES organizations(id);

-- WhatsAppConversation → Organization
ALTER TABLE whatsapp_conversations
  ADD CONSTRAINT fk_whatsapp_conversations_organization_id
  FOREIGN KEY (organization_id) REFERENCES organizations(id);

-- WhatsAppConversation → Lead
ALTER TABLE whatsapp_conversations
  ADD CONSTRAINT fk_whatsapp_conversations_lead_id
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

-- WhatsAppMessage → WhatsAppConversation
ALTER TABLE whatsapp_messages
  ADD CONSTRAINT fk_whatsapp_messages_conversation_id
  FOREIGN KEY (conversation_id) REFERENCES whatsapp_conversations(id) ON DELETE CASCADE;

-- WhatsAppWebhookLog → Organization
ALTER TABLE whatsapp_webhook_logs
  ADD CONSTRAINT fk_whatsapp_webhook_logs_organization_id
  FOREIGN KEY (organization_id) REFERENCES organizations(id);
```

### Unique Constraints (Deduplication)

```sql
-- One conversation per contact per organization
ALTER TABLE whatsapp_conversations
  ADD CONSTRAINT uq_whatsapp_conversations_organization_wa_id
  UNIQUE (organization_id, wa_id);

-- One Lead per wa_id per organization
ALTER TABLE leads
  ADD CONSTRAINT uq_leads_organization_wa_id
  UNIQUE (organization_id, wa_id);

-- One webhook delivery per message ID
ALTER TABLE whatsapp_webhook_logs
  ADD CONSTRAINT uq_whatsapp_webhook_logs_message_id
  UNIQUE (message_id);
```

### Check Constraints (Validation)

```sql
-- conversation status must be valid
ALTER TABLE whatsapp_conversations
  ADD CONSTRAINT check_whatsapp_conversation_status
  CHECK (status IN ('active', 'archived', 'blocked'));

-- message direction must be valid
ALTER TABLE whatsapp_messages
  ADD CONSTRAINT check_whatsapp_message_direction
  CHECK (direction IN ('inbound', 'outbound'));

-- lead source must be valid
ALTER TABLE leads
  ADD CONSTRAINT check_leads_source
  CHECK (source IN ('manual', 'whatsapp', 'webhook', 'api'));
```

---

## RLS (Row Level Security) Policies

All tables must enforce organization isolation:

```sql
-- WhatsAppConversation: Only users of same org can access
CREATE POLICY whatsapp_conversations_org_isolation ON whatsapp_conversations
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id')::uuid);

-- WhatsAppMessage: Access via conversation's org_id
CREATE POLICY whatsapp_messages_org_isolation ON whatsapp_messages
  FOR ALL
  USING (
    conversation_id IN (
      SELECT id FROM whatsapp_conversations
      WHERE organization_id = current_setting('app.current_org_id')::uuid
    )
  );

-- WhatsAppWebhookLog: Only same org
CREATE POLICY whatsapp_webhook_logs_org_isolation ON whatsapp_webhook_logs
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id')::uuid);

-- Leads: Extend existing policy to include WhatsApp
-- Assuming leads table already has: organization_id = current_setting(...)
-- Add check for wa_id if needed
```

---

## TypeScript Types (for Frontend/API)

```typescript
// types/whatsapp.ts

export type WhatsAppMessage = {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  content: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'video';
  media_url?: string;
  created_at: Date;
};

export type WhatsAppConversation = {
  id: string;
  organization_id: string;
  lead_id: string;
  wa_id: string;
  phone: string;
  status: 'active' | 'archived' | 'blocked';
  last_message_at?: Date;
  message_count: number;
  created_at: Date;
  updated_at: Date;
};

export type WhatsAppWebhookPayload = {
  messaging_product: 'whatsapp';
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts: Array<{
    profile: { name: string };
    wa_id: string;
  }>;
  messages: Array<{
    from: string;
    id: string;
    timestamp: string;
    type: 'text' | 'image' | 'document';
    text?: { body: string };
  }>;
};

export type WhatsAppProvider = {
  sendMessage(waId: string, message: string): Promise<{ message_id: string }>;
  receiveMessage(waId: string, content: string): Promise<WhatsAppConversation>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
};
```

---

## State Transitions

### Conversation Status Flow

```
active
  ├─ archive() → archived
  └─ block() → blocked

archived
  ├─ reactivate() → active
  └─ delete() → removed

blocked
  ├─ unblock() → active
  └─ delete() → removed
```

### Lead Status (Existing, No Change)

WhatsApp leads start in `novo` status and flow through existing pipeline:
```
novo → contato → qualificado → oportunidade
```

---

## Indexes for Performance

```sql
-- WhatsAppConversation
CREATE INDEX idx_whatsapp_conversations_organization_id
  ON whatsapp_conversations(organization_id);

CREATE INDEX idx_whatsapp_conversations_lead_id
  ON whatsapp_conversations(lead_id);

CREATE INDEX idx_whatsapp_conversations_organization_last_message
  ON whatsapp_conversations(organization_id, last_message_at DESC)
  WHERE status = 'active';

-- WhatsAppMessage
CREATE INDEX idx_whatsapp_messages_conversation_created
  ON whatsapp_messages(conversation_id, created_at DESC);

-- WhatsAppWebhookLog
CREATE INDEX idx_whatsapp_webhook_logs_organization_status
  ON whatsapp_webhook_logs(organization_id, status);

CREATE INDEX idx_whatsapp_webhook_logs_created
  ON whatsapp_webhook_logs(created_at DESC);

-- Leads (existing - add if not present)
CREATE INDEX idx_leads_organization_wa_id
  ON leads(organization_id, wa_id)
  WHERE wa_id IS NOT NULL;
```

---

## Summary

| Entity | Purpose | Records/Org | Query Pattern |
|--------|---------|-------------|---------------|
| **WhatsAppConversation** | Track 1:1 threads | 100s | BY organization + last_message_at |
| **WhatsAppMessage** | Store messages | 1000s | BY conversation_id + created_at |
| **WhatsAppWebhookLog** | Audit trail | 1000s | BY organization + status (debug) |
| **Lead (extended)** | Link conversation to CRM lead | 1000s | BY organization + wa_id (dedup) |

All queries MUST filter by `organization_id` (Constitution I - Multi-Tenant Safety).

