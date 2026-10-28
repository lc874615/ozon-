"""User's free-shipping costing convention; not a carrier delivery guarantee."""
from decimal import Decimal as D

def resolve_domestic_freight(free_shipping_explicit=False, observed_fee_cny=None, evidence=None):
    observed=None;todo=[]
    if observed_fee_cny is not None:
        try:
            observed=D(str(observed_fee_cny))
            if not observed.is_finite() or observed<0:raise ValueError('invalid freight')
        except (ValueError,ArithmeticError):
            observed=None;todo.append('shipping_fee_invalid')
    explicit=free_shipping_explicit is True
    if explicit:
        cost=D(0);basis='user_policy_explicit_free_shipping'
        if observed is not None and observed>0:todo.append('free_shipping_conflicts_with_observed_fee')
    elif observed is not None:cost=observed;basis='observed_shipping_fee'
    else:cost=None;basis='unknown';todo.append('shipping_fee_missing')
    return {'domestic_freight_cny':str(cost) if cost is not None else None,
            'observed_freight_cny':str(observed) if observed is not None else None,
            'free_shipping_explicit':explicit,'cost_basis':basis,
            'destination_verified':False,'destination_verification_required':False,
            'status':'review' if todo else 'cost_available','todo':todo,'evidence':evidence,
            'carrier_quote_guaranteed':False}
