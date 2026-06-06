import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [{ title: "Sign in — Fairway Club" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName || email.split("@")[0] },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast.success("Welcome to the Club");
        navigate({ to: "/" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/" });
      }
    } catch (err: unknown) {
      // Keep error messages generic to avoid leaking whether an email exists
      if (mode === "signup") {
        toast.error("Couldn't create account. Try a stronger password or a different email.");
      } else {
        toast.error("Sign in failed. Check your email and password.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex justify-center">
      <div className="w-full max-w-md min-h-screen bg-cream shadow-2xl flex flex-col">
        <div className="bg-forest text-cream px-8 pt-16 pb-12 text-center">
          <p className="text-[10px] uppercase tracking-club text-gold mb-2">Members Only</p>
          <h1 className="font-display text-4xl leading-tight">Fairway Club</h1>
          <p className="text-cream/70 text-sm mt-3 max-w-xs mx-auto">
            A private app for organising rounds, running season games, and planning trips with your golf group.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-8 py-10 space-y-5">
          <div className="flex bg-paper rounded-full p-1 border border-border text-xs font-bold uppercase tracking-club">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 py-2 rounded-full transition-colors ${mode === "signin" ? "bg-forest text-cream" : "text-muted-foreground"}`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 py-2 rounded-full transition-colors ${mode === "signup" ? "bg-forest text-cream" : "text-muted-foreground"}`}
            >
              Join
            </button>
          </div>

          {mode === "signup" && (
            <Field label="Name">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="James Donovan"
                className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-forest"
              />
            </Field>
          )}
          <Field label="Email">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@club.com"
              className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-forest"
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-forest"
            />
          </Field>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-forest text-cream py-3.5 rounded-full text-xs font-bold uppercase tracking-club disabled:opacity-60"
          >
            {loading ? "Please wait…" : mode === "signin" ? "Enter the Club" : "Create Account"}
          </button>

          <p className="text-center text-[10px] uppercase tracking-club text-muted-foreground pt-2">
            Private golf societies · By invitation
          </p>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-club text-muted-foreground mb-2 font-bold">
        {label}
      </span>
      {children}
    </label>
  );
}
