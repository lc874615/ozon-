"""Deterministic same-product decision from source-grounded visual/attribute findings.
The evidence extractor must supply structural and material findings; this function
never infers them from names or hashes alone.
"""
from decimal import Decimal as D
from .image_parameters import compare_image_parameters

def decide_product_match(evidence):
    reject=[];todo=[];gaps={}
    for key in ['main_structure_consistent','material_components_match','major_functions_match','sales_quantity_match']:
        value=evidence.get(key)
        if value is False:reject.append(key+'_mismatch')
        elif value is not True:todo.append(key+'_unknown')
    color=evidence.get('color_difference')
    if color not in ('same','slight'):
        todo.append('color_difference_requires_review')
    dimensions=evidence.get('product_dimensions',{})
    required=evidence.get('required_product_dimensions',[])
    if not required:todo.append('corresponding_product_dimensions_missing')
    for name in required:
        pair=dimensions.get(name)
        try:
            if not pair or pair.get('basis')!='product' or pair.get('units_normalized') is not True:
                raise ValueError('dimension basis')
            a,b=D(str(pair['supplier'])),D(str(pair['competitor']))
            if not a.is_finite() or not b.is_finite() or min(a,b)<=0:raise ValueError('dimension')
            gap=abs(a-b)/min(a,b);gaps[name]=str(gap)
            if gap>D('.02'):reject.append(name+'_difference_over_2_percent')
        except (KeyError,ValueError,ArithmeticError,TypeError):todo.append(name+'_unverified_dimension')
    if not evidence.get('sources'):todo.append('source_evidence_missing')
    if evidence.get('label_inventory_verified') is not True:
        todo.append('product_and_packaging_label_inventory_unverified')
    else:
        labels=compare_image_parameters(evidence.get('supplier_labels',{}),
            evidence.get('competitor_labels',{}),evidence.get('required_labels',[]))
        reject.extend('label:'+v for v in labels['reasons'])
        todo.extend('label:'+v for v in labels['todo'])
    return {'status':'not_match' if reject else ('needs_review' if todo else 'match'),
            'reasons':reject,'todo':todo,'dimension_gaps':gaps,
            'match_basis':'main structure, material, functions, sales quantity and corresponding product dimensions',
            'publication_approved':False}
