/**
 * Boot script that reads user preference values (theme mode, theme preset,
 * content layout, navbar style) from cookies or localStorage based on the
 * configured persistence mode.
 *
 * Runs early in <head> to apply the correct data attributes before hydration,
 * preventing layout or theme flicker and keeping RootLayout fully static.
 */
import { fontRegistry } from "@/lib/fonts/registry";
import {
  CONTENT_LAYOUT_VALUES,
  NAVBAR_STYLE_VALUES,
  SIDEBAR_COLLAPSIBLE_VALUES,
  SIDEBAR_VARIANT_VALUES,
} from "@/lib/preferences/layout";
import { PREFERENCE_DEFAULTS, PREFERENCE_PERSISTENCE, type PreferenceKey } from "@/lib/preferences/preferences-config";
import { THEME_MODE_VALUES, THEME_PRESET_VALUES } from "@/lib/preferences/theme";

const allowedValues = {
  theme_mode: THEME_MODE_VALUES,
  theme_preset: THEME_PRESET_VALUES,
  font: Object.keys(fontRegistry),
  content_layout: CONTENT_LAYOUT_VALUES,
  navbar_style: NAVBAR_STYLE_VALUES,
  sidebar_variant: SIDEBAR_VARIANT_VALUES,
  sidebar_collapsible: SIDEBAR_COLLAPSIBLE_VALUES,
} satisfies Record<PreferenceKey, readonly string[]>;

export function ThemeBootScript() {
  const code = `
    (function () {
      try {
        var root = document.documentElement;
        var PERSISTENCE = ${JSON.stringify(PREFERENCE_PERSISTENCE)};
        var DEFAULTS = ${JSON.stringify(PREFERENCE_DEFAULTS)};
        var ALLOWED_VALUES = ${JSON.stringify(allowedValues)};

        function readCookie(name) {
          try {
            var prefix = name + "=";
            var match = document.cookie.split(";").map(function(cookie) {
              return cookie.trimStart();
            }).find(function(cookie) {
              return cookie.startsWith(prefix);
            });
            return match ? decodeURIComponent(match.slice(prefix.length)) : null;
          } catch (e) {
            return null;
          }
        }

        function readLocal(name) {
          try {
            return window.localStorage.getItem(name);
          } catch (e) {
            return null;
          }
        }

        function readPreference(key) {
          var mode = PERSISTENCE[key];
          var value = null;

          if (mode === "localStorage") {
            value = readLocal(key);
          } else if (mode === "client-cookie" || mode === "server-cookie") {
            value = readCookie(key);
          }

          return ALLOWED_VALUES[key].includes(value) ? value : DEFAULTS[key];
        }

        var mode = readPreference("theme_mode");
        var resolvedMode =
          mode === "system" && window.matchMedia
            ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
            : mode;

        root.classList.toggle("dark", resolvedMode === "dark");
        root.setAttribute("data-theme-mode", mode);
        root.setAttribute("data-theme-preset", readPreference("theme_preset"));
        root.setAttribute("data-font", readPreference("font"));
        root.setAttribute("data-content-layout", readPreference("content_layout"));
        root.setAttribute("data-navbar-style", readPreference("navbar_style"));
        root.setAttribute("data-sidebar-variant", readPreference("sidebar_variant"));
        root.setAttribute("data-sidebar-collapsible", readPreference("sidebar_collapsible"));

        root.style.colorScheme = resolvedMode === "dark" ? "dark" : "light";

      } catch (e) {
        console.warn("ThemeBootScript error:", e);
      }
    })();
  `;

  /* biome-ignore lint/security/noDangerouslySetInnerHtml: required for pre-hydration boot script */
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
