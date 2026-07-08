/*!
 * Performance Optimizer
 * Copyright (c) 2026 https://github.com/brunocalado
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3.
 */

/**
 * Module id. Single source of truth, mirroring the `id` field of module.json.
 * @type {string}
 */
export const MODULE_ID = "performance-optimizer";

/**
 * Socket event name for fire-and-forget broadcasts (`game.socket`).
 * @type {string}
 */
export const SOCKET_EVENT = `module.${MODULE_ID}`;

/**
 * Localization prefix used by every key in languages/*.json.
 * @type {string}
 */
export const L10N_PREFIX = "PO";

/**
 * Setting keys registered under the module namespace.
 * All keys are client-scoped (performance is a per-machine concern) except
 * PROFILE_OVERRIDES, which is world-scoped so the GM's customized profile
 * defaults apply to every client.
 * @enum {string}
 */
export const SETTINGS = {
  /** Whether this user has already answered the profile dialog. */
  PROMPTED: "prompted",
  /** Last profile key explicitly applied on this client ("low"|"medium"|"high"|""). */
  CHOSEN_PROFILE: "chosenProfile",
  /** Enables the periodic FPS check that recommends a lighter profile. */
  AUTO_FPS_CHECK: "autoFpsCheck",
  /** Timestamp (ms) until which FPS recommendations are muted after a refusal. */
  FPS_SNOOZE_UNTIL: "fpsSnoozeUntil",
  /** Permanently hides FPS recommendations ("Don't show again"). */
  FPS_NEVER_SHOW: "fpsNeverShow",
  /** World-scoped: GM customizations layered over DEFAULT_PROFILES. */
  PROFILE_OVERRIDES: "profileOverrides"
};

/**
 * Settings-menu registration key for the GM panel button.
 * @type {string}
 */
export const GM_PANEL_MENU = "gmPanelMenu";

/**
 * Settings-menu registration key for the profile defaults editor.
 * @type {string}
 */
export const PROFILE_DEFAULTS_MENU = "profileDefaultsMenu";

/**
 * Module id of Dice So Nice, whose per-client performance options the
 * profiles also manage when that module is active in the world.
 * @type {string}
 */
export const DSN_MODULE_ID = "dice-so-nice";

/**
 * User-flag key where Dice So Nice (v4.1+) stores its per-user options.
 * DSN reads it through `Dice3D.CONFIG()` as `user.getFlag("dice-so-nice",
 * "settings")` — its `game.settings` entry of the same name is a legacy
 * migration shim, so flags are the correct write target.
 * @type {string}
 */
export const DSN_SETTINGS_FLAG = "settings";

/**
 * Inter-client query names registered on CONFIG.queries.
 * Queries are the v14 promise-based channel; use them whenever a response
 * from the remote client is needed (§7 of the project conventions).
 * @enum {string}
 */
export const QUERIES = {
  /** GM -> player: report current profile state. */
  GET_STATE: `${MODULE_ID}.getState`,
  /** GM -> player: apply a given profile locally, then confirm reload. */
  APPLY_PROFILE: `${MODULE_ID}.applyProfile`,
  /** GM -> player: (re)open the profile chooser dialog. */
  SHOW_DIALOG: `${MODULE_ID}.showDialog`
};

/**
 * Message types carried over SOCKET_EVENT broadcasts.
 * @enum {string}
 */
export const SOCKET_TYPES = {
  /** Player -> GMs: batched FPS samples recorded on the benchmark scene. */
  FPS_BATCH: "fpsBatch",
  /** Any client -> GMs: this user's profile state changed; refresh panels. */
  STATE_CHANGED: "stateChanged"
};

/**
 * Core (client-scoped) setting keys managed by the quality profiles.
 * Order matters only for comparison; all keys live in the "core" namespace.
 * @type {string[]}
 */
export const CORE_SETTING_KEYS = [
  "performanceMode",
  "maxFPS",
  "pixelRatioResolutionScaling",
  "photosensitiveMode",
  "mipmap",
  "visionAnimation",
  "lightAnimation"
];

/**
 * The three predefined quality profiles. Each has a `core` section (Foundry
 * client settings in the "core" namespace) and a `dsn` section (Dice So Nice
 * per-user options, applied only when that module is active).
 * `performanceMode` values follow CONST.CANVAS_PERFORMANCE_MODES (LOW=0, MED=1, MAX=3).
 * The `dsn` values mirror Dice So Nice's own performance scaling: DSN v6
 * derives exactly these eight options from core `performanceMode` 0/1/3 when
 * the user never customized them, so each tier reuses DSN's mapping for the
 * matching mode ("msaa" downgrades to "smaa" at apply time without WebGL2).
 * These are compile-time defaults — read the effective profiles (with the
 * GM's world overrides applied) through `getProfiles()` in profiles.js.
 * @type {Record<string, {core: Record<string, number|boolean>, dsn: Record<string, string|boolean>}>}
 */
export const DEFAULT_PROFILES = {
  low: {
    core: {
      performanceMode: 0,
      maxFPS: 10,
      pixelRatioResolutionScaling: false,
      photosensitiveMode: true,
      mipmap: false,
      visionAnimation: false,
      lightAnimation: false
    },
    dsn: {
      imageQuality: "low",
      shadowQuality: "low",
      antialiasing: "none",
      bumpMapping: false,
      glow: false,
      useHighDPI: false,
      persistentDiceOutlines: false,
      advancedGlass: false
    }
  },
  medium: {
    core: {
      performanceMode: 1,
      maxFPS: 30,
      pixelRatioResolutionScaling: true,
      photosensitiveMode: false,
      mipmap: true,
      visionAnimation: true,
      lightAnimation: true
    },
    dsn: {
      imageQuality: "medium",
      shadowQuality: "low",
      antialiasing: "none",
      bumpMapping: true,
      glow: false,
      useHighDPI: false,
      persistentDiceOutlines: false,
      advancedGlass: false
    }
  },
  high: {
    core: {
      performanceMode: 3,
      maxFPS: 60,
      pixelRatioResolutionScaling: true,
      photosensitiveMode: false,
      mipmap: true,
      visionAnimation: true,
      lightAnimation: true
    },
    dsn: {
      imageQuality: "high",
      shadowQuality: "high",
      antialiasing: "msaa",
      bumpMapping: true,
      glow: true,
      useHighDPI: true,
      persistentDiceOutlines: true,
      advancedGlass: true
    }
  }
};

