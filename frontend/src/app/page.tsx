"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { APP_VERSION } from "@/lib/version";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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
          <h1 className="text-4xl font-bold text-white mb-2">KGolfDraft</h1>
          <p className="text-green-300 text-lg">Golf Snake Draft</p>
          <p className="text-green-600 text-xs mt-1">v{APP_VERSION}</p>
        </div>

        <form
          onSubmit={handleLogin}
          className="bg-green-900/50 backdrop-blur rounded-xl p-8 shadow-2xl border border-green-800"
        >
          <label
            htmlFor="email"
            className="block text-sm font-medium text-green-200 mb-2"
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
            className="w-full px-4 py-3 rounded-lg bg-green-950 border border-green-700 text-white placeholder-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />

          {error && (
            <p className="mt-3 text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 py-3 px-4 rounded-lg bg-green-600 hover:bg-green-500 disabled:bg-green-800 disabled:cursor-not-allowed text-white font-semibold transition-colors"
          >
            {loading ? "Connecting..." : "Join Draft"}
          </button>
        </form>
      </div>
    </div>
  );
}
