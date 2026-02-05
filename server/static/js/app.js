/**
 * StrasBoard Dashboard Application
 * Alpine.js data-driven dashboard
 */

// Formatters
const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const df = new Intl.DurationFormat(undefined, { style: 'narrow' });

// Parse error message
function parseErrorMessage(msg) {
  if (!msg || typeof msg !== 'string') return msg || 'Unknown error';
  // Remove HTML tags and common prefixes
  return msg.split(/<[^>]+>|:\s+/).map(p => p.trim()).filter(p => p).join(': ');
}

// Format departure time for display
function formatDepartureTime(isoTime) {
  const diff = (new Date(isoTime) - Date.now()) / 1000;
  if (diff < -15) return null;
  if (diff < 15) return rtf.format(0, 'second');
  const mins = Math.floor(diff / 60);
  if (mins < 3) {
    const secs = Math.floor(diff % 60);
    return df.format({ minutes: mins, seconds: secs });
  }
  const hours = Math.floor(mins / 60);
  return df.format({ hours, minutes: mins % 60 });
}

// Format day label (e.g., "Mon 5")
function formatDayLabel(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString(undefined, { weekday: 'short' }) + ' ' + date.getDate();
}

// Format month label (e.g., "January")
function formatMonthLabel(dateStr) {
  const [year, month] = dateStr.split('-');
  return new Date(year, parseInt(month) - 1, 1).toLocaleDateString(undefined, { month: 'long' });
}

// Get tempo color for a date
function getTempoColor(tempoData, date) {
  const dateStr = date.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
  return tempoData?.find(t => t.date === dateStr)?.color || 'unknown';
}

// Tariff order for stacking
const TARIFF_ORDER = { HC: 5, HP: 1, BUHC: 8, BUHP: 4, BCHC: 7, BCHP: 3, RHC: 6, RHP: 2 };
const TARIFF_KEYS = Object.keys(TARIFF_ORDER);

// Analyze consumption entries into segments
function analyzeConsumption(entries) {
  const usedTariffs = new Set();
  const results = entries.map(entry => {
    let total = 0;
    const segments = [];
    for (const k of TARIFF_KEYS) {
      const v = entry[k] || 0;
      if (v > 0) {
        total += v;
        segments.push({ key: k, value: v, order: TARIFF_ORDER[k] });
        usedTariffs.add(k);
      }
    }
    segments.sort((a, b) => a.order - b.order);
    return { entry, total, segments };
  });
  return { results, usedTariffs };
}

