import argparse,json,hashlib,os
from pathlib import Path
from datetime import datetime,timezone
from urllib.request import Request,urlopen
from urllib.error import HTTPError,URLError
from .collection import observe_html,validate_collection_url
from .supplier_selection import select_sources
from .workflow_validation import validate_candidate
from .observation_audit import audit_observation
from .buyer_snapshot import normalize_buyer_snapshot
from .buyer_batch import import_buyer_batch
from .package_enrichment import enrich_with_store_packages

def atomic_json(path,data):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_name(path.name+'.tmp');temp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8');temp.replace(path)

def main():
    p=argparse.ArgumentParser(description='Direct-source pilot workflow; no store writes')
    sub=p.add_subparsers(dest='command',required=True)
    a=sub.add_parser('import-html');a.add_argument('files',nargs='+');a.add_argument('--output',required=True)
    a=sub.add_parser('collect');a.add_argument('--urls',required=True);a.add_argument('--state',required=True);a.add_argument('--retry',action='store_true')
    a=sub.add_parser('rank-sources');a.add_argument('input');a.add_argument('--output',required=True)
    a=sub.add_parser('validate');a.add_argument('input');a.add_argument('--output',required=True)
    a=sub.add_parser('audit-observations');a.add_argument('input');a.add_argument('--output',required=True)
    a=sub.add_parser('import-buyer');a.add_argument('input');a.add_argument('--output',required=True)
    a=sub.add_parser('enrich-packages');a.add_argument('input');a.add_argument('--seller-packages',required=True);a.add_argument('--output',required=True)
    args=p.parse_args()
    if args.command=='enrich-packages':
        batch=json.loads(Path(args.input).read_text(encoding='utf-8-sig'))
        seller=json.loads(Path(args.seller_packages).read_text(encoding='utf-8-sig'))
        result=enrich_with_store_packages(batch,seller)
        atomic_json(args.output,result);print('Exact-SKU seller packaging enrichment:',result['seller_packaging_enriched_count']);return
    if args.command=='import-buyer':
        data=json.loads(Path(args.input).read_text(encoding='utf-8-sig'))
        atomic_json(args.output,import_buyer_batch(data['observations']))
        print('Buyer-side selection records imported; packaging gaps preserved');return
    if args.command=='import-html':
        results=[]
        for name in args.files:
            path=Path(name);raw=path.read_text(encoding='utf-8-sig',errors='replace')
            obs=observe_html(raw);obs['source_file']=str(path.resolve());results.append(obs)
        atomic_json(args.output,{'observations':results});print('Imported',len(results),'pages');return
    if args.command=='audit-observations':
        data=json.loads(Path(args.input).read_text(encoding='utf-8-sig'))
        observations=data.get('observations',list(data.get('sources',{}).values()))
        atomic_json(args.output,{'items':[audit_observation(o) for o in observations]})
        print('Observation audit saved; unknown fields remain pending');return
    if args.command in ('rank-sources','validate'):
        data=json.loads(Path(args.input).read_text(encoding='utf-8-sig'))
        result=select_sources(data['offers']) if args.command=='rank-sources' else {'items':[validate_candidate(c) for c in data['candidates']]}
        atomic_json(args.output,result);print('Report saved; online store unchanged');return
    state_path=Path(args.state)
    state=json.loads(state_path.read_text()) if state_path.exists() else {'version':1,'sources':{},'online_mutations':False}
    urls=json.loads(Path(args.urls).read_text(encoding='utf-8-sig'))['urls']
    for url in urls:validate_collection_url(url)
    for url in urls:
        key=hashlib.sha256(url.encode()).hexdigest()[:20];previous=state['sources'].get(key)
        if previous and (previous.get('status')=='sku_observed' or not args.retry):continue
        try:
            request=Request(url,headers={'User-Agent':'OzonOperator/0.1 (product data verification)'})
            with urlopen(request,timeout=30) as response:
                validate_collection_url(response.url)
                raw=response.read(8*1024*1024+1)
                if len(raw)>8*1024*1024:raise ValueError('HTML exceeds size limit')
                encoding=response.headers.get_content_charset() or 'utf-8'
                result=observe_html(raw.decode(encoding,errors='replace'),url)
        except (HTTPError,URLError,ValueError,TimeoutError) as exc:
            result={'source_url':url,'status':'http_error','error_type':type(exc).__name__,
                    'http_status':getattr(exc,'code',None),'observed_at':datetime.now(timezone.utc).isoformat()}
        state['sources'][key]=result;atomic_json(state_path,state)
        print(result['status'],url)
        if result['status'] in ('blocked_verification','http_error'):
            print('Collection paused; saved state. No automatic challenge retry.');break
    atomic_json(state_path,state)
if __name__=='__main__':main()
