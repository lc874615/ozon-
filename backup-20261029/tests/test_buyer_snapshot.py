import unittest
from ozon_operator.buyer_snapshot import normalize_buyer_snapshot
class Buyer(unittest.TestCase):
 def test_product_dimensions_not_packaging(self):
  x=normalize_buyer_snapshot({'properties':[{'name':'Высота, см','value':'70'},{'name':'Вес товара, г','value':'7000'}]})
  self.assertEqual(x['product_dimensions_cm']['height'],'70');self.assertEqual(x['net_kg'],'7')
  self.assertIsNone(x['gross_kg']);self.assertFalse(x['packaging_complete'])
 def test_price_types_and_base_width(self):
  props=[{'name':'Ширина, мм','value':'600'},{'name':'Ширина основания, мм','value':'200'}]
  s={'properties':props,'widget_states':[{'id':'state-webPrice-1','data':{'cardPrice':'3 365 ₽','price':'3 542 ₽','originalPrice':'9 871 ₽'}}]}
  x=normalize_buyer_snapshot(s)
  self.assertEqual(x['product_dimensions_cm']['width'],'60')
  self.assertEqual(x['observed_prices']['bank_offer'],'3365')
  self.assertEqual(x['seller_price_reference_rub'],'3701.50')
  self.assertFalse(x['price_type_verified'])
 def test_published_packaging_units(self):
  props=[('Вес с упаковкой, г','8500'),('Длина упаковки, мм','600'),('Ширина упаковки, мм','500'),('Высота упаковки, мм','350'),('Материал корпуса','Дерево')]
  x=normalize_buyer_snapshot({'properties':[{'name':k,'value':v} for k,v in props]})
  self.assertEqual(x['gross_kg'],'8.5');self.assertEqual(x['packaging_dimensions_cm']['length'],'60');self.assertTrue(x['packaging_complete'])
if __name__=='__main__':unittest.main()
