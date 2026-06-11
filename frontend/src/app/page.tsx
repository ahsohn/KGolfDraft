"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { APP_VERSION } from "@/lib/version";
import { getTheme, applyThemeAttr } from "@/lib/themes";

export default function LoginPage() {
  const [email, setEmail] = useState("");
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
      { email: email.trim(), token: existingToken },
      (res: {
        success: boolean;
        error?: string;
        token?: string;
        user?: { name: string };
      }) => {
        setLoading(false);
        if (res.success) {
          if (res.token) {
            localStorage.setItem("kgolfdraft_token", res.token);
          }
          router.push("/draft");
        } else {
          setError(res.error || "Login failed");
          socket.disconnect();
        }
      }
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            {theme.appTitle}
          </h1>
          <p className="text-theme-300 text-lg">{theme.subtitle}</p>
          <p className="text-theme-600 text-xs mt-1">v{APP_VERSION}</p>
        </div>

        <form
          onSubmit={handleLogin}
          className="bg-theme-900/50 backdrop-blur rounded-xl p-8 shadow-2xl border border-theme-800"
        >
          <label
            htmlFor="email"
            className="block text-sm font-medium text-theme-200 mb-2"
          >
            Email Address
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-4 py-3 rounded-lg bg-theme-950 border border-theme-700 text-white placeholder-theme-600 focus:outline-none focus:ring-2 focus:ring-theme-500 focus:border-transparent"
          />

          {error && (
            <p className="mt-3 text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 py-3 px-4 rounded-lg bg-theme-600 hover:bg-theme-500 disabled:bg-theme-800 disabled:cursor-not-allowed text-white font-semibold transition-colors"
          >
            {loading ? "Connecting..." : "Join Draft"}
          </button>
        </form>
      </div>
    </div>
  );
}
