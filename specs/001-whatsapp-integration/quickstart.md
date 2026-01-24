# Quickstart: WhatsApp Integration

**Purpose**: Getting started guide for developers implementing WhatsApp feature
**Date**: 2026-01-23

---

## 5-Minute Setup

### 1. Install Dependencies

```bash
npm install @whiskeysockets/baileys @tanstack/react-query @supabase/supabase-js crypto
```

### 2. Create Database Schema

Run migration:
```bash
supabase migration up
```

Or manually create tables (see [data-model.md](../data-model.md)):
```sql
CREATE TABLE whatsapp_conversations (...)
CREATE TABLE whatsapp_messages (...)
CREATE TABLE whatsapp_webhook_logs (...)
```

### 3. Environment Setup

Add to `.env.local`:
```
WHATSAPP_PROVIDER=baileys
WHATSAPP_SESSION_ENCRYPTION_KEY=your-32-char-key
WHATSAPP_WEBHOOK_SECRET=your-webhook-secret
```

### 4. Initialize Baileys Client

Create `lib/whatsapp/client.ts`:

```typescript
import 'server-only';
import { Browsers, makeWASocket } from '@whiskeysockets/baileys';

export async function initializeWhatsAppWeb() {
  const sock = makeWASocket({
    browser: Browsers.macOS('Desktop'),
  });

  sock.ev.on('connection.update', (update) => {
    const { qr, connection } = update;
    if (qr) console.log('Scan QR Code:', qr);
    if (connection === 'open') console.log('✅ Connected!');
  });

  return sock;
}
```

### 5. Create Service Layer

Create `lib/whatsapp/service.ts`:

```typescript
import { initializeWhatsAppWeb } from './client';
import { createServerClient } from '@/lib/supabase/server';

export async function receiveMessage(
  waId: string,
  content: string,
  organizationId: string
) {
  const supabase = await createServerClient();
  
  // Find or create conversation
  const { data: conversation } = await supabase
    .from('whatsapp_conversations')
    .select('id, lead_id')
    .eq('wa_id', waId)
    .eq('organization_id', organizationId)
    .single();

  if (!conversation) {
    // Create new lead
    const { data: lead } = await supabase
      .from('leads')
      .insert({
        organization_id: organizationId,
        wa_id: waId,
        source: 'whatsapp',
        name: 'Lead WhatsApp',
      })
      .select()
      .single();

    // Create conversation
    const { data: newConvo } = await supabase
      .from('whatsapp_conversations')
      .insert({
        organization_id: organizationId,
        lead_id: lead.id,
        wa_id: waId,
        phone: waId,
      })
      .select()
      .single();

    // Store message
    await supabase.from('whatsapp_messages').insert({
      conversation_id: newConvo.id,
      direction: 'inbound',
      content,
    });

    return newConvo;
  }

  // Store message in existing conversation
  await supabase.from('whatsapp_messages').insert({
    conversation_id: conversation.id,
    direction: 'inbound',
    content,
  });

  return conversation;
}
```

### 6. Create API Route

Create `app/api/whatsapp/receive/route.ts`:

```typescript
import { receiveMessage } from '@/lib/whatsapp/service';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Parse Baileys webhook
    const messages = body.entry?.[0]?.changes?.[0]?.value?.messages || [];
    
    for (const msg of messages) {
      const { from, text } = msg;
      const organizationId = req.headers.get('x-org-id')!;
      
      await receiveMessage(
        from,
        text.body,
        organizationId
      );
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('[whatsapp/receive]', error);
    return new Response('Error', { status: 500 });
  }
}
```

---

## Integration Points

### Connect to Baileys Listener

In your server component or initialization:

```typescript
import { initializeWhatsAppWeb } from '@/lib/whatsapp/client';
import { receiveMessage } from '@/lib/whatsapp/service';

async function setupWhatsAppListener(organizationId: string) {
  const sock = await initializeWhatsAppWeb();
  
  sock.ev.on('messages.upsert', async (m) => {
    for (const message of m.messages) {
      if (message.key.fromMe) continue; // Skip own messages
      
      const from = message.key.remoteJid;
      const text = message.message?.conversation;
      
      if (text) {
        await receiveMessage(from, text, organizationId);
      }
    }
  });
  
  return sock;
}
```

