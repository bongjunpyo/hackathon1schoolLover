// 화면 렌더링과 이벤트. file:// 에서 열리므로 모듈을 쓰지 않는다.
// 부분 갱신을 하지 않는다 — 모든 변경 뒤에 render() 전체를 다시 돌린다.
(function () {
  'use strict';

  var FIELDS = ['title', 'date', 'place', 'memberCount', 'memo',
                'category', 'durationMin', 'weightKg', 'kcalIn'];

  // 미입력 판정. store/analytics와 같은 형태를 쓴다
  function has(v) { return v != null && !Number.isNaN(v); }

  function $(id) { return document.getElementById(id); }
  function num(n, d) { return has(n) ? Number(n).toFixed(d || 0) : '—'; }

  function ready(name) {
    return typeof window[name] !== 'undefined' && window[name];
  }

  // ---------- 폼 ----------

  var form = $('addForm');

  function clearErrors() {
    document.querySelectorAll('.err').forEach(function (el) { el.textContent = ''; });
    document.querySelectorAll('.field').forEach(function (el) { el.classList.remove('is-bad'); });
  }

  function showErrors(errors) {
    Object.keys(errors || {}).forEach(function (key) {
      var el = document.querySelector('[data-err="' + key + '"]');
      if (!el) return;
      el.textContent = errors[key];
      el.closest('.field').classList.add('is-bad');
    });
  }

  function collect() {
    var out = {};
    FIELDS.forEach(function (name) {
      var el = form.elements[name];
      out[name] = el ? el.value.trim() : '';
    });
    return out;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearErrors();
    $('formMsg').textContent = '';

    if (!ready('Store')) {
      $('formMsg').textContent = '저장 모듈(store.js)이 아직 준비되지 않았습니다.';
      return;
    }

    var result = Store.add(collect());
    if (!result || result.ok !== true) {
      showErrors(result && result.errors);
      $('formMsg').textContent = '입력을 확인해주세요.';
      return;
    }

    form.reset();
    resetDate();   // reset()이 날짜 기본값까지 지운다. 다시 채운다
    $('formMsg').textContent = '저장했습니다.';
    render();
  });

  // ---------- 목록 ----------

  function renderList(list) {
    var box = $('list');
    $('listCount').textContent = list.length ? list.length + '건' : '';

    if (!list.length) {
      box.innerHTML = '<p class="empty">아직 기록이 없습니다. 오늘 체중부터 남겨보세요.</p>';
      return;
    }

    box.innerHTML = '';
    list.forEach(function (a) {
      var row = document.createElement('div');
      row.className = 'row';

      var nums = [];
      if (has(a.durationMin)) nums.push(a.durationMin + '분');
      if (has(a.weightKg)) nums.push(a.weightKg + 'kg');
      if (has(a.kcalIn)) nums.push(a.kcalIn + 'kcal');

      row.innerHTML =
        '<span class="row__date">' + String(a.date || '').slice(5) + '</span>' +
        '<span><span class="row__title"></span>' +
        '<br><span class="row__meta"></span></span>' +
        '<span class="row__nums">' + (nums.join(' · ') || '—') + '</span>';

      // 사용자 입력은 textContent로 넣는다
      row.querySelector('.row__title').textContent = a.title || '(제목 없음)';
      row.querySelector('.row__meta').textContent =
        [a.category, a.place, has(a.memberCount) ? a.memberCount + '명' : null, a.memo]
          .filter(Boolean).join(' · ');

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'row__del';
      del.textContent = '삭제';
      del.addEventListener('click', function () {
        if (!confirm('"' + (a.title || '이 기록') + '"을 삭제할까요?')) return;
        Store.remove(a.id);
        render();
      });

      row.appendChild(del);
      box.appendChild(row);
    });
  }

  // ---------- 오늘의 체중 + 눈금 ----------

  function renderToday(trend) {
    var box = $('today');
    if (!trend || !trend.length) { box.hidden = true; return; }
    box.hidden = false;

    var last = trend[trend.length - 1];
    var vals = trend.map(function (t) { return t.weightKg; });
    var min = Math.min.apply(null, vals);
    var max = Math.max.apply(null, vals);

    $('todayWeight').textContent = num(last.weightKg, 1);
    // 측정이 1건이면 최고와 최저가 같다. 0으로 나누지 않고 가운데 둔다
    var pct = (max === min) ? 50 : ((last.weightKg - min) / (max - min)) * 100;
    // 양 끝(0% / 100%)에서 바늘이 테두리에 묻힌다. 안쪽으로 조금 접어 넣는다
    $('rulerNeedle').style.left = (2 + pct * 0.96) + '%';

    $('weightMin').textContent = '최저 ' + num(min, 1);
    $('weightToday').textContent = last.date + '  ' + num(last.weightKg, 1);
  }

  // ---------- 통계 ----------

  function renderSummary(s) {
    var box = $('summary');
    box.innerHTML = '';
    [['활동 수', s.totalCount], ['참여 인원 합계', s.totalMembers],
     ['참여 인원 평균', num(s.avgMembers, 1)], ['운동 시간 합계', s.totalMin + '분'],
     ['운동 시간 평균', num(s.avgMin, 0) + '분']
    ].forEach(function (pair) {
      var d = document.createElement('div');
      d.innerHTML = '<dt></dt><dd></dd>';
      d.querySelector('dt').textContent = pair[0];
      d.querySelector('dd').textContent = pair[1];
      box.appendChild(d);
    });
  }

  function renderBars(id, rows, keyName, valName, suffix) {
    var box = $(id);
    box.innerHTML = '';
    if (!rows || !rows.length) return;
    var top = Math.max.apply(null, rows.map(function (r) { return r[valName]; })) || 1;

    rows.forEach(function (r) {
      var el = document.createElement('div');
      el.className = 'bar-row';   // 헤더의 .bar와 충돌하지 않게 따로 쓴다
      el.innerHTML =
        '<span class="bar__key"></span>' +
        '<span class="bar__track"><span class="bar__fill" style="width:' +
          ((r[valName] / top) * 100) + '%"></span></span>' +
        '<span class="bar__val"></span>';
      el.querySelector('.bar__key').textContent = r[keyName];
      el.querySelector('.bar__val').textContent = r[valName] + (suffix || '');
      box.appendChild(el);
    });
  }

  function renderKcal(rows) {
    var t = $('kcalTable');
    t.innerHTML =
      '<thead><tr><th>날짜</th><th>섭취</th><th>소모</th><th>수지</th></tr></thead><tbody></tbody>';
    var body = t.querySelector('tbody');

    (rows || []).forEach(function (r) {
      var tr = document.createElement('tr');
      // 없는 값은 0이 아니라 — 로 적는다
      tr.innerHTML =
        '<td>' + r.date + '</td>' +
        '<td>' + num(r.kcalIn) + '</td>' +
        '<td>' + num(r.kcalOut) + '</td>' +
        '<td>' + (has(r.net) ? (r.net > 0 ? '+' : '') + num(r.net) : '—') + '</td>';
      body.appendChild(tr);
    });
  }

  // 감량 효과 랭킹. 증감은 색이 아니라 삼각형 방향으로 나타낸다.
  function renderRank(id, rows, headLabel) {
    var t = $(id);
    t.innerHTML =
      '<thead><tr><th>' + headLabel + '</th><th>하루당 변화</th><th>표본</th></tr>' +
      '</thead><tbody></tbody>';
    var body = t.querySelector('tbody');

    if (!rows || !rows.length) {
      var blank = document.createElement('tr');
      blank.innerHTML = '<td colspan="3">표본 3회가 쌓이면 표시됩니다.</td>';
      body.appendChild(blank);
      return;
    }

    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td></td><td></td><td></td>';
      var cells = tr.querySelectorAll('td');
      cells[0].textContent = r.name;
      // 음수면 감량이다. 부호 대신 방향 삼각형으로 읽힌다
      cells[1].textContent = (r.avgChangePerDay < 0 ? '▼ ' : '▲ ') +
        num(Math.abs(r.avgChangePerDay), 2) + 'kg';
      cells[2].textContent = r.sampleCount + '회';
      body.appendChild(tr);
    });
  }

  // 체중이 늘어난 운동과 음식을 합쳐 증가폭이 큰 순으로 3개만 남긴다
  function avoidRows(list) {
    return Analytics.worstExercises(list, 3)
      .concat(Analytics.worstFoods(list, 3))
      .sort(function (a, b) { return b.avgChangePerDay - a.avgChangePerDay; })
      .slice(0, 3);
  }

  function renderStats(list) {
    var box = $('stats');
    if (!list.length || !ready('Analytics')) { box.hidden = true; return; }
    box.hidden = false;

    renderSummary(Analytics.summary(list));
    renderBars('monthly', Analytics.monthlyCount(list), 'month', 'count', '회');
    renderBars('byCategory', Analytics.byCategory(list), 'category', 'count', '회');
    renderRank('rankExercise', Analytics.topExercises(list, 3), '운동');
    renderRank('rankFood', Analytics.topFoods(list, 3), '음식');
    renderRank('rankAvoid', avoidRows(list), '항목');
    renderKcal(Analytics.kcalBalance(list));
  }

  // ---------- 렌더 파이프라인 ----------

  function render() {
    if (!ready('Store')) {
      $('list').innerHTML =
        '<p class="empty">저장 모듈(store.js)을 기다리는 중입니다.</p>';
      return;
    }
    var list = Store.getAll() || [];
    renderList(list);
    renderToday(ready('Analytics') ? Analytics.weightTrend(list) : null);
    renderStats(list);
  }

  // ---------- 데이터 도구 ----------

  function tool(msg) { $('toolMsg').textContent = msg; }

  $('btnSeed').addEventListener('click', function () {
    if (!ready('Store')) return tool('store.js가 아직 없습니다.');
    if (!confirm('최근 30일치 샘플 기록을 생성합니다. 계속할까요?')) return;
    var n = Store.seedSampleData();
    tool(n + '건을 생성했습니다.');
    render();
  });

  $('btnExport').addEventListener('click', function () {
    if (!ready('Store')) return tool('store.js가 아직 없습니다.');
    var blob = new Blob([Store.exportJson()], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'healthydiet-activities.json';
    a.click();
    URL.revokeObjectURL(a.href);
    tool('내보냈습니다.');
  });

  $('btnImport').addEventListener('click', function () { $('fileInput').click(); });

  $('fileInput').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file || !ready('Store')) return;
    var reader = new FileReader();
    reader.onload = function () {
      var r = Store.importJson(String(reader.result));
      tool(r && r.ok
        ? r.added + '건을 가져왔습니다.' + (r.skipped ? ' (' + r.skipped + '건 제외)' : '')
        : (r && r.message) || '가져오기에 실패했습니다.');
      render();
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // 오늘 날짜를 기본값으로. 미래 날짜는 선택 자체를 막는다
  function resetDate() {
    var d = new Date();
    var iso = d.getFullYear() + '-' +
              String(d.getMonth() + 1).padStart(2, '0') + '-' +
              String(d.getDate()).padStart(2, '0');
    form.elements.date.value = iso;
    form.elements.date.max = iso;

    var head = $('todayDate');
    if (head) head.textContent = iso.replace(/-/g, '. ');
  }

  resetDate();
  render();
})();
