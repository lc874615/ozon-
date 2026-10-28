import unittest
from ozon_operator.buyer_snapshot import normalize_buyer_snapshot
class PriceCurrency(unittest.TestCase):
 def widget(self,data):return {'widget_states':[{'id':'state-webPrice-1','data':data}]}
 def test_cny_display_not_ruble(self):
  r=normalize_buyer_snapshot(self.widget({'cardPrice':'193,57 ¥','price':'215,12 ¥','disclaimerPriceHeader':'Итого в CNY','disclaimerPriceBodyRs':[{'content':'Сумма в CNY приблизительная.'}]}))
  self.assertEqual(r['observed_prices']['currency'],'CNY');self.assertEqual(r['observed_prices']['bank_offer'],'193.57')
  self.assertTrue(r['observed_prices']['approximate_display_conversion']);self.assertNotIn('seller_price_reference_rub',r)
 def test_yen_symbol_alone_is_ambiguous(self):
  r=normalize_buyer_snapshot(self.widget({'cardPrice':'193.57 ¥'}))
  self.assertEqual(r['observed_prices']['currency'],'UNKNOWN');self.assertNotIn('seller_price_reference_rub',r)
 def test_set_price_kept_separate_from_unit_price(self):
  r=normalize_buyer_snapshot(self.widget({'cardPrice':'248,43 ¥','pricePerUnit':'124,22 ¥','disclaimerPriceHeader':'CNY','measurePerUnit':'за 1 шт'}))
  self.assertEqual(r['observed_prices']['bank_offer'],'248.43');self.assertEqual(r['observed_prices']['per_unit_display'],'124.22')
