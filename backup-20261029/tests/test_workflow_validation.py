import unittest
from ozon_operator.workflow_validation import validate_candidate
class Workflow(unittest.TestCase):
 def test_missing_does_not_pass(self):
  r=validate_candidate({'candidate_id':'missing'})
  self.assertEqual(r['stage'],'needs_verification');self.assertIsNone(r['financial'])
  self.assertFalse(r['publication_approved'])
 def test_zero_reserves_do_not_imply_known_costs(self):
  r=validate_candidate({'candidate_id':'partial','target_transaction_cny':800,
     'costs_cny':{'procurement':188,'ogl_logistics':'244.54','label_fee':1},
     'fee_rates':{'commission':'.10','advertising':0,'goods_loss':0}})
  self.assertEqual(r['financial']['status'],'hold')
  self.assertEqual(r['price_plan']['backend_listing_cny'],'1600.00')
  self.assertEqual(r['price_plan']['margin_basis_cny'],'800.00')
if __name__=='__main__':unittest.main()
