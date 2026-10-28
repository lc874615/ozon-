"""User-confirmed OGL reference calculator; does not authorize publication."""
import json
from pathlib import Path
from decimal import Decimal as D, ROUND_CEILING
RULES=json.loads(Path(__file__).with_name('ogl-user-confirmed.json').read_text())
def number(value):
 x=D(str(value))
 if not x.is_finite() or x<0:raise ValueError('Expected finite nonnegative number')
 return x

def freight_options(weight_kg, dimensions_cm, declared_value_rub):
 weight=number(weight_kg).quantize(D('.001'),rounding=ROUND_CEILING)
 sides=[number(v) for v in dimensions_cm];value=number(declared_value_rub)
 if weight<=0 or len(sides)!=3 or min(sides)<=0 or value<=0:raise ValueError('Invalid package or declared value')
 volume=sides[0]*sides[1]*sides[2]/D(12000);options=[]
 for c in RULES['channels']:
  if not D(c['min_real_kg'])<=weight<=D(c['max_real_kg']):continue
  if not D(c['min_value_rub'])<=value<=D(c['max_value_rub']):continue
  if max(sides)>c['max_side_cm'] or sum(sides)>c['max_sum_cm']:continue
  billed=max(weight,volume) if c['volumetric'] else weight
  if billed>30:continue
  cost=(D(c['base_cny'])+D(c['cny_per_kg'])*billed).quantize(D('.01'),rounding=ROUND_CEILING)
  options.append({'channel':c['name'],'billed_kg':str(billed),'freight_cny':str(cost),'label_fee_cny_per_parcel':'1.00','status':'reference_estimate_user_confirmed_rules'})
 return sorted(options,key=lambda q:D(q['freight_cny']))

def assess_market_price(sale_cny, costs_cny, fee_rates, unresolved=()):
 """Costs are itemized once, including parcel-count-based label fees.
 fee_rates are effective fractions on sale revenue, explicitly supplied.
 FX/tax/return fees with other bases must first be converted into costs.
 """
 if unresolved:return {'status':'hold','unresolved':list(unresolved)}
 sale=number(sale_cny)
 if sale<=0:raise ValueError('Sale must be positive')
 if not costs_cny or 'procurement' not in costs_cny or 'ogl_logistics' not in costs_cny or 'label_fee' not in costs_cny:raise ValueError('Missing required cost breakdown')
 if 'commission' not in fee_rates:raise ValueError('Commission required')
 fixed=sum((number(v) for v in costs_cny.values()),D(0))
 rate=sum((number(v) for v in fee_rates.values()),D(0))
 if rate>=1:raise ValueError('Invalid combined fee rate')
 profit=sale*(1-rate)-fixed;margin=profit/sale
 return {'status':'margin_pass' if margin>=D('.25') else 'reject_margin','profit_cny':str(profit),'margin_on_sales':str(margin),'publication_approved':False}
