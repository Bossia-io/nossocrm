# Tasks: WhatsApp Integration (NossoCRM)

**Input**: Design documents from `specs/001-whatsapp-integration/`  
**Prerequisites**: ✅ plan.md, ✅ spec.md, ✅ data-model.md (implicit)  
**Status**: Generated 2026-01-24 | Phase 1-2 ✅ Complete | Phase 3+ 🎯 Ready to Execute

---

## Format: `- [ ] [TaskID] [P?] [Story] Description with file path`

- **[P]**: Parallelizable (different files, no blocking dependencies)
- **[Story]**: Maps to User Story (US1-US5 from spec.md)
- **File paths**: All relative to repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Status**: ✅ COMPLETE (2026-01-23)  
**Tasks**: 5/5  
**Code Lines**: ~1,295 LOC  
**Deliverables**:
- Supabase schema with RLS policies
- TypeScript type definitions (strict mode)
- WhatsApp service layer with business logic
- Environment configuration

**Checkpoint**: Database schema ready, types defined, service layer ready for API integration

- [x] T001 Create Supabase migration with WhatsApp tables in `supabase/migrations/20260123000_whatsapp_tables.sql`
- [x] T002 Create WhatsApp type definitions in `types/whatsapp.ts`
- [x] T003 Implement WhatsApp service layer in `lib/whatsapp/service.ts`
- [x] T004 Create Baileys WebSocket client in `lib/whatsapp/client.ts`
- [x] T005 Configure environment variables in `.env.example`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Status**: ✅ COMPLETE (2026-01-23)  
**Tasks**: 6/6 + 1 helper  
**Code Lines**: ~1,310 LOC  
**Deliverables**:
- 4 RESTful API endpoints (receive, send, conversations list/detail)
- TanStack Query hooks for frontend state management
- Provider factory pattern for Baileys/Meta switching
- HMAC webhook signature verification

**⚠️ CRITICAL**: Phase 1-2 MUST be complete before ANY user story implementation can begin.

**Checkpoint**: APIs working, TanStack Query ready, provider strategy pattern in place

- [x] T006 Create webhook receive endpoint in `app/api/whatsapp/receive/route.ts`
- [x] T007 Create message send endpoint in `app/api/whatsapp/send/route.ts`
- [x] T008 Create conversations list endpoint in `app/api/whatsapp/conversations/route.ts`
- [x] T009 Create conversation detail endpoint in `app/api/whatsapp/conversations/[id]/route.ts`
- [x] T010 Implement TanStack Query hooks in `lib/query/whatsapp.ts`
- [x] T011 Create provider factory in `lib/whatsapp/provider.ts`
- [x] Helper: Created ignore files (`.eslintignore`, `.dockerignore`, `.prettierignore`, `.npmignore`)

---

## Phase 3: User Story 1 - Receive WhatsApp Messages & Auto-Create Leads (Priority: P1) 🎯 MVP

**Goal**: When a customer sends a WhatsApp message to the organization's number, the system automatically creates a lead in the CRM and stores the conversation history.

**Status**: ✅ TESTS COMPLETE (2026-01-24)
**Tests**: 8/8 ✅  
**Code Lines**: ~1,800 LOC (test code)
**Deliverables**:
- 8 comprehensive test files covering all scenarios
- Webhook idempotency validation
- Lead deduplication & multi-tenant isolation
- Phone normalization for all Brazilian formats
- Error handling & graceful degradation
- Webhook signature verification (HMAC-SHA256)
- Comprehensive validation matrix

**Independent Test Criteria**:
- ✅ Send message from new number → Lead created within 2 seconds
- ✅ Send duplicate message → Not duplicated (idempotent)
- ✅ Same customer, new message → Reused existing Lead
- ✅ Phone normalization works (various formats → standardized)
- ✅ Multi-tenant isolation verified (org_id filtering)
- ✅ Error handling & retry logic tested

**Story Acceptance Scenarios**:
1. New message arrives → New Lead created + Conversation created + Message stored
2. Duplicate message (same message_id) → Ignored, processed only once (idempotent)
3. Existing wa_id → Message added to existing Lead/Conversation (no duplication)
4. No name available → Lead name defaults to "Lead WhatsApp" (editable)
5. Webhook fails → Retry mechanism works, no data loss

### Tests for User Story 1

> **CRITICAL**: Write tests FIRST, ensure they FAIL before implementation

- [x] T012 [P] [US1] Unit test webhook idempotency in `test/whatsapp.webhook-idempotency.test.ts`
- [x] T013 [P] [US1] Unit test lead deduplication logic in `test/whatsapp.lead-deduplication.test.ts`
- [x] T014 [P] [US1] Unit test phone number normalization in `test/whatsapp.phone-normalization.test.ts`
- [x] T015 [US1] Integration test complete receive flow (webhook → lead → message → conversation) in `test/whatsapp.receive-flow.test.ts`
- [x] T016 [US1] Integration test multi-tenant isolation (org_id filtering) in `test/whatsapp.multi-tenant.test.ts`
- [x] T017 [P] [US1] Unit test error handling and retry logic in `test/whatsapp.error-handling.test.ts`
- [x] T018 [US1] Integration test webhook signature verification in `test/whatsapp.webhook-verification.test.ts`
- [x] T019 [US1] Create validation test scenarios in `test/whatsapp.validation.test.ts`

### Implementation for User Story 1

