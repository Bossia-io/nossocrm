# WhatsApp Integration - Exemplos de Código

## 1. Webhook Endpoint Seguro

### app/api/webhooks/whatsapp/route.ts

```typescript
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { verifyWebhookSignature } from './verify';
import { processWhatsAppMessage } from '@/lib/whatsapp/service';

/**
 * GET: Verificação inicial do webhook (Meta Challenge)
 * POST: Receber webhooks com mensagens
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  const mode = searchParams.get('hub.mode');
  const challenge = searchParams.get('hub.challenge');
  const verifyToken = searchParams.get('hub.verify_token');
  
  // Verificar token
  if (mode !== 'subscribe' || !challenge) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  
  if (verifyToken !== process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.error('Invalid verify token');
    return new NextResponse('Forbidden', { status: 403 });
  }
  
  // Responder com challenge
  return new NextResponse(challenge, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

export async function POST(request: NextRequest) {
  try {
    // 1. Verificar assinatura HMAC
    const signature = request.headers.get('x-hub-signature-256');
    if (!signature) {
      console.error('Missing webhook signature');
      return new NextResponse('Unauthorized', { status: 403 });
    }
    
    const body = await request.text();
    
    const isValid = verifyWebhookSignature(
      body,
      signature,
      process.env.WHATSAPP_WEBHOOK_SECRET!
    );
    
    if (!isValid) {
      console.error('Invalid webhook signature');
      return new NextResponse('Unauthorized', { status: 403 });
    }
    
    // 2. Parse e processar
    const webhook = JSON.parse(body);
    
    // 3. Enfileirar processamento assíncrono
    // (Para não bloquear por > 5s)
    processWhatsAppMessage(webhook).catch((error) => {
      console.error('Error processing webhook:', error);
      // Notify monitoring service
    });
    
    // 4. Retornar 200 imediatamente
    return new NextResponse(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new NextResponse(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500 }
    );
  }
}
```

### lib/whatsapp/verify.ts

```typescript
import crypto from 'crypto';

/**
 * Verifica assinatura HMAC SHA256 do webhook
 * Protege contra man-in-the-middle
 */
export function verifyWebhookSignature(
  body: string,
  signature: string,
  secretKey: string
): boolean {
  try {
    // Compute expected signature
    const hash = crypto
      .createHmac('sha256', secretKey)
      .update(body)
      .digest('hex');
    
    const expectedSignature = `sha256=${hash}`;
    
    // Compare safely (protege contra timing attacks)
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}
```

---

## 2. Service Layer - Business Logic

### lib/whatsapp/service.ts

```typescript
import 'server-only';
import { createServerClient } from '@/lib/supabase/server';
import { whatsappAPI } from './client';
import { findOrCreateLead } from '@/features/leads/queries';
import type { WhatsAppWebhook } from '@/types/whatsapp';

/**
 * Processar webhook de mensagem do WhatsApp
 * Chamado de forma assíncrona para não bloquear webhook
 */
export async function processWhatsAppMessage(webhook: WhatsAppWebhook) {
  const entry = webhook.entry?.[0];
  if (!entry?.changes?.[0]) return;
  
  const change = entry.changes[0];
  if (change.field !== 'messages') return;
  
  const value = change.value;
  const message = value.messages?.[0];
  const contact = value.contacts?.[0];
  
  if (!message || !contact || message.type !== 'text') return;
  
  // Organização (from header ou config)
  const organizationId = process.env.WHATSAPP_ORGANIZATION_ID!;
  
  const supabase = createServerClient();
  
  try {
    // 1. Verificar idempotência
    const existing = await supabase
      .from('whatsapp_messages')
      .select('id')
      .eq('wa_message_id', message.id)
      .maybeSingle();
    
    if (existing.data) {
      console.log(`Message ${message.id} already processed`);
      return;
    }
    
    // 2. Normalizar telefone
    const phone = normalizePhoneNumber(message.from);
    
    // 3. Encontrar ou criar lead
    const { lead, created } = await findOrCreateLead(supabase, {
      organizationId,
      wa_id: contact.wa_id,
      phone,
      name: contact.profile.name,
      first_message: message.text.body,
      timestamp: message.timestamp,
    });
    
    // 4. Criar/atualizar conversa
    const conversation = await supabase
      .from('whatsapp_conversations')
      .upsert(
        {
          organization_id: organizationId,
          lead_id: lead.id,
          wa_id: contact.wa_id,
          phone,
          last_message_at: new Date(parseInt(message.timestamp) * 1000),
        },
        { onConflict: 'wa_id,organization_id' }
      )
      .select()
      .single();
    
    // 5. Armazenar mensagem
    await supabase.from('whatsapp_messages').insert({
      conversation_id: conversation.data!.id,
      wa_message_id: message.id,
      direction: 'inbound',
      content: message.text.body,
      type: 'text',
      created_at: new Date(parseInt(message.timestamp) * 1000),
    });
    
    // 6. Log webhook processado
    await supabase.from('whatsapp_webhook_logs').insert({
      organization_id: organizationId,
      message_id: message.id,
      status: 'processed',
      payload: value,
      result: { leadId: lead.id, created },
    });
    
    // 7. Enviar resposta automática (opcional)
    if (created) {
      await sendAutoReply(phone, contact.profile.name);
    }
    
    console.log(`Lead ${lead.id} processed from WhatsApp`);
  } catch (error) {
    console.error('Error processing WhatsApp message:', error);
    
    // Log erro
    await supabase.from('whatsapp_webhook_logs').insert({
      organization_id: organizationId,
      message_id: message?.id || 'unknown',
      status: 'failed',
      payload: webhook,
      error_message: error instanceof Error ? error.message : 'Unknown error',
    }).catch(console.error);
    
    throw error;
  }
}

/**
 * Enviar resposta automática quando novo lead contata
 */
async function sendAutoReply(phone: string, name: string) {
  try {
    await whatsappAPI.sendMessage({
      to: phone,
      text: `Olá ${name}! 👋\n\nObrigado por entrar em contato conosco via WhatsApp. Já recebemos sua mensagem e logo responderemos com mais informações.\n\n😊`,
    });
  } catch (error) {
    console.warn('Failed to send auto reply:', error);
    // Não falhar o fluxo principal
  }
}

function normalizePhoneNumber(rawPhone: string): string {
  // Remove + e espaços
  const normalized = rawPhone.replace(/[\s+]/g, '');
  
  // Adicionar + se não tiver
  if (!normalized.startsWith('+')) {
    return `+${normalized}`;
  }
  
  return `+${normalized}`;
}
```

