# Implementation Plan: WhatsApp Integration

**Branch**: `001-whatsapp-integration` | **Date**: 2026-01-23 | **Spec**: [spec.md](spec.md)

**Note**: This template is filled in by research and architecture planning. See spec.md for feature requirements.

## Summary

Implement native WhatsApp integration for NossoCRM allowing:
- **Inbound**: Automatically create leads from WhatsApp messages
- **Outbound**: Send messages directly from CRM (WhatsApp Inbox + Lead Detail)
- **Dual-Provider**: Support both Meta Cloud API (official) and Baileys Web (free alternative)
- **Multi-Tenant**: Complete isolation per organization with RLS policies

Technical approach: Strategy Pattern for provider switching + TanStack Query for state management + Supabase for persistent storage.

---

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), React 19, Next.js 16 (App Router)

**Primary Dependencies**: 
- `@whiskeysockets/baileys@6.x` (WhatsApp Web automation)
- `@tanstack/react-query@5.x` (state management)
- `@supabase/supabase-js@2.x` (database + auth)
- `crypto` (Node.js built-in for HMAC verification)

**Storage**: PostgreSQL (Supabase) with RLS policies for tenant isolation

**Testing**: Vitest + React Testing Library + happy-dom

**Target Platform**: Web (Next.js 16 with App Router)

**Performance Goals**:
- Message delivery: < 2 seconds (UI feedback)
- Webhook processing: < 5 seconds
- Conversation list load: < 1 second
- Support 100+ concurrent WebSocket connections (Baileys)

**Constraints**:
- HMAC verification MUST use crypto.timingSafeEqual() (timing-safe comparison)
- All database queries MUST filter by organization_id (multi-tenant)
- Webhook processing MUST be idempotent (Exactly-Once semantics)
- Zero ESLint warnings + TypeScript strict mode

**Scale/Scope**: 
- MVP: 1,000 leads/month with ~5 messages each
- Support unlimited organizations (SaaS)
- Support up to 100 concurrent conversations per org

---

## Constitution Check

**Gate: Must pass before implementation. Re-check after Phase 1.**

✅ **I. Multi-Tenant Safety**: All queries filter by `organization_id`. Service role (Baileys session) uses admin context.

✅ **II. TypeScript-First**: Strict mode enforced. All types explicitly defined (WhatsAppMessage, WhatsAppConversation, etc.).

✅ **III. Test-First**: Tests for webhook verification, idempotency, lead creation, cache invalidation.

✅ **IV. Cache Integrity**: TanStack Query with single cache per entity. Mutations use `queryKeys.whatsapp.conversations.lists()`.

✅ **V. AI-Integrated**: N/A for this feature (but future: AI sentiment analysis from messages).

**Status**: All principles satisfied. Ready to implement.

---

## Project Structure

### Documentation (this feature)

```text
specs/001-whatsapp-integration/
├── plan.md              # This file
├── spec.md              # User stories + requirements
├── data-model.md        # Entity relationships (if detailed)
├── contracts/           # API endpoint specs (if external)
└── tasks.md             # Phase-by-phase implementation tasks
```

### Source Code (repository root)

```text
app/
├── api/whatsapp/
│   ├── send/route.ts                    # POST /api/whatsapp/send
│   ├── receive/route.ts                 # POST /api/whatsapp/receive (webhook)
│   └── conversations/[id]/route.ts      # GET /api/whatsapp/conversations/:id
│
└── (protected)/whatsapp/
    └── page.tsx                         # WhatsApp Inbox page

lib/
├── whatsapp/
│   ├── client.ts                        # Baileys WebSocket manager
│   ├── service.ts                       # Business logic (send/receive)
│   ├── provider.ts                      # Strategy pattern interface
│   ├── types.ts                         # TypeScript types
│   └── server.ts                        # Server-only utilities
│
├── query/whatsapp.ts                    # TanStack Query hooks

features/
├── whatsapp/
│   ├── WhatsAppPage.tsx                 # Inbox main component
│   ├── components/
│   │   ├── WhatsAppList.tsx             # Conversation list
│   │   ├── ConversationDetail.tsx       # Conversation view
│   │   ├── MessageBubble.tsx            # Message UI
│   │   ├── SendMessageInput.tsx         # Send form
│   │   └── ConversationPanel.tsx        # Shared panel
│   │
│   └── hooks/useWhatsAppController.ts   # Controller logic

└── leads/
    └── components/LeadWhatsAppWidget.tsx # WhatsApp tab in Lead detail

types/whatsapp.ts                        # Domain types

context/whatsapp/WhatsAppContext.tsx     # State management (optional, if needed beyond TQ)

supabase/
└── migrations/
    └── 20260123000_whatsapp_tables.sql  # Schema for conversations + messages
```

---

## Complexity Tracking

**Constitution Alignment**: ✅ All principles apply. Multi-tenant + TypeScript-strict + test-first are mandatory.

**Technical Debt Avoided**:
- ✅ Using Strategy Pattern for provider switching (no hardcoded provider)
- ✅ TanStack Query for cache management (no manual state)
- ✅ Webhook logging for idempotency debugging
- ✅ Separate `lib/whatsapp/service.ts` for business logic (not mixed with routes)

**Justified Complexity**:
- Webhook idempotency logic (necessary for robustness)
- Multi-provider support (market requirement)
- Dual UI locations (WhatsApp Inbox + Lead Detail)

---

## Dependencies & Trade-offs

### Baileys vs Meta Cloud API

| Aspect | Baileys (Web) | Meta Cloud |
|--------|---------------|-----------|
| Setup time | 5 minutes (QR code) | 1-2 hours (approval process) |
| Cost | Free | $0.003/msg |
| Stability | Medium (breaks on updates) | High (official) |
| Risk | Ban risk (10-20%) | No risk |
| **MVP Choice** | ✅ **Start here** | Implement later |

**Plan**: MVP uses Baileys (faster iteration). Meta Cloud as P2 feature.

---

## Success Criteria

Phase 1 MVP completion:
- ✅ Webhook endpoint receives messages (Baileys)
- ✅ Leads auto-created with deduplication
- ✅ Messages storable in Supabase
- ✅ Send endpoint functional
- ✅ WhatsApp Inbox page renders conversations
- ✅ Lead Detail includes WhatsApp tab
- ✅ Unit + integration tests passing
- ✅ Zero ESLint warnings
- ✅ HMAC verification (when Meta added)

Phase 2 (future):
- Meta Cloud API as alternate provider
- Real-time WebSocket updates
- Broadcast messaging with rate limiting
- AI sentiment analysis

