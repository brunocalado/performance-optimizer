/*!
 * Performance Optimizer
 * Copyright (c) 2026 https://github.com/brunocalado
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3.
 */

import { MODULE_ID, SETTINGS, GM_PANEL_MENU, PROFILE_DEFAULTS_MENU, L10N_PREFIX } from "./constants.js";
import GMPanel from "./apps/gm-panel.js";
import ProfileDefaults from "./apps/profile-defaults.js";

/**
 * Register the module's settings and settings-menu buttons. Settings are
 * client-scoped (performance is inherently a per-machine concern) except the
 * profile overrides, which the GM defines once for the whole world. Called
 * from the "init" hook.
 */
export function registerSettings() {

  game.settings.registerMenu(MODULE_ID, GM_PANEL_MENU, {
    name: `${L10N_PREFIX}.Settings.GMPanel.Name`,
    label: `${L10N_PREFIX}.Settings.GMPanel.Label`,
    hint: `${L10N_PREFIX}.Settings.GMPanel.Hint`,
    icon: "fa-solid fa-computer",
    type: GMPanel,
    restricted: true
  });

  game.settings.registerMenu(MODULE_ID, PROFILE_DEFAULTS_MENU, {
    name: `${L10N_PREFIX}.Settings.ProfileDefaults.Name`,
    label: `${L10N_PREFIX}.Settings.ProfileDefaults.Label`,
    hint: `${L10N_PREFIX}.Settings.ProfileDefaults.Hint`,
    icon: "fa-solid fa-sliders",
    type: ProfileDefaults,
    restricted: true
  });

  game.settings.register(MODULE_ID, SETTINGS.PROFILE_OVERRIDES, {
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, SETTINGS.AUTO_FPS_CHECK, {
    name: `${L10N_PREFIX}.Settings.AutoFpsCheck.Name`,
    hint: `${L10N_PREFIX}.Settings.AutoFpsCheck.Hint`,
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.FPS_NEVER_SHOW, {
    name: `${L10N_PREFIX}.Settings.FpsNeverShow.Name`,
    hint: `${L10N_PREFIX}.Settings.FpsNeverShow.Hint`,
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.PROMPTED, {
    scope: "client",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.CHOSEN_PROFILE, {
    scope: "client",
    config: false,
    type: String,
    default: ""
  });

  game.settings.register(MODULE_ID, SETTINGS.FPS_SNOOZE_UNTIL, {
    scope: "client",
    config: false,
    type: Number,
    default: 0
  });
}
