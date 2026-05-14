"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/home");
    router.refresh();
  }

  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setResetSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Wordmark */}
        <h1 className="font-display text-display-lg text-center mb-12">
          Calltime<span className="text-brick">.</span>
        </h1>

        {resetSent ? (
          <div className="bg-confirmed/5 border border-confirmed/20 rounded-card px-4 py-6 text-center">
            <p className="text-body-md text-ink">Check your email for a reset link.</p>
            <button
              onClick={() => { setResetSent(false); setResetMode(false); }}
              className="text-body-sm text-ash hover:text-brick mt-3 transition-colors"
            >
              Back to sign in
            </button>
          </div>
        ) : resetMode ? (
          <form onSubmit={handleResetRequest} className="space-y-4">
            {error && (
              <div className="text-body-sm text-brick bg-brick/5 border border-brick/20 rounded-card px-4 py-3">
                {error}
              </div>
            )}
            <div>
              <label htmlFor="email" className="block text-body-sm text-ash mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
                placeholder="you@company.org"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !email}
              className="w-full py-2.5 bg-ink text-paper font-body text-body-md font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Sending..." : "Send reset link"}
            </button>
            <button
              type="button"
              onClick={() => setResetMode(false)}
              className="w-full text-center text-body-sm text-ash hover:text-brick transition-colors"
            >
              Back to sign in
            </button>
          </form>
        ) : (
          <>
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <div className="text-body-sm text-brick bg-brick/5 border border-brick/20 rounded-card px-4 py-3">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-body-sm text-ash mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
                  placeholder="you@company.org"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="block text-body-sm text-ash">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setResetMode(true)}
                    className="text-body-xs text-muted hover:text-brick transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-ink text-paper font-body text-body-md font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>

            <p className="text-center text-body-sm text-ash mt-8">
              No account?{" "}
              <Link href="/signup" className="text-ink underline underline-offset-2 hover:text-brick transition-colors">
                Create one
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
