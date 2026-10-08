"""src/ -> docs/ 빌드. 노트(w1~w6.html)나 암기 데이터(memo_w*.json)를 고친 뒤 `python build.py` 실행."""
import json
import shutil
from pathlib import Path

root = Path(__file__).parent
src, out = root / 'src', root / 'docs'
out.mkdir(exist_ok=True)

notes = '\n'.join((src / f'w{i}.html').read_text(encoding='utf-8') for i in range(1, 7))
memo = [json.loads((src / f'memo_w{i}.json').read_text(encoding='utf-8')) for i in range(1, 7)]
# </script> 가 JSON 안에 있어도 스크립트가 끊기지 않도록
memo_js = json.dumps(memo, ensure_ascii=False).replace('</', '<\\/')

html = (src / 'template.html').read_text(encoding='utf-8')
html = html.replace('<!--NOTES-->', notes).replace('/*MEMO*/', memo_js)
(out / 'index.html').write_text(html, encoding='utf-8')
for f in ('style.css', 'app.js'):
    shutil.copy(src / f, out / f)
(out / '.nojekyll').touch()
print('built', out, 'cards:', sum(len(m['cards']) for m in memo))