- [ ] T020 [US1] Add integration tests to CI/CD pipeline (update GitHub Actions workflow)
- [ ] T021 [US1] Create test fixtures/factories in `test/helpers/whatsapp.fixtures.ts`
- [ ] T022 [US1] Document lead creation logic in `docs/whatsapp-lead-creation.md`
- [ ] T023 [US1] Add error recovery mechanism for failed webhook processing in `lib/whatsapp/service.ts`

**Checkpoint**: User Story 1 complete - receives messages, creates leads, idempotent, fully tested

**Notes**: 
- All tests written in Vitest + happy-dom (per project standards)
- Constitution principles verified:
  - ✅ Constitution I: Multi-tenant isolation (organization_id on all queries)
  - ✅ Constitution II: TypeScript strict mode (no `any`, server-only directives)
  - ✅ Constitution III: Test-first (all tests before implementation)
  - ✅ Constitution IV: Cache integrity (single queryKey per entity)

---

## Phase 4: User Story 2 - Send Messages from CRM to WhatsApp (Priority: P1)

**Goal**: User can send WhatsApp messages directly from the CRM (both from WhatsApp Inbox and Lead Detail) to communicate with leads.

**Independent Test Criteria**:
- ✅ Send message from Inbox UI → Message delivered in < 2 seconds
- ✅ Send message from Lead detail WhatsApp tab → Appears in both locations
- ✅ Message validation (1000 char limit, required recipient)
- ✅ Error handling: network failure, rate limiting, retry logic
- ✅ Cache updates: sent message appears immediately in UI (optimistic update)

**Story Acceptance Scenarios**:
1. User sends from Inbox → Message queued, sent via Baileys, appears in history with timestamp
2. User sends from Lead detail → Same flow, visible in both Inbox and Lead detail
3. Network fails → Error shown, user can retry, message NOT stored until sent
4. Rate limit (1 msg/6sec) → Queued, sent when ready (P2 feature, graceful handling)
5. Multiple recipients → Single message to multiple leads (bulk send, P2 feature)

### Tests for User Story 2

> **CRITICAL**: Write tests FIRST, ensure they FAIL before implementation

- [ ] T024 [P] [US2] Unit test message validation (length, recipient, content) in `test/whatsapp.message-validation.test.ts`
- [ ] T025 [P] [US2] Unit test message queuing & rate limiting in `test/whatsapp.message-queue.test.ts`
- [ ] T026 [US2] Integration test send flow (API → Baileys → Database → Cache) in `test/whatsapp.send-flow.test.ts`
- [ ] T027 [US2] Integration test cache invalidation after send in `test/whatsapp.send-cache.test.ts`
- [ ] T028 [P] [US2] Unit test retry mechanism for failed sends in `test/whatsapp.send-retry.test.ts`

### Implementation for User Story 2

- [ ] T029 [P] [US2] Create React component SendMessageForm in `components/whatsapp/SendMessageForm.tsx`
- [ ] T030 [P] [US2] Extend TanStack Query with useSendWhatsAppMessage hook (already in `lib/query/whatsapp.ts` - verify implementation)
- [ ] T031 [US2] Implement message queue in `lib/whatsapp/queue.ts` (FIFO, exponential backoff)
- [ ] T032 [US2] Add rate limiter for Baileys provider in `lib/whatsapp/rate-limiter.ts`
- [ ] T033 [US2] Integrate send form into WhatsApp Inbox page (Phase 5)
- [ ] T034 [US2] Integrate send form into Lead detail WhatsApp tab (Phase 6)
- [ ] T035 [US2] Add error toast notifications in `components/whatsapp/SendErrorNotification.tsx`
- [ ] T036 [US2] Document message sending flow in `docs/whatsapp-message-sending.md`

**Checkpoint**: User Story 2 complete - can send messages from UI, queued, rate-limited, fully tested

**Dependencies**: Depends on Phase 3 (US1) completion for message routing infrastructure

---

## Phase 5: User Story 3 - WhatsApp Inbox Dashboard (Priority: P1)

**Goal**: New "WhatsApp" tab in main navigation shows all active conversations, allowing quick access and management.

**Independent Test Criteria**:
- ✅ Inbox page loads with list of conversations (sorted by recency)
- ✅ Real-time updates when new messages arrive
- ✅ Search conversations by contact name or phone
- ✅ Filter by status (active, archived, blocked)
- ✅ Mark conversation as read/unread
- ✅ Pagination for large conversation lists

**Story Acceptance Scenarios**:
1. User visits /dashboard/whatsapp → Sees all conversations sorted by last message time
2. User clicks conversation → Full history loads, can scroll up for older messages
3. New message arrives → List updates in real-time, conversation moves to top, unread badge appears
4. User searches → Filter works for contact name or phone number
5. User archives conversation → Removed from inbox, available in archive view
6. User blocks contact → Conversation grayed out, no new messages accepted

### Tests for User Story 3

> **CRITICAL**: Write tests FIRST, ensure they FAIL before implementation

- [ ] T037 [P] [US3] Unit test conversation sorting & filtering logic in `test/whatsapp.inbox-filtering.test.ts`
- [ ] T038 [P] [US3] Unit test real-time update subscription in `test/whatsapp.realtime-updates.test.ts`
- [ ] T039 [US3] Integration test conversation list query with pagination in `test/whatsapp.inbox-pagination.test.ts`
- [ ] T040 [US3] Integration test search functionality in `test/whatsapp.inbox-search.test.ts`
- [ ] T041 [P] [US3] React component test for ConversationList in `test/whatsapp.ConversationList.test.tsx`

### Implementation for User Story 3

