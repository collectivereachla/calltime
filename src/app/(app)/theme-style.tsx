import { getTheme, themeToCss, getMode } from "@/lib/theme";

// Injects the live theme as :root CSS-variable overrides. Mode (Àṣẹ/Tulia)
// comes from the calltime_mode cookie; Tulia darkens the neutrals.
export async function ThemeStyle() {
  const [theme, mode] = await Promise.all([getTheme(), getMode()]);
  return <style id="ct-theme">{themeToCss(theme, mode)}</style>;
}
