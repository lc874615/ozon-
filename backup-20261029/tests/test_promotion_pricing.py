import unittest
from decimal import Decimal
from ozon_operator.promotion_pricing import price_plan
class Promotion(unittest.TestCase):
 def test_user_price_basis(self):
  x=price_plan('723.24')
  self.assertEqual(x['backend_listing_cny'],'1446.48')
  self.assertEqual(Decimal(x['backend_listing_cny'])*Decimal('.5'),Decimal(x['target_transaction_cny']))
  for k in ['commission_basis_cny','logistics_declared_value_price_basis_cny','margin_basis_cny']:self.assertEqual(x[k],'723.24')
  self.assertFalse(x['promotion_eligibility_verified'])
 def test_rounding_and_invalid(self):
  self.assertEqual(price_plan('1.001')['backend_listing_cny'],'2.02')
  for v in ['0','-1','NaN','Infinity']:
   with self.assertRaises(ValueError):price_plan(v)
if __name__=='__main__':unittest.main()
