import unittest
from ozon_operator.seller_packages import normalize,collect_store_packages
class SellerPackages(unittest.TestCase):
 def test_explicit_units(self):
  r=normalize({'id':1,'sku':2,'weight':7000,'weight_unit':'g','depth':570,'width':500,'height':350,'dimension_unit':'mm'})
  self.assertEqual(r['gross_kg'],'7.000');self.assertEqual(r['dimensions_cm']['length'],'57.0')
 def test_missing_units_not_guessed(self):
  self.assertEqual(normalize({'id':1,'weight':7})['status'],'units_or_values_require_review')
 def test_scope_and_coverage(self):
  data={'result':[{'id':1,'weight':7},{'id':999,'weight':7}]}
  r=collect_store_packages([1,2],lambda path,body:data)
  self.assertEqual(r['returned_count'],1);self.assertEqual(r['missing_product_ids'],['2']);self.assertEqual(len(r['errors']),1)
if __name__=='__main__':unittest.main()
