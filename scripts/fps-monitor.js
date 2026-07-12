/*!
 * Performance Optimizer
 * Copyright (c) 2026 https://github.com/brunocalado
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3.
 */

import {
  MODULE_ID,
  SETTINGS,
  SOCKET_EVENT,
  SOCKET_TYPES,
  FPS_TIMING,
  FPS_RECOMMENDATION_RULES,
  BENCHMARK_SCENE_FLAG
} from "./constants.js";
import { detectProfile } from "./profiles.js";
import ProfileDialog from "./apps/profile-dialog.js";
import BenchmarkMonitor from "./apps/benchmark-monitor.js";

/**
 * Periodic FPS sampler with two responsibilities:
 * 1. Auto-detection — averages FPS in 10-second buckets over a 2-minute
 *    window and recommends a lighter profile when the average is
 *    consistently below the current profile's expectations.
 * 2. Benchmark reporting — while the benchmark scene is viewed, accumulates
 *    per-second samples locally and ships them to GM clients in a single
 *    socket batch every 5 seconds, keeping network chatter low.
 */
export default class FpsMonitor {

  /** @type {FpsMonitor|null} Singleton instance started at "ready". */
  static #instance = null;

  /** @type {number|null} setInterval handle for the 1-second tick. */
  #timer = null;

  /** @type {number[]} Raw per-second readings of the current 10 s bucket. */
  #bucket = [];

  /** @type {number[]} Rolling window of 10 s averages (2 minutes = 12). */
  #window = [];

  /** @type {{t: number, fps: number}[]} Benchmark samples pending a socket send. */
  #pendingBatch = [];

  /** @type {number} Timestamp of the last benchmark batch emission. */
  #lastBatchSent = 0;

  /**
   * Start the singleton monitor. Safe to call once from the "ready" hook.
   * @returns {FpsMonitor} The running instance.
   */
  static start() {
    if ( !FpsMonitor.#instance ) {
      FpsMonitor.#instance = new FpsMonitor();
      FpsMonitor.#instance.#timer = setInterval(() => FpsMonitor.#instance.#tick(), FPS_TIMING.TICK_MS);
    }
    return FpsMonitor.#instance;
  }

  /**
   * Whether the currently viewed scene is the benchmark scene.
   * @returns {boolean}
   */
  static get onBenchmarkScene() {
    return canvas?.scene?.getFlag(MODULE_ID, BENCHMARK_SCENE_FLAG) === true;
  }

  /**
   * One-second tick: read the PIXI ticker, feed the benchmark stream and the
   * auto-detection window. Hidden tabs and unfocused windows are skipped
   * entirely — browsers throttle rendering in both cases (background tab
   * throttling, or reduced GPU/compositor priority for an unfocused window
   * while the user is in another OS-level app), which would produce false
   * low-FPS positives.
   */
  #tick() {
    if ( !canvas?.ready || document.visibilityState !== "visible" || !document.hasFocus() ) return;
    const fps = canvas.app.ticker.FPS;
    if ( !Number.isFinite(fps) ) return;

    if ( FpsMonitor.onBenchmarkScene ) this.#recordBenchmarkSample(fps);

    this.#bucket.push(fps);
    if ( this.#bucket.length < FPS_TIMING.READS_PER_SAMPLE ) return;
    const average = this.#bucket.reduce((sum, v) => sum + v, 0) / this.#bucket.length;
    this.#bucket = [];
    this.#window.push(average);
    if ( this.#window.length < FPS_TIMING.SAMPLES_PER_WINDOW ) return;
    const samples = this.#window;
    this.#window = [];
    this.#evaluate(samples);
  }

  /**
   * Queue a benchmark FPS sample and flush the batch to GM clients every
   * 5 seconds. GMs record their own samples directly, since module socket
   * emissions are not echoed back to the sender.
   * @param {number} fps  The instantaneous framerate reading.
   */
  #recordBenchmarkSample(fps) {
    const now = Date.now();
    this.#pendingBatch.push({ t: now, fps });
    if ( (now - this.#lastBatchSent) < FPS_TIMING.BENCHMARK_SEND_MS ) return;
    const samples = this.#pendingBatch;
    this.#pendingBatch = [];
    this.#lastBatchSent = now;
    if ( game.user.isGM ) BenchmarkMonitor.recordBatch(game.user.id, samples);
    else game.socket.emit(SOCKET_EVENT, { type: SOCKET_TYPES.FPS_BATCH, userId: game.user.id, samples });
  }

  /**
   * Evaluate a completed 2-minute window and recommend a lighter profile via
   * the ProfileDialog when the average framerate is consistently low.
   * The "low" profile never triggers a warning — there is nothing weaker.
   * @param {number[]} samples  Twelve 10-second FPS averages.
   */
  #evaluate(samples) {
    if ( !game.settings.get(MODULE_ID, SETTINGS.AUTO_FPS_CHECK) ) return;
    if ( game.settings.get(MODULE_ID, SETTINGS.FPS_NEVER_SHOW) ) return;
    if ( Date.now() < game.settings.get(MODULE_ID, SETTINGS.FPS_SNOOZE_UNTIL) ) return;
    // Benchmark stress is intentionally heavy; recommending downgrades there
    // would defeat its purpose as a comparative reference.
    if ( FpsMonitor.onBenchmarkScene ) return;
    if ( ProfileDialog.instance ) return;

    const rule = FPS_RECOMMENDATION_RULES[detectProfile()];
    if ( !rule ) return;
    const average = samples.reduce((sum, v) => sum + v, 0) / samples.length;
    if ( average >= rule.threshold ) return;
    ProfileDialog.open({ recommendation: { target: rule.target, avgFps: average } });
  }
}
