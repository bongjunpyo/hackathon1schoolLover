// 오늘의 운동 추천 엔진
// 날씨는 Open-Meteo를 쓴다. API 키가 필요 없어 저장소에 비밀정보를 두지 않는다.
// analytics.js 가 먼저 로드되어야 한다.

const SEOUL = { latitude: 37.5665, longitude: 126.978 };
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';

// 실내에서 하기 좋은 카테고리. 날씨가 나쁜 날의 대체 후보다.
const INDOOR_CATEGORIES = ['근력', '스트레칭'];
// 야외 운동이 어려운 날씨
const BAD_WEATHER_BUCKETS = ['비', '더움', '한랭'];

const FORECAST_DAYS = 7;
const EXERCISE_START_HOUR = 6;
const EXERCISE_END_HOUR = 21;
const WINDOW_HOURS = 2;
const RAINY_CHANCE = 50;
// 체감온도가 이 범위를 넘으면 야외 운동을 권하지 않는다
const HEAT_ALERT_TEMP = 31;
const COLD_ALERT_TEMP = -5;

// 앞으로 며칠치 예보를 하루 단위로 묶어 받아온다
async function fetchUpcomingForecast(location, days) {
  const params = new URLSearchParams({
    latitude: location.latitude,
    longitude: location.longitude,
    daily: 'temperature_2m_mean,precipitation_sum',
    hourly: 'apparent_temperature,precipitation_probability',
    timezone: 'Asia/Seoul',
    forecast_days: String(days || FORECAST_DAYS),
  });
  const response = await fetch(FORECAST_URL + '?' + params);
  if (!response.ok) throw new Error('예보를 불러오지 못했습니다');

  const data = await response.json();
  return data.daily.time.map((date, index) => ({
    date: date,
    tempMean: data.daily.temperature_2m_mean[index],
    precipSum: data.daily.precipitation_sum[index],
    hourly: extractHoursForDate(data.hourly, date),
  }));
}

// 시간별 예보 배열에서 특정 날짜분만 뽑아낸다
function extractHoursForDate(hourly, date) {
  const picked = { hours: [], apparentTemperature: [], rainChance: [] };
  hourly.time.forEach((timestamp, index) => {
    if (timestamp.slice(0, 10) !== date) return;
    picked.hours.push(Number(timestamp.slice(11, 13)));
    picked.apparentTemperature.push(hourly.apparent_temperature[index]);
    picked.rainChance.push(hourly.precipitation_probability[index]);
  });
  return picked;
}

// 과거 날씨를 받아 날짜별 객체로 만든다
async function fetchPastWeather(location, startDate, endDate) {
  const params = new URLSearchParams({
    latitude: location.latitude,
    longitude: location.longitude,
    start_date: startDate,
    end_date: endDate,
    daily: 'temperature_2m_mean,precipitation_sum',
    timezone: 'Asia/Seoul',
  });
  const response = await fetch(ARCHIVE_URL + '?' + params);
  if (!response.ok) throw new Error('과거 날씨를 불러오지 못했습니다');

  const data = await response.json();
  const byDate = {};
  data.daily.time.forEach((date, index) => {
    const tempMean = data.daily.temperature_2m_mean[index];
    const precipSum = data.daily.precipitation_sum[index];
    // 아카이브는 최근 며칠치가 비어 있을 수 있다. 빈 날은 건너뛴다.
    if (tempMean === null || precipSum === null) return;
    byDate[date] = { tempMean: tempMean, precipSum: precipSum };
  });
  return byDate;
}

// 체감온도 18도를 최적으로 보고 쾌적도를 0~1로 매긴다
// 뺄셈식은 극단 기온에서 0으로 포화돼 34도와 38도를 동점으로 만든다.
// 아래 곡선은 포화되지 않아 더운 쪽이 항상 낮은 점수를 받는다.
function comfortScore(apparentTemp) {
  const IDEAL_TEMP = 18;
  const TOLERANCE = 12;
  const deviation = Math.abs(apparentTemp - IDEAL_TEMP) / TOLERANCE;
  return 1 / (1 + deviation * deviation);
}

// 운동 가능 시간대마다 쾌적도, 강수확률, 개인 선호를 합쳐 점수를 낸다
function scoreHours(forecast, hourPreference) {
  const scores = [];

  for (let i = 0; i < forecast.hours.length; i++) {
    const hour = forecast.hours[i];
    if (hour < EXERCISE_START_HOUR || hour > EXERCISE_END_HOUR) continue;

    const apparentTemp = forecast.apparentTemperature[i];
    const rainChance = forecast.rainChance[i];
    // 예보는 뒤쪽 날짜일수록 값이 비어 올 수 있다. 빈 시간은 후보에서 뺀다.
    if (typeof apparentTemp !== 'number' || typeof rainChance !== 'number') continue;

    const comfort = comfortScore(apparentTemp);
    const dryness = 1 - rainChance / 100;
    const personal = hourPreference[hour];

    scores.push({
      hour: hour,
      score: 0.45 * comfort + 0.35 * dryness + 0.2 * personal,
      comfort: comfort,
      dryness: dryness,
      personal: personal,
      apparentTemperature: apparentTemp,
      rainChance: rainChance,
    });
  }
  return scores;
}

