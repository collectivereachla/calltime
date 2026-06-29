"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

export async function setMode(mode: "ase" | "tulia") {
  const c = await cookies();
  c.set("calltime_mode", mode === "tulia" ? "tulia" : "ase", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}
