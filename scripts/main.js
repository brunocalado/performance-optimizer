/*!
 * Performance Optimizer
 * Copyright (c) 2026 https://github.com/brunocalado
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3.
 */

import { MODULE_ID, SETTINGS } from "./constants.js";
import { registerSettings } from "./settings.js";
import { registerQueries, activateSocketListener } from "./socket.js";
import FpsMonitor from "./fps-monitor.js";
import ProfileDialog from "./apps/profile-dialog.js";

Hooks.once("init", () => {
  registerSettings();
  registerQueries();
});

Hooks.once("ready", () => {
  activateSocketListener();
  FpsMonitor.start();
  // First-run prompt for every user, GM included: performance is a per-client
  // concern, so the GM picks a profile for their own machine exactly like a
  // player. The dialog can still be reopened from the panel or settings menu.
  if ( !game.settings.get(MODULE_ID, SETTINGS.PROMPTED) ) {
    ProfileDialog.open();
  }
});
