const $ = (id) => document.getElementById(id);
const els = {
  chips: $('chips'), draft: $('draft'), count: $('count'), reroll: $('reroll'),
  editedNote: $('editedNote'), go: $('go'), fallback: $('fallback'),
  goManual: $('goManual'), skip: $('skip'), toast: $('toast'),
};

const selected = new Set();
let edited = false;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 고른 키워드만으로 문장을 만든다. 고르지 않은 칭찬은 절대 넣지 않는다.
function compose() {
  const chosen = CONFIG.keywords.filter((k) => selected.has(k.id));
  if (chosen.length === 0) return '';
  const body = shuffle(chosen).map((k) => pick(k.phrases));
  const opener = pick(CONFIG.openers);
  return (opener ? [opener, ...body] : body).join(' ');
}

function regenerate() {
  els.draft.value = compose();
  edited = false;
  render();
}

function render() {
  const text = els.draft.value.trim();
  els.count.textContent = `${text.length}자`;
  els.go.disabled = text.length === 0;
  els.reroll.disabled = selected.size === 0;
  els.editedNote.hidden = !edited;
}

function toggleKeyword(id, btn) {
  if (selected.has(id)) selected.delete(id); else selected.add(id);
  btn.setAttribute('aria-pressed', String(selected.has(id)));
  if (edited) render(); else regenerate();
}

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  setTimeout(() => els.toast.classList.remove('show'), 1800);
}

// 키보드가 뜨지 않도록 화면 밖 readonly textarea로 복사
function legacyCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;font-size:16px;';
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  document.body.removeChild(ta);
  return ok;
}

// Clipboard API는 사용자 동작 안에서만 허용되므로 클릭 핸들러에서 바로 호출한다.
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(() => true, () => legacyCopy(text));
  }
  return Promise.resolve(legacyCopy(text));
}

function goToNaver() {
  window.location.href = CONFIG.reviewUrl;
}

els.go.addEventListener('click', () => {
  const text = els.draft.value.trim();
  if (!text) return;
  els.go.disabled = true;
  copyText(text).then((ok) => {
    if (ok) {
      showToast('복사됐어요! 네이버로 이동합니다');
      setTimeout(goToNaver, 600);
    } else {
      els.go.disabled = false;
      els.fallback.hidden = false;
      els.draft.classList.add('flash');
      els.draft.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
});

els.draft.addEventListener('input', () => {
  edited = true;
  els.draft.classList.remove('flash');
  render();
});
els.reroll.addEventListener('click', regenerate);

// 초기화
document.getElementById('storeName').textContent = CONFIG.storeName;
els.goManual.href = CONFIG.reviewUrl;
els.skip.href = CONFIG.reviewUrl;
for (const k of CONFIG.keywords) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chip';
  btn.textContent = k.label;
  btn.setAttribute('aria-pressed', 'false');
  btn.addEventListener('click', () => toggleKeyword(k.id, btn));
  els.chips.appendChild(btn);
}
render();
