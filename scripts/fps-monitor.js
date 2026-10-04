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
 */
export default class FpsMonitor {

  /** @type {FpsMonitor|null} Singleton instance started at "ready". */
  static #instance = null;

  /** @type {number|null} setInterval handle for the 1-second tick. */
  #timer = null;

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
   * One-second tick: read the PIXI ticker while on the benchmark scene.
   * Hidden tabs and unfocused windows are skipped entirely — browsers throttle
   * rendering in both cases (background tab throttling, or reduced
   * GPU/compositor priority for an unfocused window while the user is in
   * another OS-level app), which would chart false low-FPS readings.
   */
  #tick() {
    if ( !canvas?.ready || !FpsMonitor.onBenchmarkScene ) return;
    if ( document.visibilityState !== "visible" || !document.hasFocus() ) return;
    const fps = canvas.app.ticker.FPS;
    if ( !Number.isFinite(fps) ) return;
    this.#recordBenchmarkSample(fps);
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
}
