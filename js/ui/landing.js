// 메인 페이지 스크롤 연출.
// 바깥 통을 지나는 진행도(0~1)가 모델 회전 각도와 단계 전환을 함께 만든다.

// AOS 초기화. aos.css가 [data-aos]를 opacity:0으로 깔아두기 때문에,
// CSS만 로드되고 JS가 실패하면 화면이 통째로 안 보인다.
// 그 경우 속성을 걷어내 원래대로 보이게 만든다.
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

(function () {
  'use strict';

  var sec = document.getElementById('how');
  var spin = document.getElementById('modelSpin');
  var progress = document.getElementById('scrollProgress');
  var steps = [].slice.call(document.querySelectorAll('.step'));

  if (!sec || !spin || !steps.length) return;

  // 움직임을 줄이도록 설정한 사용자에게는 회전을 걸지 않는다.
  // CSS가 이미 세 단계를 전부 펼쳐 두므로 여기서는 아무것도 하지 않는다.
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduce.matches) return;

  var TURNS = 360;      // 구간 전체를 지나면 한 바퀴
  var ticking = false;
  var lastIndex = -1;

  function update() {
    ticking = false;

    var rect = sec.getBoundingClientRect();
    var travel = sec.offsetHeight - window.innerHeight;
    if (travel <= 0) return;                       // 좁은 화면에서는 sticky를 풀어둔다

    var p = -rect.top / travel;
    p = p < 0 ? 0 : (p > 1 ? 1 : p);               // 구간 밖에서는 양 끝에 고정

    spin.style.transform = 'rotateY(' + (p * TURNS) + 'deg)';
    if (progress) progress.style.height = (p * 100) + '%';

    // 진행도를 단계 수로 나눈다. p가 정확히 1일 때 인덱스가 넘치지 않게 막는다
    var idx = Math.floor(p * steps.length);
    if (idx > steps.length - 1) idx = steps.length - 1;

    if (idx !== lastIndex) {
      steps.forEach(function (el, i) { el.classList.toggle('is-on', i === idx); });
      lastIndex = idx;
    }
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
