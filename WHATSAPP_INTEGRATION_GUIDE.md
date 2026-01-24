# Guia Completo: Integração com WhatsApp Business API para NossoCRM

**Documento de Pesquisa e Recomendações**
**Data: 23 de janeiro de 2026**

---

## 📋 Índice
1. [Opções de API WhatsApp](#opções-de-api-whatsapp)
2. [Arquitetura de Webhook](#arquitetura-de-webhook)
3. [Fluxo de Criação de Lead](#fluxo-de-criação-de-lead)
4. [Melhores Práticas de Segurança](#melhores-práticas-de-segurança)
5. [Padrões de Implementação](#padrões-de-implementação)
6. [Exemplos e Repositórios Open Source](#exemplos-e-repositórios-open-source)
7. [Recomendações para NossoCRM](#recomendações-para-nossocrm)

---

## 1. Opções de API WhatsApp

### 1.1 Meta Cloud API (Oficial)

**Descrição:**
- API oficial da Meta (Facebook/WhatsApp)
- Integração direta com infraestrutura do WhatsApp
- Totalmente suportada e com atualizações regulares

**Vantagens:**
- ✅ Suporte oficial e documentação completa
- ✅ Acesso a todos os recursos mais recentes
- ✅ Melhor throughput (80 MPS padrão, até 400 MPS com aprovação)
- ✅ Sem intermediários - menor latência
- ✅ Preço transparente e previsível (por mensagem desde 1º julho 2025)
- ✅ Modelos de preço: Utility, Authentication, Marketing
- ✅ Suporte a janelas de 24h após interação do usuário
- ✅ Webhooks nativos para todos os eventos

**Desvantagens:**
- ❌ Setup inicial mais complexo (exige Meta Business Account)
- ❌ Aprovação de templates pode levar tempo
- ❌ Requer configuração de webhooks próprios
- ❌ Rate limiting agressivo (1 mensagem a cada 6 segundos por usuário)

**Preços (Exemplo Brasil):**
- **Utility**: ~R$ 0,003 por mensagem (grátis na janela de 24h)
- **Authentication**: ~R$ 0,0015 por mensagem (com descontos por volume)
- **Marketing**: ~R$ 0,005 por mensagem
- Mensagens não-template: Grátis (apenas na janela de 24h após interação)
- **Janela de Entrada Gratuita (FEP)**: 72h grátis após interação via anúncio

**Modelo de Cobrança:**
```
Baseado em volume mensal por mercado + categoria:
- Nível 1: 1-1000 mensagens @ taxa base
- Nível 2: 1001-10000 @ desconto 5%
- Nível 3: 10001+ @ desconto até 15%
```

**Throughput & Rate Limiting:**
- Padrão: 80 MPS (messages per second)
- Limite de pareamento: 1 msg a cada 6 segundos por usuário
- Solução: Usar Messaging Services para distribuição em múltiplos senders

---

### 1.2 Twilio WhatsApp API

**Descrição:**
- Wrapper/intermediário da Meta Cloud API
- Adiciona camada de abstração e gerenciamento

**Vantagens:**
- ✅ Setup mais simples e rápido
- ✅ Documentação em português melhor
- ✅ Suporte técnico dedicado
- ✅ Dashboard intuitivo
- ✅ Integração com Conversations API (multicanal)
- ✅ Ferramentas como Verify, Studio, Flex

**Desvantagens:**
- ❌ Custo mais alto (taxa Twilio + taxa Meta)
- ❌ Latência adicional (intermediário)
- ❌ Menos controle sobre configurações
- ❌ Menor transparência em atualizações

**Preços:**
- Twilio: $0.005/msg (inbound ou outbound)
- Meta: +taxas conforme categoria
- Exemplo: ~$0.008-0.010/msg total (vs $0.003-0.005 direto com Meta)

---

### 1.3 Vonage API

**Descrição:**
- Terceiro intermediário (não muito diferenciado para WhatsApp)

**Status:** 
- ⚠️ Documentação limitada
- ⚠️ Menos popular que Twilio
- ⚠️ Não recomendado para novo projeto

---

### 📊 Comparação Resumida

| Critério | Meta Cloud | Twilio | Vonage |
|----------|-----------|--------|--------|
| Custo | $$ | $$$ | $$ |
| Setup | Complexo | Fácil | Fácil |
| Suporte | Comunitário | Profissional | Profissional |
| Performance | Excelente | Bom | Bom |
| Documentação | Ótima | Ótima | Limitada |
| Controle | Total | Reduzido | Reduzido |
| Escalabilidade | Alta | Alta | Média |

**✅ RECOMENDAÇÃO PARA NossoCRM: Meta Cloud API (Oficial)**
- Melhor custo-benefício
- Controle total da integração
- Alinhado com arquitetura do projeto (Next.js, Supabase)
- Sem dependências de terceiros

---

## 2. Arquitetura de Webhook

### 2.1 Fluxo de Autenticação

**Setup Inicial:**
```
1. Criar Meta Business Account
   ↓
2. Criar App e WhatsApp Business Account (WABA)
   ↓
3. Registrar Número Telefone (E.164 format: +551199999999)
   ↓
4. Gerar Access Token (Bearer Token)
   ↓
5. Configurar Webhook Endpoint (sua URL)
   ↓
6. Subscribir aos Webhook Fields
```

**Token Management:**
- Access Token: Válido por longa duração
- Revisar regularmente em Meta Business Manager
- Armazenar em `.env` com `WHATSAPP_ACCESS_TOKEN`
- Usar apenas em ambiente server-side

### 2.2 Autenticação do Webhook (Verificação de Integridade)

**Fluxo de Verificação:**
```javascript
// Quando Meta registra seu webhook:
GET https://your-domain.com/webhook?
  hub.mode=subscribe&
  hub.challenge=abc123&
  hub.verify_token=seu_verify_token

// Responder com:
Response: abc123 (status 200)
```

**HMAC Verification (para mensagens recebidas):**
```javascript
const crypto = require('crypto');

function verifyWebhookSignature(req, secretKey) {
  const signature = req.headers['x-hub-signature-256'];
  const body = req.rawBody; // body não parseado
  
  const hash = crypto
    .createHmac('sha256', secretKey)
    .update(body)
    .digest('hex');
  
  const expectedSignature = `sha256=${hash}`;
  
  return crypto.timingSafeEqual(
    Buffer.from(signature || ''),
    Buffer.from(expectedSignature)
  );
}
```

### 2.3 Estrutura do Payload de Mensagem Recebida

**Exemplo de Webhook com Mensagem:**
```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "102290129340398",
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
                "profile": {
                  "name": "João Silva"
                },
                "wa_id": "5511987654321"
              }
            ],
            "messages": [
              {
                "from": "5511987654321",
                "id": "wamid.abc123xyz",
                "timestamp": "1672531200",
                "type": "text",
                "text": {
                  "body": "Olá, gostaria de saber mais sobre seus produtos"
                }
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```

**Campos Principais:**
- `metadata.phone_number_id`: ID do seu número comercial
- `contacts[].wa_id`: ID WhatsApp do usuário (sem formatação)
- `contacts[].profile.name`: Nome do contato
- `messages[].id`: ID único da mensagem (para idempotência)
- `messages[].timestamp`: Unix timestamp
- `messages[].type`: text|image|document|audio|video|location|contacts|order|reaction
- `messages[].text.body`: Conteúdo da mensagem

**Webhooks Importantes:**
- `messages`: Mensagens recebidas e status
- `message_template_status_update`: Status de aprovação de templates
- `account_alerts`: Alertas de limite de mensagens
- `account_update`: Mudanças na conta (verificação, etc)

### 2.4 Rate Limiting e Retry Logic

**Limites da Meta:**
```
Pareamento: 1 msg a cada 6 segundos por usuário
            (ou ~10 msgs/min = 600/hora)

API Calls: 5.000 requisições/hora por WABA ativa
           200 requisições/hora por WABA não ativa

Throughput: 80 MPS padrão (400 MPS com aprovação)
```

**Estratégia de Retry Recomendada:**
```javascript
async function sendWithRetry(message, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await whatsappAPI.send(message);
      return response;
    } catch (error) {
      if (error.code === 131056) { // Rate limit
        const waitTime = Math.pow(4, attempt - 1) * 1000; // 1s, 4s, 16s
        console.log(`Retry em ${waitTime}ms (tentativa ${attempt})`);
        await sleep(waitTime);
        continue;
      }
      throw error;
    }
  }
}

// Implementação com queue para > 80 MPS:
class MessageQueue {
  constructor(maxMPS = 80) {
    this.queue = [];
    this.processing = false;
    this.msPerMessage = 1000 / maxMPS; // ~12.5ms por msg
  }
  
  async enqueue(message) {
    this.queue.push(message);
    if (!this.processing) this.process();
  }
  
  async process() {
    this.processing = true;
    while (this.queue.length > 0) {
      const message = this.queue.shift();
      const startTime = Date.now();
      
      await whatsappAPI.send(message);
      
      const elapsed = Date.now() - startTime;
      const waitTime = Math.max(0, this.msPerMessage - elapsed);
      await sleep(waitTime);
    }
    this.processing = false;
  }
}
```

### 2.5 Idempotência (Tratamento de Mensagens Duplicadas)

**Problema:**
Meta pode entregar o mesmo webhook múltiplas vezes (até 7 dias após o evento)

**Solução com Banco de Dados:**
```javascript
// Na tabela whatsapp_messages:
// - message_id: PK (ID da Meta)
// - wa_id: ID do usuário
// - content: Conteúdo
// - created_at: Timestamp
// - processed_at: NULL antes de processar

async function handleIncomingMessage(webhook) {
  const messageId = webhook.entry[0].changes[0].value.messages[0].id;
  
  // Verificar idempotência
  const existing = await db
    .from('whatsapp_messages')
    .select('id')
    .eq('message_id', messageId)
    .single();
  
  if (existing) {
    console.log('Mensagem duplicada, ignorando');
    return { success: true };
  }
  
  // Processar e salvar atomicamente
  const result = await db
    .from('whatsapp_messages')
    .insert({
      message_id: messageId,
      wa_id: webhook.contacts[0].wa_id,
      content: webhook.messages[0].text.body,
      created_at: new Date(webhook.messages[0].timestamp * 1000),
    })
    .select();
  
  // Agora sim processar (criar lead, etc)
  await createLeadFromMessage(result[0]);
}
```

---

## 3. Fluxo de Criação de Lead

### 3.1 Mapeamento WhatsApp → Lead no CRM

**Dados Disponíveis do WhatsApp:**
```json
{
  "wa_id": "5511987654321",           // Identificador único
  "name": "João Silva",               // Perfil
  "first_message": "Olá, tudo bem?",  // Primeira msg
  "timestamp": 1672531200,            // Quando enviou
  "phone_number": "+55 11 98765-4321" // Normalizado
}
```

**Campos Essenciais do Lead:**
```typescript
interface Lead {
  id: string;                    // UUID gerado
  organization_id: string;       // Tenant (multi-tenant)
  source: 'whatsapp';           // Origem
  phone: string;                // +5511987654321
  email?: string;               // Vazio inicialmente
  name: string;                 // João Silva
  message: string;              // Primeira mensagem
  wa_id: string;                // ID WhatsApp para rastreamento
  status: 'novo' | 'contato' | 'qualificado' | 'oportunidade'; // Default: 'novo'
  funnel_id: string;            // ID do funil padrão
  stage_id: string;             // ID do estágio inicial
  source_type: string;          // 'whatsapp_chat'
  created_at: timestamp;
  updated_at: timestamp;
  metadata: {
    whatsapp_chat_id?: string;  // Para rastrear conversa
    first_message_at: timestamp;
    last_message_at: timestamp;
  }
}
```

### 3.2 Criar Conversa WhatsApp

**Estrutura de Conversa:**
```typescript
interface WhatsAppConversation {
  id: string;                   // UUID
  organization_id: string;
  lead_id: string;             // Foreign key
  wa_id: string;               // ID do contato WhatsApp
  phone: string;               // +55119876543221
  status: 'ativa' | 'encerrada' | 'arquivada';
  last_message_at: timestamp;
  message_count: integer;
  created_at: timestamp;
}

interface WhatsAppMessage {
  id: string;
  conversation_id: string;
  wa_message_id: string;       // ID da Meta (para idempotência)
  direction: 'inbound' | 'outbound';
  content: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'video';
  media_url?: string;
  created_at: timestamp;
}
```

### 3.3 Deduplicação de Leads

**Estratégia de Deduplicação:**
```javascript
async function findOrCreateLead(waMessage, organizationId) {
  const { wa_id, phone, name } = waMessage;
  
  // 1. Procurar por wa_id (mais preciso)
  let lead = await db
    .from('leads')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('wa_id', wa_id)
    .single();
  
  if (lead) {
    // Lead já existe, atualizar
    await updateLeadLastMessageTime(lead.id);
    return { lead, created: false };
  }
  
  // 2. Procurar por telefone (case: múltiplos wa_id mesmo telefone)
  lead = await db
    .from('leads')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('phone', phone)
    .eq('source', 'whatsapp')
    .maybeSingle();
  
  if (lead) {
    // Atualizar wa_id se mudou
    await db
      .from('leads')
      .update({ wa_id })
      .eq('id', lead.id);
    return { lead, created: false };
  }
  
  // 3. Novo lead
  lead = await db
    .from('leads')
    .insert({
      organization_id: organizationId,
      wa_id,
      phone,
      name,
      source: 'whatsapp',
      status: 'novo',
      funnel_id: await getDefaultFunnelId(organizationId),
      stage_id: await getInitialStageId(organizationId),
      message: waMessage.text.body,
      metadata: {
        first_message_at: new Date(waMessage.timestamp * 1000),
        last_message_at: new Date(waMessage.timestamp * 1000),
      }
    })
    .select()
    .single();
  
  return { lead, created: true };
}
```

### 3.4 Estado Inicial do Lead

**Configuração Recomendada:**
```
Funil: "WhatsApp Inbound" (criar automático)
  ├─ Estágio 1: "Novo Lead" (inicial)
  ├─ Estágio 2: "Contato Estabelecido"
  ├─ Estágio 3: "Qualificado"
  └─ Estágio 4: "Oportunidade"

Status Lead: "novo" → automático quando entra pelo WhatsApp
Prioridade: "média" (padrão)
Atribuição: null (fila de WhatsApp)
Tags: ["whatsapp", "inbound"]
```

---

## 4. Melhores Práticas de Segurança

### 4.1 HMAC Verification de Webhooks

**Implementação Robusta:**
```typescript
import crypto from 'crypto';

async function verifyWhatsAppWebhook(
  req: Request,
  secretKey: string
): Promise<boolean> {
  const signature = req.headers.get('x-hub-signature-256');
  
  if (!signature) {
    console.warn('Webhook signature missing');
    return false;
  }
  
  // Get raw body (importante!)
  const body = await req.text();
  
  // Compute HMAC
  const hash = crypto
    .createHmac('sha256', secretKey)
    .update(body)
    .digest('hex');
  
  const expectedSignature = `sha256=${hash}`;
  
  // Compare seguro contra timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Middleware Next.js:
export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/api/webhooks/whatsapp') {
    const secretKey = process.env.WHATSAPP_WEBHOOK_SECRET!;
    const isValid = await verifyWhatsAppWebhook(request, secretKey);
    
    if (!isValid) {
      return new NextResponse('Unauthorized', { status: 403 });
    }
  }
  
  return NextResponse.next();
}
```

### 4.2 Token Management

**Boas Práticas:**
```
❌ NÃO FAZER:
- Versionar token no git
- Usar token sem expiração
- Armazenar em localStorage
- Logar token completo em logs

✅ FAZER:
- Armazenar em .env.local
- Revisar regularmente em Dashboard Meta
- Usar em variáveis de environment server-side
- Implementar rotação de tokens
- Usar Supabase RLS com RLS policies
- Mascarar logs (primeiros 10 chars + ***)
```

**Exemplo de Armazenamento Seguro:**
```typescript
// .env.local
WHATSAPP_ACCESS_TOKEN=EAAxxx...xxxxx
WHATSAPP_BUSINESS_ACCOUNT_ID=123456789
WHATSAPP_PHONE_NUMBER_ID=987654321
WHATSAPP_WEBHOOK_VERIFY_TOKEN=random_secret_123
WHATSAPP_WEBHOOK_SECRET=another_secret_456

// lib/whatsapp/server.ts (server-only)
import "server-only";

export const whatsappConfig = {
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
  businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID!,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID!,
};

// Nunca expor em client-side!
```

### 4.3 Rate Limiting no Backend

**Implementação com Redis:**
```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, '1 m'),
  analytics: true,
});

export async function POST(req: Request) {
  // Rate limit by IP + organization
  const ip = req.headers.get('x-forwarded-for') || '0.0.0.0';
  const orgId = req.headers.get('x-org-id');
  
  const { limit, reset } = await ratelimit.limit(
    `whatsapp-webhook:${orgId}:${ip}`
  );
  
  if (!limit) {
    return new Response('Too Many Requests', { status: 429 });
  }
  
  // Processar webhook...
}
```

### 4.4 Data Encryption

**Para Dados Sensíveis (wa_id, phone):**
```typescript
import crypto from 'crypto';

class EncryptionService {
  private algorithm = 'aes-256-gcm';
  private key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');
  
  encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }
  
  decrypt(text: string): string {
    const [ivHex, tagHex, encryptedHex] = text.split(':');
    
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.key,
      Buffer.from(ivHex, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}

// No RLS policy do Supabase:
create policy "Encrypt wa_id" on leads
  for all
  using (
    organization_id = auth.uid() or
    current_setting('app.current_org_id')::uuid = organization_id
  );
```

---

## 5. Padrões de Implementação

### 5.1 Message Queueing (Evitar Timeout)

**Problema:** 
Webhook do WhatsApp espera resposta em ~5 segundos. Processamento de lead pode demorar mais.

**Solução: Processamento Assíncrono**
```typescript
// app/api/webhooks/whatsapp/route.ts
import { Queue } from '@upstash/qstash';

const queue = new Queue({
  baseUrl: process.env.QSTASH_URL,
  token: process.env.QSTASH_TOKEN,
});

export async function POST(req: Request) {
  // 1. Verificar assinatura
  const isValid = await verifyWebhookSignature(req);
  if (!isValid) return new Response('Forbidden', { status: 403 });
  
  // 2. Enfileirar processamento
  const body = await req.json();
  
  // Retornar 200 imediatamente
  queue.publishJSON({
    api: {
      name: 'process-whatsapp-message',
      method: 'POST',
    },
    body,
  });
  
  return new Response('Received', { status: 200 });
}

// app/api/webhooks/whatsapp/process/route.ts
export async function POST(req: Request) {
  const webhook = await req.json();
  
  // Processamento pesado aqui
  await handleWhatsAppMessage(webhook);
  
  return new Response('Processed', { status: 200 });
}
```

### 5.2 Idempotent Processing

**Padrão Exactly-Once:**
```typescript
async function processWebhookIdempotently(webhookBody) {
  const messageId = webhookBody.entry[0].changes[0].value.messages[0].id;
  
  // 1. Check if already processed
  const processed = await db
    .from('webhook_logs')
    .select('id')
    .eq('message_id', messageId)
    .eq('status', 'processed')
    .maybeSingle();
  
  if (processed) {
    return { success: true, skipped: true };
  }
  
  // 2. Mark as processing
  const log = await db
    .from('webhook_logs')
    .insert({
      message_id: messageId,
      status: 'processing',
      payload: webhookBody,
    })
    .select()
    .single();
  
  try {
    // 3. Process
    const result = await createLeadFromMessage(webhookBody);
    
    // 4. Mark success
    await db
      .from('webhook_logs')
      .update({
        status: 'processed',
        result,
        processed_at: new Date(),
      })
      .eq('id', log.id);
    
    return { success: true, result };
  } catch (error) {
    // 5. Mark failed
    await db
      .from('webhook_logs')
      .update({
        status: 'failed',
        error: error.message,
      })
      .eq('id', log.id);
    
    throw error;
  }
}
```

### 5.3 Error Handling e Retry

**Estratégia de Retry com Exponential Backoff:**
```typescript
async function sendMessageWithRetry(
  message: WhatsAppMessage,
  maxRetries = 3
) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await sendToWhatsApp(message);
      
      // Log sucesso
      await db.from('whatsapp_messages').insert({
        status: 'sent',
        wa_message_id: response.messages[0].id,
        attempts: attempt + 1,
      });
      
      return response;
    } catch (error) {
      lastError = error;
      
      // Só retry em erros recuperáveis
      if (!isRetryable(error)) throw error;
      
      // Exponential backoff: 1s, 4s, 16s
      const delay = Math.pow(4, attempt) * 1000;
      
      // Log tentativa
      await db.from('whatsapp_send_log').insert({
        message_id: message.id,
        attempt: attempt + 1,
        error: error.message,
        next_retry_at: new Date(Date.now() + delay),
      });
      
      await sleep(delay);
    }
  }
  
  throw lastError;
}

function isRetryable(error: any): boolean {
  const retryableCodes = [
    131056,  // Rate limit
    -1,      // Network timeout
    500, 502, 503, 504, // Server errors
  ];
  
  return retryableCodes.includes(error.code);
}
```

### 5.4 Logging e Monitoring

**Setup de Logging Estruturado:**
```typescript
import { logger } from '@/lib/logger';

export async function handleWhatsAppWebhook(req: Request) {
  const requestId = crypto.randomUUID();
  const logContext = {
    requestId,
    service: 'whatsapp',
    timestamp: new Date(),
  };
  
  try {
    logger.info('Webhook recebido', {
      ...logContext,
      headers: maskHeaders(req.headers),
    });
    
    const webhook = await req.json();
    const messageId = webhook.entry[0].changes[0].value.messages[0].id;
    
    logger.debug('Processando mensagem', {
      ...logContext,
      messageId,
      waId: webhook.contacts[0].wa_id,
    });
    
    const result = await createLead(webhook);
    
    logger.info('Lead criado com sucesso', {
      ...logContext,
      leadId: result.id,
      duration: Date.now() - logContext.timestamp,
    });
    
    return { success: true };
  } catch (error) {
    logger.error('Erro ao processar webhook', {
      ...logContext,
      error: error.message,
      stack: error.stack,
      severity: 'high',
    });
    
    // Alert
    await notifyOpsTeam({
      service: 'whatsapp',
      error: error.message,
      requestId,
    });
    
    throw error;
  }
}

function maskHeaders(headers: Headers) {
  const masked = {};
  for (const [key, value] of headers.entries()) {
    if (key.toLowerCase().includes('authorization')) {
      masked[key] = '***' + value.slice(-10);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}
```

---

## 6. Exemplos e Repositórios Open Source

### 6.1 Principais Repositórios

**1. PyWa (Python)**
- GitHub: `david-lev/pywa`
- ⭐ Stars: ~2.5K
- Suporte: Async/FastAPI, webhooks nativos
- Exemplo:
```python
from pywa import WhatsApp, types, filters

wa = WhatsApp(
    phone_id="123456",
    token="EAAJB...",
    server=fastapi_app,
    callback_url="https://example.com/",
    verify_token="xyz123",
)

@wa.on_message(filters.text)
def handle_message(client: WhatsApp, msg: types.Message):
    msg.reply_text(f"Olá {msg.from_user.name}!")
```

**2. Separator (Django)**
- GitHub: `estvita/separator`
- Integração Bitrix24 + WhatsApp
- ⭐ 14 stars

**3. WAPlus (Node.js)**
- GitHub: `WAPlus-WhatsApp-CRM/WAPlus-WhatsApp-CRM`
- Features: Agendamento, broadcast, CRM, IA
- ⭐ 4 stars (novo)

**4. YlunoZup (Open Source WA-CRM)**
- GitHub: `YlunoZup/Whatsapp-CRM`
- API completa com integração CRM

### 6.2 Padrões Arquiteturais Recomendados

```
nossocrm/
├── app/api/
│   └── webhooks/
│       └── whatsapp/
│           ├── route.ts          (entry point)
│           ├── verify.ts         (HMAC verification)
│           └── process/route.ts  (async processing)
│
├── lib/whatsapp/
│   ├── client.ts         (API client)
│   ├── service.ts        (business logic)
│   ├── types.ts          (TypeScript types)
│   └── queue.ts          (message queue)
│
├── context/whatsapp/
│   └── WhatsAppContext.tsx (state management)
│
├── features/whatsapp/
│   ├── conversations/
│   ├── templates/
│   └── leads/
│
└── types/whatsapp.ts    (domain types)
```

---

## 7. Recomendações para NossoCRM

### 7.1 Implementação Proposta

**Fase 1: MVP (2-3 semanas)**
```
✓ Integração Meta Cloud API
✓ Webhook endpoint seguro (/api/webhooks/whatsapp)
✓ Auto-create lead de mensagem WhatsApp
✓ Armazenar conversa em tabela whatsapp_conversations
✓ HMAC verification + rate limiting
✓ Logging estruturado
✓ Testes (webhooks, idempotência)
```

**Fase 2: Enhancements (3-4 semanas)**
```
✓ Message queue (QStash/Bull)
✓ Template support para respostas automáticas
✓ Lead scoring baseado em mensagens
✓ Integração com AI (análise de sentimento)
✓ Roteamento automático para equipe
✓ Dashboard de conversas
```

**Fase 3: Advanced (4+ semanas)**
```
✓ Flows (formulários interativos)
✓ Catalog integration (produtos/catálogo)
✓ Marketing messages com templates aprovados
✓ Analytics de conversas
✓ Broadcast para leads
✓ Integração com WhatsApp Cloud Link
```

### 7.2 Estrutura de Banco de Dados

```sql
-- Tabelas necessárias no Supabase

create table whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations,
  lead_id uuid not null references leads,
  wa_id text not null,           -- ID WhatsApp do contato
  phone text not null,            -- +55 11 99999-9999
  status text default 'active',   -- active, archived, blocked
  last_message_at timestamp,
  message_count integer default 0,
  created_at timestamp default now(),
  updated_at timestamp default now(),
  
  unique(organization_id, wa_id),
  index on (lead_id),
  index on (organization_id)
);

create table whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references whatsapp_conversations,
  wa_message_id text not null,    -- Meta message ID (for idempotency)
  direction text not null,        -- 'inbound' or 'outbound'
  content text,
  type text,                      -- 'text', 'image', 'document', etc
  media_url text,
  media_id text,                  -- For file downloads
  created_at timestamp default now(),
  
  unique(conversation_id, wa_message_id),
  index on (conversation_id),
  index on (created_at)
);

create table whatsapp_webhook_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations,
  message_id text not null,       -- Meta webhook message ID
  status text,                    -- 'processing', 'processed', 'failed'
  payload jsonb,
  result jsonb,
  error_message text,
  attempts integer default 1,
  processed_at timestamp,
  created_at timestamp default now(),
  
  unique(message_id),
  index on (status),
  index on (organization_id)
);

-- RLS Policies
alter table whatsapp_conversations enable row level security;
alter table whatsapp_messages enable row level security;

create policy "Organization isolation" on whatsapp_conversations
  for all
  using (
    organization_id = current_setting('app.current_org_id')::uuid
  );

create policy "Organization isolation" on whatsapp_messages
  for all
  using (
    conversation_id in (
      select id from whatsapp_conversations
      where organization_id = current_setting('app.current_org_id')::uuid
    )
  );
```

### 7.3 Checklist de Segurança

```
BEFORE PRODUCTION:

HMAC Verification:
  ☐ Implementar crypto.timingSafeEqual()
  ☐ Testar com payload real da Meta
  ☐ Verificar x-hub-signature-256 em todos requests
  
Token Management:
  ☐ Armazenar em .env.local (nunca em git)
  ☐ Usar processo.env apenas em server-side
  ☐ Implementar token rotation (90 dias)
  ☐ Monitorar uso em Meta Business Manager
  
Rate Limiting:
  ☐ Implementar redis rate limit
  ☐ Testar com > 80 MPS
  ☐ Queue messages com exponential backoff
  
Idempotency:
  ☐ Armazenar message_id para deduplicação
  ☐ Testar webhook delivery duplicado
  ☐ Validar única lead creation por wa_id
  
Data Protection:
  ☐ RLS policies no Supabase
  ☐ Masking em logs (wa_id, phone)
  ☐ Encryption para dados sensíveis
  ☐ HTTPS obrigatório
  
Monitoring:
  ☐ Logging estruturado (requestId, duration)
  ☐ Alertas para erros críticos
  ☐ Dashboard de webhooks recebidos
  ☐ Notificação para tax rate limit
```

### 7.4 Estimativa de Custos (Mensal)

```
Assumindo: 1.000 leads/mês com ~5 msgs cada

Meta Cloud API:
- Mensagens inbound: $0 (grátis)
- Mensagens templates utility: 1.000 × $0.003 = $3
- Mensagens freeform (24h window): $0 (grátis)
- Total Meta: ~$3-10/mês

Infraestrutura (Supabase, QStash):
- Supabase: ~$25/mês (Pro plan)
- QStash (message queue): ~$15/mês (3k msgs)
- Upstash Redis: ~$10/mês (rate limiting)
- Total Infra: ~$50/mês

TOTAL: ~$60-70/mês (muito barato!)

vs Twilio:
- Twilio + Meta: ~$0.008/msg
- 5.000 msgs/mês = $40 (Twilio) + $3-10 (Meta) = $50+
- SEM economia de escala comparado a Meta direto
```

---

## 8. Próximos Passos Recomendados

### Curto Prazo (Sprint Atual)
1. ✅ Revisar este documento com equipe
2. ✅ Decidir entre Meta Cloud vs Twilio
3. ✅ Criar Business Account + WABA na Meta
4. ✅ Configurar tabelas Supabase
5. ✅ Setup webhook endpoint + HMAC verification

### Médio Prazo (Próximos 2 sprints)
1. Implementar lead creation flow completo
2. Setup message queue (QStash)
3. Integração com TanStack Query (context)
4. Dashboard de conversas WhatsApp
5. Testes automatizados

### Longo Prazo (Roadmap)
1. Templates + broadcast
2. Flows interativos
3. AI sentiment analysis
4. Catalog integration
5. Analytics avançado

---

## 📚 Referências

- [Meta Cloud API Docs](https://developers.facebook.com/docs/whatsapp/cloud-api/)
- [Meta Webhooks Reference](https://developers.facebook.com/docs/whatsapp/webhooks/)
- [Meta Pricing](https://developers.facebook.com/docs/whatsapp/pricing)
- [Twilio WhatsApp Docs](https://www.twilio.com/docs/whatsapp/)
- [PyWa Documentation](https://pywa.readthedocs.io/)
- [OWASP Webhook Security](https://owasp.org/www-community/attacks/Webhook)

---

**Documento preparado em: 23 de janeiro de 2026**
**Recomendação: Implementar Meta Cloud API (Oficial)**
