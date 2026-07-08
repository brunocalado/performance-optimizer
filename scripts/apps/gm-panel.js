/*!
 * Performance Optimizer
 * Copyright (c) 2026 https://github.com/brunocalado
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3.
 */

import {
  MODULE_ID,
  QUERIES,
  PROFILE_ORDER,
  CUSTOM_PROFILE,
  TEMPLATES,
  L10N_PREFIX
} from "../constants.js";
import { localizeProfile, getProfileState, applyProfile } from "../profiles.js";
import { activateBenchmark } from "../benchmark.js";
import BenchmarkMonitor from "./benchmark-monitor.js";
import ProfileDialog from "./profile-dialog.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM panel listing every user with their detected performance profile.
 * Profile labels act as buttons that remotely apply the preset on the target
 * client (via CONFIG.queries), a "Custom" badge marks users whose settings
 * match no preset, and resend buttons re-open the chooser dialog remotely.
 * Also hosts the benchmark controls (scene activation and FPS monitor).
 */
export default class GMPanel extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @type {GMPanel|null} The single open instance, if any. */
  static instance = null;

  /** @type {Map<string, {profile: string, chosen: string, prompted: boolean}|null>} Reported state per user id. */
  #states = new Map();

  /** @type {boolean} Whether a state fetch is currently in flight. */
  #loading = false;

  /** @type {number|null} Id of the `userConnected` hook, while the panel is open. */
  #connectionHookId = null;

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "po-gm-panel",
    classes: [MODULE_ID, "po-gm-panel"],
    window: {
      title: "PO.GMPanel.Title",
      icon: "fa-solid fa-computer"
    },
    position: { width: 620, height: "auto" },
    actions: {
      setProfile: this.prototype._onSetProfile,
      resendDialog: this.prototype._onResendDialog,
      sendAll: this.prototype._onSendAll,
      refresh: this.prototype._onRefresh,
      activateBenchmark: this.prototype._onActivateBenchmark,
      openMonitor: this.prototype._onOpenMonitor
    }
  };

  /** @inheritDoc */
  static PARTS = {
    body: { template: TEMPLATES.GM_PANEL }
  };

  /**
   * Update one user's cached state (from a socket broadcast or query result)
   * and refresh the open panel. Safe to call when the panel is closed.
   * @param {string} userId  The user whose state changed.
   * @param {{profile: string, chosen: string, prompted: boolean}} state  The new state.
   */
  static updateState(userId, state) {
    const panel = GMPanel.instance;
    if ( !panel ) return;
    panel.#states.set(userId, state);
    panel.render();
  }

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.loading = this.#loading;
    // Include this GM's own row: performance management now treats the GM the
    // same as any player, so they appear in the roster alongside everyone else.
    context.users = game.users.contents
      .sort((a, b) => (Number(b.active) - Number(a.active)) || a.name.localeCompare(b.name))
      .map(user => this.#userRow(user));
    return context;
  }

  /**
   * Build the template context row for one user.
   * @param {User} user  The user to describe.
   * @returns {object} Row context for gm-panel.hbs.
   */
  #userRow(user) {
    // This client cannot query itself, so read the GM's own state locally;
    // remote users' state comes from the cached query/broadcast results.
    const isSelf = user.id === game.user.id;
    const state = isSelf ? getProfileState() : (this.#states.get(user.id) ?? null);
    return {
      id: user.id,
      name: user.name,
      color: user.color.css,
      isGM: user.isGM,
      isSelf,
      active: user.active,
      known: state !== null,
      custom: state?.profile === CUSTOM_PROFILE,
      profiles: PROFILE_ORDER.map(key => ({
        key,
        label: localizeProfile(key),
        current: state?.profile === key
      }))
    };
  }

  /** @inheritDoc */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    // The settings menu constructs a fresh instance on every click; close a
    // previously opened panel so two apps never share the same element id.
    if ( GMPanel.instance && (GMPanel.instance !== this) ) GMPanel.instance.close();
    GMPanel.instance = this;
    // Keep the roster live: react to players joining/leaving without a manual
    // Refresh. Bound once here and torn down in _onClose.
    this.#connectionHookId = Hooks.on("userConnected", this.#onUserConnected.bind(this));
    this.#fetchStates();
  }

  /** @inheritDoc */
  _onClose(options) {
    super._onClose(options);
    if ( this.#connectionHookId !== null ) {
      Hooks.off("userConnected", this.#connectionHookId);
      this.#connectionHookId = null;
    }
    GMPanel.instance = null;
  }

  /**
   * React to a user connecting or disconnecting: reflect the online/offline
   * change immediately, then (on connect) query the freshly joined client for
   * its current profile so the row fills in without a manual Refresh.
   * Bound as a `userConnected` hook listener while the panel is open.
   * @param {User} user  The user whose connection state changed.
   * @param {boolean} connected  True when connecting, false when disconnecting.
   * @returns {Promise<void>}
   */
  async #onUserConnected(user, connected) {
    if ( user.id === game.user.id ) return;
    // Redraw at once so the active/offline styling tracks the change.
    this.render();
    if ( !connected ) return;
    try {
      const state = await user.query(QUERIES.GET_STATE, {}, { timeout: 10_000 });
      this.#states.set(user.id, state);
      this.render();
    }
    catch(err) {
      console.warn(`${MODULE_ID} | Failed to query state of user "${user.name}"`, err);
    }
  }

  /**
   * Query every connected user (except this GM) for their current profile
   * state, then re-render the table with the results.
   * @returns {Promise<void>}
   */
  async #fetchStates() {
    this.#loading = true;
    this.render();
    const targets = game.users.filter(u => u.active && (u.id !== game.user.id));
    await Promise.allSettled(targets.map(async user => {
      try {
        const state = await user.query(QUERIES.GET_STATE, {}, { timeout: 10_000 });
        this.#states.set(user.id, state);
      }
      catch(err) {
        console.warn(`${MODULE_ID} | Failed to query state of user "${user.name}"`, err);
      }
    }));
    this.#loading = false;
    this.render();
  }

  /**
   * Remotely apply a preset profile on the clicked user's client.
   * Declared in DEFAULT_OPTIONS.actions.
   * @param {PointerEvent} event  The originating click event.
   * @param {HTMLElement} target  The element carrying [data-action].
   * @returns {Promise<void>}
   */
  async _onSetProfile(event, target) {
    const { userId, profile } = target.dataset;
    // The GM's own row applies the profile locally — there is no remote client
    // to query, and applyProfile handles the notification, state broadcast and
    // reload prompt exactly as it does for a player choosing from the dialog.
    if ( userId === game.user.id ) {
      target.disabled = true;
      await applyProfile(profile);
      this.render();
      return;
    }
    const user = game.users.get(userId);
    if ( !user?.active ) return;
    target.disabled = true;
    try {
      const result = await user.query(QUERIES.APPLY_PROFILE, { profile }, { timeout: 30_000 });
      if ( result?.state ) this.#states.set(userId, result.state);
      ui.notifications.info(game.i18n.format(`${L10N_PREFIX}.GMPanel.ProfileSent`, {
        user: user.name, profile: localizeProfile(profile)
      }));
    }
    catch(err) {
      console.error(`${MODULE_ID} | Failed to apply profile on "${user.name}"`, err);
      ui.notifications.warn(game.i18n.format(`${L10N_PREFIX}.GMPanel.ProfileFailed`, { user: user.name }));
    }
    this.render();
  }

  /**
   * Re-open the profile chooser dialog on the clicked user's client.
   * Declared in DEFAULT_OPTIONS.actions.
   * @param {PointerEvent} event  The originating click event.
   * @param {HTMLElement} target  The element carrying [data-action].
   * @returns {Promise<void>}
   */
  async _onResendDialog(event, target) {
    // The GM's own row reopens the chooser locally rather than over a query.
    if ( target.dataset.userId === game.user.id ) {
      ProfileDialog.open();
      return;
    }
    const user = game.users.get(target.dataset.userId);
    if ( !user?.active ) return;
    try {
      await user.query(QUERIES.SHOW_DIALOG, {}, { timeout: 10_000 });
      ui.notifications.info(game.i18n.format(`${L10N_PREFIX}.GMPanel.DialogSent`, { user: user.name }));
    }
    catch(err) {
      console.error(`${MODULE_ID} | Failed to send dialog to "${user.name}"`, err);
      ui.notifications.warn(game.i18n.format(`${L10N_PREFIX}.GMPanel.DialogFailed`, { user: user.name }));
    }
  }

  /**
   * Re-open the profile chooser dialog on every connected client, including
   * this GM's own (opened locally, since a client cannot query itself).
   * Declared in DEFAULT_OPTIONS.actions.
   * @param {PointerEvent} event  The originating click event.
   * @param {HTMLElement} target  The element carrying [data-action].
   * @returns {Promise<void>}
   */
  async _onSendAll(event, target) {
    const targets = game.users.filter(u => u.active && (u.id !== game.user.id));
    await Promise.allSettled(targets.map(user => user.query(QUERIES.SHOW_DIALOG, {}, { timeout: 10_000 })));
    ProfileDialog.open();
    ui.notifications.info(game.i18n.format(`${L10N_PREFIX}.GMPanel.DialogSentAll`, { count: targets.length + 1 }));
  }

  /**
   * Re-query every connected user's state. Declared in DEFAULT_OPTIONS.actions.
   * @param {PointerEvent} event  The originating click event.
   * @param {HTMLElement} target  The element carrying [data-action].
   */
  _onRefresh(event, target) {
    if ( !this.#loading ) this.#fetchStates();
  }

  /**
   * Create (if needed) and activate the benchmark scene for everyone.
   * Declared in DEFAULT_OPTIONS.actions.
   * @param {PointerEvent} event  The originating click event.
   * @param {HTMLElement} target  The element carrying [data-action].
   * @returns {Promise<void>}
   */
  async _onActivateBenchmark(event, target) {
    target.disabled = true;
    try {
      await activateBenchmark();
      ui.notifications.info(game.i18n.localize(`${L10N_PREFIX}.Benchmark.Activated`));
    }
    finally {
      target.disabled = false;
    }
  }

  /**
   * Open the benchmark FPS monitor window. Declared in DEFAULT_OPTIONS.actions.
   * @param {PointerEvent} event  The originating click event.
   * @param {HTMLElement} target  The element carrying [data-action].
   */
  _onOpenMonitor(event, target) {
    BenchmarkMonitor.open();
  }
}