---

## 3. Lead Creation Query

### features/leads/queries.ts

```typescript
import { SupabaseClient } from '@supabase/supabase-js';

interface CreateLeadFromWhatsAppInput {
  organizationId: string;
  wa_id: string;
  phone: string;
  name: string;
  first_message: string;
  timestamp: string;
}

export async function findOrCreateLead(
  supabase: SupabaseClient,
  input: CreateLeadFromWhatsAppInput
) {
  const { organizationId, wa_id, phone, name, first_message, timestamp } = input;
  
  // 1. Procurar por wa_id (mais preciso)
  let lead = await supabase
    .from('leads')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('wa_id', wa_id)
    .maybeSingle();
  
  if (lead.data) {
    // Atualizar last_message_at
    await supabase
      .from('leads')
      .update({
        metadata: {
          ...lead.data.metadata,
          last_message_at: new Date(parseInt(timestamp) * 1000),
        },
      })
      .eq('id', lead.data.id);
    
    return { lead: lead.data, created: false };
  }
  
  // 2. Procurar por telefone (case: múltiplos wa_id mesmo número)
  lead = await supabase
    .from('leads')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('phone', phone)
    .eq('source', 'whatsapp')
    .maybeSingle();
  
  if (lead.data) {
    // Atualizar wa_id
    await supabase
      .from('leads')
      .update({ wa_id })
      .eq('id', lead.data.id);
    
    return { lead: lead.data, created: false };
  }
  
  // 3. Novo lead
  const defaultFunnel = await getDefaultFunnel(supabase, organizationId);
  const initialStage = await getInitialStage(supabase, defaultFunnel.id);
  
  const newLead = await supabase
    .from('leads')
    .insert({
      organization_id: organizationId,
      source: 'whatsapp',
      source_type: 'whatsapp_message',
      wa_id,
      phone,
      name,
      email: null,
      status: 'novo',
      funnel_id: defaultFunnel.id,
      stage_id: initialStage.id,
      message: first_message,
      tags: ['whatsapp', 'inbound'],
      metadata: {
        whatsapp_first_message: first_message,
        first_message_at: new Date(parseInt(timestamp) * 1000),
        last_message_at: new Date(parseInt(timestamp) * 1000),
      },
    })
    .select()
    .single();
  
  if (newLead.error) throw newLead.error;
  
  return { lead: newLead.data!, created: true };
}

async function getDefaultFunnel(
  supabase: SupabaseClient,
  organizationId: string
) {
  let funnel = await supabase
    .from('funnels')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('name', 'WhatsApp Inbound')
    .maybeSingle();
  
  if (funnel.data) return funnel.data;
  
  // Criar funnel padrão
  const created = await supabase
    .from('funnels')
    .insert({
      organization_id: organizationId,
      name: 'WhatsApp Inbound',
      description: 'Leads vindos do WhatsApp',
      is_active: true,
    })
    .select()
    .single();
  
  if (created.error) throw created.error;
  return created.data!;
}

async function getInitialStage(
  supabase: SupabaseClient,
  funnelId: string
) {
  const stage = await supabase
    .from('stages')
    .select('*')
    .eq('funnel_id', funnelId)
    .order('order', { ascending: true })
    .limit(1)
    .single();
  
  if (stage.error) throw stage.error;
  return stage.data!;
}
```

