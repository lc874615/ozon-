import unittest
from ozon_operator.domestic_freight import resolve_domestic_freight
from ozon_operator.collection import observe_html
class Shipping(unittest.TestCase):
 def test_explicit_free_costs_zero(self):
  r=resolve_domestic_freight(True);self.assertEqual(r['domestic_freight_cny'],'0');self.assertEqual(r['todo'],[])
 def test_positive_fee_retained_under_free_policy(self):
  r=resolve_domestic_freight(True,8);self.assertEqual(r['domestic_freight_cny'],'0');self.assertEqual(r['observed_freight_cny'],'8');self.assertIn('free_shipping_conflicts_with_observed_fee',r['todo'])
 def test_unknown_not_free(self):
  self.assertIsNone(resolve_domestic_freight()['domestic_freight_cny'])
  self.assertEqual(resolve_domestic_freight(False,'6.5')['domestic_freight_cny'],'6.5')
 def test_html_uses_explicit_signal_only(self):
  raw='<script>{"freightInfo":{"freeDeliverFee":true}}</script>'
  self.assertEqual(observe_html(raw)['domestic_freight_cny'],'0')
  self.assertIsNone(observe_html('<p>支持包邮吗？</p>')['domestic_freight_cny'])
if __name__=='__main__':unittest.main()