// 연속 2시간 중 평균 점수가 가장 높은 구간을 고른다
function pickBestWindow(hourScores) {
  let best = null;

  for (let i = 0; i + WINDOW_HOURS - 1 < hourScores.length; i++) {
    const slice = hourScores.slice(i, i + WINDOW_HOURS);
    const span = slice[slice.length - 1].hour - slice[0].hour;
    if (span !== WINDOW_HOURS - 1) continue;

    const average = mean(slice.map((s) => s.score));
    if (best === null || average > best.score) {
      best = {
        startHour: slice[0].hour,
        endHour: slice[slice.length - 1].hour + 1,
        score: average,
        detail: slice,
      };
    }
  }
  return best;
}

// Top3 운동 중 그날 날씨에 맞는 것을 고른다
// 1순위 같은 날씨에서 실제로 해본 운동, 2순위 실내 운동, 3순위 효과 1위 그대로
// 전날과 같은 운동은 회복을 위해 뒤로 미룬다
function pickExerciseForDay(rankedExercises, profiles, exerciseCountsByWeather, bucket, previousName) {
  if (rankedExercises.length === 0) return null;

  const rotated = rankedExercises.filter((item) => item.name !== previousName);
  const pool = rotated.length > 0 ? rotated : rankedExercises;

  const doneInBucket = exerciseCountsByWeather[bucket] || {};
  for (const item of pool) {
    if (doneInBucket[item.name]) {
      return {
        name: item.name,
        expectedChange: item.avgChangePerDay,
        basis: 'history',
        historyCount: doneInBucket[item.name],
      };
    }
  }

  if (BAD_WEATHER_BUCKETS.indexOf(bucket) !== -1) {
    for (const item of pool) {
      const profile = profiles[item.name];
      if (profile && INDOOR_CATEGORIES.indexOf(profile.category) !== -1) {
        return { name: item.name, expectedChange: item.avgChangePerDay, basis: 'indoor' };
      }
    }
  }

  const best = pool[0];
  return { name: best.name, expectedChange: best.avgChangePerDay, basis: 'top' };
}

// 폭염, 한파, 비면 장소를 실내로 되돌린다. 안전이 개인 선호보다 앞선다.
function applySafetyOverride(window, place) {
  const temps = window.detail.map((d) => d.apparentTemperature);
  const maxTemp = Math.max(...temps);
  const minTemp = Math.min(...temps);
  const maxRainChance = Math.max(...window.detail.map((d) => d.rainChance));

  if (maxTemp >= HEAT_ALERT_TEMP) {
    return { place: '실내', warning: `체감 ${maxTemp.toFixed(1)}도로 폭염 수준이라 실내 운동을 권한다` };
  }
  if (minTemp <= COLD_ALERT_TEMP) {
    return { place: '실내', warning: `체감 ${minTemp.toFixed(1)}도로 한파 수준이라 실내 운동을 권한다` };
  }
  if (maxRainChance >= RAINY_CHANCE) {
    return { place: '실내', warning: `강수확률 ${maxRainChance}%라 실내 운동을 권한다` };
  }
  return { place: place, warning: null };
}

// 하루치 추천 근거 문장을 만든다
function buildDayReasons(bucket, window, choice, performance, warning) {
  const reasons = [];
  const avgTemp = mean(window.detail.map((d) => d.apparentTemperature)).toFixed(1);
  const maxRainChance = Math.max(...window.detail.map((d) => d.rainChance));
  // 버킷은 하루 평균 기온으로 정하고, 아래 체감온도는 추천 시간대 값이라 서로 다를 수 있다
  reasons.push(
    `하루 평균으로는 '${bucket}' 날씨다. 추천 시간대는 체감 ${avgTemp}도, 강수확률 ${maxRainChance}%다`
  );
  if (warning) reasons.push(warning);

  if (choice.basis === 'history') {
    reasons.push(
      `'${bucket}' 날씨에 ${withParticle(choice.name, '을', '를')} ${choice.historyCount}회 했던 기록이 있다`
    );
  } else if (choice.basis === 'indoor') {
    reasons.push('야외 운동이 어려운 날씨라 실내 운동으로 바꿨다');
  } else {
    reasons.push(`'${bucket}' 날씨 기록이 없어 감량 효과 1위 운동을 그대로 배치했다`);
  }

  const changeText = choice.expectedChange.toFixed(3);
  reasons.push(`${withParticle(choice.name, '은', '는')} 하루당 ${changeText}kg 변화를 보였다`);

  const slotName = findTimeSlot(window.startHour);
  const slotPerformance = performance.find((p) => p.slot === slotName);
  if (slotPerformance && performance.length >= 2) {
    reasons.push(`${slotName} 시간대 평균 지속시간은 ${slotPerformance.avgDuration}분이다`);
  }
  return reasons;
}

