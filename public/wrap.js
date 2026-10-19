// 광화문선치과 줄바꿈 규칙 런타임 (선치과 components/ui.tsx pauseGlue → 문서용 JS, 루페_상품화_설계.html 판)
// 규칙: 마침표에서 우선 줄을 바꾸고(.sent), 절 쉼표에서 나누고(.clause), 나열 쉼표에서는 끊지 않는다.
// 긴 마디만 말 쉬는 자리 하나를 열고 나머지 공백은 NBSP 로 묶는다. 넓은 화면은 문장 하나 = 한 줄.
// 사용: 글 요소에 class="w". 화면을 새로 그린 뒤 window.__wrap(root) 를 부른다.
(function () {
  var NB = String.fromCharCode(0xa0), WJ = String.fromCharCode(0x2060);
  var M0 = String.fromCharCode(0xe000), M1 = String.fromCharCode(0xe001), MRE = /[]/g;
  function clean(s) { return s.replace(MRE, ''); }
  var STRONG_PAUSE_END = /(고|며|면|서|라서|해서|하면|해도|지만|는데|은데|더라도|으며|이며|하고|이고|라면|다가|자마자|니까|므로)$/;
  var PAUSE_END = /(은|는|이|가|을|를|에|에서|으로|로|과|와|도|고|며|면|서|까지|부터|처럼|보다|에게|한테|마다|조차|이나|나|든|라서|해서|하면|해도|지만|는데|은데|더라도|으며|이며|하고|이고|라면|이라|다가|자마자|니까|므로)$/;
  var NO_BREAK_BEFORE = /^(인해|인한|통해|통한|위해|위한|위해서|의해|의한|대해|대한|대해서|따라|따른|따라서|비해|비하면|걸쳐|관해|관한|더불어|이상|이하|이내|정도|만큼|때문|때문에|덕분|덕분에|이후|이전|동안|사이|뒤|후|전|중|안|밖|없이|없는|없어|없고|없다|없으며|없기|있는|있어|있을|있고|있다|있으며|있어서|있으면|있기|있습니다|없습니다|않고|않는|않은|않아|않으면|않습니다|못한|못하는|것|수|줄|지|때|데|적|뿐|아니라|아니고|아닌|아닙니다|주는|주고|주며|주면|줍니다|주세요|주시면|주시기|드립니다|드리고|드리며|드려|드리는|드릴|봅니다|보세요|보시면|보시길|두고|둡니다|등|및|또는|혹은|그리고|그래서|하지만|다른|같은|위|아래|옆)$/;
  var NO_BREAK_AFTER = /^(같은|다른|이런|그런|저런|어떤|모든|여러|각|매|새|첫|두|세|네|한|그|이|저|및|또는|혹은|가장|더|덜|안|못|바로|아주|매우|너무|약|총|전|후|약간|다소|주로|대개|대부분|거의|보다|훨씬|꼭|늘|자주|다시|먼저|미리|함께)$/;
  var NO_BREAK_AFTER_END = /(하는|되는|가는|오는|지는|나는|보는|주는|받는|이는|리는|르는|치는|우는|내는|키는|시는|하던|되던|작은|많은|적은|높은|낮은|좋은|나쁜|넓은|좁은|깊은|짧은|젊은|밝은|굵은|얇은|굳은|굽은|틀어진|벗어난|눌린|밀린|남은|둥근|[가-힣]된|[가-힣]한|적인|스러운|[가-힣]할|[가-힣]될|[가-힣]인|있는|없는|않는|않은)$/;
  var COORD_MODIFIER = /(한|된|스러운|적인|긴|운|는|은|진|린|든)$/;
  var NO_BREAK_BEFORE_END = /(게|듯|채)$/;
  var OBJECT_MARK = /(을|를)$/;
  var VERB_LIKE = /(는|은|던|을|고|며|면|서|해|여|아|어|다|지|게|기|려|러|니다|습니다)$/;
  var ENUM_MAX = 8, ENUM_PHRASE_MAX = 16;
  var CLAUSE_COMMA_END = /(고|며|면|서|해|여|지만|는데|은데|더라도|으며|이며|니|듯|도|게|거나|든지|면서|려고|다가|도록|므로|니까)$/;
  var LEAD_ADVERB = /^(또한|특히|다만|그리고|그래서|하지만|그러나|즉|이때|반면|따라서|한편|물론|대신|예를 들어|그러므로|이처럼)$/;
  var PREDICATE_END = /(는|은|던|인|된|진|온|린|난|적인|하고|하며|하여|해|고|며|서|면|다|니다|요)$/;
  var NOT_PARTICLE = /(학과|보철과|보존과|교정과|내과|외과|치과|안과|피부과)$/;
  var TIER_PENALTY = [0, 2, 4, 8, 14];
  var SEPARATOR = /^[·ㆍ|/–—=+]$/;

  function strip(w) { return w.replace(/[,.!?…)”’"']+$/, ''); }
  function parenDelta(s) { return (s.match(/[(（[]/g) || []).length - (s.match(/[)）\]]/g) || []).length; }
  function hasPredicate(t) { return t.split(/\s+/).some(function (w) { var x = strip(w); return x.length >= 2 && PREDICATE_END.test(x); }); }

  function listCommaKind(before, after, single) {
    var b = before.replace(/[,，]\s*$/, '').trim();
    var last = strip(b.split(/\s+/).pop() || '');
    if (LEAD_ADVERB.test(b)) return 'hard';
    if (CLAUSE_COMMA_END.test(last)) return null;
    if (/[·ㆍ]/.test(b)) return null;
    var a = after.replace(/[,，]\s*$/, '').trim();
    if (single && hasPredicate(a)) return null;
    if (a.length <= ENUM_MAX || b.length <= ENUM_MAX) return 'hard';
    if (b.length <= ENUM_PHRASE_MAX && !hasPredicate(b)) return 'long';
    return null;
  }
  function splitClauses(s) {
    var out = [], depth = 0, cur = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i]; cur += ch; depth += parenDelta(ch);
      if (ch === ',' && depth <= 0 && /^\s+\S/.test(s.slice(i + 1))) { out.push(cur.trim()); cur = ''; }
    }
    if (cur.trim()) out.push(cur.trim());
    var merged = [];
    for (var k = 0; k < out.length; k++) {
      var prev = out[k - 1] ? clean(out[k - 1]) : null;
      if (merged.length && prev && /,$/.test(prev) && listCommaKind(prev, clean(out[k]), out.length === 2) !== null) merged[merged.length - 1] += ' ' + out[k];
      else merged.push(out[k]);
    }
    return merged;
  }
  function canBreakBetween(w, next, prev) {
    var bare = strip(w), nx = strip(next);
    if (prev && OBJECT_MARK.test(strip(prev)) && /[는은]$/.test(bare) && !/[,，]$/.test(w)) return false;
    if (NO_BREAK_AFTER.test(bare) || NO_BREAK_AFTER_END.test(bare) || /의$/.test(bare)) return false;
    if (NO_BREAK_BEFORE.test(nx) || NO_BREAK_BEFORE_END.test(nx) || /^(것|싶)/.test(nx)) return false;
    if (/^(함께|같이)$/.test(nx) && /[와과]$/.test(bare)) return false;
    // 주어 뒤 꾸밈말은 붙여 읽는다 ('법이 정한 경우', '상대가 보낸 링크')
    if (/[이가]$/.test(bare) && bare.length >= 2 && /(한|된|는|던|운|진|린|인|할|될|적인|낸|온|간|준|본|쓴)$/.test(nx)) return false;
    if (/(고|거나)$/.test(bare) && COORD_MODIFIER.test(nx)) return false;
    if (OBJECT_MARK.test(bare) && VERB_LIKE.test(nx)) return false;
    var lastCh = nx.charCodeAt(nx.length - 1) - 0xac00;
    if (OBJECT_MARK.test(bare) && nx.length >= 2 && lastCh >= 0 && lastCh < 11172 && (lastCh % 28 === 4 || lastCh % 28 === 8)) return false;
    return true;
  }
  function listCommaKinds(words) {
    var at = {}, segStart = 0, depth = 0, d0 = 0;
    var single = words.filter(function (w) { d0 += parenDelta(w); return d0 <= 0 && /[,，]$/.test(w); }).length === 1;
    for (var i = 0; i < words.length; i++) {
      depth += parenDelta(words[i]);
      if (!/[,，]$/.test(words[i])) continue;
      if (depth > 0) { at[i] = 'hard'; continue; }
      var j = i + 1;
      while (j < words.length - 1 && !/[,，]$/.test(words[j])) j++;
      var kind = listCommaKind(words.slice(segStart, i + 1).join(' '), words.slice(i + 1, j + 1).join(' '), single);
      if (kind) at[i] = kind;
      segStart = i + 1;
    }
    return at;
  }
  function emWidth(t) {
    var w = 0;
    for (var i = 0; i < t.length; i++) { var ch = t[i]; w += /[ㄱ-ㆎ가-힣一-鿿]/.test(ch) ? 1 : /[A-Za-z0-9]/.test(ch) ? 0.55 : /\s/.test(ch) ? 0.28 : 0.3; }
    return w;
  }
  // 가운뎃점·빗금, 숫자 사이 하이픈(124-81-00999, 010-1234-5678)에서는 꺾지 않는다
  function joinDots(w) { return w.replace(/([^\s])([·ㆍ/])(?=[^\s])/g, '$1' + WJ + '$2' + WJ).replace(/(\d)-(?=\d)/g, '$1' + WJ + '-' + WJ); }
  function pauseGlue(clause, maxEm) {
    var raw = clause.split(/[ \t\r\n]+/).filter(Boolean);
    if (raw.length < 2) return joinDots(clause.trim());
    var words = raw.map(clean);
    var n = words.length - 1, lists = listCommaKinds(words), tier = new Array(n), depth = 0, i;
    for (i = 0; i < n; i++) {
      depth += parenDelta(words[i]);
      var bare = strip(words[i]), kind = lists[i];
      if (depth > 0 || kind === 'hard' || !canBreakBetween(words[i], words[i + 1], words[i - 1])) tier[i] = 4;
      else if (/[,，]$/.test(words[i])) tier[i] = kind === 'long' ? 2 : 0;
      else if (STRONG_PAUSE_END.test(bare)) tier[i] = 1;
      else if (/[와과]$/.test(bare) && !NOT_PARTICLE.test(bare)) tier[i] = 3;
      else if (PAUSE_END.test(bare) && !NOT_PARTICLE.test(bare)) tier[i] = 2;
      else tier[i] = 3;
    }
    var glued = [];
    for (i = 0; i < n; i++) {
      glued[i] = false;
      if (SEPARATOR.test(words[i + 1])) { glued[i] = true; tier[i] = 4; }
      if (SEPARATOR.test(words[i]) && tier[i] > 2) tier[i] = 2;
    }
    for (i = 0; i < words.length; i++) {
      var op = words[i].charAt(0);
      if (op !== '“' && op !== '‘') continue;
      var cl = op === '“' ? '”' : '’', j = i;
      while (j < words.length && (j === i ? words[j].slice(1) : words[j]).indexOf(cl) < 0) j++;
      if (j >= words.length || j === i || (i === 0 && j === words.length - 1)) continue;
      if (emWidth(words.slice(i, j + 1).join(' ')) > maxEm * 0.85) continue;
      for (var g = i; g < j; g++) { glued[g] = true; tier[g] = 4; }
      i = j;
    }
    var open = tier.map(function (t, k) { return t === 0 && !glued[k]; });
    function width(a, b) { return emWidth(words.slice(a, b + 1).join(' ')); }
    function openIn(a, b) {
      var total = width(a, b);
      if (b <= a || total <= maxEm) return;
      var best = a, bestScore = Infinity;
      for (var k = a; k < b; k++) {
        if (glued[k]) continue;
        var score = Math.abs(width(a, k) - total / 2) + TIER_PENALTY[tier[k]] + (k === a || k === b - 1 ? 10 : 0);
        if (score < bestScore) { bestScore = score; best = k; }
      }
      open[best] = true;
      openIn(a, best);
      openIn(best + 1, b);
    }
    var start = 0;
    for (i = 0; i <= n; i++) { if (i === n || open[i]) { openIn(start, i); start = i + 1; } }
    return raw.map(function (w, k) { return (k === 0 ? '' : (open[k - 1] ? ' ' : NB)) + joinDots(w); }).join('');
  }
  function splitSentences(text) {
    var out = [], re = /([.!?])(["'”’)\]]*)\s+(?=[^\s(])/g, last = 0, m;
    while ((m = re.exec(text))) {
      var before = text.slice(last, m.index);
      if (m[1] === '.' && (/(^|\s)\d{1,2}$/.test(before) || /[.…]$/.test(before))) continue;
      out.push(text.slice(last, m.index + m[1].length + m[2].length).trim());
      last = re.lastIndex;
    }
    out.push(text.slice(last).trim());
    return out.filter(Boolean);
  }
  function serial(el) {
    var s = '';
    el.childNodes.forEach(function (nd) {
      if (nd.nodeType === 3) s += nd.data;
      else if (nd.nodeType === 1) s += nd.tagName === 'STRONG' || nd.tagName === 'B' ? M0 + nd.textContent + M1 : nd.textContent;
    });
    return s;
  }
  function glueQuotes(t) {
    return t.replace(/([가-힣])([]?)([”’])/g, '$1$2' + WJ + '$3')
            .replace(/([”’])([]?)([가-힣])/g, '$1$2' + WJ + '$3')
            .replace(/([“‘])([]?)([가-힣])/g, '$1$2' + WJ + '$3');
  }
  function fill(parent, text, st) {
    text = glueQuotes(text);
    text.split(/([])/).forEach(function (part) {
      if (part === M0) { st.on = true; return; }
      if (part === M1) { st.on = false; return; }
      if (!part) return;
      if (st.on) { var b = document.createElement('strong'); b.textContent = part; parent.appendChild(b); }
      else parent.appendChild(document.createTextNode(part));
    });
  }
  function render(el) {
    if (!el.dataset.src) el.dataset.src = serial(el).replace(/[ \t\r\n]+/g, ' ').trim();
    var src = el.dataset.src;
    var fs = parseFloat(getComputedStyle(el).fontSize) || 16;
    var avail = el.clientWidth / fs;
    if (!avail) return;
    var maxEm = Math.max(6, Math.min(15.5, avail * 0.92));
    var sents = splitSentences(src), st = { on: false };
    el.textContent = '';
    var multi = sents.length > 1;
    sents.forEach(function (s) {
      var sp = document.createElement('span');
      sp.className = multi ? 'sent' : 'sent-one';
      var cl = splitClauses(s);
      cl.forEach(function (c, j) {
        var c1 = document.createElement('span');
        c1.className = 'clause';
        fill(c1, pauseGlue(c, maxEm), st);
        sp.appendChild(c1);
        if (j < cl.length - 1) sp.appendChild(document.createTextNode(' '));
      });
      el.appendChild(sp);
    });
  }
  function renderAll() { document.querySelectorAll('.w').forEach(render); }
  window.__wrap = function (root) { (root || document).querySelectorAll('.w').forEach(render); };
  var lastW = window.innerWidth, t = null;
  window.addEventListener('resize', function () {
    if (Math.abs(window.innerWidth - lastW) < 2) return;
    lastW = window.innerWidth;
    clearTimeout(t);
    t = setTimeout(renderAll, 120);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderAll);
  else renderAll();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(renderAll);
})();
