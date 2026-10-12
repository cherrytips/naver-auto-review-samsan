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

// [[값, 비율], ...]에서 비율대로 하나를 고른다
function weightedPick(pairs) {
  const total = pairs.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [value, w] of pairs) {
    r -= w;
    if (r < 0) return value;
  }
  return pairs[pairs.length - 1][0];
}

// 문장 끝을 . ! ~ 로 섞고 표정 이모지를 0~2개 붙여 사람이 쓴 것처럼 만든다
function decorate(sentences) {
  const { endings, emojis, emojiCount } = CONFIG.style;
  const singles = endings.filter(([e]) => e.length === 1);
  let doubled = false; // '!!', '~~' 같은 겹친 부호는 한 번만
  const ends = sentences.map(() => {
    const e = weightedPick(doubled ? singles : endings);
    if (e.length > 1) doubled = true;
    return e;
  });
  if (ends.length > 1 && ends.every((e) => e === '.')) ends[ends.length - 1] = pick(['!', '~']);

  const n = Math.min(weightedPick(emojiCount), sentences.length, emojis.length, 2);
  const faces = shuffle(emojis).slice(0, n);
  // 마지막 문장 우선, 2개면 앞 문장 중 하나에도
  const spots = n > 0 ? [sentences.length - 1] : [];
  if (n === 2) spots.push(Math.floor(Math.random() * (sentences.length - 1)));

  return sentences.map((s, i) => {
    const k = spots.indexOf(i);
    if (k < 0) return s + ends[i];
    // 마침표 자리는 이모지가 대신한다 ("맛있었어요 😊" / "맛있었어요! 😋")
    return `${s}${ends[i] === '.' ? '' : ends[i]} ${faces[k]}`;
  }).join(' ');
}

// 고른 키워드만으로 문장을 만든다. 고르지 않은 칭찬은 절대 넣지 않는다.
function compose() {
  const chosen = CONFIG.keywords.filter((k) => selected.has(k.id));
  if (chosen.length === 0) return '';
  const body = shuffle(chosen).map((k) => pick(k.phrases));
  const opener = pick(CONFIG.openers);
  const sentences = (opener ? [opener, ...body] : body).map((s) => s.replace(/[.!~\s]+$/, ''));
  return decorate(sentences);
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

const ua = navigator.userAgent;
const isAndroid = /Android/i.test(ua);
const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const inNaverApp = /NAVER\(inapp/i.test(ua); // 네이버 앱 QR 스캐너로 들어온 경우

let fallbackTimer = null;
function cancelFallback() {
  clearTimeout(fallbackTimer);
  fallbackTimer = null;
}

// 네이버 앱이 있으면 앱 안에서, 없으면 지금 브라우저에서 연다.
// 앱이 열리면 화면이 가려지므로, 1.5초 뒤에도 그대로면 앱이 없다고 보고 브라우저로 이동한다.
function openReview(url) {
  if (!CONFIG.openInNaverApp || inNaverApp || !(isAndroid || isIOS)) {
    window.location.href = url;
    return;
  }
  const query = `inappbrowser?url=${encodeURIComponent(url)}&target=new&version=6`;
  const appUrl = isAndroid
    ? `intent://${query}#Intent;scheme=naversearchapp;package=com.nhn.android.search;S.browser_fallback_url=${encodeURIComponent(url)};end`
    : `naversearchapp://${query}`;
  cancelFallback();
  fallbackTimer = setTimeout(() => {
    fallbackTimer = null;
    if (!document.hidden) window.location.href = url;
  }, 1500);
  window.location.href = appUrl;
}

function goToNaver() {
  openReview(CONFIG.reviewUrl);
}

// 네이버 앱에서 돌아오면 버튼을 다시 누를 수 있게 한다
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelFallback(); else render();
});
window.addEventListener('pagehide', cancelFallback);
window.addEventListener('pageshow', render);

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
for (const link of [els.goManual, els.skip]) {
  link.href = CONFIG.reviewUrl;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    goToNaver();
  });
}
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
