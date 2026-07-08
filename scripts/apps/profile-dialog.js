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
  TEMPLATES,
  FPS_TIMING,
  L10N_PREFIX
} from "../constants.js";
import { applyProfile, detectProfile, localizeProfile, broadcastStateChange } from "../profiles.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Player-facing dialog to choose a performance profile.
 * Also doubles as the vehicle for FPS-based downgrade recommendations: when
 * opened with a `recommendation`, it shows a banner plus snooze/mute buttons.
 */
export default class ProfileDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  /**
   * @param {object} [options]
   * @param {{target: string, avgFps: number}|null} [options.recommendation]
   *   FPS-monitor recommendation context, or null for the plain chooser.
   */
  constructor({ recommendation = null, ...options } = {}) {
    super(options);
    this.#recommendation = recommendation;
  }

  /** @type {{target: string, avgFps: number}|null} */
  #recommendation;

  /** Whether the user acted on the dialog (chose/kept/muted) before it closed. */
  #resolved = false;

  /** @type {ProfileDialog|null} The single open instance, if any. */
  static instance = null;

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "po-profile-dialog",
    classes: [MODULE_ID, "po-profile-dialog"],
    window: {
      title: "PO.ProfileDialog.Title",
      icon: "fa-solid fa-gauge-high",
      contentClasses: ["standard-form"]
    },
    position: { width: 460 },
    actions: {
      chooseProfile: this.prototype._onChooseProfile,
      keepCurrent: this.prototype._onKeepCurrent,
      snoozeFps: this.prototype._onSnoozeFps,
      neverShowFps: this.prototype._onNeverShowFps
    }
  };

  /** @inheritDoc */
  static PARTS = {
    body: { template: TEMPLATES.PROFILE_DIALOG }
  };

  /**
   * Open the dialog (single instance). If it is already open, refresh the
   * recommendation context and bring the window to front instead.
   * @param {object} [options]
   * @param {{target: string, avgFps: number}|null} [options.recommendation]
   * @returns {ProfileDialog} The open instance.
   */
  static open({ recommendation = null } = {}) {
    if ( ProfileDialog.instance ) {
      ProfileDialog.instance.#recommendation = recommendation ?? ProfileDialog.instance.#recommendation;
      ProfileDialog.instance.render({ force: true });
      return ProfileDialog.instance;
    }
    const app = new ProfileDialog({ recommendation });
    ProfileDialog.instance = app;
    app.render({ force: true });
    return app;
  }

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const current = detectProfile();
    const rec = this.#recommendation;
    context.profiles = PROFILE_ORDER.map(key => ({
      key,
      label: localizeProfile(key),
      description: game.i18n.localize(`${L10N_PREFIX}.Profiles.${key}.Description`),
      current: key === current,
      recommended: key === rec?.target
    }));
    context.currentLabel = localizeProfile(current);
    context.recommendation = rec ? {
      message: game.i18n.format(`${L10N_PREFIX}.ProfileDialog.Recommendation`, {
        fps: Math.round(rec.avgFps),
        profile: localizeProfile(rec.target)
      })
    } : null;
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
    this.#resolved = true;
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
    this.#resolved = true;
    await game.settings.set(MODULE_ID, SETTINGS.PROMPTED, true);
    broadcastStateChange();
    await this.close();
  }

  /**
   * Refuse the FPS recommendation: mute it for 24 hours.
   * Declared in DEFAULT_OPTIONS.actions.
   * @param {PointerEvent} event  The originating click event.
   * @param {HTMLElement} target  The element carrying [data-action].
   * @returns {Promise<void>}
   */
  async _onSnoozeFps(event, target) {
    this.#resolved = true;
    await game.settings.set(MODULE_ID, SETTINGS.FPS_SNOOZE_UNTIL, Date.now() + FPS_TIMING.SNOOZE_MS);
    await this.close();
  }

  /**
   * Permanently hide FPS recommendations for this client.
   * Declared in DEFAULT_OPTIONS.actions.
   * @param {PointerEvent} event  The originating click event.
   * @param {HTMLElement} target  The element carrying [data-action].
   * @returns {Promise<void>}
   */
  async _onNeverShowFps(event, target) {
    this.#resolved = true;
    await game.settings.set(MODULE_ID, SETTINGS.FPS_NEVER_SHOW, true);
    await this.close();
  }

  /** @inheritDoc */
  _onClose(options) {
    super._onClose(options);
    ProfileDialog.instance = null;
    // Dismissing a recommendation without acting counts as a refusal: mute it
    // for 24 hours so the window does not nag the user every two minutes.
    if ( this.#recommendation && !this.#resolved ) {
      game.settings.set(MODULE_ID, SETTINGS.FPS_SNOOZE_UNTIL, Date.now() + FPS_TIMING.SNOOZE_MS);
    }
  }
}
