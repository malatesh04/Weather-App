/* ======================================================
   SkyPulse — app.js
   Weatherstack API Integration
   API Key: 2764197b011232ad6571bdd06bb939d0
   Base URL: http://api.weatherstack.com
   ====================================================== */

const API_KEY = '2764197b011232ad6571bdd06bb939d0';
const BASE_URL = 'http://api.weatherstack.com';

/* ---- Proxy helper (handles CORS for browser fetch) ---- */
/* We use a CORS-anywhere proxy as Weatherstack HTTP doesn't allow
   direct browser requests from file:// or localhost origins.
   Production deployments should use a server-side proxy. */
const PROXY = 'https://corsproxy.io/?url=';

function buildUrl(endpoint, params) {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.searchParams.set('access_key', API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  return PROXY + encodeURIComponent(url.toString());
}

async function apiFetch(endpoint, params) {
  const url = buildUrl(endpoint, params);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.info || 'API error');
  if (data.success === false) throw new Error(data.error?.info || 'API returned failure');
  return data;
}

/* ---- State ---- */
let currentUnit = 'm';
let currentQuery = 'Mumbai';
let autoTimer = null;
let selectedForecastDays = null;

/* ---- WMO Weather Codes (Open-Meteo) ---- */
const WMO = {
  0: { desc: 'Clear Sky', emoji: '☀️' },
  1: { desc: 'Mainly Clear', emoji: '🌤️' },
  2: { desc: 'Partly Cloudy', emoji: '⛅' },
  3: { desc: 'Overcast', emoji: '☁️' },
  45: { desc: 'Fog', emoji: '🌫️' },
  48: { desc: 'Icy Fog', emoji: '🌫️' },
  51: { desc: 'Light Drizzle', emoji: '🌦️' },
  53: { desc: 'Moderate Drizzle', emoji: '🌦️' },
  55: { desc: 'Dense Drizzle', emoji: '🌧️' },
  56: { desc: 'Freezing Drizzle', emoji: '🌨️' },
  57: { desc: 'Heavy Freezing Drizzle', emoji: '🌨️' },
  61: { desc: 'Light Rain', emoji: '🌧️' },
  63: { desc: 'Moderate Rain', emoji: '🌧️' },
  65: { desc: 'Heavy Rain', emoji: '🌧️' },
  66: { desc: 'Freezing Rain', emoji: '🌨️' },
  67: { desc: 'Heavy Freezing Rain', emoji: '🌨️' },
  71: { desc: 'Light Snow', emoji: '❄️' },
  73: { desc: 'Moderate Snow', emoji: '❄️' },
  75: { desc: 'Heavy Snow', emoji: '❄️' },
  77: { desc: 'Snow Grains', emoji: '🌨️' },
  80: { desc: 'Light Rain Showers', emoji: '🌦️' },
  81: { desc: 'Rain Showers', emoji: '🌦️' },
  82: { desc: 'Violent Rain Showers', emoji: '⛈️' },
  85: { desc: 'Snow Showers', emoji: '🌨️' },
  86: { desc: 'Heavy Snow Showers', emoji: '🌨️' },
  95: { desc: 'Thunderstorm', emoji: '⛈️' },
  96: { desc: 'Thunderstorm + Hail', emoji: '⛈️' },
  99: { desc: 'Thunderstorm + Heavy Hail', emoji: '⛈️' },
};

function wmo(code) {
  return WMO[code] || { desc: 'Unknown', emoji: '🌡️' };
}

function degToCompass(deg) {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function cToF(c) { return Math.round(c * 9 / 5 + 32); }
function applyUnit(val) {
  if (val == null) return '—';
  if (currentUnit === 'f') return `${cToF(val)}°F`;
  return `${val}°C`;
}

/* ---- DOM References ---- */
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const autocompleteDD = document.getElementById('autocompleteDropdown');
const unitMetric = document.getElementById('unitMetric');
const unitFahrenheit = document.getElementById('unitFahrenheit');

/* ---- Tab Switching ---- */
document.getElementById('tabNav').addEventListener('click', e => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  const tab = btn.dataset.tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(`panel${capitalize(tab)}`).classList.add('active');
});

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ---- Unit Toggle ---- */
unitMetric.addEventListener('click', () => {
  if (currentUnit === 'm') return;
  currentUnit = 'm';
  unitMetric.classList.add('active');
  unitFahrenheit.classList.remove('active');
  loadCurrentWeather(currentQuery);
});

