/*!
 * Performance Optimizer
 * Copyright (c) 2026 https://github.com/brunocalado
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3.
 */

import { SOCKET_EVENT, SOCKET_TYPES, QUERIES } from "./constants.js";
import { applyProfile, getProfileState } from "./profiles.js";
import ProfileDialog from "./apps/profile-dialog.js";
import GMPanel from "./apps/gm-panel.js";
import BenchmarkMonitor from "./apps/benchmark-monitor.js";

/**
 * Register the module's promise-based inter-client queries on CONFIG.queries.
 * Queries are used whenever the sender needs a response (state reads, remote
 * profile application, remote dialog opening); plain socket broadcasts handle
 * the fire-and-forget traffic. Called from the "init" hook.
 */
export function registerQueries() {

  /**
   * GM -> player: report this client's current profile state.
   * @returns {{profile: string, chosen: string, prompted: boolean}}
   */
  CONFIG.queries[QUERIES.GET_STATE] = async () => getProfileState();

  /**
   * GM -> player: apply a preset profile locally. The reload confirmation is
   * deliberately not awaited — the query must respond to the GM immediately,
   * not when the player eventually dismisses the reload dialog.
   * @param {{profile: string}} data  The profile key to apply.
   * @returns {Promise<{ok: boolean, state: object}>} Result and fresh state.
   */
  CONFIG.queries[QUERIES.APPLY_PROFILE] = async ({ profile } = {}) => {
    const ok = await applyProfile(profile, { promptReload: false });
    if ( ok ) foundry.applications.settings.SettingsConfig.reloadConfirm({ world: false });
    return { ok, state: getProfileState() };
  };

  /**
   * GM -> player: (re)open the profile chooser dialog on this client.
   * @returns {Promise<{ok: boolean}>} Acknowledgement.
   */
  CONFIG.queries[QUERIES.SHOW_DIALOG] = async () => {
    ProfileDialog.open();
    return { ok: true };
  };
}

/**
 * Attach the fire-and-forget socket listener. Both message types are only
 * meaningful on GM clients: FPS batches feed the benchmark monitor and state
 * changes refresh the GM panel. Called from the "ready" hook.
 */
export function activateSocketListener() {
  game.socket.on(SOCKET_EVENT, payload => {
    if ( !game.user.isGM ) return;
    switch ( payload?.type ) {
      case SOCKET_TYPES.FPS_BATCH:
        BenchmarkMonitor.recordBatch(payload.userId, payload.samples);
        break;
      case SOCKET_TYPES.STATE_CHANGED:
        GMPanel.updateState(payload.userId, payload.state);
        break;
    }
  });
}
