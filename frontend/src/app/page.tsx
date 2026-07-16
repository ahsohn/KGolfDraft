"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { APP_VERSION } from "@/lib/version";
import { getTheme, applyThemeAttr } from "@/lib/themes";

const inputCls =
  "w-full px-3.5 py-[13px] bg-[rgba(10,43,29,0.6)] border border-gold/30 text-cream placeholder-cream/35 text-base focus:outline-none focus:border-gold";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [pinRequired, setPinRequired] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [themeKey, setThemeKey] = useState<string>("golf");
  const router = useRouter();

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
    fetch(`${url}/health`)
      .then((res) => res.json())
      .then((data) => {
        if (data.theme) {
          setThemeKey(data.theme);
          applyThemeAttr(data.theme);
        }
      })
      .catch(() => {
        // Backend unreachable — keep the golf default
      });
  }, []);

  const theme = getTheme(themeKey);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const socket = getSocket();
    socket.connect();

    socket.on("connect_error", () => {
      setError("Cannot connect to draft server. Is the backend running?");
      setLoading(false);
    });

    const existingToken = localStorage.getItem("kgolfdraft_token");

    socket.emit(
      "login",
      {
        email: email.trim(),
        pin: pinRequired ? pin.trim() : undefined,
        token: existingToken,
      },
      (res: {
        success: boolean;
        error?: string;
        requiresPin?: boolean;
        token?: string;
        user?: { name: string };
      }) => {
        setLoading(false);
        if (res.success) {
          if (res.token) {
            localStorage.setItem("kgolfdraft_token", res.token);
          }
          router.push("/draft");
        } else if (res.requiresPin) {
          setPinRequired(true);
          setError(res.error || "");
          socket.disconnect();
        } else {
          setError(res.error || "Login failed");
          socket.disconnect();
        }
      }
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 border-t-[3px] border-gold">
      <div className="w-full max-w-[420px]">
        <div className="text-center mb-9">
          <div className="flex items-center justify-center gap-3.5 mb-2.5">
            <span className="w-12 h-px bg-gold" />
            <span className="text-[11px] tracking-[3px] uppercase text-gold">
              {theme.subtitle}
            </span>
            <span className="w-12 h-px bg-gold" />
          </div>
          <h1 className="font-serif text-[44px] font-semibold text-cream leading-tight">
            {theme.appTitle}
          </h1>
          <p className="font-serif italic text-base text-cream/60 mt-2">
            {theme.tagline}
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          className="border border-gold/50 bg-cream/[0.04] p-8"
        >
          <label
            htmlFor="email"
            className="block text-[11px] tracking-[2.5px] uppercase text-gold mb-2.5"
          >
            Email Address
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setPinRequired(false);
              setPin("");
            }}
            placeholder="you@example.com"
            className={inputCls}
          />

          {pinRequired && (
            <div className="mt-5">
              <label
                htmlFor="pin"
                className="block text-[11px] tracking-[2.5px] uppercase text-gold mb-2.5"
              >
                Super-Admin PIN
              </label>
              <input
                id="pin"
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter your PIN"
                className={inputCls}
              />
            </div>
          )}

          {error && <p className="mt-3 text-rosewood text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 px-4 py-3.5 bg-gold hover:bg-gold-bright disabled:opacity-60 disabled:cursor-not-allowed text-clubhouse font-semibold text-[13px] tracking-[2.5px] uppercase transition-colors"
          >
            {loading
              ? "Connecting…"
              : pinRequired
              ? "Verify PIN"
              : "Join the Draft"}
          </button>
        </form>

        <p className="text-center text-[11px] text-cream/35 mt-5">
          v{APP_VERSION}
        </p>
      </div>
    </div>
  );
}
