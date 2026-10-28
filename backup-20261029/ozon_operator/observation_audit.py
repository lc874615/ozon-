"""Create review tasks from raw commerce observations without asserting a match."""
from decimal import Decimal as D

def audit_observation(obs):
    todos=[];flags=[]
    if obs.get('status')!='sku_observed':
        return {'offer_id':obs.get('offer_id'),'status':'collection_incomplete','todo':[obs.get('status')],'online_mutations':False}
    values=[]
    for name,v in obs.get('moq_raw_observations',{}).items():
        try:
            n=D(str(v))
            if n.is_finite() and n>0:values.append(n)
        except ArithmeticError:pass
    if not values:todos.append('selected_sku_minimum_order_unverified')
    elif len(set(values))>1:todos.append('minimum_order_fields_conflict')
    elif values[0]>1:flags.append('minimum_order_exceeds_one')
    else:todos.append('confirm_one_unit_applies_to_selected_sku')
    invalid_prices=[]
    for sku in obs.get('skus',[]):
        try:
            price=D(str(sku['observed_price_cny']))
            if not price.is_finite() or price<=0:raise ValueError('price')
        except (KeyError,ValueError,ArithmeticError):invalid_prices.append(sku.get('sku_id'))
    if invalid_prices:todos.append('invalid_sku_prices')
    resolution=obs.get('domestic_freight_resolution',{})
    if resolution.get('status')!='cost_available':todos.append('shipping_fee_unknown_or_conflicting')
    packaging=obs.get('raw_packaging') or []
    if not packaging:todos.append('packaging_missing')
    if isinstance(packaging,list):
        for pack in packaging:
            try:
                grams=D(str(pack['weight']));sides=[D(str(pack[k])) for k in ('length','width','height')]
                if grams<=0 or min(sides)<=0:raise ValueError('pack')
                volume=sides[0]*sides[1]*sides[2]
                # Warning only: legacy fields report grams; do not convert 7 into 7000.
                if grams/(volume/1000)<1:todos.append('suspicious_packaging_weight_or_unit')
                if not pack.get('skuId'):todos.append('offer_level_packaging_requires_sku_mapping')
            except (KeyError,ValueError,ArithmeticError):todos.append('packaging_missing_or_invalid')
    todos += ['very_high_visual_match_unverified','material_match_to_competitor_unverified',
              'competitor_gross_weight_and_packaging_comparison_pending']
    return {'offer_id':obs.get('offer_id'),'status':'rejected_moq' if flags else 'needs_verification',
            'observed_sku_count':len(obs.get('skus',[])),
            'observed_prices_parseable':not invalid_prices,
            'minimum_order_observation':str(values[0]) if values and len(set(values))==1 else None,
            'domestic_freight_cny':obs.get('domestic_freight_cny'),
            'raw_materials':[{k:a.get(k) for k in ('name','value')} for a in obs.get('material_observations',[])],
            'todo':sorted(set(todos)),'rejection_reasons':flags,'publication_approved':False}
