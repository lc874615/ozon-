"""Evidence gates for pilot products. No purchasing or listing side effects."""
from decimal import Decimal as D
from .package_review import compare_packages
from .promotion_pricing import price_plan
from .cost_engine import assess_market_price

def validate_candidate(c):
    todos=[]
    required={
      'supplier_sku_verified':'核实1688对应SKU及采购价格',
      'variant_and_quantity_verified':'确认竞品与货源规格、数量一致',
      'material_verified':'核实主体及主要部件材质一致',
      'visual_match_verified':'核对商品外观及结构',
      'market_price_verified':'取得同规格竞品绿标价格及采集时间',
      'category_and_carrier_allowed':'核实类目准入和OGL承运条件',
      'commission_verified':'核实成交价对应佣金',
      'all_applicable_fees_verified':'确认适用费用及计算口径',
      'freight_channel_verified':'核实所选OGL渠道及成交价档位',
      'supplier_availability_verified':'确认供货库存与交仓时效',
      'image_usage_verified':'确认素材使用权',
      'listing_content_verified':'完成俄语属性、图片与文案校验',
      'promotion_eligibility_verified':'核实5折活动资格和实际活动价'
    }
    for key,label in required.items():
      if c.get(key) is not True:todos.append({'code':key,'task':label})
    package=compare_packages(c.get('supplier_package'),c.get('competitor_package'),
       comparable=c.get('variant_and_quantity_verified') is True,
       channel_changed=c.get('package_comparison_changes_channel',False))
    todos += [{'code':'package:'+v,'task':'核实包装数据：'+v} for v in package['todo']]
    financial=None;prices=None
    if c.get('target_transaction_cny') is not None:
      prices=price_plan(c['target_transaction_cny'])
    else:todos.append({'code':'target_transaction_price','task':'确定目标促销成交价'})
    if prices and c.get('costs_cny') and c.get('fee_rates'):
      unresolved=[t['code'] for t in todos if t['code'] in [
        'commission_verified','all_applicable_fees_verified','freight_channel_verified'] or t['code'].startswith('package:')]
      financial=assess_market_price(prices['target_transaction_cny'],c['costs_cny'],c['fee_rates'],unresolved)
      if financial['status']=='reject_margin':todos.append({'code':'margin_below_25','task':'淘汰或重新找货源：利润率不足25%'})
    else:todos.append({'code':'cost_breakdown','task':'补齐成本和费率，禁止把未知费用当零'})
    if c.get('market_price_verified') is True and prices:
      fx=c.get('rub_per_cny')
      green=c.get('competitor_green_rub')
      if fx is not None and green is not None:
        rate=D(str(fx));gp=D(str(green))
        if not rate.is_finite() or rate<=0 or not gp.is_finite() or gp<=0:raise ValueError('Invalid market conversion')
        comparable_backend=gp*D('1.10')/rate
        if D(prices['target_transaction_cny'])>comparable_backend:
          todos.append({'code':'market_price_disadvantage','task':'目标成交价超过竞品折算参考价，需核实竞争优势'})
      else:todos.append({'code':'market_conversion','task':'核实竞品绿标价及汇率'})
    rejected=any(t['code']=='margin_below_25' for t in todos)
    return {'candidate_id':c['candidate_id'],'stage':'reject_margin' if rejected else ('needs_verification' if todos else 'ready_for_publication_review'),
            'package_comparison':package,'price_plan':prices,'financial':financial,'todos':todos,
            'publication_approved':False,'online_mutations':False}
