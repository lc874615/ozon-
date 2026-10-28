"""Evidence-based competitor filters; unavailable signals are review, never zero."""
from decimal import Decimal, InvalidOperation


def evaluate_market_selection(snapshot):
    signals = snapshot.get('official_market_export') or {}
    sku = str(snapshot.get('product_id') or '')
    rows = [r for r in signals.get('items', []) if str(r.get('sku')) == sku]
    row = rows[0] if len(rows) == 1 and signals.get('status') == 'observed' else {}
    excluded, pending = [], []
    schema = str(row.get('salesSchema') or '').strip().upper()
    if schema in ('FBO', 'RFBS', 'REALFBS'):
        excluded.append('competitor_fulfilment_is_not_FBS')
    elif schema != 'FBS':
        pending.append('competitor_FBS_not_verified')
    brand_values = []
    if isinstance(row.get('brand'), str) and row['brand'].strip():
        brand_values.append(row['brand'].strip())
    for p in snapshot.get('properties', []):
        if str(p.get('name', '')).strip().lower() in ('бренд', 'brand', '品牌') and str(p.get('value', '')).strip():
            brand_values.append(str(p['value']).strip())
    no_brand = {'без бренда', '无品牌', 'no brand', 'unbranded'}
    unknown = {'--', '-', 'unknown', '未知', '暂无数据'}
    known = {v.casefold() for v in brand_values if v.casefold() not in unknown}
    if known - no_brand:
        excluded.append('branded_or_conflicting_brand_evidence')
    elif not known:
        pending.append('explicit_no_brand_evidence_missing')
    count = None
    if row.get('soldCount') is not None:
        try:
            n = Decimal(str(row['soldCount']))
            if n.is_finite() and n >= 0 and n == n.to_integral_value():
                count = int(n)
        except InvalidOperation:
            pass
    if count is None:
        pending.append('sales_count_not_verified')
    elif not (signals.get('sales_period_days') == 28 and signals.get('sales_period_verified') is True):
        pending.append('official_28_day_sales_period_not_verified')
    elif count <= 5:
        excluded.append('official_28_day_sales_at_most_5')
    return {'status': 'exclude' if excluded else 'review' if pending else 'market_filters_passed',
            'excluded_reasons': excluded, 'pending_reasons': pending,
            'observed_sales_schema': schema or None, 'observed_brand_labels': brand_values,
            'observed_sales_count': count, 'required_sales_period_days': 28, 'publication_approved': False}
