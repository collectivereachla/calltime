import { cookies } from "next/headers";

const COOKIE_NAME = "calltime_active_production";

export async function getActiveProductionId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value || null;
}

export async function setActiveProductionId(productionId: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, productionId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
  });
}
