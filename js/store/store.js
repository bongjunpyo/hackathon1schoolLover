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

  return {
    getAll: getAll,
    add: add,
    remove: remove,
    clearAll: clearAll,
  };
})();
