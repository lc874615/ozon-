import unittest
from decimal import Decimal as D
from ozon_operator.target_pricing import target_quotes
class Target(unittest.TestCase):
 def test_reference_channel_and_double_listing(self):
  q=target_quotes(188,0,7,[57,50,35],'12.0677','.10')['quotes'][0]
  self.assertEqual(q['channel'],'PremiumBig')
  self.assertEqual(q['freight_cny'],'244.54')
  target=D(q['price_plan']['target_transaction_cny'])
  self.assertGreaterEqual(target*(D('.75')-D('.10')-D('.02')-D('.012')-D('.03')),D(q['fixed_cost_cny']))
  self.assertEqual(D(q['price_plan']['backend_listing_cny']),target*2)
 def test_no_unknown_freight_defaults(self):
  self.assertEqual(target_quotes(198,None,7,[76,48,30],'12.0677','.10')['status'],'hold')
if __name__=='__main__':unittest.main()
