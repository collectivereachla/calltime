import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: person } = await supabase
    .from("people")
    .select(
      "id, full_name, preferred_name, pronouns, email, phone, bio, birth_month, birth_day, is_minor"
    )
    .eq("user_id", user.id)
    .single();

  if (!person) redirect("/onboarding");

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 md:px-0">
      <h1 className="font-display text-display-lg text-ink mb-1">Settings</h1>
      <p className="text-body-sm text-ash mb-8">
        Manage your profile and account.
      </p>

      <SettingsForm person={person} userEmail={user.email || ""} />
    </div>
  );
}
