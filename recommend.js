// 오늘의 운동 추천 엔진
// 날씨는 Open-Meteo를 쓴다. API 키가 필요 없어 저장소에 비밀정보를 두지 않는다.
// analytics.js 가 먼저 로드되어야 한다.

const SEOUL = { latitude: 37.5665, longitude: 126.978 };
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';

// 날씨 버킷별 기본 추천. 개인 기록이 부족할 때 쓴다.
const FALLBACK_BY_WEATHER = {
  비: { category: '근력', place: '실내' },
  한랭: { category: '근력', place: '실내' },
  선선: { category: '유산소', place: '야외' },
  쾌적: { category: '유산소', place: '야외' },
  더움: { category: '근력', place: '실내' },
};

const MIN_SAMPLES_FOR_PERSONAL = 3;
const EXERCISE_START_HOUR = 6;
const EXERCISE_END_HOUR = 21;
const WINDOW_HOURS = 2;
const RAINY_CHANCE = 50;
// 체감온도가 이 범위를 넘으면 야외 운동을 권하지 않는다
const HEAT_ALERT_TEMP = 31;
const COLD_ALERT_TEMP = -5;

// 오늘 시간별 예보를 받아온다
async function fetchTodayForecast(location) {
  const params = new URLSearchParams({
    latitude: location.latitude,
    longitude: location.longitude,
    hourly: 'temperature_2m,apparent_temperature,precipitation_probability',
    timezone: 'Asia/Seoul',
    forecast_days: '1',
  });
  const response = await fetch(FORECAST_URL + '?' + params);
  if (!response.ok) throw new Error('오늘 예보를 불러오지 못했습니다');

  const data = await response.json();
  return {
    hours: data.hourly.time.map((t) => Number(t.slice(11, 13))),
    temperature: data.hourly.temperature_2m,
    apparentTemperature: data.hourly.apparent_temperature,
    rainChance: data.hourly.precipitation_probability,
  };
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

    const comfort = comfortScore(forecast.apparentTemperature[i]);
    const dryness = 1 - forecast.rainChance[i] / 100;
    const personal = hourPreference[hour];

    scores.push({
      hour: hour,
      score: 0.45 * comfort + 0.35 * dryness + 0.2 * personal,
      comfort: comfort,
      dryness: dryness,
      personal: personal,
      apparentTemperature: forecast.apparentTemperature[i],
      rainChance: forecast.rainChance[i],
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

// 추천 시간대의 예보로 오늘의 날씨 버킷을 정한다
// 강수확률 50% 이상이면 비 온 날(1mm)로 취급해 과거 분류 기준과 맞춘다
function todayWeatherBucket(window) {
  const temps = window.detail.map((d) => d.apparentTemperature);
  const maxRainChance = Math.max(...window.detail.map((d) => d.rainChance));
  const precipSum = maxRainChance >= RAINY_CHANCE ? 1 : 0;
  return classifyWeather(mean(temps), precipSum);
}

// 날씨에 맞는 운동을 고른다. 개인 기록이 충분하면 그것을 우선한다.
function pickCategory(bucket, weatherPreferences) {
  const fallback = FALLBACK_BY_WEATHER[bucket];
  const personal = weatherPreferences.find((p) => p.bucket === bucket);

  if (personal && personal.total >= MIN_SAMPLES_FOR_PERSONAL) {
    return {
      category: personal.topCategory,
      place: personal.topPlace || fallback.place,
      source: 'personal',
      share: personal.share,
      total: personal.total,
    };
  }
  return { category: fallback.category, place: fallback.place, source: 'fallback' };
}

// 폭염이나 한파면 장소를 실내로 되돌린다. 안전이 개인 선호보다 앞선다.
function applySafetyOverride(window, place) {
  const temps = window.detail.map((d) => d.apparentTemperature);
  const maxTemp = Math.max(...temps);
  const minTemp = Math.min(...temps);

  if (maxTemp >= HEAT_ALERT_TEMP) {
    return { place: '실내', warning: `체감 ${maxTemp.toFixed(1)}도로 폭염 수준이라 실내 운동을 권한다` };
  }
  if (minTemp <= COLD_ALERT_TEMP) {
    return { place: '실내', warning: `체감 ${minTemp.toFixed(1)}도로 한파 수준이라 실내 운동을 권한다` };
  }
  return { place: place, warning: null };
}

// 추천 근거 문장을 만든다
function buildReasons(bucket, window, choice, effects, performance, warning) {
  const reasons = [];
  const avgTemp = mean(window.detail.map((d) => d.apparentTemperature)).toFixed(1);
  const maxRainChance = Math.max(...window.detail.map((d) => d.rainChance));
  reasons.push(
    `${window.startHour}시~${window.endHour}시는 체감 ${avgTemp}도, 강수확률 ${maxRainChance}%로 오늘 운동 가능 시간대 중 점수가 가장 높다`
  );
  if (warning) reasons.push(warning);

  if (choice.source === 'personal') {
    const percent = Math.round(choice.share * 100);
    reasons.push(
      `'${bucket}' 날씨에는 ${withParticle(choice.category, '을', '를')} 가장 많이 했다 (${choice.total}건 중 ${percent}%)`
    );
  } else {
    reasons.push(`'${bucket}' 날씨 기록이 ${MIN_SAMPLES_FOR_PERSONAL}건 미만이라 기본 추천을 적용했다`);
  }

  const effect = effects.find((e) => e.category === choice.category);
  if (effect) {
    reasons.push(
      `${withParticle(choice.category, '은', '는')} 체중 변화와 상관 r=${effect.correlation.toFixed(2)} (${effect.strength}, ${effect.weekCount}주 기준)`
    );
  }

  const slotName = findTimeSlot(window.startHour);
  const slotPerformance = performance.find((p) => p.slot === slotName);
  if (slotPerformance && performance.length >= 2) {
    reasons.push(
      `${slotName} 시간대 평균 지속시간은 ${slotPerformance.avgDuration}분이다 (${slotPerformance.count}회 기준)`
    );
  }
  return reasons;
}

// 날씨와 지난 기록을 합쳐 오늘의 추천을 만든다
function buildRecommendation(activities, forecast, pastWeatherByDate) {
  const window = pickBestWindow(scoreHours(forecast, hourPreferenceMap(activities)));
  if (window === null) return null;

  const bucket = todayWeatherBucket(window);
  const choice = pickCategory(bucket, weatherPreference(activities, pastWeatherByDate));
  const safety = applySafetyOverride(window, choice.place);

  return {
    weatherBucket: bucket,
    category: choice.category,
    place: safety.place,
    startHour: window.startHour,
    endHour: window.endHour,
    source: choice.source,
    warning: safety.warning,
    reasons: buildReasons(
      bucket,
      window,
      choice,
      categoryEffect(activities),
      hourPerformance(activities),
      safety.warning
    ),
  };
}

// 날씨를 받아와 추천까지 한 번에 만든다
async function loadRecommendation(activities, location) {
  const target = location || SEOUL;
  const forecast = await fetchTodayForecast(target);

  const dates = activities.map((a) => a.date).filter(Boolean).sort();
  let pastWeather = {};
  if (dates.length > 0) {
    pastWeather = await fetchPastWeather(target, dates[0], dates[dates.length - 1]);
  }
  return buildRecommendation(activities, forecast, pastWeather);
}
