/*!
 * Performance Optimizer
 * Copyright (c) 2026 https://github.com/brunocalado
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3.
 */

import { MODULE_ID, FPS_TIMING, TEMPLATES, L10N_PREFIX } from "../constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM-only window charting each player's FPS over time while the benchmark
 * scene runs. Data arrives in 5-second socket batches (see FpsMonitor) and is
 * kept in a static store so batches received while the window is closed are
 * not lost. The line chart is drawn on a 2D canvas with vanilla JS: one time
 * axis, one FPS axis, one line per user in that user's Foundry color.
 */
export default class BenchmarkMonitor extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @type {BenchmarkMonitor|null} The single open instance, if any. */
  static instance = null;

  /** @type {Map<string, {t: number, fps: number}[]>} FPS series per user id. */
  static #series = new Map();

  /** @type {ResizeObserver|null} Redraws the chart when the window resizes. */
  #resizeObserver = null;

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "po-benchmark-monitor",
    classes: [MODULE_ID, "po-benchmark-monitor"],
    window: {
      title: "PO.Monitor.Title",
      icon: "fa-solid fa-chart-line"
    },
    position: { width: 640, height: "auto" },
    actions: {
      clearData: this.prototype._onClearData
    }
  };

  /** @inheritDoc */
  static PARTS = {
    body: { template: TEMPLATES.BENCHMARK_MONITOR }
  };

  /**
   * Open the monitor (single instance), bringing it to front if already open.
   * @returns {BenchmarkMonitor} The open instance.
   */
  static open() {
    if ( BenchmarkMonitor.instance ) {
      BenchmarkMonitor.instance.render({ force: true });
      return BenchmarkMonitor.instance;
    }
    const app = new BenchmarkMonitor();
    BenchmarkMonitor.instance = app;
    app.render({ force: true });
    return app;
  }

  /**
   * Store a batch of FPS samples for a user and refresh the open monitor.
   * Called from the socket handler (player batches) and directly by the GM's
   * own FpsMonitor, since socket emissions are not echoed to the sender.
   * @param {string} userId                        The reporting user's id.
   * @param {{t: number, fps: number}[]} samples   Timestamped FPS readings.
   */
  static recordBatch(userId, samples) {
    if ( !Array.isArray(samples) || !samples.length ) return;
    const series = BenchmarkMonitor.#series.get(userId) ?? [];
    series.push(...samples);
    series.sort((a, b) => a.t - b.t);
    if ( series.length > FPS_TIMING.MONITOR_MAX_POINTS ) {
      series.splice(0, series.length - FPS_TIMING.MONITOR_MAX_POINTS);
    }
    BenchmarkMonitor.#series.set(userId, series);
    BenchmarkMonitor.instance?.refresh();
  }

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.players = this.#playerRows();
    context.hasData = BenchmarkMonitor.#series.size > 0;
    return context;
  }

  /**
   * Build one legend row per relevant user: every connected user plus any
   * user that already reported data during this benchmark run.
   * @returns {{id: string, name: string, color: string, fps: string}[]}
   */
  #playerRows() {
    const ids = new Set(game.users.filter(u => u.active).map(u => u.id));
    for ( const id of BenchmarkMonitor.#series.keys() ) ids.add(id);
    return [...ids].map(id => {
      const user = game.users.get(id);
      if ( !user ) return null;
      const series = BenchmarkMonitor.#series.get(id);
      const latest = series?.at(-1);
      return {
        id,
        name: user.name,
        color: BenchmarkMonitor.#readableColor(user.color),
        fps: latest ? String(Math.round(latest.fps)) : "—"
      };
    }).filter(row => row !== null);
  }

  /**
   * Lighten a user color until it stays readable on the dark chart surface.
   * User colors are world data and may be arbitrarily dark; identity is never
   * color-alone (the legend and direct labels carry the names), but the line
   * itself must remain visible.
   * @param {foundry.utils.Color} color  The user's color.
   * @returns {string} A CSS color string with sufficient luminance.
   */
  static #readableColor(color) {
    let c = foundry.utils.Color.from(color ?? 0x999999);
    const white = foundry.utils.Color.from(0xFFFFFF);
    for ( let i = 0; (i < 6) && (c.hsv[2] < 0.65); i++ ) c = c.mix(white, 0.2);
    return c.css;
  }

  /** @inheritDoc */
  _onRender(context, options) {
    super._onRender(context, options);
    const canvasEl = this.element.querySelector(".po-chart canvas");
    if ( !canvasEl ) return;
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = new ResizeObserver(() => this.#drawChart());
    this.#resizeObserver.observe(canvasEl.parentElement);
    canvasEl.addEventListener("pointermove", ev => this.#onPointerMove(ev));
    canvasEl.addEventListener("pointerleave", () => this.#hideTooltip());
    this.#drawChart();
  }

  /** @inheritDoc */
  _onClose(options) {
    super._onClose(options);
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    BenchmarkMonitor.instance = null;
  }

  /**
   * Discard all recorded FPS data. Declared in DEFAULT_OPTIONS.actions.
   * @param {PointerEvent} event  The originating click event.
   * @param {HTMLElement} target  The element carrying [data-action].
   */
  _onClearData(event, target) {
    BenchmarkMonitor.#series.clear();
    this.render();
  }

  /**
   * Lightweight refresh on incoming data: update legend FPS values in place
   * and redraw the canvas, avoiding a full template re-render every 5 s.
   */
  refresh() {
    if ( !this.rendered ) return;
    const known = this.element.querySelectorAll(".po-legend [data-user-id]").length;
    if ( known !== this.#playerRows().length ) return void this.render();
    for ( const row of this.#playerRows() ) {
      const value = this.element.querySelector(`.po-legend [data-user-id="${row.id}"] .po-legend-fps`);
      if ( value ) value.textContent = row.fps;
    }
    this.#drawChart();
  }

  /* -------------------------------------------- */
  /*  Chart rendering                             */
  /* -------------------------------------------- */

  /** @type {{t0: number, t1: number, fpsMax: number, plot: DOMRect}|null} Last drawn scales, for tooltip math. */
  #scales = null;

  /**
   * Compute the visible time domain and FPS range from the stored series.
   * @returns {{t0: number, t1: number, fpsMax: number}|null} Null when empty.
   */
  #computeDomain() {
    let tMin = Infinity;
    let tMax = -Infinity;
    let fpsMax = 0;
    for ( const series of BenchmarkMonitor.#series.values() ) {
      for ( const s of series ) {
        if ( s.t < tMin ) tMin = s.t;
        if ( s.t > tMax ) tMax = s.t;
        if ( s.fps > fpsMax ) fpsMax = s.fps;
      }
    }
    if ( !Number.isFinite(tMin) ) return null;
    // At least a one-minute window so early lines do not stretch edge to edge.
    const t1 = tMax;
    const t0 = Math.min(tMin, t1 - 60_000);
    fpsMax = Math.max(60, Math.ceil(fpsMax / 10) * 10);
    return { t0, t1, fpsMax };
  }

  /**
   * Draw the full line chart: recessive grid and axes, one 2px line per user,
   * and a direct name label at each line's end.
   */
  #drawChart() {
    const canvasEl = this.element?.querySelector(".po-chart canvas");
    if ( !canvasEl ) return;
    const host = canvasEl.parentElement;
    const cssWidth = host.clientWidth;
    const cssHeight = 280;
    const ratio = window.devicePixelRatio || 1;
    canvasEl.width = Math.round(cssWidth * ratio);
    canvasEl.height = Math.round(cssHeight * ratio);
    canvasEl.style.height = `${cssHeight}px`;
    const ctx = canvasEl.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const style = getComputedStyle(canvasEl);
    const inkMuted = style.getPropertyValue("--color-text-secondary").trim() || "#999";
    const gridColor = "rgba(128, 128, 128, 0.25)";

    const domain = this.#computeDomain();
    if ( !domain ) { this.#scales = null; return; }
    const margin = { top: 10, right: 90, bottom: 24, left: 36 };
    const plot = new DOMRect(margin.left, margin.top,
      cssWidth - margin.left - margin.right, cssHeight - margin.top - margin.bottom);
    const xOf = t => plot.x + ((t - domain.t0) / (domain.t1 - domain.t0)) * plot.width;
    const yOf = fps => plot.y + plot.height - (fps / domain.fpsMax) * plot.height;
    this.#scales = { ...domain, plot };

    ctx.font = `11px ${style.fontFamily}`;

    // Horizontal gridlines + FPS tick labels, kept visually recessive.
    const yStep = domain.fpsMax > 90 ? 30 : 15;
    for ( let fps = 0; fps <= domain.fpsMax; fps += yStep ) {
      const y = yOf(fps);
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.width, y);
      ctx.stroke();
      ctx.fillStyle = inkMuted;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(String(fps), plot.x - 6, y);
    }

    // Time tick labels every 30 seconds along the bottom edge.
    const tickMs = 30_000;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for ( let t = Math.ceil(domain.t0 / tickMs) * tickMs; t <= domain.t1; t += tickMs ) {
      ctx.fillStyle = inkMuted;
      ctx.fillText(BenchmarkMonitor.#formatTime(t), xOf(t), plot.y + plot.height + 6);
    }

    // One 2px line per user, in the user's (readability-clamped) color, with
    // a direct name label at the line's end so identity is not color-alone.
    for ( const [userId, series] of BenchmarkMonitor.#series.entries() ) {
      const user = game.users.get(userId);
      if ( !user || !series.length ) continue;
      const color = BenchmarkMonitor.#readableColor(user.color);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      series.forEach((s, i) => {
        const x = xOf(s.t);
        const y = yOf(Math.min(s.fps, domain.fpsMax));
        if ( i === 0 ) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      const last = series.at(-1);
      ctx.fillStyle = color;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(user.name, xOf(last.t) + 8, yOf(Math.min(last.fps, domain.fpsMax)));
    }
  }

  /**
   * Format a timestamp as a mm:ss wall-clock label for the time axis.
   * @param {number} t  Epoch milliseconds.
   * @returns {string} The formatted label.
   */
  static #formatTime(t) {
    const date = new Date(t);
    return `${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
  }

  /* -------------------------------------------- */
  /*  Hover tooltip                               */
  /* -------------------------------------------- */

  /**
   * Show a crosshair tooltip listing each player's FPS nearest to the hovered
   * time. Attached in `_onRender` (non-action listener).
   * @param {PointerEvent} event  The pointermove event on the chart canvas.
   */
  #onPointerMove(event) {
    const scales = this.#scales;
    const tooltip = this.element.querySelector(".po-chart-tooltip");
    if ( !scales || !tooltip ) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    if ( (x < scales.plot.x) || (x > scales.plot.x + scales.plot.width) ) return this.#hideTooltip();
    const t = scales.t0 + ((x - scales.plot.x) / scales.plot.width) * (scales.t1 - scales.t0);

    const lines = [];
    for ( const [userId, series] of BenchmarkMonitor.#series.entries() ) {
      const user = game.users.get(userId);
      if ( !user || !series.length ) continue;
      const nearest = series.reduce((a, b) => Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a);
      if ( Math.abs(nearest.t - t) > 5000 ) continue;
      lines.push({ name: user.name, color: BenchmarkMonitor.#readableColor(user.color), fps: Math.round(nearest.fps) });
    }
    if ( !lines.length ) return this.#hideTooltip();

    // Built through DOM APIs (not innerHTML): user names are world data.
    tooltip.replaceChildren();
    const header = document.createElement("header");
    header.textContent = BenchmarkMonitor.#formatTime(t);
    tooltip.append(header);
    for ( const line of lines ) {
      const row = document.createElement("div");
      const chip = document.createElement("span");
      chip.className = "po-chip";
      chip.style.background = line.color;
      const name = document.createElement("span");
      name.textContent = line.name;
      const value = document.createElement("strong");
      value.textContent = `${line.fps} ${game.i18n.localize(`${L10N_PREFIX}.Monitor.Fps`)}`;
      row.append(chip, name, value);
      tooltip.append(row);
    }
    tooltip.hidden = false;
    const hostBounds = tooltip.parentElement.getBoundingClientRect();
    const left = Math.min(event.clientX - hostBounds.left + 12, hostBounds.width - tooltip.offsetWidth - 4);
    tooltip.style.left = `${Math.max(0, left)}px`;
    tooltip.style.top = `${event.clientY - hostBounds.top + 12}px`;
  }

  /**
   * Hide the hover tooltip.
   */
  #hideTooltip() {
    const tooltip = this.element?.querySelector(".po-chart-tooltip");
    if ( tooltip ) tooltip.hidden = true;
  }
}
