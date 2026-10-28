import unittest
from ozon_operator.collection import observe_html
from ozon_operator.observation_audit import audit_observation
class Audit(unittest.TestCase):
 def test_suspect_weight_never_fixed_by_guess(self):
  x=observe_html('<script>{"skuInfoMap":{"A":{"skuId":1,"price":"179"}},"beginAmount":1,"freightInfo":{"freeDeliverFee":true},"pieceWeightScaleInfo":[{"weight":7,"length":52,"width":48,"height":65}]}</script>')
  r=audit_observation(x)
  self.assertEqual(r['domestic_freight_cny'],'0')
  self.assertIn('suspicious_packaging_weight_or_unit',r['todo'])
  self.assertEqual(x['raw_packaging'][0]['weight'],7)
  self.assertFalse(r['publication_approved'])
 def test_moq_two_rejects(self):
  x=observe_html('<script>{"skuInfoMap":{"A":{"skuId":1,"price":"10"}},"beginAmount":2}</script>')
  self.assertEqual(audit_observation(x)['status'],'rejected_moq')
if __name__=='__main__':unittest.main()