unitFahrenheit.addEventListener('click', () => {
  if (currentUnit === 'f') return;
  currentUnit = 'f';
  unitFahrenheit.classList.add('active');
  unitMetric.classList.remove('active');
  loadCurrentWeather(currentQuery);
});

/* ---- Search ---- */
searchBtn.addEventListener('click', () => doSearch());
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') doSearch();
});

function doSearch() {
  const q = searchInput.value.trim();
  if (!q) return;
  currentQuery = q;
  autocompleteDD.classList.remove('open');
  autocompleteDD.innerHTML = '';

  // Switch to current tab and fetch
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tabCurrent').classList.add('active');
  document.getElementById('panelCurrent').classList.add('active');
  loadCurrentWeather(q);
}

/* ---- Autocomplete typing in header search ---- */
searchInput.addEventListener('input', () => {
  clearTimeout(autoTimer);
  const q = searchInput.value.trim();
  if (q.length < 2) {
    autocompleteDD.classList.remove('open');
    return;
  }
  autoTimer = setTimeout(() => headerAutocomplete(q), 350);
});

/* Uses OpenStreetMap Nominatim — free, no API key, no CORS issues */
async function headerAutocomplete(q) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (!res.ok) throw new Error('Nominatim error');
    const results = await res.json();
    renderHeaderAutocomplete(results);
  } catch (_) {
    autocompleteDD.classList.remove('open');
  }
}

function renderHeaderAutocomplete(results) {
  if (!results || !results.length) { autocompleteDD.classList.remove('open'); return; }
  autocompleteDD.innerHTML = results.slice(0, 6).map(r => {
    const addr = r.address || {};
    const city = addr.city || addr.town || addr.village || addr.county || r.name || 'Unknown';
    const country = addr.country || '';
    const region = addr.state || addr.region || '';
    const lat = parseFloat(r.lat).toFixed(4);
    const lon = parseFloat(r.lon).toFixed(4);
    return `
      <div class="auto-item" data-name="${city}" data-country="${country}" data-lat="${lat}" data-lon="${lon}">
        <span class="auto-item-name">${city}${region ? ', ' + region : ''}</span>
        <span class="auto-item-meta">${country} &nbsp;·&nbsp; ${lat}, ${lon}</span>
      </div>
    `;
  }).join('');
  autocompleteDD.classList.add('open');

  autocompleteDD.querySelectorAll('.auto-item').forEach(item => {
    item.addEventListener('click', () => {
      const loc = `${item.dataset.lat},${item.dataset.lon}`;
      searchInput.value = `${item.dataset.name}${item.dataset.country ? ', ' + item.dataset.country : ''}`;
      autocompleteDD.classList.remove('open');
      currentQuery = loc;
      loadCurrentWeather(loc);
    });
  });
}

// Close dropdown on outside click
document.addEventListener('click', e => {
  if (!document.getElementById('searchWrapper').contains(e.target)) {
    autocompleteDD.classList.remove('open');
  }
});

/* ============================================================
   CURRENT WEATHER
   ============================================================ */
async function loadCurrentWeather(query) {
  showLoading('current', true);
  hideError('current');
  document.getElementById('currentContent').classList.add('hidden');

  try {
    const data = await apiFetch('current', { query, units: currentUnit });
    renderCurrentWeather(data);
  } catch (err) {
    showError('current', err.message);
  } finally {
    showLoading('current', false);
  }
}

