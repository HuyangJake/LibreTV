import base64
import socket
import sys
import types
import unittest
from unittest.mock import patch

import browser_fetch


class BrowserFetchTest(unittest.TestCase):
    def test_target_and_dns_must_be_public_before_connecting(self):
        for url in ['https://jable.tv.example/', 'http://jable.tv/',
                    'https://jable.tv:444/', 'https://user:pass@jable.tv/',
                    'https://evil.com/', 'http://missav.ai/']:
            with self.assertRaises(ValueError):
                browser_fetch.public_address(url)
        for address in ['127.0.0.1', '192.168.1.114', '169.254.169.254', '::1', '::ffff:127.0.0.1']:
            with patch('socket.getaddrinfo', return_value=[(socket.AF_INET, 0, 0, '', (address, 443))]):
                with self.assertRaisesRegex(ValueError, '内网'):
                    browser_fetch.public_address('https://jable.tv/')
                    browser_fetch.public_address('https://missav.ai/')
                    browser_fetch.public_address('https://surrit.com/')

    def test_browser_fingerprint_pinned_dns_and_bounded_response(self):
        observed = {}

        class Session:
            def __init__(self, **kwargs):
                observed.update(kwargs)
            def __enter__(self):
                return self
            def __exit__(self, *_args):
                pass
            def request(self, method, url, **kwargs):
                observed.update(kwargs)
                kwargs['content_callback'](b'<html>results</html>')
                return types.SimpleNamespace(status_code=200, headers={
                    'Content-Encoding': 'gzip', 'Content-Length': '7', 'Content-Type': 'text/html'})

        fake = types.ModuleType('curl_cffi')
        fake.requests = types.SimpleNamespace(Session=Session)
        fake.CurlOpt = types.SimpleNamespace(RESOLVE='resolve')
        with patch.dict(sys.modules, {'curl_cffi': fake}), patch('socket.getaddrinfo',
                return_value=[(socket.AF_INET, 0, 0, '', ('104.20.42.172', 443))]):
            result = browser_fetch.request({'url': 'https://jable.tv/search/SSIS/', 'headers': {
                'user-agent': 'legacy', 'Host': '127.0.0.1', 'sec-fetch-site': 'fake', 'Cookie': 'language=cn_CN'}})
            self.assertEqual(observed['curl_options']['resolve'], ['jable.tv:443:104.20.42.172'])
            self.assertFalse(observed['trust_env'])
            self.assertFalse(observed['allow_redirects'])
            self.assertEqual(observed['impersonate'], 'chrome')
            self.assertEqual(observed['headers'], {'Cookie': 'language=cn_CN'})
            self.assertEqual(base64.b64decode(result['body']), b'<html>results</html>')
            self.assertEqual(result['headers'], {'Content-Type': 'text/html'})
            with patch.object(browser_fetch, 'MAX_BODY', 5):
                with self.assertRaisesRegex(ValueError, '10MB'):
                    browser_fetch.request({'url': 'https://jable.tv/'})


if __name__ == '__main__':
    unittest.main()
