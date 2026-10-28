"""Compare transcribed image parameters with normalized units and explicit evidence.
Image reading/OCR must provide verified transcriptions. No OCR output is trusted
as a product specification without source context.
"""
from decimal import Decimal as D
import unicodedata

def normalize_parameter(name,reading):
    if reading.get('reading_verified') is not True:raise ValueError('unverified image reading')
    if not reading.get('source'):raise ValueError('missing image evidence')
    if name=='brand':
        value=unicodedata.normalize('NFKC',str(reading['value'])).strip().casefold()
        if not value:raise ValueError('brand missing')
        return value
    if name not in ('voltage','power'):
        value=unicodedata.normalize('NFKC',str(reading['value'])).strip().casefold()
        if not value:raise ValueError('label missing')
        return (value,reading.get('unit'),reading.get('role'))
    factor={'voltage':{'V':D(1),'kV':D(1000)},'power':{'W':D(1),'kW':D(1000)}}[name][reading['unit']]
    raw=reading['value'];values=raw if isinstance(raw,list) else [raw]
    numbers=[D(str(v))*factor for v in values]
    if not numbers or any(not n.is_finite() or n<=0 for n in numbers):raise ValueError('invalid parameter')
    kind=reading.get('kind','rated')
    if kind=='range':
        if len(numbers)!=2 or numbers[0]>numbers[1]:raise ValueError('invalid range')
    elif len(numbers)!=1:raise ValueError('unexpected scalar')
    # AC/DC, input/output and rated/peak distinctions must be supplied by reading.
    return (kind,reading.get('current_type'),reading.get('role'),tuple(numbers))

def compare_image_parameters(supplier,competitor,required=()):
    reasons=[];todo=[]
    names=set(supplier)|set(competitor)|set(required)
    for name in sorted(names):
        if name not in supplier or name not in competitor:
            todo.append(name+'_missing_on_one_side');continue
        try:
            a=normalize_parameter(name,supplier[name]);b=normalize_parameter(name,competitor[name])
            if name in ('voltage','power') and (a[1] is None and name=='voltage' or a[2] is None or b[2] is None or a[0]=='unknown' or b[0]=='unknown'):
                todo.append(name+'_context_unclear');continue
            if a!=b:reasons.append(name+'_mismatch')
        except (KeyError,ValueError,ArithmeticError,TypeError):todo.append(name+'_reading_or_unit_unverified')
    return {'status':'not_match' if reasons else ('needs_review' if todo else 'match'),
            'reasons':reasons,'todo':todo,'dimension_tolerance_applied':False}
