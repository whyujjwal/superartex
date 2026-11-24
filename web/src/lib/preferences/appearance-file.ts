import { fontRegistry } from "@/lib/fonts/registry";

import {
  CONTENT_LAYOUT_VALUES,
  NAVBAR_STYLE_VALUES,
  SIDEBAR_COLLAPSIBLE_VALUES,
  SIDEBAR_VARIANT_VALUES,
  UI_SCALE_VALUES,
} from "./layout";
import type { PreferenceKey, PreferenceValueMap } from "./preferences-config";
import { THEME_MODE_VALUES, THEME_PRESET_VALUES } from "./theme";

const FORMAT = "superartex-appearance";
const VERSION = 1;
export const MAX_APPEARANCE_FILE_BYTES = 4 * 1024;

const allowedValues = {
  theme_mode: THEME_MODE_VALUES,
  theme_preset: THEME_PRESET_VALUES,
  font: Object.keys(fontRegistry),
  ui_scale: UI_SCALE_VALUES,
  content_layout: CONTENT_LAYOUT_VALUES,
  navbar_style: NAVBAR_STYLE_VALUES,
  sidebar_variant: SIDEBAR_VARIANT_VALUES,
  sidebar_collapsible: SIDEBAR_COLLAPSIBLE_VALUES,
} satisfies Record<PreferenceKey, readonly string[]>;

const keys = Object.keys(allowedValues) as PreferenceKey[];

export function serializeAppearanceFile(settings: PreferenceValueMap): string {
  const preferences = Object.fromEntries(keys.map((key) => [key, settings[key]]));
  return `${JSON.stringify({ format: FORMAT, version: VERSION, preferences }, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseAppearanceFile(text: string): PreferenceValueMap | null {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(file) || Object.keys(file).length !== 3 || file.format !== FORMAT || file.version !== VERSION)
    return null;

  const preferences = file.preferences;
  if (!isRecord(preferences) || Object.keys(preferences).length !== keys.length) return null;
  for (const key of keys) {
    const accepted: readonly string[] = allowedValues[key];
    const value = preferences[key];
    if (!Object.hasOwn(preferences, key) || typeof value !== "string" || !accepted.includes(value)) return null;
  }
  return preferences as PreferenceValueMap;
}
