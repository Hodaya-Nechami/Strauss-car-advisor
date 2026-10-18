import sys, glob, zipfile, json, os
import xml.etree.ElementTree as ET
root = sys.argv[1]
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
T = '{%s}t' % ns['m']
z = zipfile.ZipFile(os.path.join(root, 'data', 'source', 'challenge-data.xlsx'))
ss = [''.join(t.text or '' for t in si.iter(T)) for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', ns)] if 'xl/sharedStrings.xml' in z.namelist() else []
names = [s.get('name') for s in ET.fromstring(z.read('xl/workbook.xml')).find('m:sheets', ns)]
def sheet(name):
    i = names.index(name) + 1
    rows = []
    for row in ET.fromstring(z.read(f'xl/worksheets/sheet{i}.xml')).iter('{%s}row' % ns['m']):
        r = []
        for c in row.findall('m:c', ns):
            v = c.find('m:v', ns); val = v.text if v is not None else ''
            if c.get('t') == 's': val = ss[int(val)]
            elif c.get('t') == 'inlineStr': val = ''.join(t.text or '' for t in c.iter(T))
            r.append(val)
        rows.append(r)
    return rows
def num(x):
    f = float(x); return int(f) if f.is_integer() else f
cat = []
for r in sheet('קטלוג רכבים')[1:]:
    cat.append(dict(id=r[0], group=r[1], manufacturer=r[2], manufacturerCode=r[3], model=r[4], modelCode=r[5],
        modelDescription=r[6], registrationYear=int(r[7]), drive=r[8], listPrice=num(r[9]), valueOfUse=num(r[10]),
        monthlyCost=num(r[11]), defaultParticipation=num(r[12])))
occ = []
for r in sheet('עיסוקים')[1:]:
    occ.append(dict(name=r[0], group=r[1], carMandatory=r[2] == 'כן', waiverAllowed=r[3] == 'כן', waiverMaintenance=num(r[4])))
emp = []
for r in sheet('עובדים לדוגמה')[1:]:
    emp.append(dict(id=r[0], name=r[1], occupation=r[3], group=r[4], baseSalary=num(r[5]), commissions=num(r[6]),
        bonus=num(r[7]), pensionRate=num(r[8]), studyFundRate=num(r[9]), creditPoints=num(r[10]), childrenUnder23=int(r[11]),
        todayCar=r[12], todayParticipation=num(r[13]), question=r[14]))
ref = []
for r in sheet('חישובים')[1:]:
    ref.append(dict(id=r[0], today=r[2], alternative=r[3], eligible=r[4] == 'כן', reason=r[5], netToday=num(r[6]),
        netAlternative=num(r[7]), diff=num(r[8]), taxToday=num(r[9]), taxAlternative=num(r[10]), niHealthToday=num(r[11]),
        niHealthAlternative=num(r[12]), electricGross=num(r[13]), familyGapEmployee=num(r[14]), why=r[15]))
for fn, data in [('catalog', cat), ('occupations', occ), ('sample-employees', emp), ('reference-results', ref)]:
    with open(os.path.join(root, 'config', fn + '.json'), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2); f.write('\n')
    print(fn, len(data))
