import unittest
from ozon_operator.product_match import decide_product_match

def evidence():
 return {'main_structure_consistent':True,'material_components_match':True,
  'major_functions_match':True,'sales_quantity_match':True,'color_difference':'slight',
  'required_product_dimensions':['seat_height_cm'],'product_dimensions':{
   'seat_height_cm':{'supplier':70,'competitor':71.4,'basis':'product','units_normalized':True}},
  'label_inventory_verified':True,'supplier_labels':{},'competitor_labels':{},
  'sources':['supplier SKU image and attributes','competitor SKU image and attributes']}
class Match(unittest.TestCase):
 def test_two_percent_inclusive_and_slight_color(self):
  self.assertEqual(decide_product_match(evidence())['status'],'match')
 def test_over_tolerance_reject(self):
  e=evidence();e['product_dimensions']['seat_height_cm']['competitor']='71.41'
  self.assertEqual(decide_product_match(e)['status'],'not_match')
 def test_structural_difference_rejects_even_similar_dimensions(self):
  e=evidence();e['main_structure_consistent']=False
  self.assertEqual(decide_product_match(e)['status'],'not_match')
 def test_unknown_material_and_packaging_not_accepted(self):
  e=evidence();e['material_components_match']=None;e['product_dimensions']['seat_height_cm']['basis']='packaging'
  r=decide_product_match(e);self.assertEqual(r['status'],'needs_review')
if __name__=='__main__':unittest.main()
