import unittest
from ozon_operator.supplier_selection import select_sources

def source(identity,price,freight,moq=1):
    x={'offer_id':identity,'sku_id':'sku-'+identity,'selected_sku_min_order_units':moq,
       'sku_price_cny':price,'domestic_freight_cny':freight,'evidence':{'kind':'test_fixture'}}
    for k in ['single_sales_unit_purchasable','very_high_visual_match_verified','material_match_verified',
              'variant_and_pack_quantity_verified','single_unit_sku_price_verified','domestic_freight_to_jiaxing_verified']:x[k]=True
    return x
class Sources(unittest.TestCase):
 def test_total_cost_and_moq(self):
    r=select_sources([source('a',10,8),source('b',14,0),source('c',1,0,2)])
    self.assertEqual(r['lowest_cost_source']['offer_id'],'b')
    self.assertEqual(r['rejected'][0]['offer_id'],'c')
 def test_unknown_shipping_or_material_never_wins(self):
    a=source('a',1,None);b=source('b',2,0);b['material_match_verified']=False
    r=select_sources([a,b]);self.assertIsNone(r['lowest_cost_source']);self.assertEqual(len(r['todos']),2)
 def test_main_structure_match_is_accepted(self):
    a=source('a',10,0);a.pop('very_high_visual_match_verified');a['main_structure_match_verified']=True
    self.assertIsNotNone(select_sources([a])['lowest_cost_source'])
 def test_missing_moq_not_inferred_from_price(self):
    a=source('a',1,0);del a['selected_sku_min_order_units']
    self.assertIsNone(select_sources([a])['lowest_cost_source'])
if __name__=='__main__':unittest.main()