function renderCurrentWeather(data) {
  const loc = data.location;
  const cur = data.current;

  // Location
  document.getElementById('curCity').textContent = loc.name;
  document.getElementById('curMeta').textContent = `${loc.region ? loc.region + ', ' : ''}${loc.country} · Lat ${loc.lat} / Lon ${loc.lon}`;
  document.getElementById('curTime').textContent = `🕐 Local Time: ${loc.localtime}  ·  UTC ${loc.utc_offset >= 0 ? '+' : ''}${loc.utc_offset}  ·  ${loc.timezone_id}`;

  // Temperature
  const unitSym = currentUnit === 'f' ? '°F' : currentUnit === 's' ? 'K' : '°C';
  document.getElementById('curTemp').textContent = `${cur.temperature}${unitSym}`;
  document.getElementById('curDesc').textContent = (cur.weather_descriptions || []).join(', ') || '—';
  document.getElementById('curFeels').textContent = `Feels like ${cur.feelslike}${unitSym}`;

  // Icon
  const iconEl = document.getElementById('curIcon');
  if (cur.weather_icons && cur.weather_icons[0]) {
    iconEl.src = cur.weather_icons[0];
    iconEl.alt = (cur.weather_descriptions || [''])[0];
  }

  // Stats
  document.getElementById('curHumidity').textContent = `${cur.humidity}%`;
  document.getElementById('curWind').textContent = `${cur.wind_speed} km/h`;
  document.getElementById('curPressure').textContent = `${cur.pressure} mb`;
  document.getElementById('curVisibility').textContent = `${cur.visibility} km`;
  document.getElementById('curUV').textContent = cur.uv_index ?? '—';
  document.getElementById('curCloud').textContent = `${cur.cloudcover}%`;
  document.getElementById('curPrecip').textContent = `${cur.precip} mm`;
  document.getElementById('curWindDir').textContent = `${cur.wind_dir} (${cur.wind_degree}°)`;

  // Astro
  if (cur.astro) {
    const a = cur.astro;
    document.getElementById('curSunrise').textContent = a.sunrise || '—';
    document.getElementById('curSunset').textContent = a.sunset || '—';
    document.getElementById('curMoonrise').textContent = a.moonrise || '—';
    document.getElementById('curMoonset').textContent = a.moonset || '—';
    document.getElementById('curMoonPhase').textContent = a.moon_phase || '—';
    document.getElementById('curMoonIllum').textContent = a.moon_illumination != null ? `${a.moon_illumination}%` : '—';
  }

  // Air Quality
  if (cur.air_quality) {
    const aq = cur.air_quality;
    const epaIndex = parseInt(aq['us-epa-index']) || 0;
    const aqLabels = ['', 'Good', 'Moderate', 'Unhealthy for Sensitive Groups', 'Unhealthy', 'Very Unhealthy', 'Hazardous'];
    const aqColors = ['', '#16a34a', '#ca8a04', '#ea580c', '#dc2626', '#9333ea', '#7c3aed'];
    const badge = document.getElementById('aqBadge');
    badge.textContent = `EPA: ${epaIndex} — ${aqLabels[epaIndex] || 'Unknown'}`;
    badge.style.background = aqColors[epaIndex] || '#16a34a';
    document.getElementById('aqCO').textContent = aq.co ? `${parseFloat(aq.co).toFixed(1)} µg/m³` : '—';
    document.getElementById('aqNO2').textContent = aq.no2 ? `${parseFloat(aq.no2).toFixed(1)} µg/m³` : '—';
    document.getElementById('aqO3').textContent = aq.o3 ? `${parseFloat(aq.o3).toFixed(1)} µg/m³` : '—';
    document.getElementById('aqSO2').textContent = aq.so2 ? `${parseFloat(aq.so2).toFixed(1)} µg/m³` : '—';
    document.getElementById('aqPM25').textContent = aq.pm2_5 ? `${parseFloat(aq.pm2_5).toFixed(1)} µg/m³` : '—';
    document.getElementById('aqPM10').textContent = aq.pm10 ? `${parseFloat(aq.pm10).toFixed(1)} µg/m³` : '—';
  }

  document.getElementById('currentContent').classList.remove('hidden');
}

/* ============================================================
   HISTORICAL WEATHER — powered by Open-Meteo Archive API (free)
   Geocoding: OpenStreetMap Nominatim
   Supports historical data back to 1940!
   ============================================================ */

// Set max date on the date picker to yesterday
const histDateInput = document.getElementById('histDate');
const yesterday = new Date(Date.now() - 86400000);
histDateInput.max = yesterday.toISOString().split('T')[0];
histDateInput.value = yesterday.toISOString().split('T')[0];

