import unittest
from ozon_operator.package_enrichment import enrich_with_store_packages
class Enrichment(unittest.TestCase):
 def test_exact_sku_not_product_id_or_title(self):
  row={'sku':'12','product_id':'99','status':'packaging_observed','gross_kg':'7','dimensions_cm':{'length':'57','width':'50','height':'35'},'source':'seller API','fetched_at':'test'}
  batch={'items':[{'product_id':'12','todo':[]},{'product_id':'99','todo':[]}]}
  x=enrich_with_store_packages(batch,{'rows':[row]})
  self.assertEqual(x['seller_packaging_enriched_count'],1)
  self.assertEqual(x['items'][1]['seller_api_packaging_status'],'no_exact_store_sku_match')
 def test_conflict_not_overwritten(self):
  row={'sku':'12','product_id':'99','status':'packaging_observed','gross_kg':'7','dimensions_cm':{},'source':'seller API','fetched_at':'test'}
  x=enrich_with_store_packages({'items':[{'product_id':'12','gross_kg':'8','todo':[]}]},{'rows':[row]})
  self.assertEqual(x['items'][0]['gross_kg'],'8');self.assertEqual(x['items'][0]['seller_api_packaging_status'],'source_conflict')
if __name__=='__main__':unittest.main()
