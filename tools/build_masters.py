"""
Rebuild the blank fire pump master PDFs and their cell layout (forms-layout.js)
from the official California AES state forms. Only needed if the state revises a form.

  python3 tools/build_masters.py <AES_5.1_diesel.pdf> <AES_5.3_electric.pdf> <out_dir>

Per form:
  1. qpdf --decrypt (the state forms are fill-only locked)
  2. clear every value in the test columns, keep the header block (building, pump data)
  3. flatten so the header text is printed, then remove all form fields
  4. record where each item / date / deficiency / signature cell sits from the old field positions
Outputs master_diesel.pdf and master_electric.pdf (upload to Drive > Logs > Rounds > Test Form Assets)
and rewrites forms-layout.js. A revised form needs the row lists below checked against the printed item numbers.
"""
import json, os, re, subprocess, sys
import pikepdf

H = 792

def dump_fields(src):
    pdf = pikepdf.open(src); out = []
    for pi, page in enumerate(pdf.pages):
        for a in page.get('/Annots', []):
            if a.get('/Subtype') != '/Widget': continue
            names = []; o = a; ft = None
            while o is not None:
                if '/T' in o: names.insert(0, str(o.T))
                if ft is None and '/FT' in o: ft = str(o.FT)
                o = o.get('/Parent')
            out.append(dict(p=pi, name='.'.join(names), ft=ft, rect=[round(float(x), 1) for x in a.Rect]))
    return out

def read_words(bbox_html):
    b = open(bbox_html).read(); words = []; pg = -1
    for m in re.finditer(r'<page |<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', b):
        if m.group(0).startswith('<page'): pg += 1; continue
        x0, y0, x1, y1 = [float(m.group(i)) for i in range(1, 5)]
        words.append(dict(p=pg, t=m.group(5), x0=x0, x1=x1, y0=H - y1, y1=H - y0))
    return words

def norm(r):
    x0, y0, x1, y1 = r
    return [round(min(x0, x1), 1), round(min(y0, y1), 1), round(max(x0, x1), 1), round(max(y0, y1), 1)]

def rowcells(fields, p, yc, minx=300):
    out = [norm(f['rect']) for f in fields if f['p'] == p and f['rect'][0] >= minx and abs((f['rect'][1] + f['rect'][3]) / 2 - yc) <= 3]
    return sorted(out, key=lambda r: r[0])

def unitcap(words, p, cell):
    for w in words:
        if w['p'] == p and w['t'] in ('psi', 'sec', 'min') and cell[0] <= w['x0'] <= cell[2] + 16 and w['y0'] >= cell[1] - 3 and w['y1'] <= cell[3] + 3:
            return round(min(w['x0'] - 1, cell[2]), 1)
    return None

# Row centers (PDF points) for each item, read off the 2013 forms
DIESEL_ROWS = {0: [('1.1', 386), ('1.2', 366), ('1.3', 347), ('1.4', 328), ('1.5', 296), ('1.6', 266), ('1.7', 246), ('1.8', 227), ('1.9', 206), ('1.10', 186),
                   ('1.11', 166), ('1.12', 147), ('1.13', 127), ('1.14', 108), ('suction', 88)],
               1: [('1.15', 604), ('system', 585), ('1.16', 565), ('1.17', 546), ('1.18', 525), ('1.19', 505), ('1.20', 485), ('1.21', 466), ('1.22', 447), ('1.23', 426),
                   ('1.24', 406), ('1.25', 387), ('1.26', 361), ('1.27', 335), ('1.28', 316), ('1.29', 297), ('1.30', 277), ('1.31a', 238), ('1.31b', 218), ('1.31c', 198),
                   ('1.31d', 179), ('1.32', 159), ('1.33', 139), ('1.34', 107), ('1.35', 88)],
               2: list(zip(['1.%d' % i for i in range(36, 61)], [604, 585, 565, 545, 525, 504, 485, 466, 446, 426, 406, 385, 360, 324, 304, 284, 265, 244, 224, 204, 185, 165, 145, 126, 106])),
               3: [('1.61', 595), ('1.62', 576), ('1.63', 557), ('1.64', 538), ('1.65', 519), ('1.66', 501), ('1.67', 482), ('1.68', 450)]}
ELEC_ROWS = {0: [('1.1', 379), ('1.2', 360), ('1.3', 340), ('1.4', 321), ('1.5', 290), ('1.6', 258), ('1.7', 239), ('1.8', 219), ('1.9', 199), ('1.10', 179),
                 ('1.11', 160), ('1.12', 140), ('1.13', 120), ('suction', 101)],
             1: list(zip(['1.14', 'system'] + ['1.%d' % i for i in range(15, 38)],
                         [605, 585, 565, 545, 525, 505, 485, 465, 445, 425, 406, 386, 366, 346, 326, 307, 275, 255, 235, 216, 196, 176, 156, 136, 105]))}
SPEC = {
    'diesel': dict(n=5, rows=DIESEL_ROWS, dates={0: 412, 1: 622, 2: 622, 3: 613}, defp=3, defy=[386, 367, 348, 330, 311, 292, 274, 255, 236],
                   date_re=r'Date\.\d', aes9=('CBAdditional Def',)),
    'electric': dict(n=6, rows=ELEC_ROWS, dates={0: 407, 1: 622}, defp=2,
                     defy=[613, 594, 574, 555, 536, 516, 497, 477, 458, 438, 418, 399, 380, 360, 341, 321, 301, 282, 262, 243],
                     date_re=r'SignatureDate\.\d', aes9=('AES9',)),
}