document.getElementById('fetchHistBtn').addEventListener('click', async () => {
  const query = document.getElementById('histLocation').value.trim() || currentQuery;
  const date = document.getElementById('histDate').value;
  const interval = parseInt(document.getElementById('histHourly').value) || 3;
  if (!query) { showError('historical', 'Please enter a location.'); return; }
  if (!date) { showError('historical', 'Please select a date.'); return; }

  showLoading('historical', true);
  hideError('historical');
  document.getElementById('historicalContent').classList.add('hidden');

  try {
    /* Step 1: Geocode via Nominatim */
    let lat, lon, locationLabel;
    const latLonMatch = query.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
    if (latLonMatch) {
      lat = parseFloat(latLonMatch[1]);
      lon = parseFloat(latLonMatch[2]);
      locationLabel = `${lat}, ${lon}`;
    } else {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const geoData = await geoRes.json();
      if (!geoData.length) throw new Error(`Location "${query}" not found.`);
      lat = parseFloat(geoData[0].lat);
      lon = parseFloat(geoData[0].lon);
      const addr = geoData[0].address || {};
      locationLabel = [
        addr.city || addr.town || addr.village || addr.county || geoData[0].name,
        addr.state,
        addr.country
      ].filter(Boolean).join(', ');
    }

    /* Step 2: Fetch from Open-Meteo Archive */
    const tempUnit = currentUnit === 'f' ? 'fahrenheit' : 'celsius';
    const omUrl = new URL('https://archive-api.open-meteo.com/v1/archive');
    omUrl.searchParams.set('latitude', lat);
    omUrl.searchParams.set('longitude', lon);
    omUrl.searchParams.set('start_date', date);
    omUrl.searchParams.set('end_date', date);
    omUrl.searchParams.set('timezone', 'auto');
    omUrl.searchParams.set('temperature_unit', tempUnit);
    omUrl.searchParams.set('daily', [
      'weathercode', 'temperature_2m_max', 'temperature_2m_min', 'temperature_2m_mean',
      'sunrise', 'sunset', 'precipitation_sum', 'precipitation_hours',
      'windspeed_10m_max', 'winddirection_10m_dominant', 'shortwave_radiation_sum'
    ].join(','));
    omUrl.searchParams.set('hourly', [
      'temperature_2m', 'relativehumidity_2m', 'precipitation', 'weathercode',
      'windspeed_10m', 'winddirection_10m', 'cloudcover', 'pressure_msl', 'visibility'
    ].join(','));

    const omRes = await fetch(omUrl.toString());
    if (!omRes.ok) throw new Error(`Archive service error: HTTP ${omRes.status}`);
    const omData = await omRes.json();

    renderHistorical(omData, date, locationLabel, lat, lon, interval);
  } catch (err) {
    showError('historical', err.message);
  } finally {
    showLoading('historical', false);
  }
});

