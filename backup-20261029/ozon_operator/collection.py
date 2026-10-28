"""Direct HTML observations; missing commerce evidence is never invented."""
import hashlib,json,re
from html.parser import HTMLParser
from html import unescape
from urllib.parse import urlparse
from datetime import datetime,timezone
from .domestic_freight import resolve_domestic_freight

class VisibleText(HTMLParser):
    def __init__(self):super().__init__();self.hidden=0;self.parts=[]
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style'):self.hidden+=1
    def handle_endtag(self,tag):
        if tag in ('script','style'):self.hidden=max(0,self.hidden-1)
    def handle_data(self,data):
        if not self.hidden:self.parts.append(data)

def field(raw,name,default=None):
    for match in re.finditer(r'"'+re.escape(name)+r'"\s*:',raw):
        try:return json.JSONDecoder().raw_decode(raw[match.end():].lstrip())[0]
        except ValueError:pass
    return default

def observe_html(raw,url=''):
    text=VisibleText();text.feed(raw);visible=' '.join(text.parts)
    title=re.search(r'<title[^>]*>(.*?)</title>',raw,re.I|re.S)
    signals=('完成验证','拖动滑块','通过验证以确保','请按住滑块','访问过于频繁',
             '验证码拦截','drag the slider','verify to ensure','access denied','доступ ограничен')
    skus=field(raw,'skuInfoMap',{})
    # Check visible/title evidence even if stale SKU JSON exists on a challenge page.
    blocked=any(v in (visible+' '+(title.group(1) if title else '')).lower() for v in signals)
    address=url.lower()
    blocked=blocked or any(k in address for k in ('captcha','punish','signin'))
    offer_ids=re.findall(r'detail\.1688\.com/offer/(\d+)\.html',url+' '+raw[:1000])
    if not offer_ids:
        oid=field(raw,'offerId');offer_ids=[str(oid)] if oid is not None else []
    props=field(raw,'skuProps',[])
    images={}
    if isinstance(props,list):
        for prop in props:
            if not isinstance(prop,dict):continue
            for item in prop.get('value',[]) or []:
                if isinstance(item,dict) and item.get('name') and item.get('imageUrl'):
                    images[unescape(item['name'])]=item['imageUrl']
    rows=[]
    if not blocked and isinstance(skus,dict):
        for name,sku in skus.items():
            if not isinstance(sku,dict):continue
            rows.append({'sku_id':sku.get('skuId'),'specification':unescape(name),
                         'observed_price_cny':sku.get('price'),'observed_discount_price_cny':sku.get('discountPrice'),
                         'observed_stock':sku.get('canBookCount'),
                         'image_candidates':[image for label,image in images.items() if label in unescape(name)],
                         'single_unit_price_verified':False})
    packaging=field(raw,'pieceWeightScaleInfo',[])
    moq={k:v for k in ('minOrderQuantity','beginAmount','minOrderAmount','offerBeginAmount','beginNum')
         if (v:=field(raw,k)) is not None}
    freight_info=field(raw,'freightInfo',{})
    freight_info=freight_info if isinstance(freight_info,dict) else {}
    # Parse no fee amounts without known currency/unit semantics.
    free=not blocked and (freight_info.get('freeDeliverFee') is True or
                         freight_info.get('marketingFreePostage') is True)
    shipping=resolve_domestic_freight(free_shipping_explicit=free,
        evidence={'field':'freightInfo','raw':freight_info})
    return {'observed_at' :datetime.now(timezone.utc).isoformat(),
            'source_url':url,'html_sha256':hashlib.sha256(raw.encode()).hexdigest(),
            'offer_id':offer_ids[0] if offer_ids else None,
            'title':unescape(title.group(1)) if title else None,
            'status':'blocked_verification' if blocked else ('sku_observed' if rows else 'data_unavailable'),
            'skus':rows,'raw_packaging':packaging,'packaging_units_and_quantity_verified':False,
            'moq_raw_observations':moq,'selected_sku_min_order_units':None,
            'raw_price_model':field(raw,'priceModel'),
            'raw_freight_info':field(raw,'freightInfo'),
            'raw_product_attributes':field(raw,'featureAttributes',[]),
            'raw_order_parameters':field(raw,'orderParamModel',{}),
            'material_observations':[a for a in (field(raw,'featureAttributes',[]) or [])
                if isinstance(a,dict) and any(k in a.get('name','') for k in ('材质','框架','填充','面料'))],
            'freight_note':'Explicit free-shipping signal costs zero by user policy; raw fee collection continues.',
            'domestic_freight_cny':shipping['domestic_freight_cny'],
            'domestic_freight_resolution':shipping,'material_verified':False,'image_similarity_verified':False,
            'review_tasks':['verify_selected_sku_one_unit_order','verify_selected_sku_single_unit_price',
                            'capture_observed_shipping_fee_and_resolve_conflicts','match_material_and_images',
                            'verify_packaging_units_and_sales_quantity'],
            'page_excerpt':visible.strip()[:600] if blocked or not rows else None}

def validate_collection_url(url):
    p=urlparse(url)
    if p.scheme!='https' or p.username or p.password or p.port not in (None,443):raise ValueError('HTTPS official product URL required')
    if p.hostname=='detail.1688.com' and re.fullmatch(r'/offer/\d+\.html',p.path):return
    if p.hostname in ('ozon.ru','www.ozon.ru') and p.path.startswith('/product/'):return
    raise ValueError('Only official 1688/Ozon product URLs supported')
