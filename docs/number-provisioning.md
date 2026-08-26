# Aprovisionamento de números (Telnyx) — estratégia, automação e diferenciação

Decisão de produto para o **Atende** (Voice Agents). Cobre: o que dá para
automatizar com a Telnyx, em nome de quem ficam os números, como se compara com
a concorrência, e como tornamos a adesão simples para o cliente e automática
para nós.

> Fontes (Ago 2026): Telnyx *Portugal DID Requirements*, *Requirement Groups*,
> *Regulatory Requirements*, *Managed Accounts*, *Account Levels (TPVE)*; e
> práticas públicas de concorrentes (OnCallClerk, Upfirst, TurboCall, SIMBA,
> AI‑Receptionist, Goodcall, Rosie).

---

## 1. Dá para automatizar com a Telnyx? Sim — com uma verificação única nossa.

**Uma vez (a nossa empresa):** a conta Telnyx tem de estar verificada. No
enquadramento atual (TPVE), para comprar números precisamos de conta **Verified**:
email verificado, revisão de fraude, telemóvel verificado, método de pagamento,
2FA, morada de serviço e KYC aprovado. Números internacionais exigem este nível.
Isto é **setup único** da Transformative, não se repete por cliente.

**Por cada número (automatizável via API):** Portugal passou a exigir
**Requirement Groups** obrigatórios (desde 16/09/2024; também CH, DK, IT, NO, SE).
O fluxo API é:

1. `POST /v2/addresses` → cria a morada, devolve `address_id`.
2. `POST /documents` → carrega o comprovativo/certidão, devolve `document_id`.
3. `POST /v2/requirement_groups` → grupo por `(country_code, phone_number_type, action)`,
   preenchido com identidade + morada + documentos. **Reutilizável** em muitas
   encomendas do mesmo end‑user.
4. `GET /available_phone_numbers` → escolher o número.
5. `POST /v2/number_orders` com `requirement_group_id` → encomenda entra em
   revisão regulatória; se a morada corresponder à área do DID, pode ativar de
   imediato.
6. Ligar o número (SIP/connection) ao stack de voz e gravar estado no negócio.

O que **não** é instantâneo: a *revisão* regulatória da Telnyx e a papelada que
o regulador PT exige (ver §2). Mas a recolha e submissão são 100% API — sem
ninguém a fazer copy‑paste.

### Requisitos PT por tipo de número
- **Local (geográfico 2x):** identidade do negócio (rep. autorizado, nome da
  empresa + **NIF**, **certidão de registo comercial**), **morada na área do
  indicativo** + comprovativo de morada (≤ 3 meses). Uso comercial obrigatório.
- **Nacional:** identidade + morada em Portugal.
- **Móvel (9x):** identidade + morada; sujeito a stock (a **confirmar** na conta
  — ver §6). Preferível para barbearias (é como os clientes já ligam) e evita a
  restrição "morada = área do indicativo" dos geográficos.
- Exceção UE: cidadãos UE podem usar passaporte/CC de qualquer estado‑membro.

---

## 2. Em nome de quem ficam os números? (a pergunta central)

Há duas figuras distintas — **não as confundir**:

- **Titular da conta / cliente do operador (customer of record):** quem paga e
  controla o número na Telnyx.
- **End‑user regulatório:** a entidade cuja identidade/morada cumpre o
  Requirement Group. Para números **PT locais** o regulador quer os dados do
  **utilizador real** (empresa, NIF, morada na área). Não é possível "esconder"
  o cliente atrás só da nossa identidade num número geográfico.

### Recomendação: **conta única nossa + end‑user = cliente + garantia de portabilidade**

- Os números ficam na **nossa conta Telnyx** (somos customer of record) →
  máximo controlo, faturação consolidada, automação e churn simples do lado do
  cliente. O **end‑user regulatório é o cliente** (NIF/morada/comprovativo dele),
  como exige a lei para números PT — recolhido **uma vez** na adesão e reutilizado
  via Requirement Group.
- Para neutralizar o receio de *lock‑in*, assumimos por contrato uma **garantia
  de portabilidade**: se o cliente sair, **portamos o número para ele
  gratuitamente**. Na prática "o número é dele", sem a fricção de o registar em
  nome dele à partida.
- **Opção para clientes maiores / requisito de titularidade própria:** usar uma
  **Managed Account** Telnyx por cliente (sub‑conta criada por API; faturação
  roll‑up; até 3000 sub‑contas; requer ativar a conta manager com o comercial
  Telnyx). Aí o número "vive" na sub‑conta do cliente — titularidade mais limpa,
  mais overhead. **Default = conta única**; Managed Accounts só quando fizer
  sentido.

**Porque não pôr tudo cegamente em nome só da nossa empresa:** para números
geográficos PT o regulador exige os dados do utilizador; e ter tudo em nosso nome
sem mandato do cliente cria risco regulatório e de titularidade. **Porque não pôr
tudo em nome do cliente à partida:** obrigá‑lo a lidar com o operador destrói a
adesão simples. A via do meio (conta nossa + end‑user cliente + garantia de
portabilidade) dá o melhor dos dois.