function renderHistorical(omData, date, locationLabel, lat, lon, interval) {
  const unitSym = currentUnit === 'f' ? '°F' : '°C';
  const daily = omData.daily || {};
  const hourly = omData.hourly || {};
  const dateIdx = (daily.time || []).indexOf(date);
  const sunrise = dateIdx >= 0 ? (daily.sunrise?.[dateIdx] || '').split('T')[1] || '—' : '—';
  const sunset = dateIdx >= 0 ? (daily.sunset?.[dateIdx] || '').split('T')[1] || '—' : '—';
  const w = wmo(daily.weathercode?.[dateIdx]);

  /* ---- Summary Card ---- */
  const summaryEl = document.getElementById('histSummary');
  summaryEl.innerHTML = `
    <div class="hist-summary-left">
      <div class="hist-date-label">${formatDate(date)}</div>
      <div class="hist-location-label">${locationLabel}</div>
      <div style="font-size:0.8rem;color:var(--text-muted)">
        Lat ${lat.toFixed(4)} / Lon ${lon.toFixed(4)} · ${omData.timezone || ''}
      </div>
      <div style="font-size:2.5rem;margin-top:10px">${w.emoji}</div>
      <div style="font-size:1rem;font-weight:600;color:var(--text-secondary)">${w.desc}</div>
    </div>
    ${dateIdx >= 0 ? `
    <div class="hist-stats">
      <div class="hist-stat-item">
        <div class="hist-stat-val">${daily.temperature_2m_mean?.[dateIdx] ?? '—'}${unitSym}</div>
        <div class="hist-stat-lbl">Avg Temp</div>
      </div>
      <div class="hist-stat-item">
        <div class="hist-stat-val">${daily.temperature_2m_max?.[dateIdx] ?? '—'}${unitSym}</div>
        <div class="hist-stat-lbl">Max Temp</div>
      </div>
      <div class="hist-stat-item">
        <div class="hist-stat-val">${daily.temperature_2m_min?.[dateIdx] ?? '—'}${unitSym}</div>
        <div class="hist-stat-lbl">Min Temp</div>
      </div>
      <div class="hist-stat-item">
        <div class="hist-stat-val">${daily.precipitation_sum?.[dateIdx] ?? 0} mm</div>
        <div class="hist-stat-lbl">Rainfall</div>
      </div>
      <div class="hist-stat-item">
        <div class="hist-stat-val">${daily.windspeed_10m_max?.[dateIdx] ?? '—'} km/h</div>
        <div class="hist-stat-lbl">Max Wind</div>
      </div>
      <div class="hist-stat-item">
        <div class="hist-stat-val">${daily.shortwave_radiation_sum?.[dateIdx] ?? '—'} MJ</div>
        <div class="hist-stat-lbl">Solar Rad.</div>
      </div>
      <div class="hist-stat-item">
        <div class="hist-stat-val" style="font-size:1rem">${sunrise}</div>
        <div class="hist-stat-lbl">🌅 Sunrise</div>
      </div>
      <div class="hist-stat-item">
        <div class="hist-stat-val" style="font-size:1rem">${sunset}</div>
        <div class="hist-stat-lbl">🌇 Sunset</div>
      </div>
      <div class="hist-stat-item">
        <div class="hist-stat-val">${daily.precipitation_hours?.[dateIdx] ?? '—'} h</div>
        <div class="hist-stat-lbl">Rain Hours</div>
      </div>
    </div>` : '<p style="color:var(--text-muted)">No daily summary data available.</p>'}
  `;

  /* ---- Hourly Breakdown ---- */
  const hourlyForDay = [];
  (hourly.time || []).forEach((t, i) => {
    if (t.startsWith(date)) {
      hourlyForDay.push({
        time: t.split('T')[1] || '00:00',
        temp: hourly.temperature_2m?.[i],
        humidity: hourly.relativehumidity_2m?.[i],
        precip: hourly.precipitation?.[i],
        code: hourly.weathercode?.[i],
        wind: hourly.windspeed_10m?.[i],
        windDir: hourly.winddirection_10m?.[i],
        cloud: hourly.cloudcover?.[i],
        pressure: hourly.pressure_msl?.[i],
        vis: hourly.visibility?.[i],
      });
    }
  });

  /* Filter by selected interval */
  const step = Math.max(1, interval);
  const filtered = hourlyForDay.filter((_, i) => i % step === 0);

  const scroll = document.getElementById('histHourlyScroll');
  scroll.innerHTML = '';

  if (filtered.length) {
    filtered.forEach(h => {
      const hw = wmo(h.code);
      const card = document.createElement('div');
      card.className = 'hourly-card';
      card.innerHTML = `
        <div class="hourly-time">${h.time.substring(0, 5)}</div>
        <div style="font-size:2rem;margin:4px 0">${hw.emoji}</div>
        <div class="hourly-temp">${h.temp != null ? h.temp + unitSym : '—'}</div>
        <div class="hourly-desc">${hw.desc}</div>
        <div class="hourly-meta">
          💧 ${h.humidity ?? '—'}%<br>
          💨 ${h.wind ?? '—'} km/h ${h.windDir != null ? degToCompass(h.windDir) : ''}<br>
          🌧️ ${h.precip ?? 0} mm<br>
          ☁️ ${h.cloud ?? '—'}%<br>
          🌡️ ${h.pressure != null ? Math.round(h.pressure) : '—'} mb
        </div>
      `;
      scroll.appendChild(card);
    });
    document.getElementById('histHourlyCard').style.display = 'block';
  } else {
    document.getElementById('histHourlyCard').style.display = 'none';
  }

  document.getElementById('historicalContent').classList.remove('hidden');
}

/* ============================================================
   WEATHER FORECAST — powered by Open-Meteo (free, no key)
   Geocoding: OpenStreetMap Nominatim
   ============================================================ */
