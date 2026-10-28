"""Separate intended activity price from listing price; no store writes."""
from decimal import Decimal as D, ROUND_CEILING

def price_plan(target_cny):
    target=D(str(target_cny))
    if not target.is_finite() or target<=0:raise ValueError('Target must be finite and positive')
    target=target.quantize(D('.01'),rounding=ROUND_CEILING)
    return {'target_transaction_cny':str(target),'backend_listing_cny':str(target*2),
            'planned_discount':'0.50','commission_basis_cny':str(target),
            'logistics_declared_value_price_basis_cny':str(target),
            'margin_basis_cny':str(target),'promotion_status':'not_confirmed_active',
            'promotion_eligibility_verified':False,'publication_approved':False}
