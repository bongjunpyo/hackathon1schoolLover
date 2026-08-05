// 다이어트 동아리 활동 기록 - 통계 분석 엔진
// 외부 라이브러리 없이 순수 JavaScript로 구현한다.

// 숫자 배열의 평균을 구한다
function mean(nums) {
  if (nums.length === 0) return null;
  let sum = 0;
  for (const n of nums) sum += n;
  return sum / nums.length;
}

// 숫자 배열의 표준편차를 구한다 (모집단 기준)
function stdDev(nums) {
  const m = mean(nums);
  if (m === null) return null;
  let sqSum = 0;
  for (const n of nums) sqSum += (n - m) * (n - m);
  return Math.sqrt(sqSum / nums.length);
}

// 기준일로부터 지난 일수를 구한다 (회귀분석의 x축으로 쓴다)
function daysSince(baseDate, targetDate) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const base = new Date(baseDate + 'T00:00:00');
  const target = new Date(targetDate + 'T00:00:00');
  return Math.round((target - base) / MS_PER_DAY);
}

// 최소자승법으로 선형회귀선을 구한다
// 반환: { slope, intercept, r2 } / 계산 불가 시 null
function linearRegression(xs, ys) {
  if (xs.length !== ys.length || xs.length < 2) return null;

  const mx = mean(xs);
  const my = mean(ys);
  let covariance = 0;
  let varianceX = 0;

  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx;
    covariance += dx * (ys[i] - my);
    varianceX += dx * dx;
  }
  if (varianceX === 0) return null;

  const slope = covariance / varianceX;
  const r = pearson(xs, ys);
  return {
    slope: slope,
    intercept: my - slope * mx,
    r2: r === null ? 0 : r * r,
  };
}

// 피어슨 상관계수를 구한다 (-1 ~ 1)
// 반환: r / 계산 불가 시 null
function pearson(xs, ys) {
  if (xs.length !== ys.length || xs.length < 2) return null;

  const mx = mean(xs);
  const my = mean(ys);
  let covariance = 0;
  let varX = 0;
  let varY = 0;

  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    covariance += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  const denominator = Math.sqrt(varX * varY);
  if (denominator === 0) return null;
  return covariance / denominator;
}

// 상관계수의 세기를 한글 라벨로 바꾼다
function correlationLabel(r) {
  const abs = Math.abs(r);
  if (abs >= 0.7) return '매우 강함';
  if (abs >= 0.5) return '강함';
  if (abs >= 0.3) return '보통';
  return '약함';
}

// 값을 0~1 범위로 정규화한다
function normalize(nums) {
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (max === min) return nums.map(() => 0.5);
  return nums.map((n) => (n - min) / (max - min));
}

// 하루를 6개 시간대로 나눈다. 야간은 자정을 넘어간다.
const TIME_SLOTS = [
  { key: '새벽', startHour: 5, endHour: 8 },
  { key: '오전', startHour: 9, endHour: 11 },
  { key: '점심', startHour: 12, endHour: 14 },
  { key: '오후', startHour: 15, endHour: 17 },
  { key: '저녁', startHour: 18, endHour: 21 },
  { key: '야간', startHour: 22, endHour: 4 },
];

// 시(0~23)가 속한 시간대 이름을 찾는다
function findTimeSlot(hour) {
  for (const slot of TIME_SLOTS) {
    const wrapsMidnight = slot.startHour > slot.endHour;
    if (wrapsMidnight) {
      if (hour >= slot.startHour || hour <= slot.endHour) return slot.key;
    } else if (hour >= slot.startHour && hour <= slot.endHour) {
      return slot.key;
    }
  }
  return null;
}

