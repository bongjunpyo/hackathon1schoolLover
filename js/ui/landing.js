// 메인 페이지.
// 스크롤 구간을 지나는 진행도가 단계가 되고, 단계마다 모델이 정해진 각도로
// 툭 돌면서 기록해 둔 내용이 하나씩 나타난다.

// --- AOS 초기화 ---
// aos.css가 [data-aos]를 opacity:0으로 깔아두기 때문에, CSS만 로드되고
// JS가 실패하면 화면이 통째로 안 보인다. 그 경우 속성을 걷어낸다.
(function () {
  'use strict';

  function fallback() {
    document.querySelectorAll('[data-aos]').forEach(function (el) {
      el.removeAttribute('data-aos');
    });
  }

  if (typeof AOS === 'undefined') { fallback(); return; }
  try {
    AOS.init({ duration: 800, once: true, offset: 80, easing: 'ease-out-cubic' });
  } catch (e) {
    fallback();
  }
})();

// --- 중앙 모델 + 단계별 내용 ---
(function () {
  'use strict';

  // 정면에서 시작해 단계마다 90도씩 돈다. 단계 수(내용 3장 + 시작)와 개수를 맞춘다.
  var ANGLES = [0, 90, 180, 270];

  var stage = document.getElementById('stage');
  var spin = document.getElementById('figureSpin');
  var hint = document.getElementById('stageHint');
  var facts = [].slice.call(document.querySelectorAll('.fact'));
  if (!stage || !spin || !facts.length) return;

  function $(id) { return document.getElementById(id); }
  function has(v) { return v != null && !Number.isNaN(v); }
  function ready(name) { return typeof window[name] !== 'undefined' && window[name]; }

  // 값을 넣으면서 "기록 없음" 표시를 벗긴다
  function put(id, text) {
    var el = $(id);
    if (!el) return;
    el.textContent = text;
    el.classList.remove('ph');
  }

  // ---------- 기록해 둔 값을 카드에 채운다 ----------

  function fill() {
    if (!ready('Store') || !ready('Analytics')) return;

    var list = Store.getAll() || [];
    if (!list.length) return;          // 안내 문구를 그대로 둔다

    // 체중
    var trend = Analytics.weightTrend(list) || [];
    if (trend.length) {
      var last = trend[trend.length - 1];
      var vals = trend.map(function (t) { return t.weightKg; });
      var min = Math.min.apply(null, vals);
      var max = Math.max.apply(null, vals);

      put('mWeight', last.weightKg.toFixed(1));
      // 측정이 1건이면 최고와 최저가 같다. 0으로 나누지 않고 가운데 둔다
      var pct = (max === min) ? 50 : ((last.weightKg - min) / (max - min)) * 100;
      $('mNeedle').style.left = (2 + pct * 0.96) + '%';   // 양 끝에서 테두리에 묻히지 않게
      $('mWeightFoot').textContent =
        '최저 ' + min.toFixed(1) + ' · 최고 ' + max.toFixed(1) + ' · ' + last.date;
    }

    // 활동
    var s = Analytics.summary(list);
    var months = Analytics.monthlyCount(list) || [];
    put('mCount', s.totalCount);
    var thisMonth = months.length ? months[months.length - 1] : null;
    $('mCountFoot').textContent = thisMonth
      ? thisMonth.month + ' ' + thisMonth.count + '회 · 평균 ' + Math.round(s.avgMin) + '분'
      : '평균 ' + Math.round(s.avgMin) + '분';

    // 칼로리 수지 — 값이 있는 마지막 날
    var bal = (Analytics.kcalBalance(list) || []).filter(function (r) { return has(r.net); });
    if (bal.length) {
      var b = bal[bal.length - 1];
      put('mKcal', (b.net > 0 ? '+' : '') + Math.round(b.net).toLocaleString());
      $('mKcalFoot').textContent =
        b.date + ' · 섭취 ' + Math.round(b.kcalIn).toLocaleString() +
        ' · 소모 ' + Math.round(b.kcalOut).toLocaleString();
    }
  }

  // ---------- 스크롤 ----------

  function showAll() {
    spin.style.transform = 'rotateY(0deg)';
    facts.forEach(function (el) { el.classList.add('is-in'); });
    if (hint) hint.hidden = true;
  }

  fill();

  // 움직임을 줄이도록 설정했으면 정면 그대로 두고 세 장을 다 보여준다
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    showAll();
    return;
  }

  var ticking = false;
  var lastStep = -1;

  function update() {
    ticking = false;

    var travel = stage.offsetHeight - window.innerHeight;
    if (travel <= 0) { showAll(); return; }   // 좁은 화면에서는 sticky를 풀어둔다

    var p = -stage.getBoundingClientRect().top / travel;
    p = p < 0 ? 0 : (p > 1 ? 1 : p);

    // 진행도를 단계로 끊는다. 0단계에서는 정면을 본다.
    var step = Math.floor(p * (facts.length + 1));
    if (step > facts.length) step = facts.length;
    if (step === lastStep) return;
    lastStep = step;

    spin.style.transform = 'rotateY(' + (ANGLES[Math.min(step, ANGLES.length - 1)]) + 'deg)';
    facts.forEach(function (el, i) { el.classList.toggle('is-in', i < step); });
    if (hint) hint.hidden = step > 0;
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
})();
