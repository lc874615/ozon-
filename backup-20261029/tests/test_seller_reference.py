import unittest
from ozon_operator.seller_reference import normalize_seller_reference
from ozon_operator.buyer_snapshot import normalize_buyer_snapshot

class SellerReference(unittest.TestCase):
    def fixture(self):
        return {'product_id':'123','seller_reference':{'items':[{'variant_id':'456','sku_ids':['123']}],
            'approved_detail':{'status':'detail_response_observed','requested_sku':'123','variant_id':'456',
                'fields':{'depth':650,'width':650,'height':100,'weight':2500},
                'response_identifiers':{'bundle_id':'789'},'draft_creation_confirmed':False}}}
    def test_preserve_observation_without_promoting_to_costing(self):
        s=self.fixture();r=normalize_seller_reference(s)
        self.assertEqual(r['candidate_under_vendor_mm_g_assumption']['gross_kg'],'2.5')
        self.assertEqual(r['candidate_under_vendor_mm_g_assumption']['volume_cm3'],'42250')
        self.assertFalse(r['eligible_for_costing']);self.assertEqual(r['draft_state'],'unknown')
        item=normalize_buyer_snapshot(s)
        self.assertIsNone(item['gross_kg']);self.assertFalse(item['packaging_complete'])
    def test_reject_foreign_sku_or_variant(self):
        for key in ('requested_sku','variant_id'):
            s=self.fixture();s['seller_reference']['approved_detail'][key]='999'
            r=normalize_seller_reference(s);self.assertEqual(r['status'],'sku_variant_mismatch')
            self.assertNotIn('candidate_under_vendor_mm_g_assumption',r)
    def test_invalid_measurements(self):
        for value in ('NaN','-1','Infinity'):
            s=self.fixture();s['seller_reference']['approved_detail']['fields']['weight']=value
            self.assertEqual(normalize_seller_reference(s)['status'],'incomplete_or_invalid_detail')