### Add WhatsApp Tab to Lead Detail

In `features/leads/LeadDetail.tsx`:

```typescript
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LeadWhatsAppWidget } from './components/LeadWhatsAppWidget';

export function LeadDetail({ leadId }: { leadId: string }) {
  return (
    <Tabs>
      <TabsList>
        <TabsTrigger value="info">Informações</TabsTrigger>
        <TabsTrigger value="whatsapp">💬 WhatsApp</TabsTrigger>
      </TabsList>
      
      <TabsContent value="info">
        {/* existing content */}
      </TabsContent>
      
      <TabsContent value="whatsapp">
        <LeadWhatsAppWidget leadId={leadId} />
      </TabsContent>
    </Tabs>
  );
}
```

### Create WhatsApp Inbox Page

In `app/(protected)/whatsapp/page.tsx`:

```typescript
import { WhatsAppPage } from '@/features/whatsapp/WhatsAppPage';

export default function Page() {
  return <WhatsAppPage />;
}
```

---

## Testing

### Test Message Reception

1. Get QR code from `http://localhost:3000/api/whatsapp/qr`
2. Scan with your WhatsApp phone
3. Send message to your number
4. Check database:

```sql
SELECT * FROM whatsapp_messages 
ORDER BY created_at DESC 
LIMIT 1;
```

### Test Message Sending

```typescript
import { useSendWhatsAppMessage } from '@/lib/query/whatsapp';

export function TestSend() {
  const { mutate } = useSendWhatsAppMessage();
  
  return (
    <button
      onClick={() =>
        mutate({
          leadId: 'lead-uuid',
          message: 'Teste',
        })
      }
    >
      Send Test Message
    </button>
  );
}
```

---

## Debugging

### View Webhook Logs

```sql
SELECT * FROM whatsapp_webhook_logs
WHERE organization_id = 'your-org-id'
ORDER BY created_at DESC
LIMIT 20;
```

### Check Conversation History

```sql
SELECT m.* FROM whatsapp_messages m
JOIN whatsapp_conversations c ON m.conversation_id = c.id
WHERE c.lead_id = 'lead-uuid'
ORDER BY m.created_at DESC;
```

### Monitor Baileys Connection

Check logs for:
```
✅ Connected!
Scan QR Code: data:image/png...
Message received: ...
```

---

## Common Issues

### Issue: Messages Not Appearing

**Check**:
1. QR code scanned successfully? `✅ Connected!` in logs?
2. Message sent from correct WhatsApp number?
3. Organization ID set correctly?
4. RLS policy allowing access?

```sql
-- Debug RLS
SET app.current_org_id = '...';
SELECT * FROM whatsapp_messages LIMIT 1;
```

### Issue: Duplicate Messages

**Cause**: Webhook delivered twice (Baileys retry)

**Fix**: Check `whatsapp_webhook_logs` table for idempotency:
```sql
SELECT message_id, COUNT(*) 
FROM whatsapp_webhook_logs
GROUP BY message_id
HAVING COUNT(*) > 1;
```

### Issue: Send Fails with "Not Configured"

**Check**:
1. Baileys client initialized? `initializeWhatsAppWeb()`?
2. Organization has WhatsApp configured?
3. Session still valid (not expired)?

---

## Next Steps

### Phase 1 MVP (Complete)
- [x] Receive messages
- [x] Create leads
- [x] Send messages
- [x] Store conversation history

### Phase 2 (UI)
- [ ] WhatsApp Inbox page (with list + detail)
- [ ] Lead detail WhatsApp tab
- [ ] Real-time message updates

### Phase 3 (Multi-Provider)
- [ ] Meta Cloud API support
- [ ] Provider switching in Settings
- [ ] HMAC verification for Meta

### Phase 4 (Advanced)
- [ ] Broadcast messages
- [ ] Message templates
- [ ] AI sentiment analysis

---

## Reference

- **Schema**: [data-model.md](../data-model.md)
- **API Endpoints**: [contracts/whatsapp-api.md](../contracts/whatsapp-api.md)
- **Tasks**: [tasks.md](../tasks.md)
- **Baileys Docs**: https://github.com/WhiskeySockets/Baileys
- **Supabase**: https://supabase.com/docs

