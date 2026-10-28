"""Preserve browser-only detail evidence without assuming official API equivalence."""
from decimal import Decimal, InvalidOperation


def normalize_seller_reference(snapshot):
    reference = snapshot.get('seller_reference') or {}
    detail = reference.get('approved_detail') or {}
    sku = str(snapshot.get('product_id') or '')
    variant = str(detail.get('variant_id') or '')
    exact = bool(sku and variant and str(detail.get('requested_sku')) == sku and any(
        str(item.get('variant_id')) == variant and sku in [str(s) for s in item.get('sku_ids', [])]
        for item in reference.get('items', [])))
    out = {'status': 'no_detail_observation', 'exact_sku_variant_match': exact,
           'raw_fields': detail.get('fields', {}),
           'response_identifiers': detail.get('response_identifiers', {}),
           'draft_state': 'unknown', 'eligible_for_costing': False,
           'physical_measurements_verified': False, 'todo': []}
    if detail.get('status') != 'detail_response_observed':
        return out
    if not exact:
        out['status'] = 'sku_variant_mismatch'
        out['todo'].append('seller_detail_identity_requires_review')
        return out
    try:
        values = {k: Decimal(str(out['raw_fields'][k]).replace(',', '.'))
                  for k in ('depth', 'width', 'height', 'weight')}
        if any(not v.is_finite() or v <= 0 for v in values.values()):
            raise ValueError('Invalid measurement')
    except (KeyError, InvalidOperation, ValueError):
        out['status'] = 'incomplete_or_invalid_detail'
        return out
    out['status'] = 'detail_observed_units_and_semantics_pending'
    out['candidate_under_vendor_mm_g_assumption'] = {
        'dimensions_cm': {k: str(values[k] / 10) for k in ('depth', 'width', 'height')},
        'gross_kg': str(values['weight'] / 1000),
        'volume_cm3': str(values['depth'] * values['width'] * values['height'] / 1000)}
    out['todo'] += ['internal_endpoint_packaging_semantics_and_units_unverified',
                    'returned_bundle_persistence_requires_read_only_check']
    return out
