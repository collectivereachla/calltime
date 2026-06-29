import { getTheme, themeToCss } from "@/lib/theme";

// Injects the live theme as :root CSS-variable overrides (over the @theme
// defaults). Seeded with current values, so no change until edited.
export async function ThemeStyle() {
  const css = themeToCss(await getTheme());
  return <style id="ct-theme">{css}</style>;
}
