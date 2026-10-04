/*!
 * Performance Optimizer
 * Copyright (c) 2026 https://github.com/brunocalado
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3.
 */

import {
  MODULE_ID,
  SOCKET_EVENT,
  SOCKET_TYPES,
  FPS_TIMING,
  BENCHMARK_SCENE_FLAG
} from "./constants.js";
import BenchmarkMonitor from "./apps/benchmark-monitor.js";

/**
 * Benchmark FPS sampler: while the benchmark scene is viewed, accumulates
 * per-second samples locally and ships them to GM clients in a single socket
 * batch every 5 seconds, keeping network chatter low.
 *
 * Each sample is the number of frames actually rendered during that second.
 * PIXI's `ticker.FPS` is not used: it is `1000 / elapsedMS` of a single
 * frame, and whenever the FPS cap does not evenly divide the display's
 * refresh rate (a 60 cap on a 75 Hz monitor) consecutive frames alternate
 * between one and two refresh intervals, so a once-per-second read bounces
 * between e.g. 75 and 37 while the real rate holds steady near 60.
 */
export default class FpsMonitor {

  /** @type {FpsMonitor|null} Singleton instance started at "ready". */
  static #instance = null;

  /** @type {number|null} setInterval handle for the 1-second tick. */
  #timer = null;

  /** @type {number} Frames rendered since the last tick. */
  #frames = 0;

  /** @type {number} `performance.now()` of the last tick, the start of the current count. */
  #lastTick = performance.now();

  /**
   * Whether the previous tick was sampled too. A count that started while
   * sampling was skipped (other scene, hidden tab, unfocused window, canvas
   * redrawing) spans throttled frames, so it is discarded rather than charted.
   * @type {boolean}
   */
  #primed = false;

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
      // canvas.app is created once per session and never replaced, so one
      // listener covers every scene. It is absent when the canvas is disabled.
      canvas.app?.ticker.add(() => FpsMonitor.#instance.#frames++);
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
   * One-second tick: turn the frames counted since the last tick into a
   * frames-per-second sample while on the benchmark scene. Hidden tabs and
   * unfocused windows are skipped entirely — browsers throttle rendering in
   * both cases (background tab throttling, or reduced GPU/compositor priority
   * for an unfocused window while the user is in another OS-level app), which
   * would chart false low-FPS readings.
   */
  #tick() {
    const now = performance.now();
    const fps = (this.#frames * 1000) / (now - this.#lastTick);
    this.#frames = 0;
    this.#lastTick = now;
    const sampling = canvas?.ready && FpsMonitor.onBenchmarkScene
      && (document.visibilityState === "visible") && document.hasFocus();
    const primed = this.#primed;
    this.#primed = sampling;
    if ( sampling && primed ) this.#recordBenchmarkSample(fps);
  }

  /**
   * Queue a benchmark FPS sample and flush the batch to GM clients every
   * 5 seconds. GMs record their own samples directly, since module socket
   * emissions are not echoed back to the sender.
   * @param {number} fps  Frames rendered per second over the last tick.
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
}