// Alpine.js initialization
document.addEventListener('alpine:init', () => {

  Alpine.data('dashboard', () => ({
    // State
    timestamp: null,

    // Weather
    weather: {
      loading: true,
      error: null,
      warning: null,
      current: null,
      hourly: [],
      daily: []
    },

    // Transport - placeholder data shown while loading
    transport: {
      loading: true,
      error: null,
      warning: null,
      stops: [
        { id: 0, line: '?', name: '--', color: '#555', colorText: '#888', destinations: [{ name: '--', departures: [] }] },
        { id: 1, line: '?', name: '--', color: '#555', colorText: '#888', destinations: [{ name: '--', departures: [] }] },
        { id: 2, line: '?', name: '--', color: '#555', colorText: '#888', destinations: [{ name: '--', departures: [] }] }
      ]
    },

    // Temperature
    temperature: {
      loading: true,
      error: null,
      warning: null,
      value: '--',
      humidity: '--'
    },

    // Electricity - placeholder data
    electricity: {
      loading: true,
      error: null,
      warning: null,
      days: [],
      months: [],
      last7: Array(7).fill(null).map((_, i) => ({
        date: new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10),
        segments: [{ key: 'HC', value: 5 + Math.random() * 10 }],
        total: 10
      })),
      prev7: Array(7).fill(null).map(() => ({
        segments: [{ key: 'HC', value: 5 + Math.random() * 10 }],
        total: 10
      })),
      currentMonth: { segments: [{ key: 'HC', value: 100 }], total: 100, label: '--' },
      prevMonth: { segments: [{ key: 'HC', value: 80 }], total: 80, label: '--' },
      estimation: null,
      usedTariffs: ['HC'],
      dailyMax: 20,
      monthlyMax: 100
    },

    // Tempo
    tempo: {
      loading: true,
      data: []
    },

    // Lifecycle
    init() {
      // Set document language for i18n
      document.documentElement.lang = navigator.language || 'en';

      // Initial fetch
      this.refresh();

      // Refresh every minute
      setInterval(() => this.refresh(), 60000);

      // Update transport times every second
      setInterval(() => this.tickTransportTimes(), 1000);
    },

    // Data Fetching
    async refresh() {
      try {
        const resp = await fetch('/api/all');
        const data = await resp.json();

        this.timestamp = data.timestamp;
        this.updateWeather(data.weather);
        this.updateTransport(data.transport);
        this.updateTemperature(data.temperature);
        this.updateElectricity(data.electricity);
        this.updateTempo(data.tempo);

      } catch (e) {
        console.error('Fetch error:', e);
      }
    },

    // Weather
    updateWeather(resp) {
      const hasData = resp?.data && (resp.data.current || resp.data.hourly?.length);
      const errorMsg = resp?.error ? parseErrorMessage(resp.error) : null;

      if (errorMsg && !hasData) {
        this.weather = { ...this.weather, loading: true, error: errorMsg, warning: null };
        return;
      }

      const d = resp?.data || {};
      this.weather = {
        loading: false,
        error: null,
        warning: hasData && errorMsg ? errorMsg : null,  // Degraded mode
        current: d.current || null,
        hourly: d.hourly || [],
        daily: d.daily || []
      };

      // Render graph after data update
      this.$nextTick(() => {
        const container = this.$refs.weatherGraph;
        if (container && this.weather.hourly.length > 1) {
          WeatherGraph.render(container, {
            hourly: this.weather.hourly,
            daily: this.weather.daily
          });
        }
      });
    },

    // Transport
    updateTransport(resp) {
      const hasData = resp?.data?.stops?.length > 0;
      const errorMsg = resp?.error ? parseErrorMessage(resp.error) : null;

      if (errorMsg && !hasData) {
        this.transport = { ...this.transport, loading: true, error: errorMsg, warning: null };
        return;
      }

      const stops = resp?.data?.stops || [];
      this.transport = {
        loading: false,
        error: null,
        warning: hasData && errorMsg ? errorMsg : null,
        stops: stops.map(s => ({
          id: s.id,
          line: s.line,
          name: s.name,
          color: s.color,
          colorText: s.color_text,
          destinations: s.destinations || []
        }))
      };
    },

    async fetchLiveTransport(stopId) {
      try {
        const resp = await fetch(`/api/transport/live?id=${stopId}`);
        const data = await resp.json();

        if (data?.data?.destinations) {
          const stop = this.transport.stops.find(s => s.id === stopId);
          if (stop) {
            stop.destinations = data.data.destinations;
          }
        }
      } catch (e) {
        console.error('Live transport error:', e);
      }
    },

    tickTransportTimes() {
      // Force reactivity update for time displays
      this.transport.stops = [...this.transport.stops];
    },

    formatTime(isoTime) {
      return formatDepartureTime(isoTime);
    },

    getVisibleDepartures(departures) {
      return (departures || [])
        .filter(d => formatDepartureTime(d.time) !== null)
        .slice(0, 3);
    },

    // Temperature
    updateTemperature(resp) {
      const hasData = resp?.data && (resp.data.temperature != null);
      const errorMsg = resp?.error ? parseErrorMessage(resp.error) : null;

      // Error-only: keep placeholder visible
      if (errorMsg && !hasData) {
        this.temperature = { ...this.temperature, loading: true, error: errorMsg, warning: null };
        return;
      }

      const d = resp?.data || {};
      this.temperature = {
        loading: false,
        error: null,
        warning: hasData && errorMsg ? errorMsg : null,  // Degraded mode
        value: d.temperature ?? '--',
        humidity: d.humidity ?? '--'
      };
    },

    // Electricity
    updateElectricity(resp) {
      const hasData = resp?.data?.days?.length > 0 && resp?.data?.months?.length > 0;
      const errorMsg = resp?.error ? parseErrorMessage(resp.error) : null;

      // Error-only: keep placeholder visible
      if (errorMsg && !hasData) {
        this.electricity.loading = true;
        this.electricity.error = errorMsg;
        this.electricity.warning = null;
        return;
      }

      const d = resp?.data || {};
      if (!d.days?.length || !d.months?.length) {
        this.electricity.loading = true;
        this.electricity.error = 'No data';
        return;
      }

      const days = d.days;
      const months = d.months;

      const last7 = days.slice(-7);
      const prev7 = days.slice(-14, -7);
      const { results: last7Data, usedTariffs: dailyTariffs } = analyzeConsumption(last7);
      const { results: prev7Data } = analyzeConsumption(prev7);
      const { results: monthsData, usedTariffs: monthlyTariffs } = analyzeConsumption(months);

      const allUsedTariffs = [...new Set([...dailyTariffs, ...monthlyTariffs])];

      // Daily max
      const dailyMax = Math.max(...last7Data.map(d => d.total), ...prev7Data.map(d => d.total), 1);

      // Monthly data
      const currentMonthData = monthsData[monthsData.length - 1];
      const prevMonthData = monthsData.length > 1 ? monthsData[monthsData.length - 2] : null;
      const currentMonth = months[months.length - 1];
      const prevMonth = months.length > 1 ? months[months.length - 2] : null;

      // Estimation
      const [lastMonthYear, lastMonthNum] = currentMonth.date.split('-');
      const daysInMonth = new Date(lastMonthYear, lastMonthNum, 0).getDate();
      const [, lastDayMonth, lastDayNum] = last7[last7.length - 1].date.split('-');
      const daysWithData = lastDayMonth === lastMonthNum ? parseInt(lastDayNum) : daysInMonth;
      const hasEstimation = daysWithData < daysInMonth;
      const estimationTotal = hasEstimation
        ? Math.round(currentMonthData.total * daysInMonth / daysWithData)
        : currentMonthData.total;

      const monthlyMax = Math.max(prevMonthData?.total || 0, estimationTotal, 1);

      const warning = (hasData && errorMsg) ? errorMsg : (resp.warning || null);

      this.electricity = {
        loading: false,
        error: null,
        warning,
        days,
        months,
        last7: last7Data.map((d, i) => ({
          date: d.entry.date,
          segments: d.segments,
          total: d.total
        })),
        prev7: prev7Data.map(d => ({
          segments: d.segments,
          total: d.total
        })),
        currentMonth: {
          segments: currentMonthData.segments,
          total: currentMonthData.total,
          label: formatMonthLabel(currentMonth.date),
          pct: (currentMonthData.total / monthlyMax) * 100
        },
        prevMonth: prevMonthData ? {
          segments: prevMonthData.segments,
          total: prevMonthData.total,
          label: formatMonthLabel(prevMonth.date),
          pct: (prevMonthData.total / monthlyMax) * 100
        } : null,
        estimation: hasEstimation ? {
          total: estimationTotal,
          pct: (estimationTotal / monthlyMax) * 100
        } : null,
        usedTariffs: TARIFF_KEYS.filter(k => allUsedTariffs.includes(k)),
        dailyMax,
        monthlyMax
      };
    },

    barHeight(total) {
      return Math.round((total / this.electricity.dailyMax) * 100);
    },

    // Tempo
    updateTempo(resp) {
      this.tempo = {
        loading: false,
        data: resp?.data || []
      };
    },

    tempoColor(daysFromNow) {
      const date = new Date(Date.now() + daysFromNow * 86400000);
      return getTempoColor(this.tempo.data, date);
    },

    relativeDay(days) {
      return rtf.format(days, 'day');
    },

    // Formatters
    formatDay(dateStr) {
      return formatDayLabel(dateStr);
    }
  }));
});
