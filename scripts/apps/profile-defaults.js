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
  PROFILE_FIELDS,
  DSN_MODULE_ID,
  TEMPLATES,
  L10N_PREFIX
} from "../constants.js";
import { getProfiles, localizeProfile } from "../profiles.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM editor for the default settings of the three performance profiles.
 * Renders one column per profile (low/medium/high) and one row per managed
 * setting: the Foundry core graphics settings, plus the Dice So Nice
 * performance options when that module is active in the world. Saving stores
 * the full profile table in a world setting; "Reset to Default" clears it
 * back to the compile-time defaults.
 */
export default class ProfileDefaults extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @type {ProfileDefaults|null} The single open instance, if any. */
  static instance = null;

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "po-profile-defaults",
    classes: [MODULE_ID, "po-profile-defaults"],
    tag: "form",
    window: {
      title: "PO.ProfileDefaults.Title",
      icon: "fa-solid fa-sliders",
      contentClasses: ["standard-form"]
    },
    position: { width: 620, height: "auto" },
    form: {
      handler: ProfileDefaults.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true
    },
    actions: {
      resetDefaults: this.prototype._onResetDefaults
    }
  };

  /** @inheritDoc */
  static PARTS = {
    body: { template: TEMPLATES.PROFILE_DEFAULTS }
  };

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const profiles = getProfiles();
    const dsnActive = game.modules.get(DSN_MODULE_ID)?.active === true;
    context.dsnActive = dsnActive;
    context.profiles = PROFILE_ORDER.map(key => ({ key, label: localizeProfile(key) }));
    context.sections = [{
      id: "core",
      icon: "fa-solid fa-display",
      tabLabel: game.i18n.localize(`${L10N_PREFIX}.ProfileDefaults.Tabs.core`),
      legend: game.i18n.localize(`${L10N_PREFIX}.ProfileDefaults.CoreSection`),
      rows: this.#buildRows("core", profiles)
    }];
    if ( dsnActive ) context.sections.push({
      id: "dsn",
      icon: "fa-solid fa-dice-d20",
      tabLabel: game.i18n.localize(`${L10N_PREFIX}.ProfileDefaults.Tabs.dsn`),
      legend: game.i18n.localize(`${L10N_PREFIX}.ProfileDefaults.DsnSection`),
      hint: game.i18n.localize(`${L10N_PREFIX}.ProfileDefaults.DsnHint`),
      rows: this.#buildRows("dsn", profiles)
    });
    // Tabs only earn their keep with more than one section; a lone core section
    // renders flat so it never wastes vertical space on an unused tab strip.
    context.useTabs = context.sections.length > 1;
    return context;
  }

  /**
   * Build the template rows of one profile section: one row per managed
   * setting, one input cell per profile column.
   * @param {string} sectionKey  "core" or "dsn" (see PROFILE_FIELDS).
   * @param {Record<string, object>} profiles  Effective profiles from getProfiles().
   * @returns {object[]} Row contexts for profile-defaults.hbs.
   */
  #buildRows(sectionKey, profiles) {
    return PROFILE_FIELDS[sectionKey].map(field => ({
      label: game.i18n.localize(`${L10N_PREFIX}.ProfileDefaults.Fields.${sectionKey}.${field.key}`),
      tooltip: game.i18n.localize(`${L10N_PREFIX}.ProfileDefaults.Hints.${sectionKey}.${field.key}`),
      cells: PROFILE_ORDER.map(profileKey => {
        const value = profiles[profileKey]?.[sectionKey]?.[field.key];
        return {
          profileKey,
          name: `${profileKey}.${sectionKey}.${field.key}`,
          isCheckbox: field.type === "checkbox",
          isNumber: field.type === "number",
          isSelect: field.type === "select",
          value,
          min: field.min,
          max: field.max,
          step: field.step,
          choices: field.choices?.map(choice => ({
            value: choice.value,
            label: game.i18n.localize(`${L10N_PREFIX}.ProfileDefaults.Choices.${choice.labelKey}`),
            selected: choice.value === value
          }))
        };
      })
    }));
  }

  /** @inheritDoc */
  _onRender(context, options) {
    super._onRender(context, options);
    // Tabs are rendered inline within the single body part rather than through
    // the native part-per-tab system, because the DSN panel is conditional and
    // both panels must submit together; wire their switching here.
    for ( const item of this.element.querySelectorAll(".po-tabs .item") ) {
      item.addEventListener("click", this.#onClickTab.bind(this));
    }
  }

  /**
   * Reveal the clicked profile section and hide its siblings. Panels stay in
   * the DOM (only toggled with a class) so their inputs keep submitting even
   * while a different tab is showing. Called from `_onRender`.
   * @param {PointerEvent} event  The originating click event.
   * @returns {void}
   */
  #onClickTab(event) {
    const tab = event.currentTarget.dataset.tab;
    for ( const item of this.element.querySelectorAll(".po-tabs .item") ) {
      item.classList.toggle("active", item.dataset.tab === tab);
    }
    for ( const panel of this.element.querySelectorAll(".po-tab-panel") ) {
      panel.classList.toggle("active", panel.dataset.tab === tab);
    }
  }

  /** @inheritDoc */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    // The settings menu constructs a fresh instance on every click; close a
    // previously opened editor so two apps never share the same element id.
    if ( ProfileDefaults.instance && (ProfileDefaults.instance !== this) ) ProfileDefaults.instance.close();
    ProfileDefaults.instance = this;
  }

  /** @inheritDoc */
  _onClose(options) {
    super._onClose(options);
    if ( ProfileDefaults.instance === this ) ProfileDefaults.instance = null;
  }

  /**
   * Persist the edited profile table into the world-scoped overrides setting.
   * Declared in DEFAULT_OPTIONS.form (called with the app as `this`).
   * @param {SubmitEvent} event  The originating submit event.
   * @param {HTMLFormElement} form  The application form element.
   * @param {foundry.applications.ux.FormDataExtended} formData  Parsed form data.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const profiles = ProfileDefaults.#normalize(data);
    await game.settings.set(MODULE_ID, SETTINGS.PROFILE_OVERRIDES, profiles);
    ui.notifications.info(game.i18n.localize(`${L10N_PREFIX}.ProfileDefaults.Saved`));
  }

  /**
   * Coerce submitted form values onto the effective profiles. Starting from
   * getProfiles() (rather than an empty object) preserves the values of any
   * section absent from the form — the DSN rows are not rendered while Dice
   * So Nice is inactive, and its overrides must survive a save.
   * @param {object} data  Expanded form data ({low: {core: {...}}, ...}).
   * @returns {Record<string, object>} The full profile table to store.
   */
  static #normalize(data) {
    const profiles = getProfiles();
    for ( const profileKey of PROFILE_ORDER ) {
      for ( const [sectionKey, fields] of Object.entries(PROFILE_FIELDS) ) {
        const source = data[profileKey]?.[sectionKey];
        if ( !source ) continue;
        for ( const field of fields ) {
          if ( !(field.key in source) ) continue;
          let value = source[field.key];
          // Selects always submit strings; numeric fields must round-trip as numbers.
          if ( (field.type === "number") || (field.dtype === "number") ) value = Number(value);
          else if ( field.type === "checkbox" ) value = Boolean(value);
          if ( (typeof value === "number") && !Number.isFinite(value) ) continue;
          profiles[profileKey][sectionKey][field.key] = value;
        }
      }
    }
    return profiles;
  }

  /**
   * Clear the world overrides after confirmation, restoring the compile-time
   * defaults, then re-render the form with the restored values.
   * Declared in DEFAULT_OPTIONS.actions.
   * @param {PointerEvent} event  The originating click event.
   * @param {HTMLElement} target  The element carrying [data-action].
   * @returns {Promise<void>}
   */
  async _onResetDefaults(event, target) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: `${L10N_PREFIX}.ProfileDefaults.ResetTitle` },
      content: `<p>${game.i18n.localize(`${L10N_PREFIX}.ProfileDefaults.ResetContent`)}</p>`
    });
    if ( !confirmed ) return;
    await game.settings.set(MODULE_ID, SETTINGS.PROFILE_OVERRIDES, {});
    ui.notifications.info(game.i18n.localize(`${L10N_PREFIX}.ProfileDefaults.ResetDone`));
    this.render();
  }
}
