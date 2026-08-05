// 활동 기록 저장소. localStorage를 만지는 유일한 파일이다.
// 화면을 모르므로 alert 대신 errors 객체를 돌려준다.

const Store = (function () {
  const KEY = 'activities';
  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

  const CATEGORIES = ['유산소', '근력', '스트레칭'];
  const EXERCISES = ['러닝', '헬스', '수영', '자전거', '등산'];
  // 랭킹의 집계 키라 선택형으로만 받는다. 자유 텍스트면 "닭가슴살"과 "닭 가슴살"이 갈린다.
  // 감량·증량 양쪽이 다 있어야 Analytics.worstFoods가 빈 배열이 되지 않는다.
  const FOODS = [
    '닭가슴살', '샐러드', '현미밥', '고구마', '계란', '두부', '단백질쉐이크',
    '치킨', '피자', '라면', '삼겹살', '탄산음료',
  ];

  // null·undefined·NaN을 한 번에 거른다. analytics.js와 같은 판정을 쓴다.
  function has(value) {
    return value != null && !Number.isNaN(value);
  }

  // 빈 문자열은 0이 아니라 미입력이다. Number('')가 0이라 그냥 넘기면 체중 0kg가 저장된다.
  function toNumber(value) {
    if (value === '' || value == null) return null;
    return Number(value);
  }

  // 로컬 날짜로 만든다. toISOString()은 UTC라 한국 시간 오전 9시 이전에 하루 전이 나온다.
  function todayString() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function readRaw() {
    const text = localStorage.getItem(KEY);
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      // 저장소가 깨졌어도 던지지 않는다. 여기서 예외가 나가면 화면이 통째로 죽는다.
      return [];
    }
  }

  function write(list) {
    localStorage.setItem(KEY, JSON.stringify(list));
  }

  // 활동 날짜 내림차순. 같은 날이면 나중에 입력한 것이 위로 온다.
  // createdAt만으로 정렬하면 seedSampleData가 한 번에 만든 30일치가 생성 순서대로 나온다.
  function byNewest(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  }

  function validate(input) {
    const errors = {};

    const title = String(input.title == null ? '' : input.title).trim();
    if (title === '') errors.title = '활동명을 입력해 주세요';

    const date = String(input.date == null ? '' : input.date).trim();
    if (!DATE_PATTERN.test(date)) {
      errors.date = '날짜를 선택해 주세요';
    } else if (date > todayString()) {
      // 문자열끼리 비교한다. Date 객체는 시:분 때문에 오늘이 미래로 잡힌다.
      errors.date = '미래 날짜는 기록할 수 없습니다';
    }

    const memberCount = toNumber(input.memberCount);
    if (!has(memberCount) || !Number.isInteger(memberCount) || memberCount < 1) {
      // Number.isInteger를 쓴다. parseInt('2.5')는 2가 되어 통과한 것처럼 보인다.
      errors.memberCount = '참여 인원은 1명 이상의 정수여야 합니다';
    }

    if (CATEGORIES.indexOf(input.category) === -1) {
      errors.category = '종목을 선택해 주세요';
    }

    const durationMin = toNumber(input.durationMin);
    if (!has(durationMin) || !Number.isInteger(durationMin) || durationMin < 1) {
      errors.durationMin = '운동 시간은 1분 이상의 정수여야 합니다';
    }

    const weightKg = toNumber(input.weightKg);
    if (has(weightKg) && weightKg <= 0) {
      errors.weightKg = '체중은 0보다 커야 합니다';
    }

    const kcalIn = toNumber(input.kcalIn);
    if (has(kcalIn) && kcalIn <= 0) {
      errors.kcalIn = '섭취 칼로리는 0보다 커야 합니다';
    }

    if (has(input.exercise) && input.exercise !== '' && EXERCISES.indexOf(input.exercise) === -1) {
      errors.exercise = '운동은 목록에서 선택해 주세요';
    }

    if (input.foods != null && !Array.isArray(input.foods)) {
      errors.foods = '음식은 목록에서 선택해 주세요';
    }

    return errors;
  }

  // 미입력은 null로 통일한다. undefined는 JSON.stringify에서 키가 사라져
  // 내보내기 → 가져오기 왕복에 필드 유무가 달라진다.
  function optionalNumber(value) {
    const n = toNumber(value);
    return has(n) ? n : null;
  }

  // 허용 목록 밖의 값은 걸러낸다. 집계 키라서 오타 하나가 순위를 갈라놓는다.
  function normalizeFoods(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(function (name) {
      return FOODS.indexOf(name) !== -1;
    });
  }

  function buildActivity(input) {
    return {
      id: newId(),
      title: String(input.title).trim(),
      date: String(input.date).trim(),
      place: String(input.place == null ? '' : input.place).trim(),
      memberCount: toNumber(input.memberCount),
      memo: String(input.memo == null ? '' : input.memo).trim(),
      createdAt: new Date().toISOString(),

      category: input.category,
      durationMin: toNumber(input.durationMin),
      weightKg: optionalNumber(input.weightKg),
      kcalIn: optionalNumber(input.kcalIn),
      exercise: EXERCISES.indexOf(input.exercise) === -1 ? null : input.exercise,
      foods: normalizeFoods(input.foods),
    };
  }

  function getAll() {
    return readRaw().sort(byNewest);
  }

  function add(input) {
    const errors = validate(input);
    if (Object.keys(errors).length > 0) return { ok: false, errors };

    const activity = buildActivity(input);
    const list = readRaw();
    list.push(activity);
    write(list);
    return { ok: true, activity };
  }

  // 샘플 데이터. 랭킹이 되짚어낼 수 있도록 조합마다 감량 효과를 실제로 심어둔다.
  const SAMPLE_PLANS = [
    { exercise: '러닝', category: '유산소', durationMin: 45, place: '한강공원', foods: ['닭가슴살', '샐러드'] },
    { exercise: '헬스', category: '근력', durationMin: 60, place: '교내 헬스장', foods: ['계란', '현미밥'] },
    { exercise: '수영', category: '유산소', durationMin: 40, place: '시민수영장', foods: ['두부', '샐러드'] },
    { exercise: '자전거', category: '유산소', durationMin: 50, place: '중랑천', foods: ['고구마'] },
    { exercise: '등산', category: '유산소', durationMin: 90, place: '관악산', foods: ['단백질쉐이크'] },
    { exercise: '헬스', category: '스트레칭', durationMin: 25, place: '동아리방', foods: ['치킨', '탄산음료'] },
    { exercise: '러닝', category: '유산소', durationMin: 30, place: '학교 운동장', foods: ['라면'] },
    { exercise: '헬스', category: '근력', durationMin: 55, place: '교내 헬스장', foods: ['피자', '삼겹살'] },
  ];
  const LOSING_FOODS = ['닭가슴살', '샐러드', '현미밥', '고구마', '계란', '두부', '단백질쉐이크'];

  // 그날의 체중 변화량. 오래 운동할수록, 감량 음식을 먹을수록 많이 빠진다.
  function sampleWeightDelta(plan) {
    let delta = -0.05 - plan.durationMin / 600;
    plan.foods.forEach(function (name) {
      delta += LOSING_FOODS.indexOf(name) === -1 ? 0.18 : -0.07;
    });
    return delta;
  }

  function seedSampleData() {
    const list = readRaw();
    const now = new Date();
    let weight = 72.0;
    let planIndex = 0;
    let created = 0;

    for (let ago = 29; ago >= 0; ago--) {
      // 쉬는 날을 두되 연속으로 비우지 않는다. 랭킹은 기록 사이의 체중 변화로
      // 효과를 귀속시키므로, 간격이 3일을 넘으면 그 구간이 통째로 분석에서 빠진다.
      if (ago % 7 === 3) continue;

      const plan = SAMPLE_PLANS[planIndex % SAMPLE_PLANS.length];
      planIndex += 1;

      // 이 기록의 체중은 오늘 선택을 반영하기 전 값이다.
      // analytics는 기록 이후의 체중 변화를 그 기록에 귀속시킨다 —
      // 오늘 먹은 것이 다음 측정에 나타나야 랭킹이 심어둔 효과를 되짚어낸다.
      const weightToday = weight;
      weight += sampleWeightDelta(plan);

      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ago, 20, 0, 0);
      const month = String(at.getMonth() + 1).padStart(2, '0');
      const day = String(at.getDate()).padStart(2, '0');

      list.push({
        id: newId(),
        title: `${plan.exercise} ${plan.durationMin}분`,
        date: `${at.getFullYear()}-${month}-${day}`,
        place: plan.place,
        memberCount: 2 + (planIndex % 5),
        memo: '[샘플] 자동 생성된 기록',
        // createdAt을 해당 날짜에 맞춘다. 전부 지금 시각이면 목록이 생성 순서대로 나온다.
        createdAt: (at > now ? now : at).toISOString(),

        category: plan.category,
        durationMin: plan.durationMin,
        weightKg: Math.round(weightToday * 10) / 10,
        // 일부는 비워둔다. analytics의 "없는 값 건너뛰기"가 여기서 실제로 검증된다.
        kcalIn: planIndex % 4 === 0 ? null : 1600 + (planIndex % 6) * 120,
        exercise: plan.exercise,
        foods: plan.foods.slice(),
      });
      created += 1;
    }

    write(list);
    return created;
  }

  // 삭제 확인창은 UI가 띄운다. 이 파일은 화면을 모른다.
  function remove(id) {
    const list = readRaw();
    const next = list.filter(function (activity) {
      return activity.id !== id;
    });
    if (next.length === list.length) return false;
    write(next);
    return true;
  }

  function clearAll() {
    localStorage.removeItem(KEY);
  }

  function exportJson() {
    return JSON.stringify(getAll(), null, 2);
  }

  // 시스템 경계다. 남이 준 파일을 믿지 않고 add와 같은 검증에 태운다.
  function importJson(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      return { ok: false, added: 0, skipped: 0, message: 'JSON 형식이 아닙니다' };
    }
    if (!Array.isArray(parsed)) {
      return { ok: false, added: 0, skipped: 0, message: '활동 목록 배열이 아닙니다' };
    }

    const list = readRaw();
    let added = 0;
    let skipped = 0;

    parsed.forEach(function (item) {
      if (item == null || Object.keys(validate(item)).length > 0) {
        skipped += 1;
        return;
      }
      const activity = buildActivity(item);
      // id는 항상 새로 발급한다. 겹치면 삭제가 엉뚱한 기록을 지운다.
      // createdAt은 살린다. 새로 만들면 가져온 기록이 전부 "지금"이 되어 순서를 잃는다.
      if (typeof item.createdAt === 'string' && !Number.isNaN(Date.parse(item.createdAt))) {
        activity.createdAt = item.createdAt;
      }
      list.push(activity);
      added += 1;
    });

    write(list);
    const tail = skipped > 0 ? `, ${skipped}건은 형식이 맞지 않아 건너뛰었습니다` : '';
    return { ok: true, added: added, skipped: skipped, message: `${added}건을 가져왔습니다${tail}` };
  }

  return {
    getAll: getAll,
    add: add,
    remove: remove,
    clearAll: clearAll,
    seedSampleData: seedSampleData,
    exportJson: exportJson,
    importJson: importJson,
  };
})();

// 최상위 const 는 전역 렉시컬 스코프에 들어갈 뿐 window 에 붙지 않는다.
// ui.js 가 window[name] 으로 모듈 존재를 확인하므로 명시적으로 올린다.
window.Store = Store;