- [ ] T042 [P] [US3] Create WhatsApp Inbox page layout in `app/(protected)/whatsapp/page.tsx`
- [ ] T043 [P] [US3] Create ConversationList component in `components/whatsapp/ConversationList.tsx`
- [ ] T044 [P] [US3] Create ConversationDetail component in `components/whatsapp/ConversationDetail.tsx`
- [ ] T045 [US3] Implement real-time subscription for new messages in `lib/realtime/whatsapp.ts`
- [ ] T046 [US3] Create search & filter UI in `components/whatsapp/InboxFilters.tsx`
- [ ] T047 [US3] Implement conversation status update mutations in `lib/query/whatsapp.ts`
- [ ] T048 [US3] Add Inbox link to main navigation in `components/navigation/MainNav.tsx`
- [ ] T049 [US3] Style components per design system (Tailwind + Radix UI)
- [ ] T050 [US3] Add loading states and error boundaries
- [ ] T051 [US3] Document Inbox page behavior in `docs/whatsapp-inbox.md`

**Checkpoint**: User Story 3 complete - full Inbox UI working, real-time updates, search & filter

**Dependencies**: Depends on Phase 3 (US1) and Phase 4 (US2) completion

---

## Phase 6: User Story 4 - WhatsApp in Lead Detail (Priority: P1)

**Goal**: Lead detail page includes a "WhatsApp" tab showing conversation history and allowing direct message sending.

**Independent Test Criteria**:
- ✅ Lead detail shows WhatsApp tab (if conversation exists)
- ✅ Tab displays full conversation history with timestamps
- ✅ Phone number displayed prominently
- ✅ Message send form available in tab
- ✅ Sending from tab also updates Inbox (cache sync)
- ✅ "No conversation yet" message if no history

**Story Acceptance Scenarios**:
1. User views Lead detail (created from WhatsApp) → WhatsApp tab visible with conversation
2. User sends message from tab → Appears immediately in this view and in Inbox
3. User receives message while on tab → New message appears in real-time
4. Lead has no WhatsApp conversation yet → "No conversation yet" + send first message form
5. User switches between Lead detail and Inbox → Cache stays in sync

### Tests for User Story 4

> **CRITICAL**: Write tests FIRST, ensure they FAIL before implementation

- [ ] T052 [P] [US4] Unit test conversation history formatting in `test/whatsapp.history-formatting.test.ts`
- [ ] T053 [US4] Integration test Lead detail WhatsApp data loading in `test/whatsapp.lead-detail-data.test.ts`
- [ ] T054 [P] [US4] React component test for LeadWhatsAppTab in `test/whatsapp.LeadWhatsAppTab.test.tsx`
- [ ] T055 [US4] Integration test cache sync between Inbox and Lead detail in `test/whatsapp.cache-sync.test.ts`

### Implementation for User Story 4

- [ ] T056 [P] [US4] Create LeadWhatsAppTab component in `components/whatsapp/LeadWhatsAppTab.tsx`
- [ ] T057 [US4] Integrate tab into Lead detail page in `features/contacts/lead/LeadDetail.tsx`
- [ ] T058 [US4] Query conversation by lead_id (add query to `lib/query/whatsapp.ts`)
- [ ] T059 [US4] Implement real-time updates for tab in `lib/realtime/whatsapp.ts`
- [ ] T060 [US4] Share SendMessageForm component between Inbox and Lead detail
- [ ] T061 [US4] Add empty state handling (no conversation yet)
- [ ] T062 [US4] Style tab per design system
- [ ] T063 [US4] Document Lead WhatsApp integration in `docs/whatsapp-lead-integration.md`

**Checkpoint**: User Story 4 complete - WhatsApp visible in Lead detail, full sync with Inbox

**Dependencies**: Depends on Phase 3 (US1), Phase 4 (US2), and Phase 5 (US3)

---

## Phase 7: User Story 5 - Multi-Provider Support (Priority: P2)

**Goal**: Admin can choose between two WhatsApp providers: Official Meta Cloud API or Baileys (WhatsApp Web automation).

**Independent Test Criteria**:
- ✅ Settings page shows provider selection (Baileys vs Meta)
- ✅ Switching providers doesn't lose data
- ✅ Both providers can send/receive messages independently
- ✅ Provider configuration stored per organization
- ✅ Connection test endpoint available
- ✅ Error messages differ by provider (helpful debugging)

**Story Acceptance Scenarios**:
1. Admin accesses Settings → WhatsApp → Sees "Provider" dropdown (default: Baileys)
2. Admin selects "Meta Cloud API" → Fields for Access Token, Phone Number ID appear
3. Admin clicks "Test Connection" → Verifies credentials with Meta
4. Admin selects "WhatsApp Web" → QR code appears for phone authentication
5. After switching → Messages continue working (no data loss)
6. Both providers simultaneously configured → Can switch between them without data loss

### Tests for User Story 5

> **CRITICAL**: Write tests FIRST, ensure they FAIL before implementation

- [ ] T064 [P] [US5] Unit test provider factory pattern in `test/whatsapp.provider-factory.test.ts`
- [ ] T065 [P] [US5] Unit test Meta API client initialization in `test/whatsapp.meta-client.test.ts`
- [ ] T066 [P] [US5] Unit test Baileys client initialization in `test/whatsapp.baileys-client.test.ts`
- [ ] T067 [US5] Integration test provider switching (data persistence) in `test/whatsapp.provider-switching.test.ts`
- [ ] T068 [US5] Integration test Meta API send/receive in `test/whatsapp.meta-integration.test.ts`
- [ ] T069 [P] [US5] Unit test provider configuration storage in `test/whatsapp.provider-config.test.ts`

