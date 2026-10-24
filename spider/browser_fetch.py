"""A bounded, public-only HTTP transport with a browser TLS fingerprint for Cloudflare-protected sites."""
import base64
import ipaddress
import json
import socket
import os
import sys
from urllib.parse import urlsplit

MAX_BODY = 10_000_000
DEFAULT_ALLOWED_HOSTS = {'jable.tv', 'missav.ai', 'surrit.com'}
env_hosts = {h.strip().lower() for h in os.environ.get('SPIDER_BROWSER_HOSTS', '').split(',') if h.strip()}
ALLOWED_HOSTS = DEFAULT_ALLOWED_HOSTS | env_hosts


def is_allowed_host(hostname):
    if not hostname:
        return False
    host = hostname.lower()
    return host in ALLOWED_HOSTS or any(host.endswith('.' + h) for h in ALLOWED_HOSTS)


def is_global_address(addr):
    ip = ipaddress.ip_address(addr)
    if ip.version == 4 and ip in ipaddress.ip_network('198.18.0.0/15'):
        return True
    if ip.version == 6 and ip in ipaddress.ip_network('2001::/32'):
        return True
    return ip.is_global


PROXY = (os.environ.get('SPIDER_PROXY') or os.environ.get('HTTPS_PROXY')
         or os.environ.get('https_proxy') or os.environ.get('HTTP_PROXY')
         or os.environ.get('http_proxy') or os.environ.get('ALL_PROXY')
         or os.environ.get('all_proxy'))


def public_address(url):
    target = urlsplit(url)
    if (target.scheme != 'https' or not is_allowed_host(target.hostname)
            or target.port not in (None, 443) or target.username or target.password):
        raise ValueError('浏览器客户端仅允许受支持的域名')
    try:
        addresses = list(dict.fromkeys(item[4][0] for item in socket.getaddrinfo(
            target.hostname, 443, type=socket.SOCK_STREAM)))
    except socket.gaierror:
        addresses = []
    if addresses and any(not is_global_address(addr) for addr in addresses):
        raise ValueError('Spider 禁止访问内网和保留地址')
    if not addresses:
        if PROXY:
            return None
        raise ValueError('无法解析目标域名')
    # Pin the validated address in libcurl: a second DNS lookup must not rebind it.
    address = next((addr for addr in addresses if ':' not in addr), addresses[0])
    host_port = f'{target.hostname}:443'
    return f'{host_port}:[{address}]' if ':' in address else f'{host_port}:{address}'


def request(payload):
    from curl_cffi import requests, CurlOpt
    resolve = public_address(payload['url'])
    headers = {k: v for k, v in payload.get('headers', {}).items()
               if k.lower() not in ('user-agent', 'host', 'connection', 'content-length', 'accept-encoding')
               and not k.lower().startswith('sec-')}
    chunks = []
    size = 0

    def receive(chunk):
        nonlocal size
        size += len(chunk)
        if size > MAX_BODY:
            raise ValueError('Spider 响应超过 10MB')
        chunks.append(chunk)
        return len(chunk)

    curl_options = {CurlOpt.RESOLVE: [resolve]} if resolve else {}
    session_kwargs = {'trust_env': False, 'curl_options': curl_options}
    if PROXY:
        session_kwargs['proxies'] = {'http': PROXY, 'https': PROXY}

    with requests.Session(**session_kwargs) as client:
        response = client.request(payload.get('method', 'GET'), payload['url'],
                                  headers=headers, data=payload.get('body'),
                                  impersonate='chrome', timeout=12, allow_redirects=False,
                                  content_callback=receive)
        return {'status': response.status_code,
                'headers': {k: v for k, v in response.headers.items()
                            if k.lower() not in ('content-encoding', 'content-length', 'transfer-encoding')},
                'body': base64.b64encode(b''.join(chunks)).decode('ascii')}


if __name__ == '__main__':
    try:
        payload = json.loads(sys.stdin.buffer.read(100_001))
        result = request(payload)
    except ValueError as error:
        result = {'error': str(error)}
    except Exception:
        # Network errors can contain signed URLs or credentials; do not log them.
        result = {'error': 'Spider 浏览器网络请求失败'}
    print(json.dumps(result))
