/*!
 * Performance Optimizer
 * Copyright (c) 2026 https://github.com/brunocalado
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3.
 */

import { MODULE_ID, BENCHMARK_SCENE_FLAG, BENCHMARK_JSON_PATH } from "./constants.js";

/**
 * Load and sanitize the benchmark scene source data.
 *
 * The raw export lives in assets/benchmark.json (~300 KB) and is fetched on
 * demand rather than inlined in this file, so the payload is only downloaded
 * when the GM actually creates the scene. Sanitization strips fields tied to
 * the world it was exported from and stamps the module's identification flag.
 *
 * @returns {Promise<object>} Scene creation data ready for Scene.create().
 */
export async function getBenchmarkSceneData() {
  const data = await foundry.utils.fetchJsonWithTimeout(BENCHMARK_JSON_PATH);
  // World-specific leftovers from the export: a thumbnail path inside the
  // source world, document stats, folder/journal references and flags of the
  // game system the scene was authored in.
  delete data.thumb;
  delete data._stats;
  delete data.folder;
  delete data.journal;
  delete data.journalEntryPage;
  delete data.playlist;
  delete data.playlistSound;
  data.flags = { [MODULE_ID]: { [BENCHMARK_SCENE_FLAG]: true } };
  data.ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER };
  data.navigation = true;
  return data;
}
