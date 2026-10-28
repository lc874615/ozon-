import csv
import tempfile
import unittest
from pathlib import Path
from openpyxl import Workbook
from ozon_operator.official_market_export import import_official_market_export

class OfficialExport(unittest.TestCase):
 def write(self, folder, headers, rows):
  path=Path(folder)/'official.xlsx';w=Workbook();s=w.active;s.append(['Official export']);s.append(headers)
  for row in rows:s.append(row)
  w.save(path);return path
 def test_exact_sku_period_and_explicit_packaging(self):
  with tempfile.TemporaryDirectory() as folder:
   p=self.write(folder,['SKU','Бренд','Схема продаж','Продано за 28 дней, шт.','Длина упаковки, мм','Ширина упаковки, мм','Высота упаковки, мм','Вес с упаковкой, г'],[['123','без бренда','FBS',6,650,650,100,2500],['999','Other','FBO',100,1,1,1,1]])
   r=import_official_market_export(p,'123');i=r['matched_rows'][0]
   self.assertEqual(r['status'],'single_sku_found');self.assertEqual(i['selection']['status'],'market_filters_passed')
   self.assertEqual(i['packaging']['gross_kg'],'2.5');self.assertEqual(i['packaging']['dimensions_cm']['length'],'65')
   self.assertTrue(i['packaging']['complete']);self.assertEqual(len(r['matched_rows']),1);self.assertEqual(r['store_mutations'],0)
 def test_cutoff_and_brand(self):
  with tempfile.TemporaryDirectory() as folder:
   p=self.write(folder,['SKU','Бренд','Схема продаж','Продано за 28 дней, шт.'],[['123','без бренда','FBS',5]])
   self.assertEqual(import_official_market_export(p,'123')['matched_rows'][0]['selection']['status'],'exclude')
 def test_unqualified_weights_and_dimensions_are_not_packaging(self):
  with tempfile.TemporaryDirectory() as folder:
   p=self.write(folder,['SKU','Вес, кг','Длина, см','Ширина, см','Высота, см'],[['123',2.5,65,65,10]])
   i=import_official_market_export(p,'123')['matched_rows'][0]
   self.assertFalse(i['packaging']['complete']);self.assertEqual(i['packaging']['dimensions_cm'],{})
 def test_orders_and_period_not_invented(self):
  with tempfile.TemporaryDirectory() as folder:
   p=self.write(folder,['SKU','Бренд','Схема продаж','Заказано товаров за 28 дней, шт.'],[['123','без бренда','FBS',140]])
   i=import_official_market_export(p,'123')['matched_rows'][0]
   self.assertEqual(i['observed_metric']['kind'],'ordered_units');self.assertEqual(i['selection']['status'],'review')
 def test_generic_sales_period_needs_confirmation(self):
  with tempfile.TemporaryDirectory() as folder:
   p=self.write(folder,['SKU','Бренд','Схема продаж','Продано, шт.'],[['123','без бренда','FBS',8]])
   self.assertEqual(import_official_market_export(p,'123')['matched_rows'][0]['selection']['status'],'review')
   self.assertEqual(import_official_market_export(p,'123',28)['matched_rows'][0]['selection']['status'],'market_filters_passed')
 def test_conflicting_packaging_columns(self):
  with tempfile.TemporaryDirectory() as folder:
   p=self.write(folder,['SKU','Длина упаковки, мм','Длина упаковки, см'],[['123',650,70]])
   r=import_official_market_export(p,'123')['matched_rows'][0]['packaging']
   self.assertEqual(r['conflicts'],['length']);self.assertNotIn('length',r['dimensions_cm'])
 def test_duplicate_sku_not_collapsed(self):
  with tempfile.TemporaryDirectory() as folder:
   p=self.write(folder,['SKU'],[['123'],['123']]);r=import_official_market_export(p,'123');self.assertEqual(r['status'],'duplicate_sku_requires_review');self.assertTrue(all(i['selection']['status']=='review' for i in r['matched_rows']))
 def test_utf8_csv(self):
  with tempfile.TemporaryDirectory() as folder:
   p=Path(folder)/'report.csv';p.write_text('SKU;Бренд;Схема продаж;Продано за 28 дней, шт.\n123;без бренда;FBS;6\n',encoding='utf-8-sig')
   self.assertEqual(import_official_market_export(p,'123')['matched_rows'][0]['selection']['status'],'market_filters_passed')
