const vm=require('vm'),fs=require('fs'),assert=require('assert/strict');const c={};vm.createContext(c);vm.runInContext(fs.readFileSync('browser-extension/packaging-reader.js','utf8'),c);
const form={fields:[{label:'包装长度（厘米） *',value:'65'},{label:'包装宽度，毫米',value:'650'},{label:'Высота упаковки, см',value:'10'},{label:'含包装重量（千克）',value:'2,5'},{label:'商品重量，克',value:'99'},{label:'宽度，厘米',value:'999'}]};
let r=c.extractPackaging(form);assert(r.complete);assert.equal(r.values.length_mm,650);assert.equal(r.values.width_mm,650);assert.equal(r.values.height_mm,100);assert.equal(r.values.gross_weight_g,2500);
r=c.extractPackaging({fields:Array(4).fill({label:'包装长度，毫米',value:'650'})});assert(!r.complete);assert.equal(r.missing.length,3);
r=c.extractPackaging({fields:[...form.fields,{label:'包装宽度，毫米',value:'700'}]});assert.equal(r.status,'conflict');assert(r.conflicts.some(x=>x.key==='width_mm'));
r=c.extractPackaging({fields:[{label:'包装长度',value:'65'}]});assert(!r.complete);assert(r.diagnostics.some(x=>x.reason==='unit_not_confirmed'));
r=c.extractPackaging({fields:[{label:'Package length',value:'65',unit_text_candidates:['cm']}],read_only_attributes:[{label:'Вес с упаковкой, г',value:'2 500'}]});assert.equal(r.values.length_mm,650);assert.equal(r.values.gross_weight_g,2500);
r=c.extractPackaging({fields:[{label:'包装高度，毫米',value:'0'}]});assert(!r.complete);assert(r.diagnostics.some(x=>x.reason==='non_positive_packaging_value'));
console.log('PASS four distinct packaging axes, cm/mm and kg/g normalization, comma decimals, readonly labels, unknown units/conflicts rejected, product size/weight never substituted');