---

## 3. Como a concorrência faz (e onde falha)

A maioria dos "AI receptionists" oferece três/quatro caminhos, todos com atrito:

| Abordagem | Como funciona | Pontos fracos |
| --- | --- | --- |
| **Reencaminhamento** (`*72/*73`) | Mantém o número atual, desvia chamadas | Depende do dono **lembrar‑se** de ativar/desativar; suporte de carrier irregular; em PT os desvios self‑service dos operadores móveis são maus; frágil |
| **Número novo dedicado** | Provisiona um número só para a IA | O **cliente** tem de atualizar Google/Instagram/cartões; clientes podem não reconhecer o novo número |
| **Portabilidade** | Transfere a titularidade para o operador da IA | Lento (1–15 dias úteis); papelada (LOA, fatura recente, nº de conta, PIN); rejeições por detalhes (nome "Lda" vs "Unipessoal"), saldos pendentes, alterações recentes; risco de downtime |
| **BYON/BYOC (SIP)** | Liga o carrier atual por SIP trunk | Técnico demais para um barbeiro (URI/credenciais SIP) |

Fraquezas transversais que exploramos:
1. **Centrados nos EUA / inglês:** indicativos, `*72`, regras FCC, voz em inglês.
   Nada de **+351**, sem tratar da regulação PT, sem **RGPD/dados na UE**, sem
   **português europeu**. → O nosso maior fosso para o ICP.
2. **Fricção de adesão:** ou o cliente configura desvios, ou atualiza diretórios,
   ou trata de papelada de portabilidade. Poucos fazem o **done‑for‑you**.
3. **Medo de lock‑in:** portar para o operador da IA e depois "e se eu quiser
   sair?". Poucos dão **garantia de portabilidade** explícita.
4. **Custo do número opaco:** telefonia como extra ou "créditos".

---

## 4. Como nos diferenciamos (e tornamos visível ao cliente)

Mensagens que passam para a landing/adesão:

1. **"O número, tratado por nós."** Provisionamos o **+351** e ajudamos a publicá‑lo
   (Google Business/Instagram/porta). O cliente não mexe em operadores.
2. **"Feito para Portugal."** +351 (móvel 9x quando há stock), **voz em português
   europeu**, papelada regulatória (NIF/certidão/comprovativo) tratada por nós,
   **dados na UE (RGPD)**.
3. **"Sem malabarismos de reencaminhamento."** O número é do assistente desde o
   dia 1; o botão **Disponível / A cortar** substitui o `*72/*73`; transferência
   para o telemóvel do barbeiro quando quiser.
4. **"Garantia de portabilidade — o número é seu."** Se sair, portamos
   gratuitamente para si. Sem lock‑in.
5. **"Número incluído, sem surpresas."** O custo do +351 está no preço. Sem
   créditos nem taxas escondidas.
6. **"Adesão em minutos."** Sem contratos de operador, sem SIP; a parte técnica é
   connosco.

---

## 5. Runbook de automação (o nosso lado)

**Setup único:** conta Telnyx Verified (KYC, pagamento, 2FA, morada). Opcional:
ativar Managed Accounts com o comercial.

**Por cliente, na adesão (guiado, mínimo):** recolher `NIF`, representante,
`morada` + `comprovativo de morada` (≤3 meses) e `certidão de registo`. Para
barbearias (ENI/Unipessoal) é rápido; o NIF permite pré‑preencher dados da empresa.

**Pipeline (API, idempotente):**
```
addresses.create → documents.upload → requirement_groups.create(fulfil)
   → available_phone_numbers.list(PT, mobile→local) → number_orders.create(requirement_group_id)
   → poll order status → connect SIP → gravar {e164, status} no negócio
```

**Estados expostos no backoffice:** `sem número` → `a tratar do número`
(provisioning) → `número ativo` (active); e para portabilidade: `portabilidade em
curso — X dias` (porting). Já refletido em `PhoneNumber.status`
(`none|provisioning|active|porting|released`) em `src/domain/types.ts`.

**Portas de código já existentes:** `src/telephony/telnyx.ts`
(`searchNumbers`/`provisionNumber`/`releaseNumber`) e `src/telephony/index.ts`
(`provisionForBusiness`). Falta acrescentar o fluxo de Requirement Groups
(addresses/documents/requirement_groups) — ficou como próximo passo, dependente
de chaves Telnyx reais (ver Secrets/`.env.example`).

---

## 6. Itens a confirmar na conta Telnyx real
- [ ] Stock de **móveis +351 (9x)** e requisitos exatos vs geográficos 2x.
- [ ] Ativar **Managed Accounts** (falar com comercial) — decidir default vs por‑cliente.
- [ ] Tempos reais de revisão regulatória PT (ativação imediata quando morada = área).
- [ ] Modelo de **portabilidade de entrada** (LOA digital) e SLA por tipo de número.
- [ ] Confirmar SIP/connection para o stack de voz (Grok/Retell/Vapi) por número.