/**
 * Form-field descriptors for the profile defaults editor, one entry per
 * profile setting, grouped by profile section ("core" | "dsn").
 * `type` selects the input widget; `dtype: "number"` marks selects whose
 * submitted string value must be coerced back to Number. Labels resolve to
 * `PO.ProfileDefaults.Fields.<section>.<key>` and each choice to
 * `PO.ProfileDefaults.Choices.<labelKey>`.
 * @type {Record<string, {key: string, type: "select"|"number"|"checkbox", dtype?: string,
 *   min?: number, max?: number, step?: number,
 *   choices?: {value: number|string, labelKey: string}[]}[]>}
 */
export const PROFILE_FIELDS = {
  core: [
    {
      key: "performanceMode", type: "select", dtype: "number",
      choices: [
        { value: 0, labelKey: "pmLow" },
        { value: 1, labelKey: "pmMed" },
        { value: 2, labelKey: "pmHigh" },
        { value: 3, labelKey: "pmMax" }
      ]
    },
    { key: "maxFPS", type: "number", min: 5, max: 120, step: 5 },
    { key: "pixelRatioResolutionScaling", type: "checkbox" },
    { key: "photosensitiveMode", type: "checkbox" },
    { key: "mipmap", type: "checkbox" },
    { key: "visionAnimation", type: "checkbox" },
    { key: "lightAnimation", type: "checkbox" }
  ],
  dsn: [
    {
      key: "imageQuality", type: "select",
      choices: [
        { value: "low", labelKey: "low" },
        { value: "medium", labelKey: "medium" },
        { value: "high", labelKey: "high" }
      ]
    },
    {
      key: "shadowQuality", type: "select",
      choices: [
        { value: "none", labelKey: "none" },
        { value: "low", labelKey: "low" },
        { value: "medium", labelKey: "medium" },
        { value: "high", labelKey: "high" }
      ]
    },
    {
      key: "antialiasing", type: "select",
      choices: [
        { value: "none", labelKey: "none" },
        { value: "smaa", labelKey: "smaa" },
        { value: "msaa", labelKey: "msaa" }
      ]
    },
    { key: "bumpMapping", type: "checkbox" },
    { key: "glow", type: "checkbox" },
    { key: "useHighDPI", type: "checkbox" },
    { key: "persistentDiceOutlines", type: "checkbox" },
    { key: "advancedGlass", type: "checkbox" }
  ]
};

/**
 * Display/iteration order of the profiles, weakest first.
 * @type {string[]}
 */
export const PROFILE_ORDER = ["low", "medium", "high"];

/**
 * Sentinel profile key meaning "settings match none of the presets".
 * @type {string}
 */
export const CUSTOM_PROFILE = "custom";

/**
 * FPS auto-detection rules: when the detected profile is the key and the
 * 2-minute average FPS falls below `threshold`, recommend `target`.
 * The "low" profile is intentionally absent — there is nothing weaker to offer.
 * @type {Record<string, {threshold: number, target: string}>}
 */
export const FPS_RECOMMENDATION_RULES = {
  high: { threshold: 30, target: "medium" },
  medium: { threshold: 15, target: "low" },
  [CUSTOM_PROFILE]: { threshold: 15, target: "low" }
};

/**
 * Timing constants for FPS sampling and benchmark reporting.
 * @type {Record<string, number>}
 */
export const FPS_TIMING = {
  /** Interval between raw ticker reads (ms). */
  TICK_MS: 1000,
  /** Raw reads aggregated into one averaged sample (10 s buckets). */
  READS_PER_SAMPLE: 10,
  /** Averaged samples per evaluation window (12 x 10 s = 2 minutes). */
  SAMPLES_PER_WINDOW: 12,
  /** Mute duration after the user refuses a recommendation (24 h in ms). */
  SNOOZE_MS: 24 * 60 * 60 * 1000,
  /** Interval between benchmark FPS socket batches (ms). */
  BENCHMARK_SEND_MS: 5000,
  /** Maximum FPS points retained per user in the benchmark monitor. */
  MONITOR_MAX_POINTS: 600
};

/**
 * Flag key (scoped to MODULE_ID) identifying the benchmark scene.
 * @type {string}
 */
export const BENCHMARK_SCENE_FLAG = "benchmarkScene";

/**
 * Module-relative path of the benchmark scene source data.
 * @type {string}
 */
export const BENCHMARK_JSON_PATH = `modules/${MODULE_ID}/assets/benchmark.json`;

/**
 * Handlebars template paths, one per Application part.
 * @type {Record<string, string>}
 */
export const TEMPLATES = {
  PROFILE_DIALOG: `modules/${MODULE_ID}/templates/profile-dialog.hbs`,
  GM_PANEL: `modules/${MODULE_ID}/templates/gm-panel.hbs`,
  BENCHMARK_MONITOR: `modules/${MODULE_ID}/templates/benchmark-monitor.hbs`,
  PROFILE_DEFAULTS: `modules/${MODULE_ID}/templates/profile-defaults.hbs`
};
