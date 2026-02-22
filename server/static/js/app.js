/**
 * StrasBoard - Dashboard Application
 *
 * Architecture:
 * - Each widget has: { data, error }
 * - data is null until first successful fetch (loading state)
 * - data + error together = degraded mode (cached data, fresh error)
 * - API response parsing is done per-source in parse functions
 * - Alpine.js renders directly from these clean structures
 */

/*
  RESPONSE PARSING
*/

// Generic response handler
function parseResponse(resp, transform) {
  const data = resp?.data != null ? transform(resp.data) : null;
  const error = resp?.error || (!data ? 'No data' : null);
  return { data, error };
}

// Weather
function parseWeather(resp) {
  return parseResponse(resp, (d) => ({
    current: d.current ?? null,
    hourly: d.hourly ?? [],
    daily: d.daily ?? [],
  }));
}

// Temperature
function parseTemperature(resp) {
  return parseResponse(resp, (d) => ({
    temperature: d.temperature,
    humidity: d.humidity,
    location: d.location ?? null,
  }));
}

// Transport
function parseTransport(resp) {
  return parseResponse(resp, (d) => ({
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
}

// Electricity
function parseElectricity(resp) {
  const normalize = (entry) => ({
    date: entry.date,
    bchc: entry.BCHC ?? 0,
    bchp: entry.BCHP ?? 0,
    buhc: entry.BUHC ?? 0,
    buhp: entry.BUHP ?? 0,
    rhc: entry.RHC ?? 0,
    rhp: entry.RHP ?? 0,
  });

  return parseResponse(resp, (d) => ({
    days: (d.days ?? []).slice(-14).map(normalize),
    months: (d.months ?? []).slice(-2).map(normalize),
  }));
}

// Tempo
function parseTempo(resp) {
  return parseResponse(resp, (d) => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
    const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
    const find = (date) => (d ?? []).find((t) => t.date === date)?.color ?? null;
    return {
      today: find(today),
      tomorrow: find(tomorrow),
    };
  });
}

/*
  ALPINE COMPONENT
*/

document.addEventListener('alpine:init', () => {
  Alpine.data('dashboard', () => ({

    // Global
    timestamp: null,
    now: Date.now(),

    // Widget states
    weather:     { data: null, error: null },
    temperature: { data: null, error: null },
    transport:   { data: null, error: null },
    electricity: { data: null, error: null },
    tempo:       { data: null, error: null },

    init() {
      document.documentElement.lang = navigator.language || 'en';
      this.refresh();
      setInterval(() => this.refresh(), 10_000);
      setInterval(() => { this.now = Date.now(); }, 1_000);
    },

    async refresh() {
      try {
        const resp = await fetch('/api/all');
        const all = await resp.json();

        this.timestamp = all.timestamp;
        this.weather     = parseWeather(all.weather);
        this.temperature = parseTemperature(all.temperature);
        this.transport   = parseTransport(all.transport);
        this.electricity = parseElectricity(all.electricity);
        this.tempo       = parseTempo(all.tempo);
      } catch (e) {
        console.error('Fetch failed:', e);
      }
    },

    // Transport: fetch live departures for a specific stop
    async refreshStop(stopId) {
      try {
        const resp = await fetch(`/api/transport/live?id=${stopId}`);
        const result = await resp.json();
        if (result?.data?.destinations) {
          const newDests = result.data.destinations;
          this.transport.data?.stops?.forEach((row) => {
            if (row.id !== stopId) return;
            const match = newDests.find((d) => d.name === row.destination);
            if (match) row.departures = match.departures ?? [];
          });
        }
      } catch (e) {
        console.error('Live transport fetch failed:', e);
      }

      // Flash all rows with this stop id
      document.querySelectorAll(`.transport-row[data-stop-id="${stopId}"]`).forEach((el) => {
        el.classList.remove('refreshed');
        void el.offsetWidth;
        el.classList.add('refreshed');
      });
    },

    // Transport: filter past departures and limit to 3 upcoming
    getActiveDepartures(departures, _now) {
      return departures
        .filter((dep) => new Date(dep.time).getTime() - _now > -10_000)
        .slice(0, 3);
    },

    // Format departure as countdown
    formatDeparture(isoTime, _now) {
      const secs = Math.round((new Date(isoTime).getTime() - _now) / 1000);
      if (secs <= 20) return '';
      if (secs < 60) return `${secs} s`;
      const mins = Math.floor(secs / 60);
      const hours = Math.floor(mins / 60);
      if (hours > 0) return `${hours}h${String(mins % 60).padStart(2, '0')}`;
      return `${mins} min`;
    },
  }));
});
