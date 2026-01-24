# Feature Specification: WhatsApp Integration

**Feature Branch**: `001-whatsapp-integration`  
**Created**: 2026-01-23  
**Status**: Draft  
**Priority**: P1 (MVP for lead generation & communication)

---

## User Scenarios & Testing

### User Story 1 - Receive WhatsApp Messages & Auto-Create Leads (Priority: P1)

When a customer sends a WhatsApp message to the organization's number, the system automatically creates a lead in the CRM and stores the conversation history.

**Why this priority**: Core feature - inbound lead generation is the primary goal. Without this, there's no value.

**Independent Test**: 
- Send a message from any WhatsApp number
- Lead is automatically created within seconds
- Conversation appears in both WhatsApp Inbox and Lead detail
- Message is not duplicated even if webhook is delivered twice

**Acceptance Scenarios**:

1. **Given** a new WhatsApp message arrives from `+5511987654321`  
   **When** system receives the webhook  
   **Then** a new Lead is created with phone number, name, and "whatsapp" source; Message is stored in whatsapp_messages table; Conversation record is created

2. **Given** a message from the same `wa_id` arrives again  
   **When** system receives the webhook  
   **Then** Lead is NOT duplicated; Message is added to existing conversation; Webhook is processed only once (idempotent)

3. **Given** no name is available from WhatsApp profile  
   **When** lead is created  
   **Then** Lead name defaults to "Lead WhatsApp"; Can be edited manually later

---

### User Story 2 - Send Messages from CRM to WhatsApp (Priority: P1)

User can send WhatsApp messages directly from the CRM (both from WhatsApp Inbox and Lead Detail) to communicate with leads.

**Why this priority**: Core feature - outbound communication enables customer engagement.

**Independent Test**:
- Send message from WhatsApp Inbox tab
- Send message from Lead detail → WhatsApp tab
- Message appears in customer's WhatsApp within seconds
- Message history is saved in CRM

**Acceptance Scenarios**:

1. **Given** I'm viewing a conversation in WhatsApp Inbox  
   **When** I type a message and click "Enviar"  
   **Then** Message is sent via Baileys to customer; Message appears in history with timestamp; UI shows success confirmation

2. **Given** I'm viewing a Lead detail page  
   **When** I click the "WhatsApp" tab and send a message  
   **Then** Message is sent via Baileys; Message appears in both Lead detail and WhatsApp Inbox; Same conversation state is shared

3. **Given** message sending fails (network/timeout)  
   **When** error occurs  
   **Then** User sees error message; Can retry; Message is NOT stored until confirmed sent

---

### User Story 3 - WhatsApp Inbox Dashboard (Priority: P1)

New "WhatsApp" tab in main navigation shows all active conversations, allowing quick access and management.

**Why this priority**: UX feature - must have organized interface for multi-tenant support.

**Independent Test**:
- Visit /whatsapp page
- See list of all open conversations (sorted by last message)
- Click conversation → see full history
- Mark as read/unread
- Search conversations

**Acceptance Scenarios**:

1. **Given** I navigate to WhatsApp Inbox  
   **When** page loads  
   **Then** I see list of all conversations (sorted by recency); Each shows contact name, preview of last message, timestamp, unread indicator

2. **Given** I click on a conversation  
   **When** conversation is selected  
   **Then** Full message history loads in right panel; Can scroll up to see older messages; Send message form appears at bottom

3. **Given** multiple conversations exist  
   **When** I receive a new message  
   **Then** Conversation list updates in real-time; New/updated conversations move to top; Unread badge appears

---

### User Story 4 - WhatsApp in Lead Detail (Priority: P1)

Lead detail page includes a "WhatsApp" tab showing conversation history and allowing direct message sending.

**Why this priority**: UX feature - context-aware messaging when working with individual leads.

**Independent Test**:
- Open a lead with WhatsApp conversation
- See "WhatsApp" tab in lead detail
- View full conversation history
- Send message from tab
- Message appears in both places

**Acceptance Scenarios**:

1. **Given** I'm viewing a Lead detail (created from WhatsApp)  
   **When** I click the "WhatsApp" tab  
   **Then** I see full conversation history; Phone number is displayed; Send message form is visible

2. **Given** I send a message from Lead detail WhatsApp tab  
   **When** message is sent  
   **Then** Message appears immediately in this view; Also appears in WhatsApp Inbox for that conversation

3. **Given** conversation has no messages yet  
   **When** I view the WhatsApp tab  
   **Then** I see "No conversation yet" message; Can still send first message