document.getElementById('fetchForecastBtn').addEventListener('click', async () => {
  const query = document.getElementById('forecastLocation').value.trim() || currentQuery;
  const days = parseInt(document.getElementById('forecastDays').value) || 7;

  showLoading('forecast', true);
  hideError('forecast');
  document.getElementById('forecastContent').classList.add('hidden');

  try {
    /* Step 1: Geocode location via Nominatim */
    let lat, lon, locationLabel;
    const latLonMatch = query.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
    if (latLonMatch) {
      lat = parseFloat(latLonMatch[1]);
      lon = parseFloat(latLonMatch[2]);
      locationLabel = `${lat}, ${lon}`;
    } else {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const geoData = await geoRes.json();
      if (!geoData.length) throw new Error(`Location "${query}" not found. Try a different city name.`);
      lat = parseFloat(geoData[0].lat);
      lon = parseFloat(geoData[0].lon);
      const addr = geoData[0].address || {};
      locationLabel = [
        addr.city || addr.town || addr.village || addr.county || geoData[0].name,
        addr.state,
        addr.country
      ].filter(Boolean).join(', ');
    }

    /* Step 2: Fetch forecast from Open-Meteo */
    const tempUnit = currentUnit === 'f' ? 'fahrenheit' : 'celsius';
    const omUrl = new URL('https://api.open-meteo.com/v1/forecast');
    omUrl.searchParams.set('latitude', lat);
    omUrl.searchParams.set('longitude', lon);
    omUrl.searchParams.set('forecast_days', days);
    omUrl.searchParams.set('timezone', 'auto');
    omUrl.searchParams.set('temperature_unit', tempUnit);
    omUrl.searchParams.set('daily', [
      'weathercode', 'temperature_2m_max', 'temperature_2m_min',
      'sunrise', 'sunset', 'uv_index_max', 'precipitation_sum',
      'windspeed_10m_max', 'winddirection_10m_dominant', 'precipitation_probability_max'
    ].join(','));
    omUrl.searchParams.set('hourly', [
      'temperature_2m', 'relativehumidity_2m', 'precipitation',
      'weathercode', 'windspeed_10m', 'winddirection_10m',
      'cloudcover', 'pressure_msl', 'visibility', 'uv_index'
    ].join(','));

    const omRes = await fetch(omUrl.toString());
    if (!omRes.ok) throw new Error(`Forecast service error: HTTP ${omRes.status}`);
    const omData = await omRes.json();

    renderForecast(omData, locationLabel, lat, lon);
  } catch (err) {
    showError('forecast', err.message);
  } finally {
    showLoading('forecast', false);
  }
});