---

## 4. WhatsApp API Client

### lib/whatsapp/client.ts

```typescript
import 'server-only';

const API_VERSION = 'v18.0';
const GRAPH_URL = 'https://graph.instagram.com';

interface SendMessageParams {
  to: string;
  text: string;
  previewUrl?: boolean;
}

interface SendMessageResponse {
  messages: Array<{ id: string }>;
  contacts: Array<{ input: string; wa_id: string }>;
}

class WhatsAppClient {
  private accessToken: string;
  private businessPhoneNumberId: string;
  
  constructor(accessToken: string, phoneNumberId: string) {
    this.accessToken = accessToken;
    this.businessPhoneNumberId = phoneNumberId;
  }
  
  /**
   * Enviar mensagem de texto simples
   * Apenas dentro da janela de 24h ou com template
   */
  async sendMessage(params: SendMessageParams): Promise<SendMessageResponse> {
    const url = `${GRAPH_URL}/${API_VERSION}/${this.businessPhoneNumberId}/messages`;
    
    const payload = {
      messaging_product: 'whatsapp',
      to: params.to,
      type: 'text',
      text: {
        body: params.text,
        preview_url: params.previewUrl ?? false,
      },
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new WhatsAppAPIError(
        error.error?.message || 'Failed to send message',
        error.error?.code,
        error
      );
    }
    
    return response.json();
  }
  
  /**
   * Enviar template de mensagem
   * Pode ser enviado fora da janela de 24h
   */
  async sendTemplate(params: {
    to: string;
    templateName: string;
    language?: string;
    params?: string[];
  }): Promise<SendMessageResponse> {
    const url = `${GRAPH_URL}/${API_VERSION}/${this.businessPhoneNumberId}/messages`;
    
    const payload = {
      messaging_product: 'whatsapp',
      to: params.to,
      type: 'template',
      template: {
        name: params.templateName,
        language: {
          code: params.language || 'pt_BR',
        },
        ...(params.params && {
          components: [
            {
              type: 'body',
              parameters: params.params.map((p) => ({ type: 'text', text: p })),
            },
          ],
        }),
      },
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new WhatsAppAPIError(
        error.error?.message || 'Failed to send template',
        error.error?.code,
        error
      );
    }
    
    return response.json();
  }
  
  /**
   * Marcar mensagem como lida
   */
  async markAsRead(messageId: string): Promise<void> {
    const url = `${GRAPH_URL}/${API_VERSION}/${this.businessPhoneNumberId}/messages`;
    
    const payload = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new WhatsAppAPIError(
        error.error?.message || 'Failed to mark as read',
        error.error?.code,
        error
      );
    }
  }
}

class WhatsAppAPIError extends Error {
  constructor(
    message: string,
    public code?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'WhatsAppAPIError';
  }
}

// Singleton instance
let clientInstance: WhatsAppClient | null = null;

export function getWhatsAppClient(): WhatsAppClient {
  if (!clientInstance) {
    clientInstance = new WhatsAppClient(
      process.env.WHATSAPP_ACCESS_TOKEN!,
      process.env.WHATSAPP_PHONE_NUMBER_ID!
    );
  }
  return clientInstance;
}

export const whatsappAPI = new Proxy({}, {
  get: (_, prop) => {
    const client = getWhatsAppClient();
    return (client as any)[prop];
  },
}) as WhatsAppClient;
```

---

## 5. Message Queue com QStash

### lib/whatsapp/queue.ts

```typescript
import 'server-only';
import { Client } from '@upstash/qstash';
import type { WhatsAppWebhook } from '@/types/whatsapp';

const qstash = new Client({
  token: process.env.QSTASH_TOKEN!,
});

/**
 * Enfileirar processamento de webhook para não bloquear resposta
 */
export async function enqueueWhatsAppMessage(webhook: WhatsAppWebhook) {
  try {
    await qstash.publishJSON({
      api: {
        name: 'processWhatsAppMessage',
        method: 'POST',
      },
      body: webhook,
      // Retry automático: 5 tentativas em 24h
      retries: 5,
      // Callback URL
      callback: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/whatsapp/callback`,
    });
  } catch (error) {
    console.error('Failed to enqueue WhatsApp message:', error);
    throw error;
  }
}

