# API Contracts: WhatsApp Integration

**Purpose**: OpenAPI specification for all WhatsApp endpoints
**Date**: 2026-01-23

---

## Overview

All endpoints follow NossoCRM patterns:
- ✅ Authentication: Bearer token (Supabase session)
- ✅ Multi-tenant: All require `app.current_org_id` context
- ✅ Response format: Standard JSON + error handling
- ✅ HMAC verification: Optional (for future Meta Cloud webhook)

---

## Endpoints

### 1. Send WhatsApp Message

**POST** `/api/whatsapp/send`

Send a message to a lead via WhatsApp.

#### Request

```json
{
  "leadId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Olá! Tudo bem? Gostaria de saber mais sobre nossa proposta."
}
```

**Parameters**:
- `leadId` (UUID, required): Lead to send message to
- `message` (string, required, max 1000 chars): Message text

**Headers**:
- `Authorization: Bearer <session_token>`
- `Content-Type: application/json`

#### Response (Success)

**200 OK**

```json
{
  "success": true,
  "message_id": "wamid.abc123xyz",
  "timestamp": "2026-01-23T14:30:00Z",
  "conversation_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### Response (Error)

**400 Bad Request**
```json
{
  "error": "Message exceeds 1000 characters",
  "code": "INVALID_MESSAGE"
}
```

**401 Unauthorized**
```json
{
  "error": "Session expired",
  "code": "UNAUTHORIZED"
}
```

**404 Not Found**
```json
{
  "error": "Lead not found",
  "code": "LEAD_NOT_FOUND"
}
```

**429 Too Many Requests**
```json
{
  "error": "Rate limited: 1 message per 6 seconds per contact",
  "code": "RATE_LIMIT",
  "retry_after": 5
}
```

---

### 2. Receive WhatsApp Message (Webhook)

**POST** `/api/whatsapp/receive`

Webhook endpoint for incoming WhatsApp messages (Baileys/Meta).

#### Request (Baileys Format)

```json
{
  "entry": [
    {
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "15550783881",
              "phone_number_id": "106540352242922"
            },
            "contacts": [
              {
                "profile": { "name": "João Silva" },
                "wa_id": "5511987654321"
              }
            ],
            "messages": [
              {
                "from": "5511987654321",
                "id": "wamid.abc123xyz",
                "timestamp": "1672531200",
                "type": "text",
                "text": { "body": "Olá, gostaria de saber mais" }
              }
            ]
          }
        }
      ]
    }
  ]
}
```

**Headers**:
- `Content-Type: application/json`
- `x-hub-signature-256: sha256=<hmac>` (if Meta provider)

#### Response

**200 OK**

```json
{
  "success": true,
  "message_id": "wamid.abc123xyz",
  "conversation_id": "550e8400-e29b-41d4-a716-446655440000",
  "lead_id": "550e8400-e29b-41d4-a716-446655440001"
}
```

**Note**: Endpoint returns 200 immediately (async processing).

---

### 3. List Conversations

**GET** `/api/whatsapp/conversations`

List all active WhatsApp conversations for organization.

#### Query Parameters

- `status` (enum, optional): Filter by status (active, archived, blocked)
  - Default: `active`
- `limit` (integer, optional): Page size
  - Default: `20`
  - Max: `100`
- `offset` (integer, optional): Pagination offset
  - Default: `0`
- `search` (string, optional): Search by contact name or phone
  - Example: `?search=joão`

#### Response

**200 OK**

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "lead_id": "550e8400-e29b-41d4-a716-446655440001",
      "wa_id": "5511987654321",
      "phone": "+55 11 98765-4321",
      "status": "active",
      "lead": {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "name": "João Silva",
        "email": "joao@example.com"
      },
      "last_message_at": "2026-01-23T14:30:00Z",
      "message_count": 5,
      "last_message_preview": "Qual é o valor?",
      "created_at": "2026-01-20T10:00:00Z"
    }
  ],
  "pagination": {
    "total": 42,
    "limit": 20,
    "offset": 0
  }
}
```

---

### 4. Get Conversation

**GET** `/api/whatsapp/conversations/:conversationId`

Get single conversation with full message history.

#### Path Parameters

- `conversationId` (UUID): Conversation ID

#### Query Parameters

- `limit` (integer, optional): Messages per page
  - Default: `50`
  - Max: `200`
- `offset` (integer, optional): Pagination
  - Default: `0` (most recent)

#### Response

**200 OK**

