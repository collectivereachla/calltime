"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function PublicHeader({ back }: { back?: { href: string; label: string } }) {
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });
  }, []);

  async function handleLogout() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="border-b border-bone bg-card/50">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {back ? (
            <Link href={back.href} className="text-body-sm text-ash hover:text-brick transition-colors">
              ← {back.label}
            </Link>
          ) : (
            <Link href="/directory" className="font-marquee text-body-lg text-ink hover:text-brick transition-colors">
              Calltime<span className="text-brick">.</span>
            </Link>
          )}
        </div>

        <div className="flex items-center gap-3">
          {back && (
            <Link href="/directory" className="font-marquee text-body-lg text-ink hover:text-brick transition-colors">
              Calltime<span className="text-brick">.</span>
            </Link>
          )}
          {user ? (
            <button
              onClick={handleLogout}
              disabled={loading}
              className="text-body-sm text-ash hover:text-brick transition-colors disabled:opacity-50"
            >
              {loading ? "..." : "Sign out"}
            </button>
          ) : (
            <Link href="/login" className="text-body-sm text-ash hover:text-brick transition-colors">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
