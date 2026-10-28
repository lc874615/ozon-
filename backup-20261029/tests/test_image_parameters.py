import unittest
from ozon_operator.image_parameters import compare_image_parameters

def reading(value,unit=None,**extra):return {'value':value,'unit':unit,'source':'test image','reading_verified':True,'role':'input','current_type':'AC',**extra}
class Parameters(unittest.TestCase):
 def test_power_unit_conversion(self):
  self.assertEqual(compare_image_parameters({'power':reading(1,'kW')},{'power':reading(1000,'W')})['status'],'match')
 def test_voltage_no_dimension_tolerance(self):
  self.assertEqual(compare_image_parameters({'voltage':reading(220,'V')},{'voltage':reading(224,'V')})['status'],'not_match')
 def test_brand_case_only_not_aliases(self):
  self.assertEqual(compare_image_parameters({'brand':reading('ABC')},{'brand':reading('abc')})['status'],'match')
  self.assertEqual(compare_image_parameters({'brand':reading('ABC')},{'brand':reading('Other')})['status'],'not_match')
 def test_other_labels_are_compared(self):
  self.assertEqual(compare_image_parameters({'model':reading('A100')},{'model':reading('A200')})['status'],'not_match')
  self.assertEqual(compare_image_parameters({'capacity':reading('2','L')},{'capacity':reading('2','L')})['status'],'match')
  self.assertEqual(compare_image_parameters({'quantity':reading('2')},{})['status'],'needs_review')
 def test_rating_context_and_missing(self):
  self.assertEqual(compare_image_parameters({'power':reading(1000,'W',kind='peak')},{'power':reading(1000,'W')})['status'],'not_match')
  self.assertEqual(compare_image_parameters({'voltage':reading(220,'V')},{})['status'],'needs_review')
if __name__=='__main__':unittest.main()