---

### User Story 5 - Multi-Provider Support (Meta Cloud API + Baileys Web) (Priority: P2)

Admin can choose between two WhatsApp providers: Official Meta Cloud API or Baileys (WhatsApp Web automation).

**Why this priority**: Market reality - not all customers have Meta approval yet. Offer both options.

**Independent Test**:
- Access Settings → Integrations → WhatsApp
- Choose between "Meta Cloud API" or "WhatsApp Web"
- Verify both options can send/receive independently

**Acceptance Scenarios**:

1. **Given** I'm in Settings → WhatsApp Configuration  
   **When** I select "Meta Cloud API"  
   **Then** Fields for Access Token, Phone Number ID appear; Can test connection

2. **Given** I select "WhatsApp Web"  
   **When** I click "Connect"  
   **Then** QR Code appears; Scan with phone → logged in; Can immediately start receiving messages

3. **Given** both providers are configured  
   **When** I send a message  
   **Then** Message goes through the selected provider; Can switch provider without data loss

---

## Requirements (Mandatory)

### Functional Requirements

- **FR-001**: System MUST receive WhatsApp messages via webhook (Baileys or Meta)
- **FR-002**: System MUST auto-create Lead when new WhatsApp message arrives
- **FR-003**: System MUST deduplicate messages (same `wa_id` = same lead, no duplicates on retry)
- **FR-004**: System MUST store complete conversation history (inbound + outbound)
- **FR-005**: System MUST send WhatsApp messages from CRM to customer
- **FR-006**: Users MUST be able to access conversations from two locations: WhatsApp Inbox + Lead Detail
- **FR-007**: System MUST display real-time conversation updates in both locations
- **FR-008**: System MUST support multi-tenant isolation (RLS policies)
- **FR-009**: System MUST enforce organization_id filtering on all queries (Constitution I)
- **FR-010**: System MUST include TypeScript strict mode + zero ESLint warnings (Constitution II)
- **FR-011**: System MUST include unit + integration tests for webhook idempotency (Constitution III)
- **FR-012**: System MUST use single TanStack Query cache per entity (Constitution IV)
- **FR-013**: System MUST support both Meta Cloud API and Baileys Web as pluggable strategies

### Non-Functional Requirements

- **NFR-001**: Message delivery MUST be < 2 seconds (UI feedback)
- **NFR-002**: Webhook processing MUST complete within 5 seconds
- **NFR-003**: Conversation list MUST load within 1 second
- **NFR-004**: System MUST handle up to 100 concurrent WebSocket connections (Baileys)
- **NFR-005**: HMAC verification MUST use crypto.timingSafeEqual (no timing attacks)
- **NFR-006**: Webhook idempotency MUST be guaranteed (Exactly-Once semantics)

### Key Entities

- **Lead**: Extended with `wa_id` (WhatsApp ID) and `source: 'whatsapp'`
- **WhatsAppConversation**: Links Lead ↔ WhatsApp contact (tracks state)
- **WhatsAppMessage**: Individual messages (inbound/outbound) in conversation
- **WhatsAppWebhookLog**: Audit log of webhook deliveries (debug idempotency)
- **OrganizationSettings**: WhatsApp provider config (Meta vs Baileys)

---

## Edge Cases

- What happens if customer changes phone number mid-conversation?
  → Current `wa_id` is stored; system creates new conversation if new phone arrives
- What if WhatsApp Web session expires during message send?
  → Error is caught; user sees retry button; message is NOT marked as sent
- What if same customer sends from 2 different devices?
  → Both `wa_id` are same; merged into single conversation
- What if meta message arrives 7 days late (delayed delivery)?
  → Message is still processed (stored with original timestamp); prevents duplicate by message_id
- How to handle broadcast messages (send to 100 leads at once)?
  → P2 feature: Rate limiting + queue (1 msg/6sec per contact); show progress bar

---

## Testing Priorities

**Unit Tests** (must have):
- ✅ HMAC signature verification (security)
- ✅ Message deduplication logic (wa_id + message_id)
- ✅ Lead creation from WhatsApp payload
- ✅ Phone number normalization

**Integration Tests** (must have):
- ✅ Full webhook flow (receive → create lead → store message)
- ✅ Multi-tenant isolation (org_id filtering)
- ✅ Cache invalidation after send
- ✅ Idempotent processing (retry same webhook 3x)

**E2E Tests** (nice to have):
- Baileys session management
- Real conversation send/receive
- UI updates (real-time via WebSocket if added later)

