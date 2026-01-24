# Phase 3 Plan: User Story 1 - Receber Mensagens & Auto-Criar Leads

**Data**: 2026-01-24  
**Objetivo**: Implementar recebimento de mensagens WhatsApp com auto-criação de leads  
**Escopo**: US1 (P1 - Priority 1)  
**Status**: PLANEJAMENTO  

---

## 📋 Contexto

### Situação Atual
- ✅ Phase 1-2 completo (banco de dados, tipos, APIs)
- ✅ Webhooks funcionam (POST /api/whatsapp/receive)
- ✅ Service layer pronto (receiveMessage, sendMessage)
- ❌ Sem testes automatizados
- ❌ Sem componentes React/UI

### Dependências Já Disponíveis
- `lib/whatsapp/service.ts` - receiveMessage() com lógica completa
- `app/api/whatsapp/receive/route.ts` - webhook endpoint
- `types/whatsapp.ts` - tipos TypeScript
- `supabase/migrations/20260123000_whatsapp_tables.sql` - schema

### O que Falta
1. **Testes unitários** - Validar lógica isolada
2. **Testes de integração** - Testar fluxo completo
3. **Testes de webhook** - Simular Baileys/Meta
4. **Componentes React** (opcional Phase 3, melhor Phase 4)

---

## 🎯 User Story 1: Receber Mensagens & Auto-Criar Leads

### Descrição
Quando um cliente manda uma mensagem no WhatsApp, o sistema deve:
1. Receber a mensagem via webhook
2. Evitar duplicatas (mesma mensagem não cria 2 leads)
3. Auto-criar um Lead se não existir
4. Reutilizar Lead se já existe
5. Armazenar a mensagem no histórico

### Critério de Aceitação
- ✅ Lead criado dentro de 2 segundos após mensagem
- ✅ Duplicata de mensagem não cria 2 leads
- ✅ Sem duplicata de mensagens no histórico
- ✅ Organização_id isolada (Constitution I)
- ✅ Testes passando 100%

---

## 📊 Tasks Detalhadas (Phase 3)

### Bloco 1: Testes Unitários (Isolados)

#### **T012** - Teste de Idempotência de Webhook
**Arquivo**: `test/whatsapp.webhook-idempotency.test.ts`

```typescript
// O que testar:
✓ Enviar mesma mensagem (message_id) 2 vezes
  → Primeira: sucesso, marca como "processed"
  → Segunda: ignora (já processada)
✓ Webhook log atualizado corretamente
✓ Lead criado apenas 1 vez
✓ Mensagem armazenada apenas 1 vez
```

**Tempo**: 2-3 horas  
**Dependências**: T001-T011 ✅

---

#### **T013** - Teste de Deduplicação de Leads
**Arquivo**: `test/whatsapp.lead-deduplication.test.ts`

```typescript
// O que testar:
✓ Novo wa_id → cria novo Lead
✓ wa_id existente → reutiliza Lead (não cria duplicata)
✓ Normalização de número:
  - "5511987654321" → "+55 11 98765-4321"
  - Variações diferentes mesmo número → reconhece como igual
✓ Múltiplas organizações não se misturam
```

**Tempo**: 2-3 horas  
**Dependências**: T001-T011 ✅

---

#### **T014** - Teste de Normalização de Telefone
**Arquivo**: `test/whatsapp.phone-normalization.test.ts`

```typescript
// O que testar:
✓ "5511987654321" → "+55 11 98765-4321"
✓ "+5511987654321" → "+55 11 98765-4321"
✓ "11987654321" → ?
✓ Número com espaços/hífens → normaliza
```

**Tempo**: 1 hora  
**Dependências**: T001-T011 ✅

---

### Bloco 2: Testes de Integração (Fluxo Completo)

#### **T015** - Teste de Fluxo Completo: Receber → Criar Lead
**Arquivo**: `test/whatsapp.receive-integration.test.ts`

```typescript
// O que testar (ponta a ponta):
✓ Simular webhook Baileys:
  - { from: "5511987654321", id: "msg_123", text: "Olá" }
✓ Webhooks processa corretamente
✓ Lead criado com:
  - name: "WhatsApp +55 11 98765-4321"
  - wa_id: "5511987654321"
  - source: "whatsapp"
  - organization_id: <correct org>
✓ Conversa criada
✓ Mensagem armazenada
✓ Webhook log marca como "processed"
```

