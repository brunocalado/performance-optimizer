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
  DEFAULT_PROFILES,
  CORE_SETTING_KEYS,
  CUSTOM_PROFILE,
  DSN_MODULE_ID,
  DSN_SETTINGS_FLAG,
  L10N_PREFIX
} from "./constants.js";

/**
 * Resolve the effective profiles: the compile-time DEFAULT_PROFILES with the
 * GM's world-scoped overrides layered on top. Keys unknown to the current
 * module version are dropped, so stale overrides saved by an older build can
 * never reintroduce settings the profiles no longer manage.
 * @returns {Record<string, {core: Record<string, number|boolean>, dsn: Record<string, string|boolean>}>}
 */
export function getProfiles() {
  const overrides = game.settings.get(MODULE_ID, SETTINGS.PROFILE_OVERRIDES) ?? {};
  return foundry.utils.mergeObject(DEFAULT_PROFILES, overrides, {
    inplace: false,
    insertKeys: false,
    insertValues: false
  });
}

/**
 * Compare the client's current core settings against the three presets.
 * A user whose settings match none of them is considered "custom".
 * Only the `core` section participates: Dice So Nice options are applied by
 * the profiles but users legitimately fine-tune their dice afterwards, and
 * that should not demote them to "custom".
 * @returns {string} "low" | "medium" | "high" | "custom"
 */
export function detectProfile() {
  for ( const [key, values] of Object.entries(getProfiles()) ) {
    const matches = CORE_SETTING_KEYS.every(k => game.settings.get("core", k) === values.core[k]);
    if ( matches ) return key;
  }
  return CUSTOM_PROFILE;
}

/**
 * Build this client's profile state, as reported to the GM panel.
 * @returns {{profile: string, chosen: string, prompted: boolean}}
 */
export function getProfileState() {
  return {
    profile: detectProfile(),
    chosen: game.settings.get(MODULE_ID, SETTINGS.CHOSEN_PROFILE),
    prompted: game.settings.get(MODULE_ID, SETTINGS.PROMPTED)
  };
}

/**
 * Apply one of the preset profiles to this client's core settings, remember
 * the choice, broadcast the state change to open GM panels, and ask the user
 * to confirm a page reload so the canvas settings take full effect.
 * @param {string} profileKey                 One of "low" | "medium" | "high".
 * @param {object} [options]
 * @param {boolean} [options.promptReload=true]  Show the native reload confirmation.
 * @returns {Promise<boolean>} Whether the profile existed and was applied.
 */
export async function applyProfile(profileKey, { promptReload = true } = {}) {
  const profile = getProfiles()[profileKey];
  if ( !profile ) {
    console.error(`${MODULE_ID} | Unknown profile "${profileKey}"`);
    return false;
  }
  for ( const [key, value] of Object.entries(profile.core) ) {
    // Guard against core setting renames between v14 builds: skip and warn
    // instead of throwing, so the remaining keys still get applied.
    if ( !game.settings.settings.has(`core.${key}`) ) {
      console.warn(`${MODULE_ID} | Core setting "core.${key}" is not registered; skipping.`);
      continue;
    }
    if ( game.settings.get("core", key) !== value ) await game.settings.set("core", key, value);
  }
  await applyDsnProfile(profile.dsn);
  await game.settings.set(MODULE_ID, SETTINGS.CHOSEN_PROFILE, profileKey);
  await game.settings.set(MODULE_ID, SETTINGS.PROMPTED, true);
  broadcastStateChange();
  ui.notifications.info(game.i18n.format(`${L10N_PREFIX}.Notifications.ProfileApplied`, {
    profile: localizeProfile(profileKey)
  }));
  if ( promptReload ) await foundry.applications.settings.SettingsConfig.reloadConfirm({ world: false });
  return true;
}

/**
 * Apply a profile's Dice So Nice section to this user, if that module is
 * active. DSN v6 keeps per-user options in the `dice-so-nice.settings` user
 * flag (its `game.settings` entry is only a pre-4.1 migration shim), so the
 * partial write below merges into whatever the user already customized.
 * Several of these keys are on DSN's reload-required list; the reload prompt
 * issued by applyProfile() for the core settings covers them too.
 * @param {Record<string, string|boolean>|undefined} values  The profile's `dsn` section.
 * @returns {Promise<boolean>} Whether anything was written.
 */
async function applyDsnProfile(values) {
  if ( !values || !game.modules.get(DSN_MODULE_ID)?.active ) return false;
  const desired = { ...values };
  // MSAA needs a WebGL2 context; mirror DSN's own fallback to SMAA without one.
  if ( (desired.antialiasing === "msaa") && (canvas?.app?.renderer?.context?.webGLVersion !== 2) ) {
    desired.antialiasing = "smaa";
  }
  const current = game.user.getFlag(DSN_MODULE_ID, DSN_SETTINGS_FLAG) ?? {};
  if ( Object.entries(desired).every(([k, v]) => current[k] === v) ) return false;
  await game.user.setFlag(DSN_MODULE_ID, DSN_SETTINGS_FLAG, desired);
  return true;
}

/**
 * Notify GM clients (fire-and-forget) that this user's profile state changed,
 * so any open GM panel can refresh its row for this user.
 */
export function broadcastStateChange() {
  game.socket.emit(SOCKET_EVENT, {
    type: SOCKET_TYPES.STATE_CHANGED,
    userId: game.user.id,
    state: getProfileState()
  });
}

/**
 * Localize a profile key ("low"/"medium"/"high"/"custom") to its display label.
 * @param {string} profileKey  The profile key.
 * @returns {string} The localized label.
 */
export function localizeProfile(profileKey) {
  return game.i18n.localize(`${L10N_PREFIX}.Profiles.${profileKey}.Label`);
}
