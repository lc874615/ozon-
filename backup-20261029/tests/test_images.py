import unittest
from ozon_operator.images import download_product_image
class Images(unittest.TestCase):
 def test_unapproved_hosts_blocked(self):
  for u in ['http://cbu01.alicdn.com/img.jpg','https://example.com/img.jpg','https://127.0.0.1/x']:
   with self.assertRaises(ValueError):download_product_image(u,'unused.jpg')
if __name__=='__main__':unittest.main()
