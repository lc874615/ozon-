from pathlib import Path
from playwright.sync_api import sync_playwright
import json
root=Path(__file__).resolve().parents[1]
script=(root/'browser-extension/form-reader.js').read_text()
html='''<!doctype html><html><meta charset="utf-8"><body><h1>商品特征</h1>
<form id="product"><fieldset><legend>包装参数</legend>
<label for="length">Длина упаковки, мм *</label><input id="length" name="length" type="number" value="650" required>
<div class="field"><label for="width">包装宽度</label><input id="width" value="650"><span>mm</span></div>
<label for="weight">Вес с упаковкой, г</label><input id="weight" value="2500" disabled>
<label for="brand">Бренд</label><select id="brand"><option value="B">Brand</option><option selected value="NONE">без бренда</option></select>
<label for="choices">Материалы</label><select multiple id="choices"><option selected value="AL">Aluminum</option><option selected value="AC">Acrylic</option></select>
<label><input id="checked" type="checkbox" checked>С лампой</label>
<span id="label-custom">Цвет</span><div role="combobox" aria-labelledby="label-custom">Чёрный</div>
<label for="secret">API token</label><input id="secret" value="SECRET_TOKEN">
<input type="hidden" value="SECRET_HIDDEN"><input type="password" value="SECRET_PASSWORD"><input autocomplete="one-time-code" value="SECRET_OTP">
<textarea aria-label="Описание">Описание товара</textarea>
</fieldset></form>
<dl><dt>Высота упаковки, мм</dt><dd>100</dd></dl>
<table><tr><td>Частота, Гц</td><td>50</td></tr></table>
<iframe src="about:blank"></iframe><div id="shadow-host"></div>
<script>
document.getElementById('shadow-host').attachShadow({mode:'open'}).innerHTML='<label for="s">Количество</label><input id="s" value="2">';
window.actions=[];for(const kind of ['click','input','change','submit'])document.addEventListener(kind,()=>window.actions.push(kind));
</script></body></html>'''
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=p.chromium.executable_path,headless=True,args=['--no-sandbox'])
    context=browser.new_context();requests=[]
    def serve(route):
        requests.append(route.request.url);route.fulfill(content_type='text/html',body=html)
    context.route('https://seller.ozon.ru/**',serve)
    page=context.new_page();page.goto('https://seller.ozon.ru/app/products/copy?bundle_id=123&token=SECRET_URL')
    initial=len(requests)
    result=page.evaluate('()=>{'+script+'return readOzonCurrentForm();}')
    fields={f['element_id']:f for f in result['fields'] if f['element_id']}
    assert fields['length']['value']=='650' and fields['length']['required_explicit'] is True
    assert 'мм' in fields['length']['unit_text_candidates']
    assert fields['width']['unit_text_candidates']==['mm']
    assert fields['weight']['disabled'] is True
    assert fields['weight']['unit_text_candidates']==['г']
    assert fields['brand']['unit_text_candidates']==[]
    assert fields['brand']['selected_options']==[{'value':'NONE','text':'без бренда'}]
    assert fields['choices']['value']==['AL','AC']
    assert fields['checked']['checked'] is True
    assert fields['s']['value']=='2'
    assert any(f['label']=='Цвет' and f['value']=='Чёрный' for f in result['fields'])
    assert len(result['read_only_attributes'])==2,result['read_only_attributes']
    assert result['coverage']['iframes_not_read']==1
    assert result['coverage']['open_shadow_roots']==1
    assert 'SECRET_' not in json.dumps(result)
    assert result['page']['numeric_references']=={'bundle_id':'123'}
    assert page.evaluate('window.actions')==[]
    assert len(requests)==initial
    assert page.locator('#length').input_value()=='650'
    page.goto('https://seller.ozon.ru/app/settings/api-keys')
    try:page.evaluate('()=>{'+script+'return readOzonCurrentForm();}')
    except Exception as e:assert '不读取账号' in str(e)
    else:raise AssertionError('Settings page must be rejected')
    browser.close()
print('PASS loaded form labels/units, native/custom selected values, flags, open shadow DOM, readonly rows, no secrets/network/events/edits, account-page exclusion.')
