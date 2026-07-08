/*!
 * Performance Optimizer
 * Copyright (c) 2026 https://github.com/brunocalado
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3.
 */

import { MODULE_ID, BENCHMARK_SCENE_FLAG, L10N_PREFIX } from "./constants.js";
import { getBenchmarkSceneData } from "./benchmark-data.js";

/**
 * Find the benchmark scene by its identification flag.
 * @returns {Scene|undefined} The flagged scene, if it exists.
 */
export function findBenchmarkScene() {
  return game.scenes.find(s => s.getFlag(MODULE_ID, BENCHMARK_SCENE_FLAG) === true);
}

/**
 * Get the benchmark scene, creating it from the bundled data if it does not
 * exist yet. The flag lookup prevents duplicates across repeated activations.
 * @returns {Promise<Scene>} The benchmark scene document.
 */
export async function ensureBenchmarkScene() {
  const existing = findBenchmarkScene();
  if ( existing ) return existing;
  const data = await getBenchmarkSceneData();
  const scene = await Scene.implementation.create(data);
  ui.notifications.info(game.i18n.localize(`${L10N_PREFIX}.Benchmark.SceneCreated`));
  return scene;
}

/**
 * Activate the benchmark for everyone: ensure the scene exists, spawn one
 * token per connected player with an assigned character, then activate the
 * scene. Activation is a native world operation — every connected client is
 * pulled to the active scene without any custom socket traffic.
 * @returns {Promise<Scene>} The activated benchmark scene.
 */
export async function activateBenchmark() {
  const scene = await ensureBenchmarkScene();
  await spawnPlayerTokens(scene);
  await scene.activate();
  return scene;
}

/**
 * Create one token per active player whose user has an assigned character
 * and no token on the benchmark scene yet. Tokens are laid out side by side
 * on a grid-aligned row near the scene center so they never stack.
 * @param {Scene} scene  The benchmark scene.
 * @returns {Promise<void>}
 */
export async function spawnPlayerTokens(scene) {
  const actors = game.users
    .filter(u => u.active && !u.isGM && u.character)
    .map(u => u.character)
    .filter(actor => !scene.tokens.some(t => t.actorId === actor.id));
  // Distinct actors only: two users sharing one character get a single token.
  const unique = [...new Map(actors.map(a => [a.id, a])).values()];
  if ( !unique.length ) return;

  const dims = scene.dimensions;
  const grid = dims.size;
  const tokenData = [];
  let column = 0;
  for ( const actor of unique ) {
    const width = actor.prototypeToken?.width ?? 1;
    const x = dims.sceneX + Math.floor(dims.sceneWidth / (2 * grid)) * grid + (column * grid);
    const y = dims.sceneY + Math.floor(dims.sceneHeight / (2 * grid)) * grid;
    const token = await actor.getTokenDocument({ x, y });
    tokenData.push(token.toObject());
    column += Math.ceil(width);
  }
  await TokenDocument.implementation.createDocuments(tokenData, { parent: scene });
}