### Implementation for User Story 5

- [ ] T070 [P] [US5] Create Meta API client in `lib/whatsapp/meta-client.ts`
- [ ] T071 [US5] Extend getProvider() factory in `lib/whatsapp/provider.ts` (already started)
- [ ] T072 [P] [US5] Create provider settings UI in `features/settings/whatsapp/ProviderSelect.tsx`
- [ ] T073 [US5] Create Meta credentials form in `features/settings/whatsapp/MetaCredentialsForm.tsx`
- [ ] T074 [US5] Create Baileys QR code form in `features/settings/whatsapp/BaileysQrForm.tsx`
- [ ] T075 [US5] Add provider config endpoint in `app/api/whatsapp/provider/route.ts`
- [ ] T076 [US5] Add connection test endpoint in `app/api/whatsapp/provider/test/route.ts`
- [ ] T077 [US5] Update receiveMessage() to handle both providers in `lib/whatsapp/service.ts`
- [ ] T078 [US5] Update sendMessage() to handle both providers in `lib/whatsapp/service.ts`
- [ ] T079 [US5] Add provider-specific error handling in `lib/whatsapp/errors.ts`
- [ ] T080 [US5] Document multi-provider setup in `docs/whatsapp-multi-provider.md`

**Checkpoint**: User Story 5 complete - Meta + Baileys both supported, switchable per org

**Dependencies**: Phase 3-4 complete. P2 feature - can be deferred after MVP.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements affecting multiple user stories and overall quality

- [ ] T081 [P] Run full test suite: `npm run test:run` (expect all Phase 3-7 tests passing)
- [ ] T082 [P] Run linter: `npm run lint` (zero warnings enforced)
- [ ] T083 [P] Run type checker: `npm run typecheck` (strict mode)
- [ ] T084 Optimize database queries (add missing indexes, review N+1 queries)
- [ ] T085 Performance testing: Load 1000+ conversations, verify < 1 sec load time
- [ ] T086 Security audit: Review all webhook verification, encryption, RLS policies
- [ ] T087 Update README.md with WhatsApp feature documentation
- [ ] T088 Create quickstart guide in `docs/whatsapp-quickstart.md`
- [ ] T089 Update API documentation in `docs/whatsapp-api.md`
- [ ] T090 Create migration guide for existing organizations in `docs/whatsapp-migration.md`
- [ ] T091 Add feature toggle for WhatsApp (kill switch in settings)
- [ ] T092 Create admin documentation for troubleshooting in `docs/whatsapp-troubleshooting.md`
- [ ] T093 Set up monitoring/alerting for webhook failures
- [ ] T094 Create backup strategy for WhatsApp conversation data
- [ ] T095 Final validation against acceptance scenarios from spec.md

**Checkpoint**: WhatsApp feature complete, tested, documented, production-ready

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundational) ← CRITICAL BLOCKER
    ↓
Phase 3 (US1: Receive Messages) ← MVP starts here
    ├─ Can proceed when Phase 2 done
    ├─ No other dependencies
    └─ Must complete before US2, US3, US4
    ↓
Phase 4 (US2: Send Messages) ← Can start when US1 done
Phase 5 (US3: Inbox) ← Can start when US1 done
Phase 6 (US4: Lead Detail) ← Can start when US1-2 done
    ↓
Phase 7 (US5: Multi-Provider) ← Optional, P2 feature
    ↓
Phase 8 (Polish)
```

### User Story Dependencies

| Story | Depends On | Parallel With | Notes |
|-------|-----------|---------------|-------|
| US1 (Receive) | Phase 1-2 | None | MVP foundation, must be first |
| US2 (Send) | US1 | None (after US1 starts) | Requires message service ready |
| US3 (Inbox UI) | US1, US2 | US2 | Needs receive + send working |
| US4 (Lead Detail) | US1, US2 | US3 | Needs Lead entity ready |
| US5 (Multi-Provider) | US1-4 | None | P2 feature, nice-to-have |

### Critical Path to MVP

```
T001-T005 (Setup) → T006-T011 (Foundation) → T012-T023 (US1 Tests+Impl)
                  → ✅ MVP Ready
