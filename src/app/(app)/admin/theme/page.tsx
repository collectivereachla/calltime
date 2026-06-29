import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { getTheme, DISPLAY_FONTS, BODY_FONTS, MONO_FONTS, COLOR_KEYS } from "@/lib/theme";
import { ThemeEditor } from "./theme-editor";

export const dynamic = "force-dynamic";

export default async function ThemePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();
  const { data: me } = await supabase
    .from("people").select("is_platform_admin").eq("user_id", user.id).maybeSingle();
  if (!me?.is_platform_admin) notFound();

  const theme = await getTheme();
  return (
    <ThemeEditor
      initial={theme}
      displayFonts={DISPLAY_FONTS}
      bodyFonts={BODY_FONTS}
      monoFonts={MONO_FONTS}
      colorKeys={COLOR_KEYS}
    />
  );
}
