"""Keep CNY accounting; require explicit rate provenance for RUB-denominated rules."""
from datetime import datetime
from decimal import Decimal
from .cost_engine import number


def amount_for_rule(amount_cny, rule_currency, fx=None):
    amount = number(amount_cny)
    if rule_currency == 'CNY':
        return {'amount': str(amount), 'currency': 'CNY', 'converted': False}
    if rule_currency != 'RUB':
        raise ValueError('Unsupported rule currency')
    fx = fx or {}
    if fx.get('verified') is not True or not str(fx.get('source') or '').strip():
        return {'status': 'hold', 'reason': 'verified_sourced_FX_required'}
    try:
        datetime.fromisoformat(str(fx['as_of']).replace('Z', '+00:00'))
        rate = number(fx['rub_per_cny'])
        if rate <= Decimal(0):
            raise ValueError('Nonpositive rate')
    except (KeyError, ValueError, ArithmeticError):
        return {'status': 'hold', 'reason': 'valid_dated_FX_required'}
    return {'status': 'converted_for_rule_only', 'currency': 'RUB', 'amount': str(amount * rate),
            'original_cny': str(amount), 'rate_direction': 'RUB per CNY',
            'fx': {k: fx[k] for k in ('rub_per_cny', 'source', 'as_of')}, 'converted': True}
