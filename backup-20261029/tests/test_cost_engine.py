import unittest
from ozon_operator.cost_engine import freight_options,assess_market_price
class Costs(unittest.TestCase):
 def test_confirmed_boundaries(self):
  self.assertIn('Budget',[v['channel'] for v in freight_options('.501',[60,60,30],1600)])
  self.assertNotIn('Budget',[v['channel'] for v in freight_options('.500',[20,20,20],1600)])
  self.assertNotIn('PremiumBig',[v['channel'] for v in freight_options(7,[57,50,35],7000)])
  self.assertIn('PremiumBig',[v['channel'] for v in freight_options(7,[57,50,35],7001)])
 def test_reference_rounding(self):
  opts=freight_options(7,[57,50,35],9000)
  self.assertEqual(opts[0]['freight_cny'],'244.54')
 def test_volume_limit(self):
  self.assertEqual(freight_options(7,[100,100,100],9000),[])
 def test_margin_and_missing_data(self):
  costs={'procurement':188,'ogl_logistics':'244.54','label_fee':1}
  self.assertEqual(assess_market_price(600,costs,{'commission':'.10'})['status'],'reject_margin')
  self.assertEqual(assess_market_price(800,costs,{'commission':'.10'})['status'],'margin_pass')
  self.assertEqual(assess_market_price(800,costs,{'commission':'.10'},['returns_fee_unknown'])['status'],'hold')
if __name__=='__main__':unittest.main()
