import unittest
from ozon_operator.package_probe import normalize_package_probe
class Probe(unittest.TestCase):
 def candidate(self,k,v,u,semantic='packaging_candidate'):
  return {'key':k,'value':v,'unit':u,'semantic':semantic,'sku_scope_verified':True,'source':'fixture','path':'package/'+k}
 def test_complete(self):
  x=normalize_package_probe({'candidates':[self.candidate('grossWeight',8500,'g'),self.candidate('length',600,'mm'),self.candidate('width',500,'mm'),self.candidate('height',350,'mm')]})
  self.assertEqual(x['status'],'complete_observation');self.assertEqual(x['gross_kg'],'8.5')
 def test_missing_units_or_ambiguous_not_accepted(self):
  x=normalize_package_probe({'candidates':[self.candidate('weight',7,None),self.candidate('height',70,'cm','unclassified_dimension_or_weight')]})
  self.assertIsNone(x['gross_kg']);self.assertEqual(x['dimensions_cm'],{})
 def test_conflict(self):
  x=normalize_package_probe({'candidates':[self.candidate('grossWeight',7,'kg'),self.candidate('grossWeight',8,'kg')]})
  self.assertEqual(x['status'],'conflict')
if __name__=='__main__':unittest.main()
