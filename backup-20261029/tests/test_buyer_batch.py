import unittest
from ozon_operator.buyer_batch import import_buyer_batch
class Batch(unittest.TestCase):
 def test_best_detail_and_dedupe(self):
  root='https://www.ozon.ru/product/a-123/'
  x=import_buyer_batch([{'source_url':root,'title':'Good','status':'attributes_observed','properties':[{'name':'Материал','value':'Wood'}]}, {'source_url':root+'reviews/','title':'Reviews','properties':[]}])
  self.assertEqual(x['unique_products'],1);self.assertEqual(x['duplicate_records'],1)
  self.assertEqual(x['items'][0]['title'],'Good')
 def test_markdown_excluded(self):
  x=import_buyer_batch([{'source_url':'https://www.ozon.ru/product/a-2/','title':'Уцененный товар'}])
  self.assertEqual(x['candidate_count'],0);self.assertEqual(x['excluded'][0]['reason'],'markdown_condition_not_new')
 def test_sales_are_not_markdown_condition(self):
  x=import_buyer_batch([{'source_url':'https://www.ozon.ru/product/a-3/','title':'Распродажа LED'}])
  self.assertEqual(x['candidate_count'],1)
if __name__=='__main__':unittest.main()
