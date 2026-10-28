"""Read-only seller packaging sync. Credentials stay in the cloud environment."""
import os,json
from decimal import Decimal as D
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from datetime import datetime,timezone

ALLOWED={'/v4/product/info/attributes'}
class SellerAPIError(RuntimeError):
 def __init__(self,code):self.code=code;super().__init__('Seller API HTTP '+str(code))

def post(path,body):
 if path not in ALLOWED:raise ValueError('Only the packaging read endpoint is enabled')
 client,key=os.environ.get('OZON_CLIENT_ID'),os.environ.get('OZON_API_KEY')
 if not client or not key:raise RuntimeError('Seller credentials unavailable')
 req=Request('https://api-seller.ozon.ru'+path,data=json.dumps(body).encode(),method='POST',headers={'Client-Id':client,'Api-Key':key,'Content-Type':'application/json'})
 try:
  with urlopen(req,timeout=40) as r:return json.load(r)
 except HTTPError as e:raise SellerAPIError(e.code) from None

def normalize(item):
 result={'product_id':str(item.get('id','')),'sku':str(item.get('sku','')),
         'source':'seller_api_v4_product_info_attributes','scope':'returned_store_product',
         'fetched_at':datetime.now(timezone.utc).isoformat(),'gross_kg':None,'dimensions_cm':{},
         'raw':{k:item.get(k) for k in ['weight','weight_unit','depth','width','height','dimension_unit']},
         'physical_measurement_verified':False}
 try:
  wu=str(item['weight_unit']).lower();du=str(item['dimension_unit']).lower()
  wf={'g':D('.001'),'kg':D(1)}[wu];df={'mm':D('.1'),'cm':D(1),'in':D('2.54')}[du]
  w=D(str(item['weight']))*wf;dims={k:D(str(item[v]))*df for k,v in [('length','depth'),('width','width'),('height','height')]}
  if not w.is_finite() or w<=0 or any(not v.is_finite() or v<=0 for v in dims.values()):raise ValueError('invalid package')
  result.update(gross_kg=str(w),dimensions_cm={k:str(v) for k,v in dims.items()},status='packaging_observed')
 except (KeyError,ValueError,ArithmeticError,TypeError):result['status']='units_or_values_require_review'
 return result

def collect_store_packages(product_ids,call=post):
 ids=list(dict.fromkeys(str(v) for v in product_ids));rows=[];errors=[];returned=set()
 for start in range(0,len(ids),100):
  batch=ids[start:start+100]
  try:data=call('/v4/product/info/attributes',{'filter':{'product_id':batch,'visibility':'ALL'},'limit':100,'sort_dir':'ASC'})
  except SellerAPIError as e:errors.append({'product_ids':batch,'http_status':e.code});continue
  items=data.get('result')
  if not isinstance(items,list):raise ValueError('Unexpected attribute response')
  for item in items:
   pid=str(item.get('id',''))
   if pid not in batch:errors.append({'unexpected_product_id':pid});continue
   if pid in returned:continue
   returned.add(pid);rows.append(normalize(item))
 return {'requested_count':len(ids),'returned_count':len(returned),'rows':rows,'errors':errors,
         'missing_product_ids':sorted(set(ids)-returned),'coverage':'existing_store_products_only','online_mutations':False}
