import unittest
from ozon_operator.evidence_merge import merge_freight
class Merge(unittest.TestCase):
 def setUp(self):self.old=[{'offer_id':'1','sku_id':'a','domestic_freight_cny':0,'domestic_freight_source':'user_confirmed_free_shipping'}]
 def test_missing_keeps_confirmation_and_scope(self):
  x=merge_freight({'offer_id':'1','domestic_freight_cny':None},self.old)
  self.assertEqual(x['domestic_freight_cny'],'0');self.assertFalse(x['domestic_freight_resolution']['applies_to_all_skus'])
 def test_conflict_is_reviewed(self):
  x=merge_freight({'offer_id':'1','domestic_freight_cny':'8'},self.old)
  self.assertEqual(x['domestic_freight_resolution']['status'],'review')
 def test_other_offer_not_inherited(self):
  self.assertIsNone(merge_freight({'offer_id':'2','domestic_freight_cny':None},self.old)['domestic_freight_cny'])
if __name__=='__main__':unittest.main()
