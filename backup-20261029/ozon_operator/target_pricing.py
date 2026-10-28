"""Reference target-price solver using confirmed reserves and a supplied commission.
Commission must be supplied for this product and the resulting price tier.
"""
from decimal import Decimal as D, ROUND_CEILING
from .cost_engine import RULES,freight_options,number
from .promotion_pricing import price_plan

def target_quotes(procurement_cny,domestic_cny,weight_kg,dimensions_cm,rub_per_cny,commission_rate,other_fixed_cny=0,parcels=1):
    if domestic_cny is None or commission_rate is None:return {'status':'hold','reason':'domestic_freight_or_commission_unknown','quotes':[]}
    fx=number(rub_per_cny);commission=number(commission_rate)
    if fx<=0 or commission>=1 or not isinstance(parcels,int) or parcels!=1:
        raise ValueError('Positive FX and one-parcel packaging required; multi-parcel costing needs separate packages')
    denominator=D('.75')-commission-D('.02')-D('.012')-D('.03')
    if denominator<=0:return {'status':'reject','reason':'no_positive_margin_denominator','quotes':[]}
    w=number(weight_kg).quantize(D('.001'),rounding=ROUND_CEILING)
    sides=[number(v) for v in dimensions_cm]
    if len(sides)!=3 or min(sides)<=0 or w<=0:raise ValueError('Invalid package')
    volume=sides[0]*sides[1]*sides[2]/D(12000)
    quotes=[]
    for channel in RULES['channels']:
        billed=max(w,volume) if channel['volumetric'] else w
        freight=(D(channel['base_cny'])+D(channel['cny_per_kg'])*billed).quantize(D('.01'),rounding=ROUND_CEILING)
        fixed=number(procurement_cny)+number(domestic_cny)+number(other_fixed_cny)+freight+D(1)
        target=max(fixed/denominator,D(channel['min_value_rub'])/fx).quantize(D('.01'),rounding=ROUND_CEILING)
        valid=freight_options(w,sides,target*fx)
        if not any(q['channel']==channel['name'] for q in valid):continue
        available=target*(D(1)-commission-D('.02')-D('.012')-D('.03'))
        margin=(available-fixed)/target
        quotes.append({'channel':channel['name'],'fixed_cost_cny':str(fixed),
                       'freight_cny':str(freight),'label_fee_cny':'1.00',
                       'target_rub_reference':str(target*fx),'margin_on_sales_after_reserve':str(margin),
                       'commission_rate_supplied':str(commission),'price_plan':price_plan(target)})
    quotes.sort(key=lambda q:D(q['price_plan']['target_transaction_cny']))
    return {'status':'reference_estimate_only' if quotes else 'no_eligible_channel',
            'reserve_method':'3% of transaction revenue reserved for FX; margin measured on full transaction revenue',
            'quotes':quotes,'publication_approved':False}
