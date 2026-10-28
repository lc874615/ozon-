"""Compare verified same-variant, same-quantity packaging observations."""
from decimal import Decimal as D

def compare_packages(supplier, competitor, *, comparable=False, channel_changed=False):
    todo=[]
    if not comparable:
        return {'status':'hold','todo':['confirm_same_variant_quantity_and_packaging_basis'],'publication_approved':False}
    valid=[]
    for name,p in [('supplier',supplier),('competitor',competitor)]:
        try:
            if p.get('weight_basis')!='gross' or p.get('dimension_basis')!='packaging':
                raise ValueError('basis')
            weight=D(str(p['gross_kg']))
            sides=sorted([D(str(v)) for v in p['dimensions_cm']],reverse=True)
            if not weight.is_finite() or weight<=0 or len(sides)!=3 or any(not v.is_finite() or v<=0 for v in sides):
                raise ValueError('values')
            valid.append((weight,sides))
        except (ValueError,KeyError,TypeError,ArithmeticError,AttributeError):
            todo.append(name+'_packaging_missing_or_invalid')
    if todo:return {'status':'hold','todo':todo,'publication_approved':False}
    a,b=valid
    def gap(x,y):return (max(x,y)-min(x,y))/min(x,y)
    va=a[1][0]*a[1][1]*a[1][2]
    vb=b[1][0]*b[1][1]*b[1][2]
    selected=a[1] if va>=vb else b[1]
    gaps={'gross_weight':gap(a[0],b[0]), 'volume':gap(va,vb)}
    for i in range(3):gaps['side_'+str(i+1)]=gap(a[1][i],b[1][i])
    todo += [k+'_difference_over_20_percent' for k,v in gaps.items() if v>D('.20')]
    if channel_changed:todo.append('logistics_channel_changed')
    return {'status':'hold' if todo else 'reference_ready',
            'estimated_gross_kg':str(max(a[0],b[0])),
            'selected_packaging_dimensions_cm':[str(v) for v in selected],
            'selected_volume_cm3':str(max(va,vb)),
            'dimensions_source':'supplier' if va>=vb else 'competitor',
            'dimension_gaps':{k:str(v) for k,v in gaps.items()},
            'source_observations':{'supplier':supplier,'competitor':competitor},
            'todo':todo,'actual_package_verified':False,'publication_approved':False}