function renderForecast(omData, locationLabel, lat, lon) {
  const unitSym = currentUnit === 'f' ? '°F' : '°C';
  const daily = omData.daily || {};
  const hourly = omData.hourly || {};
  const times = daily.time || [];

  // Location bar
  document.getElementById('forecastLocationBar').innerHTML = `
    <div>
      <div class="forecast-city">${locationLabel}</div>
      <div style="font-size:0.82rem;color:var(--text-muted)">
        ${omData.timezone || ''} &nbsp;·&nbsp; Lat ${lat.toFixed(4)} / Lon ${lon.toFixed(4)}
      </div>
    </div>
    <div style="margin-left:auto;display:flex;align-items:center;gap:10px">
      <div style="font-size:2.2rem">${wmo(daily.weathercode?.[0]).emoji}</div>
      <div>
        <div class="forecast-cur-temp">${daily.temperature_2m_max?.[0] ?? '—'}${unitSym}</div>
        <div class="forecast-cur-desc">${wmo(daily.weathercode?.[0]).desc}</div>
      </div>
    </div>
  `;

  // Build hourly lookup by date string ("2026-02-19")
  const hourlyByDate = {};
  (hourly.time || []).forEach((t, i) => {
    const day = t.split('T')[0];
    if (!hourlyByDate[day]) hourlyByDate[day] = [];
    hourlyByDate[day].push({
      time: t.split('T')[1] || '00:00',
      temp: hourly.temperature_2m?.[i],
      humidity: hourly.relativehumidity_2m?.[i],
      precip: hourly.precipitation?.[i],
      code: hourly.weathercode?.[i],
      wind: hourly.windspeed_10m?.[i],
      windDir: hourly.winddirection_10m?.[i],
      cloud: hourly.cloudcover?.[i],
      pressure: hourly.pressure_msl?.[i],
      vis: hourly.visibility?.[i],
      uv: hourly.uv_index?.[i],
    });
  });

  // Day cards
  const daysRow = document.getElementById('forecastDaysRow');
  daysRow.innerHTML = '';

  times.forEach((dateStr, idx) => {
    const code = daily.weathercode?.[idx];
    const maxT = daily.temperature_2m_max?.[idx];
    const minT = daily.temperature_2m_min?.[idx];
    const sunrise = (daily.sunrise?.[idx] || '').split('T')[1] || '';
    const sunset = (daily.sunset?.[idx] || '').split('T')[1] || '';
    const uv = daily.uv_index_max?.[idx] ?? '—';
    const precip = daily.precipitation_sum?.[idx] ?? 0;
    const wind = daily.windspeed_10m_max?.[idx] ?? '—';
    const rain = daily.precipitation_probability_max?.[idx];
    const w = wmo(code);

    const card = document.createElement('div');
    card.className = 'forecast-day-card';
    card.dataset.date = dateStr;
    card.innerHTML = `
      <div class="forecast-date">${formatDate(dateStr)}</div>
      <div style="font-size:2.8rem;margin:6px 0">${w.emoji}</div>
      <div class="forecast-desc">${w.desc}</div>
      <div class="forecast-temps">
        <span class="forecast-max">${maxT ?? '—'}${unitSym}</span>
        <span class="forecast-min">${minT ?? '—'}${unitSym}</span>
      </div>
      <div class="forecast-extra">
        <span>🌅 ${sunrise} / 🌇 ${sunset}</span>
        <span>☀️ UV ${uv} &nbsp;·&nbsp; 💨 ${wind} km/h</span>
        <span>🌧️ ${precip} mm${rain != null ? ' &nbsp;·&nbsp; 💧 ' + rain + '%' : ''}</span>
      </div>
    `;

    card.addEventListener('click', () => {
      daysRow.querySelectorAll('.forecast-day-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      renderForecastHourly(hourlyByDate[dateStr] || [], dateStr, unitSym);
    });

    daysRow.appendChild(card);
    if (idx === 0) {
      card.classList.add('selected');
      renderForecastHourly(hourlyByDate[dateStr] || [], dateStr, unitSym);
    }
  });

  document.getElementById('forecastContent').classList.remove('hidden');
}

function renderForecastHourly(hourlyArr, dateStr, unitSym) {
  document.getElementById('forecastSelectedDay').textContent = formatDate(dateStr);
  const scroll = document.getElementById('forecastHourlyScroll');
  scroll.innerHTML = '';
  if (!hourlyArr.length) {
    scroll.innerHTML = '<p style="color:var(--text-muted);padding:20px">No hourly data for this day.</p>';
    return;
  }
  hourlyArr.forEach(h => {
    const w = wmo(h.code);
    const card = document.createElement('div');
    card.className = 'hourly-card';
    card.innerHTML = `
      <div class="hourly-time">${h.time.substring(0, 5)}</div>
      <div style="font-size:2rem;margin:4px 0">${w.emoji}</div>
      <div class="hourly-temp">${h.temp != null ? h.temp + unitSym : '—'}</div>
      <div class="hourly-desc">${w.desc}</div>
      <div class="hourly-meta">
        💧 ${h.humidity ?? '—'}%<br>
        💨 ${h.wind ?? '—'} km/h ${h.windDir != null ? degToCompass(h.windDir) : ''}<br>
        🌧️ ${h.precip ?? 0} mm<br>
        ☁️ ${h.cloud ?? '—'}%<br>
        🌡️ ${h.pressure != null ? Math.round(h.pressure) : '—'} mb<br>
        ☀️ UV ${h.uv ?? '—'}
      </div>
    `;
    scroll.appendChild(card);
  });
}

/* ============================================================
   LOCATION LOOKUP TAB — powered by OpenStreetMap Nominatim
   (Free, no API key, no plan restriction, no CORS issues)
   ============================================================ */
document.getElementById('fetchAutoBtn').addEventListener('click', async () => {
  await doLocationLookup();
});

document.getElementById('autoInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLocationLookup();
});

async function doLocationLookup() {
  const q = document.getElementById('autoInput').value.trim();
  if (!q) { showError('auto', 'Please enter a search term.'); return; }

  showLoading('auto', true);
  hideError('auto');
  document.getElementById('autoResults').classList.add('hidden');

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=12&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    const results = await res.json();
    renderAutoResults(results, q);
  } catch (err) {
    showError('auto', `Location search failed: ${err.message}`);
  } finally {
    showLoading('auto', false);
  }
}

