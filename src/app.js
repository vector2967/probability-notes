'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// localStorage는 막혀 있을 수 있으므로 항상 try/catch
const store = {
  get(k, d) { try { const v = localStorage.getItem('prob:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('prob:' + k, JSON.stringify(v)); } catch (e) {} },
};
const tex = el => window.renderMathInElement && renderMathInElement(el, {
  delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }],
  throwOnError: false,
});
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let week = store.get('week', 0);            // 0 = 전체
const res = store.get('res', {});           // 문제 id -> 'ok' | 'wrong'
const known = store.get('known', {});       // 카드 id -> true
const inWeek = w => !week || w === week;

/* ---------- 테마 · 헤더 높이 ---------- */
const theme = store.get('theme', null);
if (theme) document.documentElement.dataset.theme = theme;
$('#theme').onclick = () => {
  const r = document.documentElement;
  const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  r.dataset.theme = dark ? 'light' : 'dark';
  store.set('theme', r.dataset.theme);
};
const fitHeader = () => {
  const h = $('header').offsetHeight;
  document.documentElement.style.setProperty('--hh', h + 'px');
  document.documentElement.style.scrollPaddingTop = (h + 8) + 'px';
};
addEventListener('resize', fitHeader);

/* ---------- 개념 노트 ---------- */
const notes = $('#notes-main');
tex(notes);
const WEEKS = $$('section.week', notes).map(s => ({ w: +s.id.slice(1), title: $('h2', s).textContent.trim(), el: s }));

const toc = $('#toc');
$$('h2, h3', notes).forEach((h, i) => {
  if (!h.id) h.id = 'h' + i;
  const a = document.createElement('a');
  a.href = '#' + h.id; a.textContent = h.textContent;
  a.dataset.w = h.closest('section.week').id.slice(1);
  if (h.tagName === 'H2') a.className = 'w';
  a.onclick = e => { e.preventDefault(); h.scrollIntoView(); };   // 해시는 탭 전환에 씀
  toc.appendChild(a);
});

// 노트에서 문제(예제·연습문제)를 수집
const PROBS = [];
WEEKS.forEach(({ w, el }) => {
  let h3 = '', grp = '';
  const seen = {};
  $$('h3, p > b, details.ex', el).forEach(n => {
    if (n.tagName === 'H3') { h3 = n.textContent.trim(); grp = ''; }
    else if (n.tagName === 'B') { if (n.textContent.includes('연습문제')) grp = n.textContent.trim(); }
    else {
      const tag = $('.tag', n).textContent.trim();
      const type = tag.startsWith('예제') ? '예제' : tag[0] === 'B' ? 'B' : 'A';
      seen[tag] = (seen[tag] || 0) + 1;
      const id = `w${w}-${tag}-${seen[tag]}`;
      PROBS.push({ id, w, type, tag, where: grp || h3, el: n });
    }
  });
});
const markNotes = () => PROBS.forEach(p => {
  const s = $('summary', p.el);
  let m = $('.mark', s);
  if (!m) { m = document.createElement('span'); m.className = 'mark'; $('.tag', s).after(m); }
  m.className = 'mark ' + (res[p.id] || '');
  m.textContent = res[p.id] === 'ok' ? '✓' : res[p.id] === 'wrong' ? '✗' : '';
});
markNotes();
const probHTML = p => {
  const s = $('summary', p.el).cloneNode(true);
  $$('.tag, .mark', s).forEach(x => x.remove());
  return s.innerHTML;
};
const solHTML = p => $('.sol', p.el).innerHTML;
const setRes = (id, v) => { if (v) res[id] = v; else delete res[id]; store.set('res', res); markNotes(); };

/* ---------- 암기 노트 ---------- */
const memoMain = $('#memo-main');
window.MEMO.forEach(m => {
  const s = document.createElement('section');
  s.className = 'week'; s.dataset.w = m.week;
  const t = WEEKS.find(x => x.w === m.week);
  s.innerHTML = `<h2>${esc(t ? t.title : m.week + '주차')}</h2>` + m.memo;
  memoMain.appendChild(s);
});
tex(memoMain);

/* ---------- 주차 필터 ---------- */
const weeksBar = $('#weeks');
[{ w: 0, label: '전체' }, ...WEEKS.map(x => ({ w: x.w, label: x.title }))].forEach(({ w, label }) => {
  const b = document.createElement('button');
  b.textContent = label.split('·')[0].trim(); b.title = label; b.dataset.w = w;
  b.onclick = () => { week = w; store.set('week', w); applyWeek(); };
  weeksBar.appendChild(b);
});
function applyWeek() {
  $$('button', weeksBar).forEach(b => b.classList.toggle('on', +b.dataset.w === week));
  WEEKS.forEach(x => x.el.hidden = !inWeek(x.w));
  $$('a', toc).forEach(a => a.hidden = !inWeek(+a.dataset.w));
  $$('section.week', memoMain).forEach(s => s.hidden = !inWeek(+s.dataset.w));
  cardsInit(); quizIdle(); renderWrong();
}

/* ---------- 암기 카드 ---------- */
const CARDS = window.MEMO.flatMap(m => m.cards.map((c, i) => ({ ...c, w: m.week, id: `w${m.week}-c${i}` })));
let deck = [], ci = 0;
const stage = $('#card-stage');
function cardsInit(doShuffle) {
  const kind = $('#card-kind').value, onlyUnknown = $('#card-unknown').checked;
  deck = CARDS.filter(c => inWeek(c.w) && (!kind || c.kind === kind) && (!onlyUnknown || !known[c.id]));
  if (doShuffle) shuffle(deck);
  ci = 0; renderCard();
}
function renderCard() {
  const total = CARDS.filter(c => inWeek(c.w)).length;
  const k = CARDS.filter(c => inWeek(c.w) && known[c.id]).length;
  if (!deck.length) {
    stage.innerHTML = `<div class="empty">${$('#card-unknown').checked ? '🎉 모르는 카드가 없어요!' : '카드가 없어요.'}<br>알아요 ${k} / ${total}</div>`;
    return;
  }
  const c = deck[ci];
  stage.innerHTML = `
    <div class="meta"><span>${ci + 1} / ${deck.length}</span><span>알아요 ${k} / ${total}</span></div>
    <div class="progress"><i style="width:${(k / total * 100).toFixed(1)}%"></i></div>
    <div class="card" tabindex="0" role="button" aria-label="카드 뒤집기">
      <div class="card-in">
        <div class="face front"><span class="k">${c.w}주차 · ${esc(c.kind || '')}${known[c.id] ? ' · ✓' : ''}</span><div>${c.q}</div></div>
        <div class="face back"><span class="k">정답</span><div>${c.a}</div></div>
      </div>
    </div>
    <div class="card-btns">
      <button data-a="prev">← 이전</button>
      <button data-a="again">다시 볼래요</button>
      <button data-a="know" class="primary">알아요</button>
      <button data-a="next">다음 →</button>
    </div>`;
  tex(stage);
  // 앞/뒤 중 긴 쪽에 높이를 맞춤
  const inner = $('.card-in', stage);
  inner.style.minHeight = Math.max(260, ...$$('.face > div', stage).map(d => d.scrollHeight + 60)) + 'px';
  $('.card', stage).onclick = flip;
  $$('.card-btns button', stage).forEach(b => b.onclick = () => cardAct(b.dataset.a));
}
const flip = () => { const c = $('.card', stage); if (c) c.classList.toggle('flip'); };
function cardAct(a) {
  if (!deck.length) return;
  const c = deck[ci];
  if (a === 'know') { known[c.id] = true; store.set('known', known); }
  if (a === 'again') { delete known[c.id]; store.set('known', known); }
  if (a === 'prev') ci = (ci - 1 + deck.length) % deck.length;
  else ci = (ci + 1) % deck.length;
  renderCard();
}
$('#card-kind').onchange = () => cardsInit();
$('#card-unknown').onchange = () => cardsInit();
$('#card-shuffle').onclick = () => cardsInit(true);
$('#card-reset').onclick = () => {
  if (!confirm('이 주차의 암기 카드 기록을 지울까요?')) return;
  CARDS.filter(c => inWeek(c.w)).forEach(c => delete known[c.id]);
  store.set('known', known); cardsInit();
};
addEventListener('keydown', e => {
  if (current !== 'cards' || /INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) return;
  const map = { ' ': 'flip', ArrowLeft: 'prev', ArrowRight: 'next', '1': 'know', '2': 'again' };
  const a = map[e.key];
  if (!a) return;
  e.preventDefault();
  a === 'flip' ? flip() : cardAct(a);
});

/* ---------- 문제 풀기 ---------- */
const qstage = $('#quiz-stage');
let Q = null;
const types = () => $$('.qtype').filter(x => x.checked).map(x => x.value);
function quizPool() {
  const t = types(), f = $('#quiz-filter').value;
  return PROBS.filter(p => inWeek(p.w) && t.includes(p.type) &&
    (f === 'all' || (f === 'new' && !res[p.id]) || (f === 'wrong' && res[p.id] === 'wrong')));
}
function statsHTML(list) {
  const ok = list.filter(p => res[p.id] === 'ok').length, bad = list.filter(p => res[p.id] === 'wrong').length;
  return `<div class="stats"><div><b>${list.length}</b>문제</div><div><b>${ok}</b>맞음</div><div><b>${bad}</b>틀림</div></div>`;
}
function quizIdle() {
  Q = null;
  const all = PROBS.filter(p => inWeek(p.w) && types().includes(p.type));
  const n = quizPool().length;
  qstage.innerHTML = statsHTML(all) +
    `<p class="empty">조건에 맞는 문제 <b>${n}</b>개 · <b>시작</b>을 누르세요.<br>문제를 풀고 → 정답 확인 → 맞음/틀림을 고르면 기록돼요.</p>`;
}
function quizStart(list) {
  list = list || quizPool();
  if (!list.length) { qstage.innerHTML = '<p class="empty">조건에 맞는 문제가 없어요.</p>'; return; }
  if ($('#quiz-random').checked) list = shuffle([...list]);
  Q = { list, i: 0, ok: [], bad: [] };
  renderQ();
}
function renderQ() {
  const { list, i } = Q;
  if (i >= list.length) return quizDone();
  const p = list[i];
  const prev = res[p.id] ? (res[p.id] === 'ok' ? ' · 지난번 ✓' : ' · 지난번 ✗') : '';
  qstage.innerHTML = `
    <div class="meta"><span>${i + 1} / ${list.length}</span><span>${p.w}주차 · ${esc(p.where)}${prev}</span></div>
    <div class="progress"><i style="width:${(i / list.length * 100).toFixed(1)}%"></i></div>
    <div class="qcard">
      <span class="tag">${esc(p.tag)}</span>
      <div class="prob">${probHTML(p)}</div>
      <textarea placeholder="풀이나 답을 적어 보세요 (저장되지 않아요)"></textarea>
      <div class="sol" hidden>${solHTML(p)}</div>
      <div class="card-btns" id="q-btns">
        <button data-a="skip">건너뛰기</button>
        <button data-a="show" class="primary">정답 확인</button>
      </div>
    </div>`;
  $$('#q-btns button', qstage).forEach(b => b.onclick = () => qAct(b.dataset.a));
  scrollTo({ top: 0 });
}
function qAct(a) {
  const p = Q.list[Q.i];
  if (a === 'show') {
    $('.sol', qstage).hidden = false;
    $('#q-btns', qstage).innerHTML = '<button data-a="wrong">✗ 틀렸어요</button><button data-a="ok" class="primary">✓ 맞았어요</button>';
    $$('#q-btns button', qstage).forEach(b => b.onclick = () => qAct(b.dataset.a));
    return;
  }
  if (a === 'ok') { setRes(p.id, 'ok'); Q.ok.push(p); }
  if (a === 'wrong') { setRes(p.id, 'wrong'); Q.bad.push(p); }
  Q.i++; renderQ();
}
function quizDone() {
  const { ok, bad, list } = Q;
  qstage.innerHTML = `<div class="done"><b>${ok.length} / ${ok.length + bad.length}</b>맞혔어요 (건너뜀 ${list.length - ok.length - bad.length})</div>
    <div class="card-btns">${bad.length ? '<button id="q-retry" class="primary">틀린 문제 다시 풀기</button>' : ''}<button id="q-home">처음으로</button></div>`;
  if (bad.length) $('#q-retry').onclick = () => quizStart(bad);
  $('#q-home').onclick = quizIdle;
}
$('#quiz-start').onclick = () => quizStart();
$$('.qtype').concat($('#quiz-filter')).forEach(x => x.onchange = () => { if (!Q) quizIdle(); });

/* ---------- 오답 노트 ---------- */
const wrongMain = $('#wrong-main');
function renderWrong() {
  const list = PROBS.filter(p => inWeek(p.w) && res[p.id] === 'wrong');
  if (!list.length) { wrongMain.innerHTML = '<p class="empty">틀린 문제가 없어요. 문제 풀기에서 ✗를 누르면 여기에 모여요.</p>'; return; }
  wrongMain.innerHTML = `<div class="bar"><b>틀린 문제 ${list.length}개</b><button id="w-quiz" class="primary">이것만 다시 풀기</button></div>`;
  list.forEach(p => {
    const d = p.el.cloneNode(true);
    d.open = false;
    $('.mark', d)?.remove();
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `<span>${p.w}주차 · ${esc(p.where)}</span>`;
    const b = document.createElement('button');
    b.textContent = '이제 알아요 ✓'; b.className = 'ghost';
    b.onclick = () => { setRes(p.id, 'ok'); renderWrong(); };
    meta.appendChild(b);
    wrongMain.append(meta, d);
  });
  $('#w-quiz').onclick = () => { location.hash = 'quiz'; quizStart(list); };
}

/* ---------- 탭 ---------- */
let current = 'notes';
function route() {
  const t = (location.hash.slice(1) || 'notes');
  current = $('#' + t + '.tab') ? t : 'notes';
  $$('.tab').forEach(s => s.classList.toggle('on', s.id === current));
  $$('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === current));
  if (current === 'wrong') renderWrong();
  if (current === 'cards') renderCard();
  fitHeader();
}
addEventListener('hashchange', () => { const keep = Q && location.hash === '#quiz'; route(); if (keep) renderQ(); });
applyWeek();
route();
