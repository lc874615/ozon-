"""Accept only explicit packaging candidates with units and matching SKU scope."""
from decimal import Decimal as D

def normalize_package_probe(probe):
    values={'gross_kg':set(),'length':set(),'width':set(),'height':set()};sources=[]
    for c in (probe or {}).get('candidates',[]):
        if c.get('semantic')!='packaging_candidate' or c.get('sku_scope_verified') is not True:continue
        key=str(c.get('key','')).lower();unit=str(c.get('unit') or '').lower()
        try:n=D(str(c['value']).replace(',','.'))
        except (KeyError,ArithmeticError):continue
        if not n.is_finite() or n<=0:continue
        if 'weight' in key:
            if unit not in ('g','kg','г','кг'):continue
            values['gross_kg'].add(str(n/1000 if unit in ('g','г') else n))
        else:
            axis=next((a for a in ('length','width','height') if a in key),None)
            if not axis or unit not in ('mm','cm','мм','см'):continue
            values[axis].add(str(n/10 if unit in ('mm','мм') else n))
        sources.append({'source':c.get('source'),'path':c.get('path')})
    conflicts=[k for k,v in values.items() if len(v)>1]
    complete=all(len(v)==1 for v in values.values())
    return {'status':'conflict' if conflicts else ('complete_observation' if complete else 'incomplete'),
            'gross_kg':next(iter(values['gross_kg'])) if len(values['gross_kg'])==1 else None,
            'dimensions_cm':{k:next(iter(values[k])) for k in ('length','width','height') if len(values[k])==1},
            'conflicts':conflicts,'sources':sources,'physical_measurements_verified':False}
