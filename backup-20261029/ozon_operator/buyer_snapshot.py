"""Normalize Ozon buyer-visible characteristics; never invent missing packaging."""
import re
from decimal import Decimal as D
from .package_probe import normalize_package_probe
from .seller_reference import normalize_seller_reference

def parse_scalar(value):
    text=str(value).strip().replace('\u00a0','').replace('\u2009','').replace(' ','').replace(',','.')
    match=re.fullmatch(r'([0-9]+(?:\.[0-9]+)?)(?:мм|см|кг|г|mm|cm|kg|g)?',text,re.I)
    if not match:return None
    result=D(match.group(1))
    return result if result.is_finite() and result>0 else None

def normalize_buyer_snapshot(s):
    out={'product_id':s.get('product_id'),'source_url':s.get('source_url'),'captured_at':s.get('captured_at'),
         'title':s.get('title'),'product_dimensions_cm':{},'packaging_dimensions_cm':{},
         'gross_kg':None,'net_kg':None,'materials':[],'brand':None,'all_labels':s.get('properties',[]),
         'price_widget_text':s.get('price_widget_text'),'price_type_verified':False,'todo':[],
         'image_urls':[], 'specification_labels':[]}
    for prop in s.get('properties',[]):
        name=re.sub(r'\s+',' ',str(prop.get('name',''))).strip().lower();value=prop.get('value','')
        if any(t in name for t in ('мощност','напряжен','цокол','температура света','степень защиты','количество ламп','цвет','свет','режим','бренд')):
            out['specification_labels'].append({'name':prop['name'],'value':value})
        if 'материал' in name:out['materials'].append({'part':prop['name'],'value':value})
        if name in ('бренд','торговая марка'):out['brand']=value
        number=parse_scalar(value)
        if number is None:continue
        if 'вес' in name:
            kg=number if 'кг' in name else number/1000 if re.search(r'[,\s]г\b',name) else None
            if kg is None:continue
            if 'упаков' in name:out['gross_kg']=str(kg)
            else:out['net_kg']=str(kg)
        for ru,en in [('длина','length'),('ширина','width'),('высота','height'),('глубина','depth')]:
            if not re.match(r'^'+ru+r'(?:\s+упаковки)?\s*,',name):continue
            cm=number/10 if 'мм' in name else number if 'см' in name else None
            if cm is None:continue
            group='packaging_dimensions_cm' if 'упаков' in name else 'product_dimensions_cm'
            out[group][en]=str(cm)
    def money(value):
        clean=re.sub(r'[\s\u00a0\u2009\u202f₽]','',str(value)).replace(',','.')
        return str(D(clean)) if re.fullmatch(r'\d+(?:\.\d+)?',clean) else None
    for widget in s.get('widget_states',[]):
        data=widget.get('data',{})
        if widget.get('id','').startswith('state-webPrice-') and isinstance(data,dict):
            card,normal,original=(money(data.get(k)) for k in ('cardPrice','price','originalPrice'))
            out['observed_prices']={'currency':'RUB','bank_offer':card,'other_banks':normal,'strikethrough':original,
                'source':'Ozon webPrice widget fields; not seller settlement revenue'}
            if card:
                out['seller_price_reference_rub']=str(D(card)*D('1.10'))
                out['seller_reference_basis']='user specified card/green price times 1.10; estimate only'
        if widget.get('id','').startswith('state-webGallery-') and isinstance(data,dict):
            out['image_urls'] += [v['src'] for v in data.get('images',[]) if isinstance(v,dict) and v.get('src')]
    out['image_urls']=list(dict.fromkeys(out['image_urls'] or s.get('images',[])))
    probe=normalize_package_probe(s.get('package_probe'))
    out['hidden_packaging_probe']=probe
    if probe['status']=='complete_observation':
        if out['gross_kg'] is None:out['gross_kg']=probe['gross_kg']
        for key,value in probe['dimensions_cm'].items():
            out['packaging_dimensions_cm'].setdefault(key,value)
    elif probe['status']=='conflict':out['todo'].append('hidden_packaging_fields_conflict')
    if out['gross_kg'] is None:out['todo'].append('packaging_gross_weight_not_published_or_not_parsed')
    p=out['packaging_dimensions_cm']
    if not (p.get('width') and p.get('height') and (p.get('length') or p.get('depth'))):out['todo'].append('packaging_dimensions_not_published_or_not_parsed')
    if not out['materials']:out['todo'].append('material_missing')
    out['packaging_complete']=not any(t.startswith('packaging_') for t in out['todo'])
    out['seller_detail_observation']=normalize_seller_reference(s)
    out['todo'].extend(out['seller_detail_observation']['todo'])
    out['publication_approved']=False
    return out
