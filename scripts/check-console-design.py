#!/usr/bin/env python3
"""Check the public design reference without a browser, server or dependencies.

--update explicitly regenerates the documentation gallery and mockup manifest.
It never runs an old exporter or changes application/runtime source.
"""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit
import hashlib, html, json, re, sys

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / 'docs/design/console'
MOCK = ROOT / 'mockups/console'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()

class Links(HTMLParser):
    def __init__(self):
        super().__init__(); self.links = []; self.assets = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'a' and a.get('href'): self.links.append(a['href'])
        if tag in ['img', 'script'] and a.get('src'): self.assets.append(a['src'])
        if tag == 'link' and a.get('rel') == 'stylesheet': self.assets.append(a['href'])

def local(base, value):
    u = urlsplit(value)
    if u.scheme or u.netloc or not u.path: return None
    p = (base / unquote(u.path)).resolve()
    assert p.is_relative_to(ROOT), 'Link escapes repository: ' + value
    return p

def update():
    cards = []
    for i, v in enumerate(json.loads((DOC / 'visual-index.json').read_text())['captures']):
        current = i < 6
        label = v['id'] + ' · ' + v['theme'] + ' · ' + v['route'] + ' · ' + v['state']
        cards.append('<article data-search="' + html.escape(label.lower(), quote=True) + '" data-current="' + str(current).lower() + '"><a href="' + html.escape(v['file'], quote=True) + '"><img loading="lazy" src="' + html.escape(v['file'], quote=True) + '" alt="' + html.escape(label, quote=True) + '"></a><h2>' + html.escape(v['id']) + '</h2><p>' + html.escape(label) + '</p><p>' + html.escape(v['authority']) + '</p></article>')
    (MOCK / 'gallery.html').write_text('''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Console design references</title><style>*{box-sizing:border-box}body{margin:0;background:#F4F7FB;color:#172B3A;font:15px/1.5 system-ui,sans-serif}main{max-width:1400px;margin:auto;padding:20px}nav{display:flex;gap:16px;flex-wrap:wrap}a{color:#06636D}label{display:inline-flex;gap:8px;margin:16px 12px 16px 0}input,select{padding:10px;font:inherit;max-width:100%}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:18px}article{background:white;border:1px solid #D9E2EE;border-radius:9px;padding:14px;min-width:0}img{display:block;width:100%;height:260px;object-fit:contain;object-position:top left}h2{font-size:15px;overflow-wrap:anywhere}article p{font-size:12px;color:#526575;overflow-wrap:anywhere}[hidden]{display:none!important}:focus-visible{outline:3px solid #245DD8;outline-offset:3px}</style></head><body><main><h1>Persisted console design references</h1><p>Six current navigation/layout captures followed by historical screen/state references. Written current contracts override old chrome. Images are not production code or passing-test counts.</p><nav><a href="../../docs/design/console/README.md">Authoritative DDs</a><a href="navigation-demo.html">Menu prototype</a><a href="navigation-investigation.html">Investigation layout</a><a href="../../docs/design/console/visual-index.json">Capture metadata</a></nav><label>Search <input id="filter" type="search"></label><label>Reference set <select id="set"><option value="all">All</option><option value="current">Current</option><option value="historical">Historical</option></select></label><p id="count" role="status"></p><div class="grid">''' + ''.join(cards) + '''</div></main><script>const rows=[...document.querySelectorAll('article')],q=document.getElementById('filter'),set=document.getElementById('set');function filter(){let n=0;for(const row of rows){row.hidden=!row.dataset.search.includes(q.value.trim().toLowerCase())||(set.value!=='all'&&(set.value==='current')!==(row.dataset.current==='true'));if(!row.hidden)n++;}document.getElementById('count').textContent=n+' references shown';}q.addEventListener('input',filter);set.addEventListener('change',filter);filter();</script></body></html>''')
    manifest = {'scope': 'Static public design reference; not runtime acceptance', 'files': {str(p.relative_to(MOCK)): sha(p) for p in sorted(MOCK.rglob('*')) if p.is_file() and p != MOCK / 'manifest.json'}}
    (MOCK / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')

def check():
    manifest = json.loads((MOCK / 'manifest.json').read_text())['files']
    actual = {str(p.relative_to(MOCK)) for p in MOCK.rglob('*') if p.is_file()}
    assert actual == set(manifest) | {'manifest.json'}, 'Unexpected/missing mockup files'
    for name, digest in manifest.items():
        p = local(MOCK, name)
        assert p and p.is_file() and not (MOCK / name).is_symlink() and sha(p) == digest, name
    paths = list(DOC.glob('*.md')) + [ROOT / 'docs/adr/010-prototype-led-console-design.md', MOCK / 'README.md']
    count = 0
    for p in paths:
        for value in re.findall(r'\[[^\]]*\]\(([^)]+)\)', p.read_text()):
            target = local(p.parent, value)
            if target is not None: assert target.is_file(), str(p) + ' -> ' + value; count += 1
    for p in MOCK.glob('*.html'):
        parsed = Links(); parsed.feed(p.read_text())
        for value in parsed.assets + parsed.links:
            target = local(p.parent, value)
            if target is not None: assert target.is_file(), str(p) + ' -> ' + value; count += 1
    for p in MOCK.glob('*.css'):
        for value in re.findall(r'url\(\s*[\'"]?([^\)\'"\s]+)', p.read_text()):
            target = local(p.parent, value)
            if target is not None: assert target.is_file(), value
    screens = json.loads((DOC / 'screen-inventory.json').read_text())['screens']
    assert len(screens) == len({v['screenId'] for v in screens}) == 24
    assert len({v['menu'] for v in screens}) == 8
    for v in screens:
        assert v['screenId'] in (DOC / 'screen-contracts.md').read_text()
        assert local(DOC, v['normativeSpec']).is_file() and local(DOC, v['menuReference']).is_file()
        if 'visualAuthority' in v: assert local(DOC, v['visualAuthority']).is_file()
    visuals = json.loads((DOC / 'visual-index.json').read_text())['captures']
    assert len(visuals) == 147
    for v in visuals: assert sha(MOCK / v['file']) == v['sha256'], v['file']
    tokens = json.loads((DOC / 'design-tokens.json').read_text()); original = json.loads((MOCK / 'tokens.json').read_text()); css = (MOCK / 'console-color-v7.css').read_text()
    for theme in ['light', 'dark']:
        assert tokens[theme] == original[theme]
        block = css.split('.prototype#app[data-theme=' + theme + ']', 1)[1].split('}', 1)[0]
        for key, value in tokens[theme].items():
            if key == 'badgeTintPercent': continue
            name = re.sub(r'[A-Z]', lambda m: '-' + m[0].lower(), key)
            assert '--' + name + ':' + value in block, theme + '/' + key
    assert sha(local(DOC, tokens['logo']['copy'])) == tokens['logo']['sha256']
    # The published set is an explicit docs/assets allowlist, not a private-pack copy.
    forbidden = [r'/Users/', r'/private/var/', r'helios\d+', r'earlyDecisionResponse', r'MergePatchType', r'-----BEGIN [A-Z ]*PRIVATE KEY', r'gh[pousr]_[A-Za-z0-9]{20,}']
    text_files = list(DOC.rglob('*')) + list(MOCK.rglob('*')) + [ROOT / 'docs/adr/010-prototype-led-console-design.md']
    for p in text_files:
        if not p.is_file() or p.suffix == '.png': continue
        text = p.read_text()
        for pattern in forbidden: assert not re.search(pattern, text), 'Disallowed public content: ' + str(p.relative_to(ROOT))
    assert not any(p.suffix in ['.zip', '.go', '.tsx'] for p in MOCK.rglob('*'))
    print(json.dumps({'passed': True, 'mockupBindings': len(manifest), 'localLinks': count, 'screenPurposes': len(screens), 'visuals': len(visuals), 'paletteLogoMatch': True, 'publicContentAllowlist': True}, indent=2))

if __name__ == '__main__':
    if '--update' in sys.argv: update()
    check()
