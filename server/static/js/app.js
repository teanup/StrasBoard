// Tariff helpers
function toSegments(entry) {
  return Object.entries(entry)
    .filter(([k]) => k !== 'date')
    .map(([tariff, value]) => ({ tariff, value }));
}

function entryTotal(entry) {
  return toSegments(entry).reduce((sum, s) => sum + s.value, 0);
}

// Response parsing
function parseResponse(resp, transform) {
  const data = resp?.data ? transform(resp.data) : null;
  const error = resp?.error || (!data ? 'No data' : null);
  return { data, error };
}

const parseWeather = (resp) => parseResponse(resp, (d) => {
  return formatWeather(d.current ?? null, d.hourly ?? [], d.daily ?? []);
});

function formatWeather(current, hourly, daily) {
  let graph = null;
  if (hourly.length > 1) {
    const temps = hourly.map(h => h.temperature);
    const dataMin = Math.min(...temps);
    const dataMax = Math.max(...temps);

    const ceilMax = Math.ceil(dataMax + 0.5);
    const floorMin = Math.floor(dataMin - 0.5);
    const r = ceilMax - floorMin;
    const gap = r <= 6 ? 1 : r <= 14 ? 2 : r <= 24 ? 4 : 5;
    const top = Math.round(ceilMax / gap) * gap;
    const bottom = -Math.round(-floorMin / gap) * gap;
    const graphMax = Math.max(top, dataMax + gap / 2);
    const graphMin = Math.min(bottom, dataMin - gap / 2);
    const graphRange = graphMax - graphMin;

    const yLines = [];
    for (let v = bottom; v <= top; v += gap) {
      yLines.push({ y: (v - graphMin) / graphRange * 100, label: `${v}°` });
    }

    const toY = (t) => (100 - (t - graphMin) / graphRange * 100).toFixed(2);
    const segments = [];
    const fillCoords = ['0% 100%'];
    for (let i = 0; i < hourly.length - 1; i++) {
      const h = hourly[i];
      const d = new Date(h.time);
      const hour = d.getHours();
      const hh = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

      if (i === 0) fillCoords.push(`0% ${toY(h.temperature)}%`);
      fillCoords.push(`${(i + 1) / (hourly.length - 1) * 100}% ${toY(hourly[i + 1].temperature)}%`);

      const seg = {
        label: `${hh} \u00b7 ${Math.round(h.temperature * 10) / 10}\u00b0C \u00b7 code ${h.code}`,
      };
      if (hour === 0) {
        seg.tick = d.toLocaleDateString(undefined, { weekday: 'short' }) + ' ' + d.getDate();
        seg.main = true;
      } else if (hour === 8 || hour === 14 || hour === 20) {
        seg.tick = `${hour}h`;
      }
      segments.push(seg);
    }
    fillCoords.push('100% 100%');
    const fill = `clip-path:polygon(${fillCoords.join(',')})`;

    graph = { fill, segments, yLines };
  }
  return { current, hourly, daily, graph };
}

const parseTemperature = (resp) => parseResponse(resp, (d) => ({
  temperature: d.temperature,
  humidity: d.humidity,
  location: d.location ?? null,
}));

const parseTransport = (resp) => parseResponse(resp, (d) => ({
  stops: (d.stops ?? []).flatMap((stop) =>
    (stop.destinations?.length ? stop.destinations : [{ name: '', departures: [] }])
      .map((dest) => ({
        id: stop.id,
        stop: stop.name,
        line: stop.line,
        color: stop.color,
        colorText: stop.color_text,
        destination: dest.name,
        departures: dest.departures ?? [],
      }))
  ),
}));

function parseElectricity(resp) {
  const normalize = (entry) => ({
    date: entry.date,
    hp: entry.HP ?? 0, hc: entry.HC ?? 0,
    rhp: entry.RHP ?? 0, rhc: entry.RHC ?? 0,
    bchp: entry.BCHP ?? 0, bchc: entry.BCHC ?? 0,
    buhp: entry.BUHP ?? 0, buhc: entry.BUHC ?? 0,
  });

  return parseResponse(resp, (d) => {
    const days = (d.days ?? []).slice(-14).map(normalize);
    const months = (d.months ?? []).slice(-2).map(normalize);
    return formatElectricity(months, days);
  });
}