def make_layout(form, fields, words):
    sp = SPEC[form]; n = sp['n']
    dates = {p: rowcells(fields, p, y) for p, y in sp['dates'].items()}
    rows = {}
    for p, lst in sp['rows'].items():
        for key, y in lst:
            cells = rowcells(fields, p, y)
            if len(cells) != n:   # a missing field (diesel 1.20 col 3): borrow the column from the date row
                ys = (cells[0][1], cells[0][3]) if cells else (y - 9, y + 9)
                cells = [next((k for k in cells if abs(k[0] - c[0]) < 8), [c[0], ys[0], c[2], ys[1]]) for c in dates[p]]
            rows[key] = {'p': p, 'cells': cells, 'cap': [unitcap(words, p, c) for c in cells]}
    if form == 'diesel':
        for k in ['1.31b', '1.31c', '1.31d']: rows[k]['cap'] = rows['1.31a']['cap']   # psi / rpm / degF printed in the cell
    defrows = []
    for y in sp['defy']:
        cs = sorted([norm(f['rect']) for f in fields if f['p'] == sp['defp'] and abs((f['rect'][1] + f['rect'][3]) / 2 - y) <= 3], key=lambda r: r[0])
        if len(cs) >= 6: defrows.append(dict(item=cs[0], date=cs[1], riser=cs[2], d=cs[3], c=cs[4], text=cs[5]))
    pick = lambda rx: sorted([norm(f['rect']) for f in fields if f['p'] == sp['defp'] and re.match(rx, f['name'])], key=lambda r: r[0])
    cert = dict(date=pick(sp['date_re']), name=pick(r'Print Name\.\d'), sig=pick(r'Signature1\.\d'))
    aes9 = [norm(f['rect']) for f in fields if f['p'] == sp['defp'] and f['name'] in sp['aes9']][0]
    aes9n = [norm(f['rect']) for f in fields if f['p'] == sp['defp'] and f['name'] == 'AES9 Number'][0]
    hdr = {}
    for w in words:
        if w['t'] in ('Year', 'Month') and w['x0'] < 310:
            hdr.setdefault(str(w['p']), {})[w['t']] = [round(w['x1'] + 4, 1), round(w['y0'] + 1, 1)]
    hdr = {'0': hdr['0']} if form == 'diesel' else {'0': {'Year': hdr['0']['Year']}, '1': {'Year': hdr['1']['Year']}}
    return dict(cols=n, pages=4 if form == 'diesel' else 3, dates={str(k): v for k, v in dates.items()}, rows=rows,
                def_rows=defrows, cert=cert, aes9=aes9, aes9n=aes9n, hdr=hdr)

def build(src, form, out_dir, tmp):
    dec = os.path.join(tmp, form + '_dec.pdf'); subprocess.run(['qpdf', '--decrypt', src, dec], check=True)
    fields = dump_fields(dec)
    bb = os.path.join(tmp, form + '_bbox.html'); subprocess.run(['pdftotext', '-bbox-layout', dec, bb], check=True)
    p = pikepdf.open(dec)
    for pi, page in enumerate(p.pages):
        for a in page.get('/Annots', []):
            if a.get('/Subtype') != '/Widget': continue
            top = max(float(a.Rect[1]), float(a.Rect[3]))
            if top > 655 or (pi == 0 and top > 420): continue      # header block keeps its values
            o = a
            while o is not None:
                if '/V' in o: del o['/V']
                o = o.get('/Parent')
            if '/AP' in a: del a['/AP']
    p.Root.AcroForm.NeedAppearances = True
    c1 = os.path.join(tmp, form + '_c1.pdf'); p.save(c1)
    c2 = os.path.join(tmp, form + '_c2.pdf')
    subprocess.run(['qpdf', '--generate-appearances', '--flatten-annotations=all', c1, c2])   # exits 3 on harmless warnings
    p = pikepdf.open(c2)
    if '/AcroForm' in p.Root: del p.Root['/AcroForm']
    for pg in p.pages:
        if '/Annots' in pg: del pg['/Annots']
    p.remove_unreferenced_resources()
    p.save(os.path.join(out_dir, 'master_' + form + '.pdf'), object_stream_mode=pikepdf.ObjectStreamMode.disable, compress_streams=True)
    return make_layout(form, fields, read_words(bb))

if __name__ == '__main__':
    d_src, e_src, out_dir = sys.argv[1:4]
    tmp = os.path.join(out_dir, '_work'); os.makedirs(tmp, exist_ok=True)
    layout = {'diesel': build(d_src, 'diesel', out_dir, tmp), 'electric': build(e_src, 'electric', out_dir, tmp)}
    js = ('// Cell positions on the NFPA 25 AES forms (generated by tools/build_masters.py from the state PDFs). Units: PDF points.\n'
          'const AES_LAYOUT=' + json.dumps(layout, separators=(',', ':')) + ';\n')
    open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'forms-layout.js'), 'w').write(js)
    print('Masters written to', out_dir, '; forms-layout.js updated')
