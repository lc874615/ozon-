"""Rank evidence-backed one-unit 1688 offers, not search-card prices."""
from decimal import Decimal as D

def select_sources(offers):
    eligible=[];todos=[];rejected=[]
    for offer in offers:
        key=offer.get('offer_id');reasons=[]
        try:
            moq=D(str(offer['selected_sku_min_order_units']))
            if not moq.is_finite() or moq<=0:raise ValueError('invalid MOQ')
            if moq>1:
                rejected.append({'offer_id':key,'reason':'minimum_order_exceeds_one'});continue
        except (KeyError,ValueError,ArithmeticError):reasons.append('verify_selected_sku_one_unit_order')
        checks=['single_sales_unit_purchasable','main_structure_match_verified','material_match_verified',
                'variant_and_pack_quantity_verified','single_unit_sku_price_verified',
                'domestic_freight_cost_verified']
        for flag in checks:
            accepted=offer.get(flag) is True
            if flag=='main_structure_match_verified':
                accepted=accepted or offer.get('very_high_visual_match_verified') is True
            if flag=='domestic_freight_cost_verified':
                accepted=accepted or offer.get('domestic_freight_to_jiaxing_verified') is True
                resolution=offer.get('domestic_freight_resolution') or {}
                scope=resolution.get('confirmation_scope_sku_ids')
                scope_ok=scope is None or str(offer.get('sku_id')) in {str(v) for v in scope}
                accepted=accepted or (scope_ok and resolution.get('status')=='cost_available'
                    and resolution.get('domestic_freight_cny') is not None
                    and str(resolution.get('domestic_freight_cny'))==str(offer.get('domestic_freight_cny'))
                    and bool(resolution.get('evidence')))
            if not accepted:reasons.append(flag)
        amounts={}
        for field in ['sku_price_cny','domestic_freight_cny']:
            try:
                amount=D(str(offer[field]))
                if not amount.is_finite() or amount<0 or (field=='sku_price_cny' and amount==0):raise ValueError('invalid cost')
                amounts[field]=amount
            except (KeyError,ValueError,ArithmeticError):reasons.append(field+'_unknown_or_invalid')
        if not offer.get('sku_id'):reasons.append('sku_id_missing')
        if not offer.get('evidence'):reasons.append('source_evidence_missing')
        if reasons:
            todos.append({'offer_id':key,'reasons':sorted(set(reasons))});continue
        eligible.append({**offer,'landed_domestic_cost_cny':str(sum(amounts.values(),D(0)))})
    eligible.sort(key=lambda o:D(o['landed_domestic_cost_cny']))
    return {'eligible':eligible,'lowest_cost_source':eligible[0] if eligible else None,
            'todos':todos,'rejected':rejected,'publication_approved':False}