function formatElectricity(months, days) {
  const monthBars = months.map((m, i) => {
    const d = new Date(m.date + '-15');
    const title = d.toLocaleDateString(undefined, { month: 'long' });
    const bar = { title, segments: toSegments(m) };

    if (i === months.length - 1 && days.length > 0) {
      const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const lastDay = new Date(days[days.length - 1].date);
      const daysWithData = lastDay.getMonth() === d.getMonth() ? lastDay.getDate() : daysInMonth;
      if (daysWithData > 0 && daysWithData < daysInMonth) {
        bar.ext = Math.round(entryTotal(m) * daysInMonth / daysWithData) - entryTotal(m);
      }
    }
    return bar;
  });

  const monthMax = monthBars.reduce((mx, b) => {
    const total = b.segments.reduce((s, seg) => s + seg.value, 0);
    return Math.max(mx, total + (b.ext ?? 0));
  }, 0);

  const current7 = days.slice(-7);
  const prev7 = days.slice(-14, -7);
  const dayGroups = current7.map((day, i) => {
    const d = new Date(day.date + 'T12:00:00');
    const title = ' ' + d.toLocaleDateString(undefined, { weekday: 'short' }) + ' ' + d.getDate();
    const bars = [];
    if (prev7[i]) bars.push({ segments: toSegments(prev7[i]), dim: true });
    bars.push({ segments: toSegments(day) });
    return { title, bars };
  });

  const dayMax = days.slice(-14).reduce((mx, d) => Math.max(mx, entryTotal(d)), 0);
  const allEntries = [...months, ...days];
  const legend = Object.keys(allEntries[0] ?? {})
    .filter(k => k !== 'date' && allEntries.some(e => e[k] > 0));

  return { monthBars, monthMax, dayGroups, dayMax, legend };
}

const parseTempo = (resp) => parseResponse(resp, (d) => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
  const find = (date) => (d ?? []).find((t) => t.date === date)?.color ?? null;
  return { today: find(today), tomorrow: find(tomorrow) };
});


document.addEventListener('alpine:init', () => {
  Alpine.data('dashboard', () => ({
    timestamp: null,
    now: Date.now(),
    weather: { data: null, error: null },
    temperature: { data: null, error: null },
    transport: { data: null, error: null },
    electricity: { data: null, error: null },
    tempo: { data: null, error: null },

    init() {
      document.documentElement.lang = navigator.language || 'en';
      this.refresh();
      setInterval(() => this.refresh(), 60_000);
      setInterval(() => { this.now = Date.now(); }, 1_000);
    },

    async refresh() {
      try {
        const all = await fetch('/api/all').then(r => r.json());
        this.timestamp = all.timestamp;
        this.weather = parseWeather(all.weather);
        this.temperature = parseTemperature(all.temperature);
        this.transport = parseTransport(all.transport);
        this.electricity = parseElectricity(all.electricity);
        this.tempo = parseTempo(all.tempo);
      } catch (e) {
        console.error('Fetch failed:', e);
      }
    },

    async refreshStop(stopId) {
      try {
        const result = await fetch(`/api/transport/live?id=${stopId}`).then(r => r.json());
        if (result?.data?.destinations) {
          this.transport.data?.stops?.forEach((row) => {
            if (row.id !== stopId) return;
            const match = result.data.destinations.find((d) => d.name === row.destination);
            if (match) row.departures = match.departures ?? [];
          });
        }
      } catch (e) {
        console.error('Live transport fetch failed:', e);
      }

      document.querySelectorAll(`.transport-row[data-stop-id="${stopId}"]`).forEach((el) => {
        el.classList.remove('refreshed');
        void el.offsetWidth;
        el.classList.add('refreshed');
      });
    },

    getActiveDepartures(departures, _now) {
      return departures
        .filter((dep) => new Date(dep.time).getTime() - _now > -20_000)
        .slice(0, 3);
    },

    formatDeparture(isoTime, _now) {
      const secs = Math.round((new Date(isoTime).getTime() - _now) / 1000);
      if (secs <= 20) return '';
      if (secs < 60) return `${secs} s`;
      const mins = Math.floor(secs / 60);
      if (mins < 60) return `${mins} min`;
      const hours = Math.floor(mins / 60);
      return `${hours}h${String(mins % 60).padStart(2, '0')}`;
    },

    barSegments(segments) {
      return segments.filter(s => s.value > 0);
    },

    segStyle(seg, max) {
      return max <= 0 ? 'display:none' : `flex-basis:${seg.value / max * 100}%`;
    },

    extStyle(bar, max) {
      return !bar.ext || max <= 0 ? 'display:none' : `flex-basis:${bar.ext / max * 100}%`;
    },

    barTotal(bar) {
      return bar.segments.reduce((sum, s) => sum + s.value, 0);
    },

    showExtLabel(bar, max) {
      return bar.ext > 0 && bar.ext / max > 0.05;
    },
  }));
});