```json
{
  "conversation": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "lead_id": "550e8400-e29b-41d4-a716-446655440001",
    "wa_id": "5511987654321",
    "phone": "+55 11 98765-4321",
    "status": "active",
    "lead": {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "name": "João Silva",
      "email": "joao@example.com",
      "phone": "+55 11 98765-4321",
      "stage": { "id": "...", "name": "Contato Estabelecido" },
      "funnel": { "id": "...", "name": "Inbound WhatsApp" }
    },
    "created_at": "2026-01-20T10:00:00Z"
  },
  "messages": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "direction": "inbound",
      "content": "Olá, tudo bem?",
      "type": "text",
      "created_at": "2026-01-23T14:30:00Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440003",
      "direction": "outbound",
      "content": "Oi! Tudo certo, obrigado!",
      "type": "text",
      "created_at": "2026-01-23T14:31:00Z"
    }
  ],
  "pagination": {
    "total": 15,
    "limit": 50,
    "offset": 0
  }
}
```

---

### 5. Update Conversation Status

**PATCH** `/api/whatsapp/conversations/:conversationId`

Update conversation status (archive, block, reactivate).

#### Request

```json
{
  "status": "archived"
}
```

**Body**:
- `status` (enum): `active`, `archived`, `blocked`

#### Response

**200 OK**

```json
{
  "success": true,
  "conversation": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "archived",
    "updated_at": "2026-01-23T14:35:00Z"
  }
}
```

---

### 6. Get WhatsApp Configuration (Settings)

**GET** `/api/whatsapp/settings`

Get organization's WhatsApp provider configuration.

#### Response

**200 OK**

```json
{
  "provider": "baileys",
  "status": "connected",
  "phone_number": "+55 11 99999-9999",
  "connected_at": "2026-01-23T10:00:00Z",
  "last_heartbeat": "2026-01-23T14:45:00Z",
  "message_count": {
    "inbound": 42,
    "outbound": 18,
    "total": 60
  }
}
```

---

### 7. Update WhatsApp Configuration (Settings)

**POST** `/api/whatsapp/settings`

Update WhatsApp provider or reconnect.

#### Request (For Baileys)

```json
{
  "provider": "baileys",
  "action": "generate_qr"
}
```

#### Response

**200 OK**

```json
{
  "provider": "baileys",
  "action": "qr_generated",
  "qr_code": "data:image/png;base64,iVBORw0KGgo...",
  "expires_in": 60,
  "instructions": "Scan with your WhatsApp mobile phone"
}
```

#### Request (For Meta Cloud API - P2)

```json
{
  "provider": "meta",
  "access_token": "EAAxxx...",
  "phone_number_id": "106540352242922",
  "business_account_id": "123456789"
}
```

#### Response

**200 OK**

```json
{
  "provider": "meta",
  "status": "validated",
  "phone_number": "+1 555 078-3881",
  "verified_name": "My Business"
}
```

---

## Error Handling

All endpoints follow standard error format:

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "Optional field-level details"
  }
}
```

### Common Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `UNAUTHORIZED` | 401 | Not authenticated or session expired |
| `FORBIDDEN` | 403 | Authenticated but no permission (org mismatch) |
| `LEAD_NOT_FOUND` | 404 | Lead doesn't exist |
| `CONVERSATION_NOT_FOUND` | 404 | Conversation doesn't exist |
| `INVALID_MESSAGE` | 400 | Message validation failed (empty, too long, etc) |
| `RATE_LIMIT` | 429 | Too many requests |
| `WHATSAPP_NOT_CONFIGURED` | 400 | Provider not connected |
| `WHATSAPP_SEND_FAILED` | 500 | Message send failed |
| `INTERNAL_ERROR` | 500 | Unexpected error |

---

## Rate Limiting

All endpoints are rate limited:

- **Send message**: 1 per 6 seconds **per contact** (WhatsApp limit)
- **List conversations**: 100 per minute per organization
- **Get conversation**: 200 per minute per organization
- **Webhook receive**: Unlimited (handled asynchronously)

Response includes:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1672531200
```

---

## Authentication & Security

All endpoints require:

1. **Bearer Token**: Valid Supabase session
   ```
   Authorization: Bearer eyJhbGc...
   ```

2. **Organization Context**: Set via middleware
   ```
   app.current_org_id = user's organization
   ```

3. **HMAC Verification** (Webhook only, P2):
   ```
   x-hub-signature-256: sha256=<HMAC-SHA256(body, secret)>
   ```

---

## Pagination

List endpoints support cursor-based pagination:

```json
{
  "data": [...],
  "pagination": {
    "total": 1000,
    "limit": 20,
    "offset": 0,
    "has_next": true
  }
}
```

Request next page:
```
GET /api/whatsapp/conversations?limit=20&offset=20
```

---

## Webhook Verification (Future - Meta Cloud P2)

When registering webhook with Meta Cloud API:

**Challenge Verification** (initial setup):
```
GET https://your-domain.com/api/whatsapp/receive?
  hub.mode=subscribe&
  hub.challenge=abc123&
  hub.verify_token=your_token

Response: 200 OK
Body: abc123
```

**Message Verification** (ongoing):
```
POST /api/whatsapp/receive
X-Hub-Signature-256: sha256=<hmac>

Verify:
  HMAC-SHA256(raw_body, WEBHOOK_SECRET) == signature
```

