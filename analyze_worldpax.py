import json, sys

with open('e:/CLAUDE/META ADS - CLAUDE/data/consolidated.json', encoding='utf-8') as f:
    data = json.load(f)

insights = data.get('insights', [])
wp_insights = [i for i in insights if 'act_1881927255823403' in str(i.get('account_id', ''))]

campaigns_map = {c.get('name'): c.get('status') for c in data.get('campaigns', [])}

print("=== INSIGHTS WORLDPAX (periodo total) ===\n")
for i in wp_insights:
    actions = i.get('actions', [])
    msgs = next((a['value'] for a in actions if a['action_type'] == 'onsite_conversion.total_messaging_connection'), '0')
    msgs_int = int(msgs)
    spend = float(i.get('spend', 0))
    cpl = spend/msgs_int if msgs_int > 0 else 0
    name = i.get('campaign_name','')
    status = campaigns_map.get(name, '?')
    print(name)
    print(f"  Periodo: {i.get('date_start')} ate {i.get('date_stop')}")
    print(f"  Status: {status}")
    print(f"  Spend: R${spend:.2f}")
    print(f"  Impressoes: {int(i.get('impressions',0)):,}")
    print(f"  Alcance: {int(i.get('reach',0)):,}")
    print(f"  CTR: {float(i.get('ctr',0)):.2f}%")
    print(f"  CPM: R${float(i.get('cpm',0)):.2f}")
    print(f"  CPC: R${float(i.get('cpc',0)):.2f}")
    print(f"  Msgs WPP: {msgs} | CPL: R${cpl:.2f}")
    print()

# Daily breakdown
print("\n=== HISTORICO DIARIO ===\n")
daily = data.get('daily_insights', [])
wp_daily = [d for d in daily if 'act_1881927255823403' in str(d.get('account_id', ''))]
wp_daily_sorted = sorted(wp_daily, key=lambda x: (x.get('campaign_name',''), x.get('date_start','')))

for d in wp_daily_sorted:
    actions = d.get('actions', [])
    msgs = next((int(a['value']) for a in actions if a['action_type'] == 'onsite_conversion.total_messaging_connection'), 0)
    spend = float(d.get('spend', 0))
    cpl = spend/msgs if msgs > 0 else 0
    camp_short = d.get('campaign_name','')[:35]
    print(f"{d.get('date_start')} | {camp_short:<35} | R${spend:>6.2f} | CTR:{float(d.get('ctr',0)):>5.2f}% | Msgs:{msgs} | CPL:R${cpl:.2f}")

# Account balance
print("\n=== CONTA WORLDPAX ===")
accounts = data.get('accounts', [])
wp = next((a for a in accounts if a.get('id') == 'act_1881927255823403'), {})
balance = float(wp.get('balance', 0)) / 100
spent = float(wp.get('amount_spent', 0)) / 100
print(f"Saldo: R${balance:.2f}")
print(f"Gasto historico: R${spent:.2f}")