// 감량 효과 Top3와 예보를 맞춰 앞으로 며칠치 계획을 세운다
function buildPlan(activities, upcomingForecast, pastWeatherByDate) {
  const exercises = topExercises(activities, 3);
  const foods = topFoods(activities, 3);
  const profiles = exerciseProfiles(activities);
  const countsByWeather = exercisesByWeather(activities, pastWeatherByDate);
  const hourPreference = hourPreferenceMap(activities);
  const performance = hourPerformance(activities);

  const days = [];
  let cumulativeChange = 0;
  let previousExercise = null;

  for (const forecast of upcomingForecast) {
    // 일별 값이 비어 있으면 날씨를 분류할 수 없다. 그 날은 건너뛴다.
    if (typeof forecast.tempMean !== 'number') continue;
    if (typeof forecast.precipSum !== 'number') continue;

    const window = pickBestWindow(scoreHours(forecast.hourly, hourPreference));
    if (window === null) continue;

    const bucket = classifyWeather(forecast.tempMean, forecast.precipSum);
    const choice = pickExerciseForDay(exercises, profiles, countsByWeather, bucket, previousExercise);
    if (choice) previousExercise = choice.name;
    const profile = choice ? profiles[choice.name] : null;
    const safety = applySafetyOverride(window, profile ? profile.place : null);
    if (choice) cumulativeChange += choice.expectedChange;

    days.push({
      date: forecast.date,
      weatherBucket: bucket,
      exercise: choice ? choice.name : null,
      place: safety.place || '자유',
      startHour: window.startHour,
      endHour: window.endHour,
      expectedChange: choice ? choice.expectedChange : 0,
      cumulativeChange: cumulativeChange,
      warning: safety.warning,
      reasons: choice
        ? buildDayReasons(bucket, window, choice, performance, safety.warning)
        : [`하루 평균으로는 '${bucket}' 날씨다`, '감량 효과가 확인된 운동이 아직 없다'],
    });
  }

  return {
    topExercises: exercises,
    topFoods: foods,
    avoidExercises: worstExercises(activities, 3),
    avoidFoods: worstFoods(activities, 3),
    days: days,
    totalExpectedChange: cumulativeChange,
  };
}

// 예보와 과거 날씨를 받아와 계획까지 한 번에 만든다
// → { ok: true, plan } | { ok: false, reason: '한글 메시지' }
//
// 이 함수는 절대 throw 하지 않는다. 날씨는 외부 의존이라 없을 수 있고,
// 그때 화면 전체가 죽으면 안 된다. 추천 영역만 접고 나머지는 그대로 둔다.
// file:// 로 열면 Origin 이 null 이라 fetch 가 막힐 수 있는데, 그것도 여기서 흡수한다.
async function loadPlan(activities, location, days) {
  const target = location || SEOUL;

  let upcoming;
  let pastWeather = {};
  try {
    upcoming = await fetchUpcomingForecast(target, days);

    const dates = activities.map((a) => a.date).filter(Boolean).sort();
    if (dates.length > 0) {
      pastWeather = await fetchPastWeather(target, dates[0], dates[dates.length - 1]);
    }
  } catch (error) {
    return { ok: false, reason: '날씨 정보를 불러오지 못해 계획을 만들 수 없습니다' };
  }

  const plan = buildPlan(activities, upcoming, pastWeather);
  if (plan.days.length === 0) {
    return { ok: false, reason: '예보에서 운동할 만한 시간대를 찾지 못했습니다' };
  }
  if (plan.topExercises.length === 0) {
    return { ok: false, reason: '체중 기록이 부족해 감량 효과를 계산할 수 없습니다' };
  }
  return { ok: true, plan: plan };
}

// 전역 노출. file:// 에서는 ES 모듈이 막히므로 일반 script 태그 + 전역 객체를 쓴다.
// analytics.js 가 먼저 로드되어 있어야 한다.
const Recommend = {
  // 네트워크까지 포함한 진입점. throw 하지 않고 { ok } 로 돌려준다.
  loadPlan: loadPlan,

  // 순수 함수 진입점. 예보 데이터를 직접 넣으면 네트워크 없이 계획을 만든다.
  // 테스트와 오프라인 시연은 이쪽을 쓴다.
  buildPlan: buildPlan,

  // 날씨만 따로 받아야 할 때 쓴다. 실패하면 throw 하므로 호출부가 감싸야 한다.
  fetchUpcomingForecast: fetchUpcomingForecast,
  fetchPastWeather: fetchPastWeather,

  SEOUL: SEOUL,
};
