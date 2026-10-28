"""Bridge browser HTTP requests through the executor's trusted urllib TLS/proxy.
No TLS verification disabling, proxy bypass or challenge solving.
"""
import asyncio,urllib.request,urllib.error,ssl

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):return None

def fetch_request(url,method,headers,data):
    safe={k:v for k,v in headers.items() if k.lower() not in ('host','content-length','accept-encoding','connection')}
    request=urllib.request.Request(url,data=data,headers=safe,method=method)
    opener=urllib.request.build_opener(urllib.request.HTTPSHandler(context=ssl.create_default_context()))
    try:response=opener.open(request,timeout=20)
    except urllib.error.HTTPError as e:
        if 300<=e.code<400:
            status=e.code;e.close()
            return 502,{'Content-Type':'text/plain; charset=utf-8',
                'X-Cloud-Transport-Error':'upstream-redirect-unresolved',
                'X-Upstream-Status':str(status)},b'Cloud transport: upstream redirect could not be resolved.'
        response=e
    try:
        body=response.read(8*1024*1024+1)
        if len(body)>8*1024*1024:raise ValueError('HTTP response exceeds limit')
        filtered={k:v for k,v in response.headers.items() if k.lower() not in ('content-encoding','content-length','transfer-encoding','connection')}
        return response.code,filtered,body
    finally:response.close()

async def attach_trusted_transport(context):
    semaphore=asyncio.Semaphore(10)
    async def route_request(route):
        request=route.request
        if not request.url.startswith(('https://','http://')):
            await route.continue_();return
        if request.resource_type in ('image','media','font'):
            await route.abort();return
        try:
            async with semaphore:
                status,headers,body=await asyncio.to_thread(fetch_request,request.url,request.method,await request.all_headers(),request.post_data_buffer)
            await route.fulfill(status=status,headers=headers,body=body)
        except Exception:await route.abort()
    await context.route('**/*',route_request)