**Tempo**: 3-4 horas  
**Dependências**: T001-T011, T012-T014 ✅

---

#### **T016** - Teste de Multi-Tenant Isolation
**Arquivo**: `test/whatsapp.multi-tenant.test.ts`

```typescript
// O que testar:
✓ Org A manda mensagem → cria Lead só em Org A
✓ Org B com mesmo wa_id → cria Lead separado em Org B
✓ RLS policies enforçam isolação
✓ Webhook só processa para org correto
```

**Tempo**: 2 horas  
**Dependências**: T001-T011, T015 ✅

---

#### **T017** - Teste de Erros & Edge Cases
**Arquivo**: `test/whatsapp.receive-errors.test.ts`

```typescript
// O que testar:
✓ Webhook sem organization_id → erro 400
✓ Webhook sem message.from → erro 400
✓ Supabase database down → erro 500 (retorna 200 ao webhook)
✓ Lead creation falha → marca webhook como "failed"
✓ Message storage falha → webhook ainda marca como "processed"
```

**Tempo**: 2-3 horas  
**Dependências**: T001-T011 ✅

---

### Bloco 3: Validação & Documentação

#### **T018** - Documentação de Testes
**Arquivo**: `specs/001-whatsapp-integration/PHASE_3_TESTS.md`

```markdown
- Guia de como rodar os testes
- Quais testes cobrem qual requisito
- Cobertura de código mínima (80%)
- Como mockar Baileys/Meta
```

**Tempo**: 1 hora  
**Dependências**: T012-T017 ✅

---

#### **T019** - Validação Final Phase 3
**Arquivo**: Checklist no README

```
✓ npm run test:run - todos testes passam
✓ npm run typecheck - sem erros
✓ npm run lint - sem warnings
✓ Cobertura de testes > 80%
✓ Leading practices seguidas
✓ Documentação completa
```

**Tempo**: 1 hora  
**Dependências**: T018 ✅

---

## 🔧 Stack Técnico (Phase 3)

### Testing Framework
- **Vitest** (já configurado)
- **React Testing Library** (para futuros testes de UI)
- **happy-dom** (ambiente de teste)

### Mocking
- Mock do Supabase client
- Mock de webhooks Baileys/Meta
- Fixtures de dados de teste

### Coverage
- Mínimo: 80% das linhas
- Máximo: 100% dos caminhos críticos

---

## 📈 Sequência de Execução

```
Pré-requisitos ✅
    ↓
T012: Teste idempotência      [2-3h] ← começa aqui
    ↓
T013: Teste deduplicação      [2-3h] (paralelo com T012)
    ↓
T014: Teste normalização      [1h]   (paralelo com T012-T013)
    ↓
T015: Teste integração        [3-4h] (depende T012-T014)
    ↓
T016: Teste multi-tenant      [2h]   (paralelo com T015)
    ↓
T017: Teste erros             [2-3h] (paralelo com T015-T016)
    ↓
T018: Documentação            [1h]   (após T012-T017)
    ↓
T019: Validação final         [1h]   (após T018)
    ↓
✅ Phase 3 COMPLETO
```

**Tempo Total**: 15-20 horas (2-3 dias com 1 dev)

---

## 🎯 Checklist de Entrada (Go Gate)

Antes de começar T012, verificar:

- [x] Phase 1-2 completo (T001-T011)
- [x] Banco de dados migrado
- [x] Types compilando
- [x] APIs respondendo corretamente
- [ ] `.env.local` configurado com Baileys
- [ ] Vitest rodando (`npm run test:run`)
- [ ] README.md lido
- [ ] plan.md revisado

**Status Go**: ✅ APPROVED

---

## 🎯 Checklist de Saída (Exit Gate)

Phase 3 completa quando:

- [ ] T012-T019 todos passam
- [ ] Cobertura de testes ≥ 80%
- [ ] `npm run lint` - zero warnings
- [ ] `npm run typecheck` - sem erros
- [ ] Documentação atualizada
- [ ] Breaking Point 3 validado:
  - Webhook recebe mensagem ✓
  - Lead criado em < 2s ✓
  - Sem duplicatas ✓
  - Multi-tenant isolado ✓

