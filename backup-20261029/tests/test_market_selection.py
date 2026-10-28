import unittest
from ozon_operator.market_selection import evaluate_market_selection as evaluate
class MarketSelection(unittest.TestCase):
 def case(self,count=6,schema='FBS',brand='без бренда',period=True):
  return {'product_id':'123','seller_reference':{'market_signals':{'status':'observed','sales_period_verified_rolling_30_days':period,'items':[{'sku':'123','soldCount':count,'salesSchema':schema,'brand':brand}]}}}
 def test_pass_at_six_with_all_evidence(self):self.assertEqual(evaluate(self.case())['status'],'market_filters_passed')
 def test_at_most_five_excluded(self):
  for n in (0,4,5):self.assertIn('rolling_30_day_sales_at_most_5',evaluate(self.case(count=n))['excluded_reasons'])
 def test_unknown_brand_or_sales_does_not_pass(self):
  for s in (self.case(brand=''),self.case(count=None),self.case(period=False),self.case(schema='')):self.assertEqual(evaluate(s)['status'],'review')
 def test_fbo_and_branded_excluded(self):
  self.assertEqual(evaluate(self.case(schema='FBO'))['status'],'exclude');self.assertEqual(evaluate(self.case(brand='BrandX'))['status'],'exclude')
 def test_foreign_sku_never_used(self):
  s=self.case();s['seller_reference']['market_signals']['items'][0]['sku']='999';self.assertEqual(evaluate(s)['status'],'review')
 def test_conflicting_brand_excluded(self):
  s=self.case();s['properties']=[{'name':'Бренд','value':'BrandX'}];self.assertEqual(evaluate(s)['status'],'exclude')
