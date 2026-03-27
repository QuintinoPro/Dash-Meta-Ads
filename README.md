# Meta Ads Dashboard

Dashboard de analise de campanhas Meta Ads (Facebook/Instagram) com dados extraidos via Graph API v21.0.

## Stack

- **Next.js 16** + TypeScript
- **Tailwind CSS** (dark theme)
- **Chart.js** (react-chartjs-2)
- **Meta Graph API v21.0**

## Funcionalidades

### Filtros
- **Conta de anuncio** — filtra por qualquer uma das 8 contas ativas
- **Campanha** — seleciona campanha individual (tambem clicavel na tabela)
- **Periodo** — Todo periodo, 7 dias, 30 dias, 90 dias

### KPIs
Gasto Total, Impressoes, Alcance, Cliques, Cliques no Link, CTR, CPC, CPM, Resultados e Custo por Resultado.

### Graficos
- **Gasto & Resultados** — tendencia ao longo do tempo (linha dupla eixo)
- **Custo por Resultado** — evolucao do CPA diario/mensal
- **Funil de Conversao** — Impressoes > Cliques > Cliques no Link > Resultados
- **Resultados por Campanha** — aparece quando multiplas campanhas estao selecionadas

### Deteccao inteligente de resultado
O tipo de resultado e detectado automaticamente por campanha baseado no objetivo e nos dados disponiveis:
- **OUTCOME_SALES** → Compras ou Mensagens
- **OUTCOME_LEADS** → Leads
- **OUTCOME_ENGAGEMENT** → Mensagens, Views de video
- **OUTCOME_TRAFFIC** → Cliques no link, Landing page views
- **OUTCOME_AWARENESS** → Views de video, Engajamento

### Recomendacoes
Analise automatica por campanha com sugestoes baseadas em CTR, CPC, frequencia e custo por resultado.

### 3 Abas
1. **Visao Geral** — KPIs, graficos e tabela de campanhas
2. **Campanhas** — tabela completa com status, objetivo, metricas e resultados
3. **Recomendacoes** — analise e sugestoes por campanha

## Como rodar

```bash
cd dashboard
npm install
npm run dev
```

Acesse http://localhost:3000

## Dados

Os dados brutos estao em `data/` (JSONs por conta) e `data/consolidated.json` (consolidado).

O relatorio completo de analise esta em `data/relatorio-analise.md`.

## Estrutura

```
├── dashboard/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx        # Dashboard principal
│   │   │   ├── layout.tsx      # Layout
│   │   │   └── globals.css     # Estilos (dark theme)
│   │   └── data.json           # Dados consolidados
│   └── package.json
├── data/                        # Dados brutos da API
│   ├── consolidated.json
│   ├── relatorio-analise.md
│   ├── campaigns_*.json
│   ├── insights_*.json
│   └── daily_real_*.json
└── README.md
```
