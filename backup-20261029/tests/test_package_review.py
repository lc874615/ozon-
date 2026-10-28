import unittest
from ozon_operator.package_review import compare_packages

def pack(w,s):return {'gross_kg':w,'dimensions_cm':s,'weight_basis':'gross','dimension_basis':'packaging'}
class Packages(unittest.TestCase):
 def test_rotations_and_max(self):
  x=compare_packages(pack(7,[57,50,35]),pack(8,[36,58,49]),comparable=True)
  self.assertEqual(x['selected_packaging_dimensions_cm'],['58','49','36'])
  self.assertEqual(x['dimensions_source'],'competitor')
  self.assertEqual(x['estimated_gross_kg'],'8');self.assertEqual(x['todo'],[])
 def test_larger_volume_retains_real_dimensions(self):
  x=compare_packages(pack(7,[100,10,10]),pack(8,[40,30,20]),comparable=True)
  self.assertEqual(x['selected_packaging_dimensions_cm'],['40','30','20'])
  self.assertEqual(x['selected_volume_cm3'],'24000')
  self.assertEqual(x['status'],'hold')
 def test_threshold_and_channel(self):
  self.assertEqual(compare_packages(pack(10,[50,40,30]),pack(12,[50,40,30]),comparable=True)['status'],'reference_ready')
  self.assertEqual(compare_packages(pack(10,[50,40,30]),pack('12.01',[50,40,30]),comparable=True)['status'],'hold')
  self.assertIn('logistics_channel_changed',compare_packages(pack(10,[50,40,30]),pack(10,[50,40,30]),comparable=True,channel_changed=True)['todo'])
 def test_wrong_basis_and_missing(self):
  p=pack(7,[57,50,35]);p['weight_basis']='net'
  self.assertEqual(compare_packages(p,pack(7,[57,50,35]),comparable=True)['status'],'hold')
  self.assertEqual(compare_packages({}, {}, comparable=True)['status'],'hold')
  self.assertEqual(compare_packages(pack(7,[57,50,35]),pack(7,[57,50,35]))['status'],'hold')
if __name__=='__main__':unittest.main()
