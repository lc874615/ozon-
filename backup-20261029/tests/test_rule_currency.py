import unittest
from ozon_operator.rule_currency import amount_for_rule
class Currency(unittest.TestCase):
 def test_cny_no_exchange_required(self):self.assertEqual(amount_for_rule(100,'CNY')['amount'],'100')
 def test_ruble_requires_source_date_and_verification(self):
  for fx in (None,{'rub_per_cny':12},{'rub_per_cny':12,'source':'fixture','verified':True,'as_of':'invalid'}):self.assertEqual(amount_for_rule(100,'RUB',fx)['status'],'hold')
 def test_rate_direction_and_no_rounding_across_boundary(self):
  r=amount_for_rule('100.01','RUB',{'rub_per_cny':'12','source':'test fixture, not a market rate','as_of':'2026-10-29','verified':True})
  self.assertEqual(r['amount'],'1200.12');self.assertEqual(r['original_cny'],'100.01')
