/**
 * Weather Graph Renderer
 * Renders temperature line graph with weather category backgrounds
 */

const WeatherGraph = {
  // Weather category groupings (returns representative code for background color)
  categoryCode(code) {
    if ([0, 1].includes(code)) return 1;
    if ([2, 3].includes(code)) return 3;
    if ([45, 48].includes(code)) return 45;
    if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return 63;
    if ([56, 57, 66, 67].includes(code)) return 67;
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 73;
    if ([95, 96, 99].includes(code)) return 95;
    return null;
  },

  /**
   * Render the weather graph
   * @param {HTMLElement} container - Container element
   * @param {Object} data - { hourly: [...], daily: [...] }
   * @param {number} height - Total height in pixels
   */
  render(container, { hourly = [], daily = [] }, height = 150) {
    if (!hourly.length) {
      container.innerHTML = '';
      return;
    }

    const n = hourly.length;
    const graphH = height - 45;
    
    // Visible range (skip padding hours at edges)
    const firstVisible = 1, lastVisible = n - 2;

    // Y-axis calculations
    const temps = hourly.map(h => h.temperature);
    const dataMin = Math.min(...temps);
    const dataMax = Math.max(...temps);
    const dataRange = dataMax - dataMin;
    
    const stepCount = Math.min(Math.ceil(Math.log2(1.6 * (Math.ceil(dataRange) + 1)) + 1), 8);
    const margin = Math.min(Math.floor(dataRange / 5) + 1, 3) / 2;
    const span = Math.ceil(dataRange + 2 * margin);
    const gap = Math.ceil(span / (stepCount - 1));
    
    let yMin = Math.floor(dataMin - margin);
    let yMax = yMin + span;
    if (yMax - dataMax < dataMin - yMin) {
      yMax = Math.ceil(dataMax + margin);
      yMin = yMax - span;
    }

    // Scaling functions
    const xPct = i => (i - 0.5) / (n - 2) * 100;
    const yPct = v => (1 - (v - yMin) / span) * 100;

    // Group consecutive hours by weather category
    const groups = [];
    for (let i = firstVisible; i <= lastVisible; i++) {
      const h = hourly[i];
      const cat = this.categoryCode(h.code);
      const last = groups[groups.length - 1];
      if (last && last.cat === cat && (cat !== 1 || last.isDay === h.is_day)) {
        last.end = i;
      } else {
        groups.push({ cat, start: i, end: i, isDay: h.is_day });
      }
    }

    // Find current time position
    const times = hourly.map(h => new Date(h.time).getTime());
    const now = Date.now();
    let nowIdx = -1;
    for (let i = 0; i < n - 1; i++) {
      if (now >= times[i] && now < times[i + 1]) {
        nowIdx = i + (now - times[i]) / (times[i + 1] - times[i]);
        break;
      }
    }

    // Build DOM
    const graph = document.createElement('div');
    graph.className = 'graph';
    graph.style.height = height + 'px';
    graph.style.setProperty('--graph-h', graphH + 'px');

    // Y-axis labels
    let yLabels = '';
    for (let v = yMin; v <= yMin + span; v += gap) {
      yLabels += `<span style="top:${yPct(v)}%">${v}°</span>`;
    }
    graph.innerHTML = `<div class="graph-y">${yLabels}</div>`;

    // Content wrapper
    const content = document.createElement('div');
    content.className = 'graph-content';

    // Graph area
    const area = document.createElement('div');
    area.className = 'graph-area';

    // Category backgrounds
    groups.filter(g => g.cat !== null).forEach(g => {
      const left = g.start === firstVisible ? 0 : (xPct(g.start - 1) + xPct(g.start)) / 2;
      const right = g.end === lastVisible ? 100 : (xPct(g.end) + xPct(g.end + 1)) / 2;
      const div = document.createElement('div');
      div.className = 'graph-bg';
      div.setAttribute('data-weather', g.cat);
      div.style.cssText = `left:${left}%;width:${right - left}%`;
      div.innerHTML = `<span class="weather-icon sm" data-weather="${g.cat}"${g.isDay ? '' : ' data-night'}></span>`;
      area.appendChild(div);
    });

    // SVG overlay
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'graph-svg');

    const clipId = 'graph-clip-' + Math.random().toString(36).slice(2);
    svg.innerHTML = `<defs><clipPath id="${clipId}"><rect x="0" y="0" width="100%" height="100%"/></clipPath></defs>`;

    // Grid lines
    for (let v = yMin + gap; v < yMin + span; v += gap) {
      const line = this._svgLine('0%', '100%', yPct(v) + '%', yPct(v) + '%', 'graph-grid');
      svg.appendChild(line);
    }

    // Midnight lines + labels
    for (let i = firstVisible; i <= lastVisible; i++) {
      const date = new Date(hourly[i].time);
      const hour = date.getHours();
      
      if (hour === 0) {
        svg.appendChild(this._svgLine(xPct(i) + '%', xPct(i) + '%', '0%', '118%', 'graph-midnight'));
        svg.appendChild(this._svgText(xPct(i) + '%', '118%', 'graph-label-day', 
          date.toLocaleDateString(undefined, { weekday: 'short' })));
      } else if (hour % 6 === 0) {
        svg.appendChild(this._svgText(xPct(i) + '%', '118%', 'graph-label-x', hour + 'h'));
      }
    }

    // Current time marker
    if (nowIdx >= 0.5 && nowIdx <= n - 1.5) {
      svg.appendChild(this._svgLine(xPct(nowIdx) + '%', xPct(nowIdx) + '%', '0%', '100%', 'graph-now'));
    }

    // Temperature path
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'graph-path');
    path.setAttribute('clip-path', `url(#${clipId})`);
    svg.appendChild(path);

    // Data points
    for (let i = firstVisible; i <= lastVisible; i++) {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', xPct(i) + '%');
      circle.setAttribute('cy', yPct(hourly[i].temperature) + '%');
      circle.setAttribute('r', 2);
      circle.setAttribute('class', 'graph-point');
      svg.appendChild(circle);
    }

    area.appendChild(svg);
    content.appendChild(area);

    // Daily forecast
    if (daily.length > 0) {
      const dailySection = document.createElement('div');
      dailySection.className = 'graph-daily';

      daily.forEach(d => {
        const date = new Date(d.date + 'T12:00');
        const cat = this.categoryCode(d.code);
        const dayDiv = document.createElement('div');
        dayDiv.className = 'graph-daily-day';
        if (cat) dayDiv.setAttribute('data-weather', cat);

        dayDiv.innerHTML = `
          <svg class="graph-daily-svg">
            <line x1="0" x2="0" y1="0%" y2="118%" class="graph-midnight"/>
            <text x="4" y="118%" class="graph-label-day">${date.toLocaleDateString(undefined, { weekday: 'short' })}</text>
          </svg>
          <span class="weather-icon md" data-weather="${d.code}"></span>
          <span class="graph-daily-temps">
            <span class="temp-max">${Math.round(d.temp_max)}°</span>
            <span class="temp-min">${Math.round(d.temp_min)}°</span>
          </span>
        `;
        dailySection.appendChild(dayDiv);
      });

      content.appendChild(dailySection);
    }

    graph.appendChild(content);

    // Border lines
    const borderSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    borderSvg.setAttribute('class', 'graph-border-svg');
    [yPct(yMin), yPct(yMin + span)].forEach(y => {
      borderSvg.appendChild(this._svgLine('0%', '100%', y + '%', y + '%', 'graph-grid'));
    });
    content.appendChild(borderSvg);

    container.innerHTML = '';
    container.appendChild(graph);

    // Path updates on resize
    const updatePath = () => {
      const w = area.clientWidth, h = area.clientHeight;
      const px = i => xPct(i) / 100 * w;
      const py = v => yPct(v) / 100 * h;
      const pts = hourly.map((d, i) => `${px(i)},${py(d.temperature)}`);
      path.setAttribute('d', 'M' + pts.join(' L'));
    };
    
    updatePath();
    new ResizeObserver(updatePath).observe(area);
  },

  // Helper: create SVG line
  _svgLine(x1, x2, y1, y2, className) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('x2', x2);
    line.setAttribute('y1', y1);
    line.setAttribute('y2', y2);
    line.setAttribute('class', className);
    return line;
  },

  // Helper: create SVG text
  _svgText(x, y, className, text) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    el.setAttribute('x', x);
    el.setAttribute('y', y);
    el.setAttribute('class', className);
    el.textContent = text;
    return el;
  }
};

// Export for use in app.js
window.WeatherGraph = WeatherGraph;
