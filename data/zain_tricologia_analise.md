# CA - Zaín Tricologia — Análise de Campanhas (01/07 a 02/08/2026)

> **Conta:** `act_1533862721121665` · CA - ZAÍN TRICOLOGIA · BRL
> **Período analisado:** 01/07/2026 a 02/08/2026 (mês fechado, igual ao filtro do Gerenciador de Anúncios)
> **Fonte:** Meta Graph API v22.0 (pull por campanha, granularidade mensal) — conferido linha a linha contra o Gerenciador de Anúncios
> **Gerado em:** 02/08/2026 (substitui a versão "vida toda" gerada mais cedo no mesmo dia — ver nota de reconciliação)

---

## Nota de reconciliação

A versão anterior desta análise comparava o **acumulado desde o lançamento de cada campanha** (a 16/06
incluía junho inteiro). O gestor conferiu no Gerenciador de Anúncios com o filtro **01/07 até hoje** e os
números pareciam não bater. Não era erro de coleta — era janela de tempo diferente. Recortando os dados
exatamente para 01/07–02/08, bate com o Gerenciador (diferença de centavos, só timing de sincronização da API):

| Campanha | Resultados | Custo/resultado | Gasto (API) | Gasto (Gerenciador) |
|---|---|---|---|---|
| ENGAJAMENTO - AQUECIMENTO - 04/06 | 3.883 engajamentos | R$ 0,03 | R$ 114,79 | R$ 114,79 |
| LEADS - WPP - 16/06 | 34 conversas | R$ 15,57 | R$ 529,58 | R$ 529,46 |
| LEADS - WPP - 07/07 | 31 conversas | R$ 13,32 | R$ 412,97 | R$ 412,96 |
| DIA DOS PAIS - 01/08 | — | — | R$ 0,00 | R$ 0,00 |

Esta é a versão de referência daqui pra frente para o período de julho.

---

## Resumo executivo

No mês fechado (01/07 a 02/08), rodamos **duas frentes**: uma campanha de aquecimento (9 dias, depois
pausada) e duas campanhas de leads no WhatsApp competindo entre si para decidir qual escalar.

**Resultado do teste de leads:** a **07/07 venceu** — R$ 13,32 por conversa contra R$ 15,57 da 16/06
(~14,5% mais barata nesta janela, e a diferença cresce se olhar só o mês de julho puro, sem os 2 dias de
agosto: R$ 14,01 vs R$ 18,21 — ver seção abaixo). Por isso a 16/06 foi pausada em 02/08 e o orçamento
concentrado na 07/07, que também ganhou criativos novos.

No mesmo período foi lançada a **DIA DOS PAIS - 01/08**, ainda sem dados (lançada hoje).

---

## O que fizemos durante o mês (01/07 a 02/08)

1. **Rodamos a AQUECIMENTO em paralelo por 9 dias** (01/07 a 09/07), até o pool de público aquecido estar
   formado — R$ 114,79 investidos, 3.883 engajamentos, custo de R$ 0,03 por engajamento. Papel: gerar prova
   social e alimentar o público que abastece as campanhas de mensagem. Pausada em 09/07.
2. **Rodamos as duas campanhas de leads no WhatsApp em paralelo** (16/06 e 07/07) pra decidir qual merece
   receber o orçamento principal:
   - LEADS - WPP - 16/06: R$ 529,58 · 34 conversas · **R$ 15,57/conversa** · CTR 1,08% · CPM R$ 19,91.
   - LEADS - WPP - 07/07: R$ 412,97 · 31 conversas · **R$ 13,32/conversa** · CTR 1,29% · CPM R$ 13,12.
3. **Enfrentamos ~7 dias sem veiculação** (23 a 29/07), provável limite de faturamento, que reduziu o volume
   de dados coletados no meio do teste.
4. **Fechamos o teste em 02/08:** pausamos a 16/06 (perdeu), renovamos os criativos da 07/07 (peças fracas
   desativadas, +2 novas por conjunto) e lançamos a **DIA DOS PAIS - 01/08**, com vários criativos em teste,
   mirando a data comemorativa de 09/08.

---

## O que vamos fazer agora (próximo período)

Só **2 campanhas ativas** daqui pra frente:

1. **LEADS - WPP - 07/07** — continua rodando, agora com criativos renovados. Sinal inicial (01–02/08,
   amostra pequena de 2 dias): CPL caiu pra R$ 9,76 — acompanhar mais alguns dias antes de confirmar o ganho.
2. **DIA DOS PAIS - 01/08** — campanha nova, foco em conversas no WhatsApp, testando vários criativos.
   Janela curta (data-alvo 09/08, só ~1 semana) — acompanhamento diário, não semanal, pra reagir rápido no
   criativo vencedor.

A **16/06** fica pausada (perdeu o teste) e a **AQUECIMENTO** segue pausada — candidata a reativar com
orçamento baixo (R$10-15/dia) se o pool de aquecido esfriar ou o CPL das campanhas de mensagem voltar a subir.

**Atenção:** monitorar o limite de faturamento de perto — o gap de 23-29/07 não pode se repetir agora que a
Dia dos Pais tem só uma semana de janela útil.

---

## Julho puro vs. os 2 dias de agosto (detalhe do teste)

| Período | 16/06 — gasto | 16/06 — conversas | 16/06 — CPL | 07/07 — gasto | 07/07 — conversas | 07/07 — CPL |
|---|---|---|---|---|---|---|
| Julho (mês cheio) | R$ 455,35 | 25 | R$ 18,21 | R$ 364,17 | 26 | R$ 14,01 |
| Agosto (1–2, parcial) | R$ 74,23 | 9 | R$ 8,24 | R$ 48,80 | 5 | R$ 9,76 |
| **01/07–02/08 (janela do relatório)** | **R$ 529,58** | **34** | **R$ 15,57** | **R$ 412,97** | **31** | **R$ 13,32** |

A vantagem da 07/07 é mais clara olhando julho puro (23% mais barata) do que a janela cheia (14,5%), porque a
16/06 teve 2 dias de agosto incomuns (CPL R$ 8,24, amostra de 9 conversas — não é confiável pra reverter a
decisão, é só ruído de amostra pequena). A decisão de pausar a 16/06 se sustenta no mês fechado de julho, que
é o dado mais robusto.

---

## IDs de referência

| Item | ID | Status (02/08/2026) |
|---|---|---|
| Conta | `act_1533862721121665` | — |
| ENGAJAMENTO - AQUECIMENTO - 04/06 | `120252323789180012` | ⏸️ Pausada (desde 09/07) |
| LEADS - WPP - 16/06 | `120253399381730012` | ⏸️ Pausada (desde 02/08) |
| LEADS - WPP - 07/07 | `120254884565220012` | 🟢 Ativa |
| DIA DOS PAIS - 01/08 - WPP | `120255595686250012` | 🟢 Ativa |