```

**Estimated timeline**: 
- Phase 1-2: ✅ Already complete (2 days, 2560 LOC)
- Phase 3: 2-3 days (15-20 hours, 8 tests + validation)
- MVP checkpoint: 4-5 days total

### Parallel Opportunities

#### Within Phase 3 (US1):
- `T012`, `T013`, `T014`, `T017` can run in parallel (all [P])
- `T015` depends on T012-T014 completion
- `T018` depends on T015

#### Within Phase 4 (US2):
- `T024`, `T025`, `T028` can run in parallel (all [P])
- `T026`, `T027` depend on prior unit tests
- Components (`T029`, `T030`, etc.) can run in parallel once tests pass

#### Within Phase 5 (US3):
- Components `T042`, `T043`, `T044` can run in parallel
- `T045` (realtime) can run in parallel with components
- `T046`, `T047` can run in parallel

#### Cross-Phase (with multiple developers):
```
Developer A: Complete Phase 3 (US1) fully → Then support Phase 4-5
Developer B: Wait for Phase 2 done, then start Phase 4 (US2) tests
Developer C: Wait for Phase 2 done, then start Phase 5 (US3) tests
```

---

## Implementation Strategy

### MVP First (Recommended Path)

1. ✅ Phase 1-2 complete (already done)
2. 🎯 **Phase 3 (US1)**: Receive messages - 2-3 days
   - Write 8 tests first (T012-T019)
   - Validate webhook idempotency, dedup, normalization
   - Run full test suite
3. **STOP and VALIDATE**: Test US1 independently
4. **Deploy/Demo if ready**: Lead generation working
5. Then proceed to Phase 4-5 for sending + UI

**Timeline**: 4-5 days to working MVP with messages flowing

### Incremental Delivery (Recommended)

**Week 1**:
- Complete Phase 1-2 (foundation) ✅

**Week 2**:
- Phase 3 (US1): Receive + auto-create leads
- Deploy: Beta users can send WhatsApp messages, leads auto-created
- MVP complete

**Week 3**:
- Phase 4 (US2): Send from CRM
- Phase 5 (US3): WhatsApp Inbox
- Deploy: Full bidirectional communication

**Week 4**:
- Phase 6 (US4): Lead detail integration
- Phase 7 (US5): Multi-provider (if time allows)
- Polish, documentation, production hardening

### Single Developer Path

- Do Phase 1-2 (foundation) - can be skipped, already done
- Do Phase 3 (tests + validation) - 2-3 days
- Deploy MVP (Phase 3 only) - 1 day
- Do Phase 4-7 sequentially - 2-3 weeks
- Total: ~4 weeks to feature-complete

### Multi-Developer Path (3+ developers)

1. All complete Phase 2 together (foundation)
2. Developer A focuses Phase 3 (US1)
3. Developer B focuses Phase 4 (US2) starting day 2
4. Developer C focuses Phase 5 (US3) starting day 3
5. All Phase 3-5 happening in parallel
6. Merge/integrate Phase 6 when Phase 4 complete
7. Timeline: 2-3 weeks total to feature-complete

---

## Validation Checklist

### Phase 1-2 Validation (✅ Already Complete)

- [x] Database schema created with all tables
- [x] RLS policies enforce organization isolation
- [x] TypeScript types defined (strict mode)
- [x] API endpoints respond correctly
- [x] Service layer implements business logic
- [x] Provider factory supports both Baileys and Meta

### Phase 3 Validation (🎯 Next)

**Before Phase 4 starts, validate**:
- [ ] All 8 tests in T012-T019 pass (100%)
- [ ] Webhook receives messages correctly
- [ ] Lead is created automatically within 2 seconds
- [ ] Duplicate messages don't create duplicate leads (idempotent)
- [ ] Phone numbers normalized correctly (various formats)
- [ ] Multi-tenant isolation verified (org_id filtering)
- [ ] Error handling works (webhook failures, database errors)
- [ ] No ESLint warnings, strict mode passes

### Phase 4-6 Validation

**Before Phase 7 (P2) starts**:
- [ ] All Phase 4-6 tests pass (100%)
- [ ] Messages send successfully via Baileys
- [ ] Cache updates immediately after send (optimistic update)
- [ ] Inbox UI loads conversations with pagination
- [ ] Real-time updates work (new messages appear instantly)
- [ ] Lead detail WhatsApp tab shows conversation
- [ ] Sending from different locations (Inbox vs Lead) syncs correctly

### Phase 7 Validation

**Before production release**:
- [ ] Meta API client works independently from Baileys
- [ ] Switching providers doesn't lose data
- [ ] Both providers can send/receive simultaneously
- [ ] Provider-specific errors handled gracefully

### Final Validation (Phase 8)

- [ ] All 95 tasks complete
- [ ] All tests pass (integration + unit)
- [ ] Zero ESLint warnings, strict mode
- [ ] Performance meets goals (< 1 sec inbox load, < 2 sec send)
- [ ] Documentation complete
- [ ] RLS policies reviewed by security team
- [ ] Quickstart scenarios verified by QA
- [ ] Deployment steps documented

---

## Quick Reference: Task Count by Phase

| Phase | Count | Status | Estimated Hours | Notes |
|-------|-------|--------|-----------------|-------|
| Phase 1 | 5 | ✅ Complete | - | Setup |
| Phase 2 | 7 | ✅ Complete | - | Foundation |
| Phase 3 | 12 | 🎯 Ready | 15-20 | US1: Receive (8 tests + 4 impl) |
| Phase 4 | 12 | Planned | 20-25 | US2: Send (5 tests + 7 impl) |
| Phase 5 | 10 | Planned | 18-22 | US3: Inbox UI (5 tests + 5 impl) |
| Phase 6 | 8 | Planned | 12-16 | US4: Lead Detail (4 tests + 4 impl) |
| Phase 7 | 11 | P2/Optional | 15-20 | US5: Multi-Provider (6 tests + 5 impl) |
| Phase 8 | 15 | Planned | 10-15 | Polish & cross-cutting |
| **TOTAL** | **80** | - | **90-130 hours** | MVP in ~50-60h (Phase 1-3 only) |

---

## Notes & Best Practices

- **[P] tasks**: Different files, no internal dependencies - run together
- **[Story] label**: Required for Phase 3+ to enable independent story delivery
- **Tests first**: Write failing tests before implementing (TDD approach)
- **Commit strategy**: Commit after each task or logical group
- **Stop points**: Can pause at any "Checkpoint" and deploy that phase
- **Constitution compliance**: All phases validate Constitution principles (I-V)
- **Cache strategy**: All mutations use single queryKey per entity (Constitution IV)
- **Multi-tenant**: Every query filters by organization_id (Constitution I)
- **TypeScript**: Strict mode enforced, no `any`, server-only directives (Constitution II)

---

**Generated**: 2026-01-24  
**Last Updated**: Phase 1-2 Complete ✅ | Phase 3 Ready 🎯  
**Next Action**: Review Phase 3 plan, choose execution path (A/B/C from PHASE_3_ROADMAP.md), begin tests

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core API routes and TanStack Query setup

**⚠️ CRITICAL**: No user story work begins until this is complete

- [ ] T006 Create webhook receive endpoint `app/api/whatsapp/receive/route.ts`:
  - Accept POST from Baileys or Meta webhook
  - Verify HMAC signature (crypto.timingSafeEqual)
  - Return 200 immediately (async processing)
  - Log all requests for debugging

- [ ] T007 [P] Create webhook send endpoint `app/api/whatsapp/send/route.ts`:
  - Accept leadId + message
  - Validate organization context
  - Call whatsappService.sendMessage()
  - Return success/error with proper status codes

- [ ] T008 [P] Create conversations fetch endpoint `app/api/whatsapp/conversations/route.ts`:
  - GET: return all conversations for organization
  - Paginate and sort by last_message_at
  - Include lead info (name, phone)

- [ ] T009 [P] Create single conversation endpoint `app/api/whatsapp/conversations/[id]/route.ts`:
  - GET: return messages for conversation
  - Paginate older messages on scroll
  - Include sender metadata

- [ ] T010 Create TanStack Query hooks in `lib/query/whatsapp.ts`:
  - useConversations() - list all conversations
  - useConversation(conversationId) - single conversation with messages
  - useSendWhatsAppMessage() - mutation with optimistic update
  - useSendWhatsAppMessage().invalidate strategy for cache

- [ ] T011 Setup query key factory in `lib/query/whatsapp.ts`:
  - queryKeys.whatsapp.conversations.lists() - used for ALL mutations
  - queryKeys.whatsapp.messages(conversationId) - for pagination
  - Follows Constitution IV (single cache per entity)

**Checkpoint**: Foundation ready - user story implementation can proceed in parallel

---

## Phase 3: User Story 1 - Receive WhatsApp Messages & Auto-Create Leads (P1) 🎯

**Goal**: Incoming WhatsApp messages automatically create/update leads in the CRM

**Independent Test**: Send WhatsApp message → Lead created within 2 seconds → No duplicates on webhook retry

### Tests for US1

- [ ] T012 [P] Unit test for webhook idempotency in `test/whatsapp.webhook.test.ts`:
  - Send same message_id twice
  - Assert lead is created only once
  - Assert message is not duplicated

- [ ] T013 [P] Unit test for lead deduplication in `test/whatsapp.deduplication.test.ts`:
  - New wa_id → create new lead
  - Existing wa_id → reuse lead
  - Phone normalization edge cases

- [ ] T014 Integration test for full flow in `test/whatsapp.receive.integration.test.ts`:
  - Simulate Baileys webhook payload
  - Assert WhatsAppConversation created
  - Assert Lead created with whatsapp source
  - Assert WhatsAppMessage stored
  - Verify organization_id filtering (Constitution I)

### Implementation for US1

- [ ] T015 [US1] Implement receiveMessage logic in `lib/whatsapp/service.ts`:
  - Extract wa_id, contact name, message text from payload
  - Check idempotency (message_id in webhook_logs)
  - Create/find conversation by wa_id
  - Create/find lead by wa_id + phone

- [ ] T016 [US1] Create webhook_logs table query in `lib/whatsapp/service.ts`:
  - Check if message_id already processed
  - Mark processing → processed → handle errors
  - Ensure atomicity (INSERT ... WHERE NOT EXISTS)

- [ ] T017 [US1] Extend Lead schema to include WhatsApp fields in `supabase/migrations/...`:
  - Add column `wa_id` to leads table
  - Add column `source` (set to 'whatsapp' for these leads)
  - Ensure organization_id filter in RLS

- [ ] T018 [US1] Create Baileys event listener in `lib/whatsapp/client.ts`:
  - on('messages.upsert') → call receiveMessage()
  - Handle connection state changes
  - Implement automatic reconnect on disconnect

- [ ] T019 [P] [US1] Create webhook route handler in `app/api/whatsapp/receive/route.ts`:
  - Parse Baileys payload
  - Enqueue processing (QStash or direct if < 5sec)
  - Return 200 immediately

**Checkpoint**: US1 complete. Leads auto-created from WhatsApp messages.

---

## Phase 4: User Story 2 - Send Messages from CRM to WhatsApp (P1)

**Goal**: Users can send messages from CRM, delivered to customer WhatsApp in < 2 seconds

**Independent Test**: Type message in CRM → appears in customer's WhatsApp → appears in history

### Tests for US2

- [ ] T020 [P] Unit test for message sending in `test/whatsapp.send.test.ts`:
  - Mock Baileys socket
  - Assert sendMessage() calls socket.sendMessage()
  - Assert message stored in database with correct direction

- [ ] T021 [P] Unit test for send validation in `test/whatsapp.send.validation.test.ts`:
  - Empty message rejected
  - leadId validation
  - organization_id validation (Constitution I)

- [ ] T022 Integration test for send flow in `test/whatsapp.send.integration.test.ts`:
  - POST /api/whatsapp/send with leadId + message
  - Assert 200 response
  - Assert message in whatsapp_messages table with direction=outbound
  - Assert cache invalidated (query refetch)

### Implementation for US2

- [ ] T023 [US2] Implement sendMessage in `lib/whatsapp/service.ts`:
  - Normalize waId to Baileys format
  - Call sock.sendMessage() via getWhatsAppClient()
  - Handle errors (connection lost, rate limit)
  - Return message metadata

- [ ] T024 [US2] Create rate limiting in `lib/whatsapp/service.ts`:
  - Respect 1 msg/6sec per contact limit
  - Implement exponential backoff on failure
  - Log all attempts to whatsapp_send_log

- [ ] T025 [US2] Update send endpoint `app/api/whatsapp/send/route.ts`:
  - Validate leadId exists
  - Validate message content
  - Call whatsappService.sendMessage()
  - Invalidate query cache after success
  - Return proper error messages

- [ ] T026 [P] [US2] Create useSendWhatsAppMessage hook in `lib/query/whatsapp.ts`:
  - Mutation function POSTs to /api/whatsapp/send
  - Optimistic update on message list
  - Revalidate on success
  - Handle errors with user feedback

**Checkpoint**: US2 complete. Messages sent from CRM appear in customer's WhatsApp.

---

## Phase 5: User Story 3 - WhatsApp Inbox Dashboard (P1)

**Goal**: New WhatsApp tab in main navigation with conversation list interface

**Independent Test**: Visit /whatsapp → see all conversations sorted by recency → select one → see messages → send reply

### Tests for US3

- [ ] T027 [P] Unit test for conversation sorting in `test/whatsapp.list.test.ts`:
  - Assert conversations sorted by last_message_at DESC
  - Assert unread count correct

- [ ] T028 Integration test for WhatsApp page in `test/whatsapp.page.integration.test.ts`:
  - Load /whatsapp page
  - Assert list loads conversations
  - Assert selecting conversation loads messages
  - Assert send form visible

### Implementation for US3

- [ ] T029 [US3] Create WhatsApp Inbox page `app/(protected)/whatsapp/page.tsx`:
  - Route definition
  - Import WhatsAppPage component
  - Verify auth context available

- [ ] T030 [US3] Create WhatsAppPage component `features/whatsapp/WhatsAppPage.tsx`:
  - useState for selectedConversationId
  - useConversations() hook for list
  - Layout: list (left) + detail (right)
  - Responsive grid

- [ ] T031 [US3] Create WhatsAppList component `features/whatsapp/components/WhatsAppList.tsx`:
  - Map conversations to clickable items
  - Show last message preview
  - Show timestamp
  - Highlight selected
  - Loading skeleton

- [ ] T032 [US3] Create ConversationDetail component `features/whatsapp/components/ConversationDetail.tsx`:
  - useConversation() hook for messages
  - Render all messages with MessageBubble
  - Scroll to bottom on new message
  - Show contact info (name, phone)

- [ ] T033 [P] [US3] Create MessageBubble component `features/whatsapp/components/MessageBubble.tsx`:
  - Display inbound (left, green) vs outbound (right, gray)
  - Show timestamp
  - Show sender name if inbound
  - Responsive width

- [ ] T034 [US3] Create SendMessageInput component `features/whatsapp/components/SendMessageInput.tsx`:
  - Textarea with character limit (1000)
  - Ctrl+Enter to send
  - Loading state on button
  - Disabled when message empty

- [ ] T035 [US3] Add WhatsApp to main navigation in `components/navigation/MainNav.tsx` or equivalent:
  - Add menu item pointing to /whatsapp
  - Icon: 📱 or 💬
  - Position after Inbox

- [ ] T036 [US3] Create useWhatsAppController hook in `features/whatsapp/hooks/useWhatsAppController.ts`:
  - Combine useConversations() + useConversation() + useSendWhatsAppMessage()
  - Manage selectedConversationId state
  - Handle optimistic UI updates

**Checkpoint**: US3 complete. WhatsApp Inbox fully functional.

---

## Phase 6: User Story 4 - WhatsApp in Lead Detail (P1)

**Goal**: Lead detail page includes WhatsApp tab for conversation context

**Independent Test**: Open Lead → click WhatsApp tab → see conversation → send message → appears in Inbox too

### Tests for US4

- [ ] T037 [P] Integration test for Lead WhatsApp tab in `test/whatsapp.lead.integration.test.ts`:
  - Open Lead detail with wa_id
  - Click WhatsApp tab
  - Assert messages load
  - Assert send form works
  - Assert message appears in Inbox

### Implementation for US4

- [ ] T038 [US4] Modify LeadDetail component `features/leads/LeadDetail.tsx`:
  - Add Tabs component (if not present)
  - Import LeadWhatsAppWidget
  - Add TabsContent for "whatsapp"

- [ ] T039 [US4] Create LeadWhatsAppWidget `features/leads/components/LeadWhatsAppWidget.tsx`:
  - useWhatsAppConversation(leadId) hook
  - Show "no conversation" if none
  - Render ConversationPanel (shared)
  - Render SendMessageForm (shared)

- [ ] T040 [P] [US4] Create ConversationPanel component `features/whatsapp/components/ConversationPanel.tsx`:
  - Shared between Inbox and Lead detail
  - Takes messages[] and isPending
  - Renders MessageBubble[] with scroll

- [ ] T041 [P] [US4] Create SendMessageForm component `features/whatsapp/components/SendMessageForm.tsx`:
  - Shared between Inbox and Lead detail
  - Takes leadId and onSend callback
  - Uses SendMessageInput + useSendWhatsAppMessage

- [ ] T042 [US4] Extend useConversations hook to support Lead lookup:
  - Add useWhatsAppConversation(leadId) variant
  - Query by lead_id instead of conversation_id

**Checkpoint**: US4 complete. WhatsApp accessible from both Inbox and Lead detail.

---

## Phase 7: User Story 5 - Multi-Provider Support (P2)

**Goal**: Admin can switch between Baileys (free) and Meta Cloud API (official)

**Independent Test**: Configure Meta API → send message → delivered via Meta → switch to Baileys → still works

### Tests for US5

- [ ] T043 Unit test for provider strategy in `test/whatsapp.provider.strategy.test.ts`:
  - Mock BaileysProvider.sendMessage()
  - Mock MetaProvider.sendMessage()
  - Assert both implement interface
  - Assert strategy switching works

### Implementation for US5

- [ ] T044 [US5] Create provider interface in `lib/whatsapp/provider.ts`:
  - WhatsAppProvider interface (sendMessage, receiveMessage, connect, disconnect)
  - Both Baileys and Meta must implement

- [ ] T045 [US5] Create MetaProvider class in `lib/whatsapp/providers/meta.ts`:
  - Implement WhatsAppProvider interface
  - sendMessage() → POST to Meta Graph API
  - receiveMessage() → handle webhook (P2)
  - Placeholder for now (T046)

- [ ] T046 [P] [US5] Create BaileysProvider class `lib/whatsapp/providers/baileys.ts`:
  - Implement WhatsAppProvider interface
  - Wrap existing Baileys client logic
  - sendMessage() → sock.sendMessage()
  - receiveMessage() → listener callback

- [ ] T047 [US5] Create provider factory in `lib/whatsapp/factory.ts`:
  - getProvider(organizationId): Promise<WhatsAppProvider>
  - Read from organization_settings
  - Return appropriate provider

- [ ] T048 [US5] Update service to use factory in `lib/whatsapp/service.ts`:
  - sendMessage() calls getProvider()
  - receiveMessage() calls getProvider()
  - All routes use factory

- [ ] T049 [US5] Add organization_settings table column in migration:
  - whatsapp_provider: 'baileys' | 'meta'
  - whatsapp_config: jsonb (provider-specific config)
  - RLS policy: users can only see own org

- [ ] T050 [US5] Create Settings page for WhatsApp config:
  - Page: /settings/whatsapp
  - Choose provider: Baileys or Meta
  - If Baileys: show QR code, test button
  - If Meta: input fields for Token + Phone ID, test button

**Checkpoint**: US5 complete (P2). Both providers selectable.

---

## Phase 8: Testing & Quality (Blocking)

**Purpose**: Ensure all code meets Constitution requirements

- [ ] T051 Run `npm run lint` and fix all warnings
  - Zero warnings enforced
  - Constitution II (TypeScript-First)

- [ ] T052 Run `npm run typecheck` and fix all errors
  - Strict mode: true
  - No implicit any

- [ ] T053 Run `npm run test:run` - all tests passing
  - Unit tests: webhook, dedup, send, list
  - Integration tests: receive, send, page flow
  - Constitution III (Test-First)

- [ ] T054 Code review checklist:
  - [ ] All queries filter by organization_id (Constitution I)
  - [ ] No `any` types without justification (Constitution II)
  - [ ] Tests use Happy Path + Error Path (Constitution III)
  - [ ] Cache uses queryKeys.*.lists() for mutations (Constitution IV)
  - [ ] AI tools filter by org_id if applicable (Constitution V)

---

## Phase 9: Documentation & Deployment

**Purpose**: Document and prepare for production

- [ ] T055 Create user documentation in docs/:
  - whatsapp-setup.md: How to connect WhatsApp
  - whatsapp-faq.md: Common questions
  - whatsapp-limits.md: Rate limits, best practices

- [ ] T056 Create developer documentation:
  - Architecture diagram (provider pattern)
  - API endpoint reference
  - Query key reference

- [ ] T057 Create migration guide for existing users:
  - Run `supabase migration up`
  - Configure WhatsApp provider in Settings
  - Test with sample message

- [ ] T058 Update README.md:
  - Add WhatsApp to features list
  - Link to setup docs

- [ ] T059 Deploy to staging:
  - Verify webhook delivery works
  - Test Baileys QR code login
  - Load test with 100+ messages

---

## Summary

**Total Tasks**: 59  
**By Phase**:
- Phase 1 (Setup): 5 tasks
- Phase 2 (Foundation): 6 tasks
- Phase 3 (US1): 8 tasks
- Phase 4 (US2): 8 tasks
- Phase 5 (US3): 9 tasks
- Phase 6 (US4): 6 tasks
- Phase 7 (US5): 7 tasks
- Phase 8 (Testing): 4 tasks
- Phase 9 (Docs): 5 tasks

**Parallelizable Tasks** [P]: 25 tasks (can run simultaneously)

**Critical Path** (sequential): 34 tasks (~4 weeks, 2 devs)

**MVP Scope** (first 2 weeks): Phase 1 + Phase 2 + Phase 3 + Phase 4 (US1 + US2)
- Remove Phase 5 (US3), Phase 6 (US4) for speed
- Add UI later as Phase 2 enhancement

---

## Execution Strategy

### Week 1: Foundation
- Phase 1 (T001-T005): 3 days
- Phase 2 (T006-T011): 3 days
- [Parallel] Testing setup (T012-T014)

### Week 2: US1 + US2
- T015-T019 (US1 implementation): 2.5 days
- T023-T026 (US2 implementation): 2.5 days

### Week 3: UI Layer
- T029-T036 (US3 Inbox): 3 days
- T038-T042 (US4 Lead detail): 2 days

### Week 4: Polish + Meta
- T044-T050 (US5 Multi-provider): 3 days
- T051-T059 (Testing, docs, deploy): 3 days

