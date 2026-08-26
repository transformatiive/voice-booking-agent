# Posicionamento e canais — voz-primeiro vs multicanal

Decisão sobre o âmbito de canais do **Atende** e sobre a generalização do
posicionamento para além da barbearia. Responde à questão: "ficamos
competitivos em preço e oferta se o foco for voz?"

> Fontes (Ago 2026): comparativos de preços de AI receptionists (Trillet, Retell
> blog, Dialzara, Goodcall, XBert/Nextiva) e estudos de preferência de canal
> (WhatsApp Business/Kantar, Zendesk CX 2026, Nextiva, análises voz vs chat).

## 1. O que a concorrência oferece

| Plataforma | Preço base | Canais |
| --- | --- | --- |
| AIRA / UpFirst | ~$25/mês | Voz |
| Dialzara | $29/mês (60 min) | Voz + SMS/chat (add-on) |
| Hey Rosie / Marlie | $49/mês (250 min) | Voz (+SMS em planos) |
| Trillet | $49/mês (150 min) | Voz + SMS + email (incluído) |
| Goodcall | $79/mês (por cliente único) | **Voz apenas** |
| XBert (Nextiva) | $99/mês (100 conversas) | Omnicanal (voz + SMS + web chat) |

Padrões: (1) muitos são **voz-only**; (2) os que se destacam em valor
**incluem SMS/email de seguimento**; (3) web chat/WhatsApp costumam ser add-on
ou tier superior; (4) preços €25–99/mês.

## 2. O que dizem os dados de canal

- **Mensagens dominam no geral** (~73% preferem mensagens; WhatsApp com ~98% de
  taxa de abertura, forte na Europa para assíncrono e marcações).
- **Mas a voz ganha no inbound e na conversão:** agentes de voz convertem
  **35–55%** de chamadas em marcação, vs **18–35%** do chat; voz vence em
  urgência, transacional e público 45+.
- **O padrão vencedor é híbrido:** a voz atende a chamada e envia **seguimento
  por WhatsApp/SMS** (confirmação, lembrete). "Planeie um split, não uma
  substituição."

## 3. O nosso painpoint é inbound de voz

O problema que vendemos é concreto: **o telefone toca enquanto se trabalha e
fica sem resposta**. Isso é inbound **de voz** — o canal onde a conversão para
marcação é mais alta e onde a dor é sentida. Um chatbot de web não resolve a
chamada perdida; a voz sim.

## 4. Decisão

**Voz-primeiro é a cunha certa** para este ICP e para a conversão. Para não
ficar atrás na oferta e no preço:

1. **Incluir seguimento por WhatsApp/SMS** (confirmação + lembrete) já na
   proposta — barato, aumenta o valor percebido e reduz faltas. É o que o
   Trillet/Dialzara fazem para parecerem completos. Enquadrar como
   *confirmação/lembrete*, não como chat inbound completo (não sobre-prometer).
2. **Roteiro:** WhatsApp **inbound** (voz e/ou texto) e **web chat**, reutilizando
   o mesmo cérebro (`ConversationManager` + `Scheduler`), que já é agnóstico ao
   canal. O `/voice/functions/:slug` e o agente servem qualquer front-end.
3. **Ganhar na diferenciação, não no número de canais:** +351 tratado por nós,
   PT-nativo, RGPD/UE, garantia de portabilidade, número incluído. Os
   omnicanal genéricos (XBert) são caros ($99) e não localizados para PT.

**Competitividade de preço:** €49/€99/€199 com **número +351 incluído** e minutos
é competitivo face a Rosie/Trillet ($49) e abaixo do omnicanal (XBert $99),
sobretudo porque a maioria **não inclui o DID** nem trata da regulação PT.

## 5. Generalização do posicionamento (para além da barbearia)

A barbearia é o **beachhead** (densidade e demo), mas o painpoint é transversal.
Alterações feitas:
- Logótipo: substituído o poste de barbeiro por uma **marca de voz (soundwave)**,
  neutra entre setores.
- Copy do hero/landing generalizada para "negócios de marcações" (barbearias,
  salões, clínicas, estética, restaurantes, serviços).
- Exemplos de conversa passam a cobrir **4 setores** (barbearia, clínica,
  restaurante, salão).
- Calculadora de retorno com **seletor de tipo de negócio** (presets de valor
  médio e chamadas perdidas) e sliders ajustáveis.
- Manter a barbearia como exemplo/demo forte, sem prender a marca a esse nicho.
