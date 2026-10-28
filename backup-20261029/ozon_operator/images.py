"""Download official product images with normal site request headers."""
import hashlib,io
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.parse import urlparse
from PIL import Image

HOSTS={'cbu01.alicdn.com','ir.ozone.ru','cdn1.ozonusercontent.com','ir-20.ozonstatic.cn'}
def download_product_image(url,output):
    p=urlparse(url)
    if p.scheme!='https' or p.hostname not in HOSTS or p.username or p.password or p.port not in (None,443):raise ValueError('Unsupported official product image URL')
    referer='https://detail.1688.com/' if p.hostname=='cbu01.alicdn.com' else 'https://www.ozon.ru/'
    req=Request(url,headers={'User-Agent':'Mozilla/5.0','Referer':referer})
    with urlopen(req,timeout=25) as response:
        end=urlparse(response.url)
        if end.scheme!='https' or end.hostname not in HOSTS:raise ValueError('Unexpected image redirect')
        raw=response.read(5*1024*1024+1)
    if len(raw)>5*1024*1024:raise ValueError('Image exceeds limit')
    with Image.open(io.BytesIO(raw)) as image:
        image.verify()
    output=Path(output);output.parent.mkdir(parents=True,exist_ok=True)
    output.write_bytes(raw)
    return {'url':url,'file':str(output),'sha256':hashlib.sha256(raw).hexdigest(),
            'visual_match_verified':False}
