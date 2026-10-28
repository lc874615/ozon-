import unittest
from ozon_operator.collection import observe_html,validate_collection_url
class Collection(unittest.TestCase):
 def test_challenge_does_not_accept_stale_sku(self):
  raw='<title>验证码拦截</title><body>请按住滑块</body><script>{"skuInfoMap":{"A":{"skuId":1,"price":"10"}}}</script>'
  x=observe_html(raw);self.assertEqual(x['status'],'blocked_verification');self.assertEqual(x['skus'],[])
 def test_extract_not_approve(self):
  raw='<script>{"skuInfoMap":{"棕色&gt;70cm":{"skuId":1,"price":"188"}},"minOrderQuantity":1}</script>'
  x=observe_html(raw,'https://detail.1688.com/offer/123.html')
  self.assertEqual(x['status'],'sku_observed');self.assertEqual(x['skus'][0]['observed_price_cny'],'188')
  self.assertIsNone(x['selected_sku_min_order_units']);self.assertIsNone(x['domestic_freight_cny'])
 def test_endpoint_scope(self):
  for u in ['http://detail.1688.com/offer/1.html','https://example.com/','https://localhost/product/1']:
   with self.assertRaises(ValueError):validate_collection_url(u)
if __name__=='__main__':unittest.main()