function renderAutoResults(results, q) {
  const count = results.length;
  document.getElementById('autoResultsCount').textContent =
    count ? `${count} location${count > 1 ? 's' : ''} found for "${q}" — powered by OpenStreetMap` : `No results found for "${q}"`;

  const grid = document.getElementById('locationCardsGrid');

  if (!count) {
    grid.innerHTML = `<p style="color:var(--text-muted);padding:20px 0">Try a different search term, e.g. a city name or country.</p>`;
    document.getElementById('autoResults').classList.remove('hidden');
    return;
  }

  grid.innerHTML = results.map(r => {
    const addr = r.address || {};
    const city = addr.city || addr.town || addr.village || addr.county || addr.municipality || r.name || 'Unknown';
    const region = addr.state || addr.region || addr.province || '';
    const country = addr.country || '';
    const postcode = addr.postcode ? ` · ${addr.postcode}` : '';
    const lat = parseFloat(r.lat).toFixed(5);
    const lon = parseFloat(r.lon).toFixed(5);
    const type = (r.type || r.class || '').replace(/_/g, ' ');
    const importance = r.importance ? `${(r.importance * 100).toFixed(0)}%` : '';

    return `
      <div class="location-result-card">
        <div class="loc-name">${city}</div>
        <div class="loc-region">${region ? region + ', ' : ''}${country}${postcode}</div>
        <div class="loc-meta-row">
          <div class="loc-meta-chip">🌐 <strong>Lat&nbsp;</strong>${lat}</div>
          <div class="loc-meta-chip">📍 <strong>Lon&nbsp;</strong>${lon}</div>
          ${type ? `<div class="loc-meta-chip">🏷️ ${type}</div>` : ''}
          ${importance ? `<div class="loc-meta-chip">⭐ ${importance}</div>` : ''}
        </div>
        <button class="loc-use-btn" onclick="useLocation('${lat},${lon}', '${escapeAttr(city)}${country ? ', ' + escapeAttr(country) : ''}')">
          ⚡ View Weather
        </button>
      </div>
    `;
  }).join('');

  document.getElementById('autoResults').classList.remove('hidden');
}

function useLocation(latlon, label) {
  searchInput.value = label;
  currentQuery = latlon;
  // Switch to current tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tabCurrent').classList.add('active');
  document.getElementById('panelCurrent').classList.add('active');
  loadCurrentWeather(latlon);
}

/* ============================================================
   SHARED HELPERS
   ============================================================ */

function createHourlyCard(h, unitSym) {
  const card = document.createElement('div');
  card.className = 'hourly-card';
  const timeNum = parseInt(h.time);
  const hhmm = `${String(Math.floor(timeNum / 100)).padStart(2, '0')}:00`;
  const icon = h.weather_icons && h.weather_icons[0] ? h.weather_icons[0] : '';
  const desc = h.weather_descriptions && h.weather_descriptions[0] ? h.weather_descriptions[0] : '';

  card.innerHTML = `
    <div class="hourly-time">${hhmm}</div>
    ${icon ? `<img class="hourly-icon" src="${icon}" alt="${desc}" />` : ''}
    <div class="hourly-temp">${h.temperature}${unitSym}</div>
    <div class="hourly-desc">${desc}</div>
    <div class="hourly-meta">
      💧 ${h.humidity}%<br>
      💨 ${h.wind_speed} km/h ${h.wind_dir}<br>
      🌧️ ${h.precip} mm<br>
      👁️ ${h.visibility} km<br>
      🌡️ ${h.pressure} mb
    </div>
  `;
  return card;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeAttr(s) {
  return String(s).replace(/'/g, "\\'");
}

function showLoading(panel, show) {
  const id = `loading${capitalize(panel)}`;
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('hidden', !show);
}

function showError(panel, msg) {
  const id = `error${capitalize(panel)}`;
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = `⚠️ Error: ${msg}`;
  el.classList.remove('hidden');
}

function hideError(panel) {
  const id = `error${capitalize(panel)}`;
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

/* ============================================================
   BACKGROUND PARTICLES
   ============================================================ */
function initParticles() {
  const container = document.getElementById('bgParticles');
  const count = 35;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    const size = Math.random() * 3 + 1;
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const dur = (Math.random() * 20 + 15).toFixed(1);
    const del = (Math.random() * 10).toFixed(1);
    Object.assign(p.style, {
      position: 'absolute',
      width: `${size}px`, height: `${size}px`,
      borderRadius: '50%',
      background: `rgba(${Math.random() > 0.5 ? '96,165,250' : '167,139,250'}, ${Math.random() * 0.5 + 0.1})`,
      left: `${x}%`, top: `${y}%`,
      animation: `particleDrift ${dur}s ${del}s ease-in-out infinite alternate`
    });
    container.appendChild(p);
  }

  // Inject keyframes
  const style = document.createElement('style');
  style.textContent = `
    @keyframes particleDrift {
      from { transform: translate(0, 0) scale(1); opacity: 0.3; }
      to   { transform: translate(${Math.random() > 0.5 ? '' : '-'}${(Math.random() * 40 + 20).toFixed(0)}px, ${Math.random() > 0.5 ? '' : '-'}${(Math.random() * 40 + 20).toFixed(0)}px) scale(1.2); opacity: 0.7; }
    }
  `;
  document.head.appendChild(style);
}

/* ============================================================
   INIT
   ============================================================ */
initParticles();
loadCurrentWeather(currentQuery);
