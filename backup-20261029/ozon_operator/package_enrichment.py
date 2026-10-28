"""Join exact buyer SKU to seller-returned SKU; never fuzzy-join packaging."""
from copy import deepcopy
from decimal import Decimal as D

def enrich_with_store_packages(batch,seller_report):
    result=deepcopy(batch);index={};count=0
    for row in seller_report.get('rows',[]):
        sku=str(row.get('sku') or '')
        if sku and row.get('status')=='packaging_observed':index.setdefault(sku,[]).append(row)
    for item in result.get('items',[]):
        # Legacy buyer importer named the URL's article/SKU "product_id".
        sku=str(item.get('buyer_sku') or item.get('product_id') or '')
        item['buyer_sku']=sku
        matches=index.get(sku,[])
        if len(matches)!=1:
            item['seller_api_packaging_status']='no_exact_store_sku_match' if not matches else 'ambiguous_store_sku_match'
            continue
        row=matches[0];conflicts=[]
        if item.get('gross_kg') is not None and D(item['gross_kg'])!=D(row['gross_kg']):conflicts.append('gross_weight')
        for axis,value in row['dimensions_cm'].items():
            current=item.get('packaging_dimensions_cm',{}).get(axis)
            if current is not None and D(current)!=D(value):conflicts.append(axis)
        item['seller_api_packaging_source']={'product_id':row['product_id'],'sku':sku,'source':row['source'],'fetched_at':row['fetched_at'],'observed_gross_kg':row['gross_kg'],'observed_dimensions_cm':row['dimensions_cm']}
        if conflicts:
            item['seller_api_packaging_status']='source_conflict';item.setdefault('todo',[]).append('seller_vs_buyer_packaging_conflict');continue
        item['gross_kg']=row['gross_kg'];item['packaging_dimensions_cm']=dict(row['dimensions_cm'])
        item['seller_api_packaging_status']='exact_store_sku_observed';item['packaging_complete']=True
        item['todo']=[t for t in item.get('todo',[]) if t not in ('packaging_gross_weight_not_published_or_not_parsed','packaging_dimensions_not_published_or_not_parsed')]
        count+=1
    result['seller_packaging_enriched_count']=count
    return result
