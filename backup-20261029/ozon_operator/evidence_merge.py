"""Retain prior user-confirmed freight without silently overriding conflicts."""
from decimal import Decimal as D

def merge_freight(observation,previous_rows):
    result=dict(observation)
    prior=[r for r in previous_rows if str(r.get('offer_id'))==str(observation.get('offer_id'))
           and r.get('domestic_freight_source')=='user_confirmed_free_shipping'
           and r.get('domestic_freight_cny')==0]
    if not prior:return result
    existing=observation.get('domestic_freight_resolution') or {}
    observed=existing.get('observed_freight_cny')
    if observed is None:observed=observation.get('domestic_freight_cny')
    conflict=observed is not None and D(str(observed))>0
    result['domestic_freight_cny']='0'
    result['domestic_freight_resolution']={**existing,
        'domestic_freight_cny':'0','cost_basis':'prior_user_confirmed_free_shipping',
        'status':'review' if conflict else 'cost_available',
        'todo':['prior_confirmation_conflicts_with_current_fee'] if conflict else [],
        'evidence':{'type':'prior_report_user_confirmation','offer_id':observation['offer_id'],
                    'sku_ids':[r.get('sku_id') for r in prior]},
        'confirmation_scope_sku_ids':[r.get('sku_id') for r in prior],
        'applies_to_all_skus':False,'current_observation':existing}
    return result
