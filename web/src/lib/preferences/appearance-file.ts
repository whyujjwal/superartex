import { fontRegistry } from "@/lib/fonts/registry";

import {
  CONTENT_LAYOUT_VALUES,
  FOCUS_OUTLINE_VALUES,
  MOTION_VALUES,
  NAVBAR_STYLE_VALUES,
  SIDEBAR_COLLAPSIBLE_VALUES,
  SIDEBAR_VARIANT_VALUES,
  UI_SCALE_VALUES,
} from "./layout";
import type { PreferenceKey, PreferenceValueMap } from "./preferences-config";
import { THEME_MODE_VALUES, THEME_PRESET_VALUES } from "./theme";

const FORMAT = "superartex-appearance";
const VERSION = 3;
export const MAX_APPEARANCE_FILE_BYTES = 4 * 1024;

const versionOneValues = {
  theme_mode: THEME_MODE_VALUES,
  theme_preset: THEME_PRESET_VALUES,
  font: Object.keys(fontRegistry),
  ui_scale: UI_SCALE_VALUES,
  content_layout: CONTENT_LAYOUT_VALUES,
  navbar_style: NAVBAR_STYLE_VALUES,
  sidebar_variant: SIDEBAR_VARIANT_VALUES,
  sidebar_collapsible: SIDEBAR_COLLAPSIBLE_VALUES,
};

const versionTwoValues = { ...versionOneValues, motion: MOTION_VALUES };
const allowedValues = { ...versionTwoValues, focus_outline: FOCUS_OUTLINE_VALUES } satisfies Record<
  PreferenceKey,
  readonly string[]
>;
const valuesByVersion = { 1: versionOneValues, 2: versionTwoValues, [VERSION]: allowedValues };

const keys = Object.keys(allowedValues) as PreferenceKey[];

// Importing older files leaves any preferences they omit in place.
export type ImportedAppearanceSettings = Pick<PreferenceValueMap, keyof typeof versionOneValues> &
  Partial<Pick<PreferenceValueMap, "motion" | "focus_outline">>;

export function serializeAppearanceFile(settings: PreferenceValueMap): string {
  const preferences = Object.fromEntries(keys.map((key) => [key, settings[key]]));
  return `${JSON.stringify({ format: FORMAT, version: VERSION, preferences }, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseAppearanceFile(text: string): ImportedAppearanceSettings | null {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    return null;
  }
  if (
    !isRecord(file) ||
    Object.keys(file).length !== 3 ||
    file.format !== FORMAT ||
    (file.version !== 1 && file.version !== 2 && file.version !== VERSION)
  ) {
    return null;
  }

  const preferences = file.preferences;
  const requiredKeys = Object.keys(valuesByVersion[file.version]) as PreferenceKey[];
  if (!isRecord(preferences) || Object.keys(preferences).length !== requiredKeys.length) return null;
  for (const key of requiredKeys) {
    const accepted: readonly string[] = allowedValues[key];
    const value = preferences[key];
    if (!Object.hasOwn(preferences, key) || typeof value !== "string" || !accepted.includes(value)) return null;
  }
  return preferences as ImportedAppearanceSettings;
}