// 체중 기록에 회귀선을 그려 주당 감량 속도를 구한다
function weightTrend(activities) {
  const records = activities
    .filter((a) => typeof a.weightKg === 'number' && a.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (records.length < 2) return null;

  const baseDate = records[0].date;
  const xs = records.map((a) => daysSince(baseDate, a.date));
  const ys = records.map((a) => a.weightKg);
  const line = linearRegression(xs, ys);
  if (line === null) return null;

  return {
    changePerWeek: line.slope * 7,
    r2: line.r2,
    firstWeight: ys[0],
    lastWeight: ys[ys.length - 1],
    totalChange: ys[ys.length - 1] - ys[0],
    recordCount: records.length,
  };
}

// 시간대별 평균 운동 시간을 구해 지속력이 좋은 순서로 정렬한다
function hourPerformance(activities) {
  const buckets = {};
  for (const slot of TIME_SLOTS) buckets[slot.key] = [];

  for (const a of activities) {
    if (typeof a.startHour !== 'number') continue;
    if (typeof a.durationMin !== 'number') continue;
    const key = findTimeSlot(a.startHour);
    if (key) buckets[key].push(a.durationMin);
  }

  const result = [];
  for (const slot of TIME_SLOTS) {
    const durations = buckets[slot.key];
    if (durations.length === 0) continue;
    result.push({
      slot: slot.key,
      count: durations.length,
      avgDuration: Math.round(mean(durations)),
    });
  }
  return result.sort((a, b) => b.avgDuration - a.avgDuration);
}

// 시(0~23)마다 개인 선호 점수를 0~1로 매긴다. 추천 엔진이 쓴다.
function hourPreferenceMap(activities) {
  const map = {};
  for (let hour = 0; hour < 24; hour++) map[hour] = 0.5;

  const performance = hourPerformance(activities);
  if (performance.length < 2) return map;

  const scores = normalize(performance.map((p) => p.avgDuration));
  performance.forEach((p, index) => {
    for (let hour = 0; hour < 24; hour++) {
      if (findTimeSlot(hour) === p.slot) map[hour] = scores[index];
    }
  });
  return map;
}

// 활동을 첫 기록일 기준 7일씩 묶는다
function groupByWeek(activities) {
  const dated = activities
    .filter((a) => a.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (dated.length === 0) return [];

  const baseDate = dated[0].date;
  const weeks = new Map();

  for (const a of dated) {
    const weekIndex = Math.floor(daysSince(baseDate, a.date) / 7);
    if (!weeks.has(weekIndex)) {
      weeks.set(weekIndex, { weekIndex: weekIndex, categoryMinutes: {}, lastWeight: null });
    }
    const week = weeks.get(weekIndex);
    if (a.category && typeof a.durationMin === 'number') {
      const before = week.categoryMinutes[a.category] || 0;
      week.categoryMinutes[a.category] = before + a.durationMin;
    }
    if (typeof a.weightKg === 'number') week.lastWeight = a.weightKg;
  }
  return Array.from(weeks.values()).sort((a, b) => a.weekIndex - b.weekIndex);
}

// 카테고리별로 주간 운동시간과 주간 체중변화의 상관계수를 구한다
// 상관계수가 음수일수록 감량에 효과적이다
function categoryEffect(activities) {
  const weeks = groupByWeek(activities);
  const samples = [];

  for (let i = 1; i < weeks.length; i++) {
    const previous = weeks[i - 1];
    const current = weeks[i];
    if (previous.lastWeight === null || current.lastWeight === null) continue;
    samples.push({
      categoryMinutes: current.categoryMinutes,
      weightChange: current.lastWeight - previous.lastWeight,
    });
  }
  if (samples.length < 3) return [];

  const categories = new Set();
  for (const s of samples) {
    for (const category of Object.keys(s.categoryMinutes)) categories.add(category);
  }

  const result = [];
  for (const category of categories) {
    const xs = samples.map((s) => s.categoryMinutes[category] || 0);
    const ys = samples.map((s) => s.weightChange);
    const r = pearson(xs, ys);
    if (r === null) continue;
    result.push({
      category: category,
      correlation: r,
      strength: correlationLabel(r),
      weekCount: samples.length,
    });
  }
  return result.sort((a, b) => a.correlation - b.correlation);
}

// 날씨 버킷 이름. 추천 엔진의 폴백 테이블과 키를 맞춘다.
const WEATHER_BUCKETS = ['비', '한랭', '선선', '쾌적', '더움'];

// 하루 평균기온과 강수량으로 날씨 버킷을 정한다
function classifyWeather(tempMean, precipSum) {
  if (precipSum >= 1) return '비';
  if (tempMean < 5) return '한랭';
  if (tempMean < 15) return '선선';
  if (tempMean <= 25) return '쾌적';
  return '더움';
}

// 과거 날씨와 활동 기록을 날짜로 조인해 날씨별 선호 운동을 집계한다
// weatherByDate 형태: { '2026-07-01': { tempMean, precipSum } }
function weatherPreference(activities, weatherByDate) {
  const counts = {};

  for (const a of activities) {
    const weather = weatherByDate[a.date];
    if (!weather || !a.category) continue;
    const bucket = classifyWeather(weather.tempMean, weather.precipSum);
    if (!counts[bucket]) counts[bucket] = { categories: {}, places: {} };
    counts[bucket].categories[a.category] = (counts[bucket].categories[a.category] || 0) + 1;
    if (a.place) counts[bucket].places[a.place] = (counts[bucket].places[a.place] || 0) + 1;
  }

  const result = [];
  for (const bucket of WEATHER_BUCKETS) {
    const bucketCounts = counts[bucket];
    if (!bucketCounts) continue;

    const ranked = rankByCount(bucketCounts.categories, 'category');
    const rankedPlaces = rankByCount(bucketCounts.places, 'place');
    let total = 0;
    for (const item of ranked) total += item.count;

    result.push({
      bucket: bucket,
      total: total,
      topCategory: ranked[0].category,
      topPlace: rankedPlaces.length > 0 ? rankedPlaces[0].place : null,
      share: ranked[0].count / total,
      ranked: ranked,
    });
  }
  return result;
}

// { 이름: 횟수 } 객체를 횟수 내림차순 배열로 바꾼다
function rankByCount(countMap, keyName) {
  return Object.keys(countMap)
    .map((name) => {
      const item = { count: countMap[name] };
      item[keyName] = name;
      return item;
    })
    .sort((a, b) => b.count - a.count);
}

// 효과 랭킹에 넣으려면 최소 이만큼의 표본이 필요하다
const MIN_EFFECT_SAMPLES = 3;
// 체중 기록 간격이 이보다 벌어지면 그 사이 변화를 특정 날에 귀속하지 않는다
const MAX_GAP_DAYS = 3;

// 날짜별 하루당 체중 변화를 구한다
// 기록 간격이 들쭉날쭉하므로 경과일수로 나눠 하루당으로 정규화한다
function dailyWeightChange(activities) {
  const weightByDate = new Map();
  for (const a of activities) {
    if (typeof a.weightKg !== 'number' || !a.date) continue;
    weightByDate.set(a.date, a.weightKg);
  }

  const dates = Array.from(weightByDate.keys()).sort();
  const changes = {};
  for (let i = 0; i + 1 < dates.length; i++) {
    const from = dates[i];
    const to = dates[i + 1];
    const gapDays = daysSince(from, to);
    if (gapDays <= 0 || gapDays > MAX_GAP_DAYS) continue;
    changes[from] = (weightByDate.get(to) - weightByDate.get(from)) / gapDays;
  }
  return changes;
}

// 항목별로 그날의 체중 변화를 귀속해 감량 효과 순으로 매긴다
// extractItems: 활동 1건에서 집계할 이름 배열을 뽑는 함수
function rankByWeightEffect(activities, extractItems) {
  const changes = dailyWeightChange(activities);
  const samplesByItem = {};

  for (const a of activities) {
    const change = changes[a.date];
    if (change === undefined) continue;
    for (const item of extractItems(a)) {
      if (!item) continue;
      if (!samplesByItem[item]) samplesByItem[item] = [];
      samplesByItem[item].push(change);
    }
  }

  const result = [];
  for (const name of Object.keys(samplesByItem)) {
    const samples = samplesByItem[name];
    if (samples.length < MIN_EFFECT_SAMPLES) continue;
    result.push({
      name: name,
      avgChangePerDay: mean(samples),
      sampleCount: samples.length,
      deviation: stdDev(samples),
    });
  }
  // 하루당 변화가 가장 음수인 항목이 감량 효과 1위다
  return result.sort((a, b) => a.avgChangePerDay - b.avgChangePerDay);
}

// 실제로 체중이 줄어든 항목만 남긴다. 늘어난 항목은 감량 순위가 아니다.
function onlyLosing(ranked, limit) {
  return ranked.filter((item) => item.avgChangePerDay < 0).slice(0, limit || 3);
}

// 체중이 늘어난 항목을 증가폭이 큰 순으로 남긴다
function onlyGaining(ranked, limit) {
  return ranked
    .filter((item) => item.avgChangePerDay > 0)
    .sort((a, b) => b.avgChangePerDay - a.avgChangePerDay)
    .slice(0, limit || 3);
}

// 감량 효과가 큰 운동 상위 N개
function topExercises(activities, limit) {
  return onlyLosing(rankByWeightEffect(activities, (a) => [a.exercise]), limit);
}

// 감량 효과가 큰 음식 상위 N개
function topFoods(activities, limit) {
  return onlyLosing(rankByWeightEffect(activities, (a) => a.foods || []), limit);
}

// 체중이 늘어난 운동 상위 N개 (피해야 할 항목)
function worstExercises(activities, limit) {
  return onlyGaining(rankByWeightEffect(activities, (a) => [a.exercise]), limit);
}

// 체중이 늘어난 음식 상위 N개 (피해야 할 항목)
function worstFoods(activities, limit) {
  return onlyGaining(rankByWeightEffect(activities, (a) => a.foods || []), limit);
}

// 운동마다 가장 자주 기록된 카테고리와 장소를 찾는다
// 날씨에 맞는 운동을 고를 때 실내/야외 판정에 쓴다
function exerciseProfiles(activities) {
  const profiles = {};

  for (const a of activities) {
    if (!a.exercise) continue;
    if (!profiles[a.exercise]) {
      profiles[a.exercise] = { exercise: a.exercise, categories: {}, places: {}, count: 0 };
    }
    const profile = profiles[a.exercise];
    profile.count += 1;
    if (a.category) profile.categories[a.category] = (profile.categories[a.category] || 0) + 1;
    if (a.place) profile.places[a.place] = (profile.places[a.place] || 0) + 1;
  }

  const result = {};
  for (const name of Object.keys(profiles)) {
    const profile = profiles[name];
    const topCategory = rankByCount(profile.categories, 'category')[0];
    const topPlace = rankByCount(profile.places, 'place')[0];
    result[name] = {
      exercise: name,
      count: profile.count,
      category: topCategory ? topCategory.category : null,
      place: topPlace ? topPlace.place : null,
    };
  }
  return result;
}

// 날씨 버킷별로 실제 수행한 운동 횟수를 센다
// 나쁜 날씨에도 해본 운동인지 판단해 다음 계획에 배치할 때 쓴다
function exercisesByWeather(activities, weatherByDate) {
  const counts = {};
  for (const a of activities) {
    const weather = weatherByDate[a.date];
    if (!weather || !a.exercise) continue;
    const bucket = classifyWeather(weather.tempMean, weather.precipSum);
    if (!counts[bucket]) counts[bucket] = {};
    counts[bucket][a.exercise] = (counts[bucket][a.exercise] || 0) + 1;
  }
  return counts;
}

// 한글 받침 유무에 맞는 조사를 붙인다
function withParticle(word, particleWithJong, particleWithoutJong) {
  const HANGUL_START = 0xac00;
  const HANGUL_END = 0xd7a3;
  const code = word.charCodeAt(word.length - 1);
  if (code < HANGUL_START || code > HANGUL_END) return word + particleWithoutJong;
  const hasJong = (code - HANGUL_START) % 28 !== 0;
  return word + (hasJong ? particleWithJong : particleWithoutJong);
}
