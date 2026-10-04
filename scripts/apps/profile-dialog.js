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
  PROFILE_ORDER,
  PROFILE_ICONS,
  TEMPLATES,
  L10N_PREFIX
} from "../constants.js";
import { applyProfile, detectProfile, localizeProfile, broadcastStateChange } from "../profiles.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Player-facing dialog to choose a performance profile. Shown on first login,
 * reopened from the module's settings menu, or pushed remotely by the GM.
 */
export default class ProfileDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "po-profile-dialog",
    classes: [MODULE_ID, "po-profile-dialog"],
    window: {
      title: "PO.ProfileDialog.Title",
      icon: "fa-solid fa-gauge-high",
      contentClasses: ["standard-form"]
    },
    position: { width: 640 },
    actions: {
      chooseProfile: this.prototype._onChooseProfile,
      keepCurrent: this.prototype._onKeepCurrent
    }
  };

  /** @inheritDoc */
  static PARTS = {
    body: { template: TEMPLATES.PROFILE_DIALOG }
  };

  /**
   * Open the dialog, reusing the open window if there is one. The lookup goes
   * through the core application registry rather than a static field because
   * the settings menu button instantiates this class directly with
   * `new menu.type()`, bypassing this method.
   * @returns {ProfileDialog} The open instance.
   */
  static open() {
    const app = foundry.applications.instances.get(ProfileDialog.DEFAULT_OPTIONS.id) ?? new ProfileDialog();
    app.render({ force: true });
    return app;
  }

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const current = detectProfile();
    context.profiles = PROFILE_ORDER.map(key => ({
      key,
      icon: PROFILE_ICONS[key],
      title: game.i18n.localize(`${L10N_PREFIX}.Profiles.${key}.Title`),
      tagline: game.i18n.localize(`${L10N_PREFIX}.Profiles.${key}.Tagline`),
      description: game.i18n.localize(`${L10N_PREFIX}.Profiles.${key}.Description`),
      current: key === current
    }));
    context.currentLabel = localizeProfile(current);
    return context;
  }

  /**
   * Apply the clicked profile, then close. The apply routine handles the
   * reload confirmation and the state broadcast to GM panels.
   * Declared in DEFAULT_OPTIONS.actions.
   * @param {PointerEvent} event  The originating click event.
   * @param {HTMLElement} target  The element carrying [data-action].
   * @returns {Promise<void>}
   */
  async _onChooseProfile(event, target) {
    const profileKey = target.dataset.profile;
    await this.close();
    await applyProfile(profileKey);
  }

  /**
   * Keep the current settings: mark the prompt as answered without touching
   * any core setting. Declared in DEFAULT_OPTIONS.actions.
   * @param {PointerEvent} event  The originating click event.
   * @param {HTMLElement} target  The element carrying [data-action].
   * @returns {Promise<void>}
   */
  async _onKeepCurrent(event, target) {
    await game.settings.set(MODULE_ID, SETTINGS.PROMPTED, true);
    broadcastStateChange();
    await this.close();
  }
}