**Status Exit**: 🟡 PENDING (aguardando execução)

---

## 📝 Detalhes Técnicos

### T012: Idempotência - Pseudo-Código

```typescript
describe('Webhook Idempotency', () => {
  it('should not create duplicate leads on retry', async () => {
    const webhook = {
      message_id: 'msg_123',
      from: '5511987654321',
      text: 'Hello'
    };

    // Primeira tentativa
    const response1 = await POST(/api/whatsapp/receive, webhook);
    expect(response1.status).toBe(200);
    
    const leads1 = await db.query(
      'SELECT COUNT(*) FROM leads WHERE wa_id = ?',
      ['5511987654321']
    );
    expect(leads1.count).toBe(1);

    // Segunda tentativa (retry)
    const response2 = await POST(/api/whatsapp/receive, webhook);
    expect(response2.status).toBe(200);
    
    const leads2 = await db.query(
      'SELECT COUNT(*) FROM leads WHERE wa_id = ?',
      ['5511987654321']
    );
    expect(leads2.count).toBe(1); // Ainda 1, não 2!
  });
});
```

### T015: Integração - Pseudo-Código

```typescript
describe('Full Receive Flow', () => {
  it('should create lead + conversation + message', async () => {
    const baileysWebhook = {
      messaging_product: 'whatsapp',
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: '5511987654321',
              id: 'wamid.msg123',
              text: { body: 'Hi!' },
              timestamp: '1234567890'
            }]
          }
        }]
      }]
    };

    // POST webhook
    const response = await fetch('/api/whatsapp/receive?organization_id=xxx', {
      method: 'POST',
      body: JSON.stringify(baileysWebhook)
    });
    
    expect(response.status).toBe(200);

    // Aguarda processamento async
    await sleep(500);

    // Validações
    const lead = await db.leads.findOne({
      wa_id: '5511987654321'
    });
    expect(lead).toBeDefined();
    expect(lead.source).toBe('whatsapp');

    const conv = await db.conversations.findOne({
      lead_id: lead.id
    });
    expect(conv).toBeDefined();

    const msg = await db.messages.findOne({
      conversation_id: conv.id
    });
    expect(msg.content).toBe('Hi!');
  });
});
```

---

## 🚀 Command Reference

```bash
# Rodar testes Phase 3
npm run test:run test/whatsapp.*.test.ts

# Rodar teste específico
npm run test:run test/whatsapp.webhook-idempotency.test.ts

# Watch mode
npm run test test/whatsapp.*.test.ts

# Coverage
npm run test:run -- --coverage

# Type check
npm run typecheck

# Lint
npm run lint
```

---

## 📞 Dependências Externas

- [ ] Supabase: Banco de dados migrado
- [ ] Baileys: NPM package instalado (`npm install baileys`)
- [ ] Vitest: Test runner configurado
- [ ] Happy-dom: Test environment

**Status**: Verificar `package.json` se faltar algo

---

## 🎓 Referências Úteis

- [Vitest Docs](https://vitest.dev)
- [React Testing Library](https://testing-library.com)
- [Supabase Testing](https://supabase.com/docs)
- `specs/001-whatsapp-integration/spec.md` - User stories
- `specs/001-whatsapp-integration/quickstart.md` - Code examples

---

## ⚠️ Riscos Identificados

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Timezone issues | Média | Média | Mock timestamps em testes |
| Supabase migrations | Baixa | Alto | Teste em staging primeiro |
| Baileys session | Média | Médio | Mock webhook, não real Baileys |
| Multi-org data leak | Baixa | Crítico | Testes específicos (T016) |

---

## 📊 Métricas de Sucesso

- ✅ 100% dos testes passam
- ✅ Cobertura ≥ 80%
- ✅ Lead criado em < 2s
- ✅ Zero duplicatas em 1000 mensagens
- ✅ Zero warnings no lint
- ✅ Documentação completa

---

**Próximo Passo**: Quando aprovado, execute `npm run test:run` e comece com **T012**

