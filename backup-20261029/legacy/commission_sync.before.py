"""Read-only Ozon rFBS commission collection. Uses only official read endpoints."""
import argparse
import json
import os
from datetime import datetime, timezone
from decimal import Decimal, ROUND_CEILING
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

HOST = 'https://api-seller.ozon.ru'
ALLOWED_PATHS = {'/v5/product/info/prices', '/v3/product/info/list'}


def post(path, body):
    if path not in ALLOWED_PATHS:
        raise ValueError('Only supported read endpoints are allowed')
    client = os.environ.get('OZON_CLIENT_ID')
    key = os.environ.get('OZON_API_KEY')
    if not client or not key:
        raise RuntimeError('Missing OZON_CLIENT_ID or OZON_API_KEY; configure securely in environment settings')
    req = Request(HOST + path, data=json.dumps(body).encode(), method='POST',
                  headers={'Client-Id': client, 'Api-Key': key, 'Content-Type': 'application/json'})
    try:
        with urlopen(req, timeout=45) as response:
            return json.load(response)
    except HTTPError as exc:
        raise RuntimeError(f'Ozon API returned HTTP {exc.code}; check access and API permissions') from None


def collect(call=post):
    prices = []
    cursor = ''
    seen = set()
    while True:
        result = call('/v5/product/info/prices', {
            'cursor': cursor, 'filter': {'visibility': 'ALL'}, 'limit': 100})
        if not isinstance(result.get('items'), list):
            raise RuntimeError('Unexpected price response: items missing')
        prices.extend(result['items'])
        next_cursor = result.get('cursor') or ''
        if not next_cursor or not result['items']:
            break
        if next_cursor in seen:
            raise RuntimeError('Repeated cursor; export aborted to avoid partial coverage claim')
        seen.add(next_cursor)
        cursor = next_cursor
    details = {}
    for start in range(0, len(prices), 100):
        ids = [str(x['product_id']) for x in prices[start:start + 100]]
        response = call('/v3/product/info/list', {'product_id': ids})
        if not isinstance(response.get('items'), list):
            raise RuntimeError('Unexpected detail response: items missing')
        for item in response['items']:
            details[str(item['id'])] = item
    records = []
    for item in prices:
        detail = details.get(str(item['product_id']), {})
        raw_rate = item.get('commissions', {}).get('sales_percent_rfbs')
        valid = raw_rate is not None and 0 <= Decimal(str(raw_rate)) <= 100
        records.append({
            'product_id': item['product_id'], 'offer_id': item.get('offer_id'),
            'name': detail.get('name'),
            'description_category_id': detail.get('description_category_id'),
            'type_id': detail.get('type_id'), 'scheme': 'rFBS',
            'price': item.get('price', {}),
            'commission_percent': raw_rate if valid else None,
            'commission_source': HOST + '/v5/product/info/prices',
            'status': 'observed_for_this_product_and_price' if valid and detail else 'needs_review',
            'acquiring_api_value': item.get('acquiring'),
            'note': 'Acquiring amount is not a confirmed percentage. Do not automatically add it as a rate.'})
    return {'fetched_at': datetime.now(timezone.utc).isoformat(),
            'coverage': 'existing_store_products_only_not_all_ozon_categories',
            'records': records}


def minimum_price_cny(fixed_cost_cny, commission_percent):
    """Before RUB conversion. Logistics must be reselected at the resulting RUB price."""
    if commission_percent is None:
        raise ValueError('Commission is unknown; pricing is blocked')
    rate = Decimal(str(commission_percent)) / 100
    if not 0 <= rate < Decimal('.718'):
        raise ValueError('Invalid or uneconomic commission')
    # Target margin 25%, last mile 2%, withdrawal 1.2%; 3% FX reserve.
    return (Decimal(str(fixed_cost_cny)) / (
        Decimal('.97') * (Decimal('.75') - rate - Decimal('.02') - Decimal('.012'))
    )).quantize(Decimal('.01'), rounding=ROUND_CEILING)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default='store-commissions.json')
    args = parser.parse_args()
    payload = collect()
    output = Path(args.output)
    if output.exists():
        raise SystemExit('Output exists; choose a new filename to preserve previous records')
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    ready = sum(x['status'] == 'observed_for_this_product_and_price' for x in payload['records'])
    print(f'Exported {len(payload["records"])} products; {ready} have rate and category data. No store changes made.')
