"""Buyer-first batch intake: deduplicate detail/review/question pages safely."""
import re
from urllib.parse import urlparse
from .buyer_snapshot import normalize_buyer_snapshot

def product_identity(o):
    path=urlparse(o.get('source_url','')).path
    m=re.match(r'^/product/([^/]*?)(?:/|$)',path)
    identity=re.search(r'(\d+)$',m.group(1)) if m else None
    return identity.group(1) if identity else str(o.get('product_id') or '')

def import_buyer_batch(observations):
    groups={};unknown=[]
    for o in observations:
        identity=product_identity(o)
        if not identity:unknown.append({'reason':'product_id_missing','source_url':o.get('source_url')});continue
        groups.setdefault(identity,[]).append(o)
    items=[];excluded=[]
    for identity,entries in groups.items():
        def quality(o):
            path=urlparse(o.get('source_url','')).path
            detail=not re.search(r'/(reviews|questions)(/|$)',path)
            return (detail,o.get('status')=='attributes_observed',len(o.get('properties',[])),len(o.get('images',[])),o.get('captured_at',''))
        best=max(entries,key=quality)
        if any(re.search(r'уцен[её]нн\w*\s+товар|товар\s+с\s+уценкой',o.get('title',''),re.I) for o in entries):
            excluded.append({'product_id':identity,'title':best.get('title'),'reason':'markdown_condition_not_new','source_url':best.get('source_url')});continue
        normalized=normalize_buyer_snapshot(best)
        normalized['product_id']=identity
        normalized['source_observation_count']=len(entries)
        normalized['source_urls']=[e.get('source_url') for e in entries]
        normalized['condition_status']='not_identified_as_markdown_not_independently_verified_new'
        normalized['stage']='needs_source_matching_and_cost_verification'
        # Keep all raw observations on disk; report conflicts instead of overwriting.
        fields={}
        for o in entries:
            for prop in o.get('properties',[]):fields.setdefault(prop.get('name',''),set()).add(prop.get('value',''))
        normalized['parameter_conflicts']={k:sorted(v) for k,v in fields.items() if len(v)>1}
        if normalized['parameter_conflicts']:normalized['todo'].append('conflicting_observed_parameters')
        items.append(normalized)
    return {'selection_origin':'ozon_buyer_first','raw_records':len(observations),'unique_products':len(groups),
            'duplicate_records':sum(len(g)-1 for g in groups.values()),'candidate_count':len(items),
            'items':items,'excluded':excluded,'invalid_records':unknown,'publication_approved':False}
