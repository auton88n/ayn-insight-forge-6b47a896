import importlib.util
import io
import pathlib
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location('snapshot', pathlib.Path(__file__).parents[1] / 'scripts/seo-snapshot.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SnapshotTests(unittest.TestCase):
    def test_successful_empty_google_response_is_zero(self):
        def call(url, body=None):
            if 'urlInspection' in url:
                return {'inspectionResult': {'indexStatusResult': {'verdict': 'NEUTRAL'}}}
            return {}
        self.assertEqual(module.collect_gsc(call)['clicks'], 0)

    def test_failure_does_not_emit_zero_metrics(self):
        output = []
        def fail():
            raise module.CollectionError('http_403')
        self.assertFalse(module.emit_source('search_console', fail, lambda sql, **kwargs: output.append(sql)))
        self.assertIn('select data ||', output[0])
        self.assertIn('"collection_status": "error"', output[0])
        self.assertNotIn('"clicks": 0', output[0])

    def test_optional_pagespeed_failure_preserves_google_success(self):
        with patch.object(module, 'google_token', return_value='test'), patch.object(module, 'collect_gsc', return_value={'clicks': 7}), patch.dict(module.os.environ, {'PSI_API_KEY': '', 'SEO_PSI_KEY_FILE': ''}), patch('sys.stdout', new_callable=io.StringIO) as output:
            self.assertEqual(module.main(), 1)
        self.assertIn('"clicks": 7', output.getvalue())
        self.assertIn('pagespeed_key_not_configured', output.getvalue())

    def test_retries_are_bounded_and_redacted(self):
        with patch.object(module.urllib.request, 'urlopen', side_effect=lambda *a, **kw: (_ for _ in ()).throw(urllib.error.HTTPError('https://x/?secret=PRIVATE', 503, 'PRIVATE', {}, io.BytesIO()))) as call, patch.object(module.time, 'sleep'):
            with self.assertRaisesRegex(module.CollectionError, '^http_503$'):
                module.request_json('https://x')
            self.assertEqual(call.call_count, 3)

    def test_403_not_retried(self):
        with patch.object(module.urllib.request, 'urlopen', side_effect=urllib.error.HTTPError('https://x', 403, 'forbidden', {}, io.BytesIO())) as call:
            with self.assertRaises(module.CollectionError):
                module.request_json('https://x')
            self.assertEqual(call.call_count, 1)

    def test_fixed_source_allowlist(self):
        with self.assertRaises(ValueError):
            module.insert_sql("bad'); drop table x;--", {})


if __name__ == '__main__':
    unittest.main()