/**
 * Handler para processar da fila (chamado por QStash)
 */
export async function handleQueuedMessage(webhook: WhatsAppWebhook) {
  // Implementar lógica de processamento
  const { processWhatsAppMessage } = await import('./service');
  return processWhatsAppMessage(webhook);
}
```

---

## 6. Types TypeScript

### types/whatsapp.ts

```typescript
export interface WhatsAppWebhook {
  object: 'whatsapp_business_account';
  entry: WhatsAppEntry[];
}

export interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppChange {
  value: WhatsAppValue;
  field: string;
}

export interface WhatsAppValue {
  messaging_product: 'whatsapp';
  metadata: WhatsAppMetadata;
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
}

export interface WhatsAppMetadata {
  display_phone_number: string;
  phone_number_id: string;
}

export interface WhatsAppContact {
  profile: {
    name: string;
  };
  wa_id: string;
}

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'contacts' | 'order' | 'reaction' | 'unsupported';
  text?: {
    body: string;
  };
  image?: {
    caption?: string;
    mime_type: string;
    sha256: string;
    id: string;
  };
  document?: {
    caption?: string;
    mime_type: string;
    sha256: string;
    id: string;
    filename: string;
  };
  audio?: {
    mime_type: string;
    sha256: string;
    id: string;
    voice?: boolean;
  };
  video?: {
    caption?: string;
    mime_type: string;
    sha256: string;
    id: string;
  };
  location?: {
    latitude: number;
    longitude: number;
  };
  reaction?: {
    message_id: string;
    emoji: string;
  };
}

export interface WhatsAppStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'deleted';
  timestamp: string;
  recipient_id: string;
  errors?: Array<{
    code: number;
    title: string;
    message: string;
    error_data?: {
      details: string;
    };
  }>;
}

export interface WhatsAppConversation {
  id: string;
  organization_id: string;
  lead_id: string;
  wa_id: string;
  phone: string;
  status: 'active' | 'archived' | 'blocked';
  last_message_at: Date;
  message_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface WhatsAppMessageRecord {
  id: string;
  conversation_id: string;
  wa_message_id: string;
  direction: 'inbound' | 'outbound';
  content?: string;
  type: string;
  media_url?: string;
  media_id?: string;
  created_at: Date;
}
```

---

## 7. Testes

### __tests__/whatsapp/webhook.test.ts

```typescript
import { verifyWebhookSignature } from '@/lib/whatsapp/verify';
import crypto from 'crypto';

describe('WhatsApp Webhook', () => {
  const secretKey = 'test-secret-key';
  
  it('should verify valid webhook signature', () => {
    const body = JSON.stringify({ test: 'data' });
    
    const hash = crypto
      .createHmac('sha256', secretKey)
      .update(body)
      .digest('hex');
    
    const signature = `sha256=${hash}`;
    
    const isValid = verifyWebhookSignature(body, signature, secretKey);
    expect(isValid).toBe(true);
  });
  
  it('should reject invalid webhook signature', () => {
    const body = JSON.stringify({ test: 'data' });
    const invalidSignature = 'sha256=invalid';
    
    const isValid = verifyWebhookSignature(body, invalidSignature, secretKey);
    expect(isValid).toBe(false);
  });
  
  it('should handle idempotency correctly', async () => {
    // Testar que mensagem duplicada não cria 2 leads
    // Usar wa_message_id como unique key
  });
  
  it('should normalize phone numbers correctly', () => {
    const testCases = [
      ['5511987654321', '+5511987654321'],
      ['+5511987654321', '+5511987654321'],
      ['+55 11 98765-4321', '+5511987654321'],
    ];
    
    testCases.forEach(([input, expected]) => {
      const normalized = normalizePhoneNumber(input);
      expect(normalized).toBe(expected);
    });
  });
});
```

---

## 8. Environment Variables

### .env.example

```bash
# WhatsApp Configuration
WHATSAPP_ACCESS_TOKEN=EAAxxx...xxxxx
WHATSAPP_BUSINESS_ACCOUNT_ID=123456789
WHATSAPP_PHONE_NUMBER_ID=987654321
WHATSAPP_WEBHOOK_VERIFY_TOKEN=random_verify_token_123
WHATSAPP_WEBHOOK_SECRET=another_secret_456
WHATSAPP_ORGANIZATION_ID=org_123

# QStash (for message queue)
QSTASH_TOKEN=xxxxxxxxxxx
NEXT_PUBLIC_APP_URL=https://yourdomain.com

# Redis (for rate limiting)
REDIS_URL=redis://localhost:6379
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

---

Este documento contém exemplos prontos para usar e adaptar ao seu projeto NossoCRM.
