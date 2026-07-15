"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { DraftState, User, ChatMessage } from "@/lib/types";
import { getTheme, applyThemeAttr } from "@/lib/themes";
import PlayerList from "@/components/PlayerList";
import DraftBoard from "@/components/DraftBoard";
import Chat from "@/components/Chat";
import MyTeam from "@/components/MyTeam";
import AdminPanel from "@/components/AdminPanel";

export default function DraftPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);

  // In-site error banner (replaces native alert() popups)
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  // Connect and authenticate on mount
  useEffect(() => {
    const socket = getSocket();
    const token = localStorage.getItem("kgolfdraft_token");

    if (!token) {
      router.push("/");
      return;
    }

    function authenticateWithToken() {
      setConnected(true);
      socket.emit(
        "login",
        { email: "", token },
        (res: {
          success: boolean;
          user?: User;
          draftState?: DraftState;
          chatHistory?: ChatMessage[];
          error?: string;
        }) => {
          if (res.success && res.user && res.draftState) {
            setCurrentUser(res.user);
            setDraftState(res.draftState);
            setMessages(res.chatHistory || []);
          } else {
            localStorage.removeItem("kgolfdraft_token");
            router.push("/");
          }
        }
      );
    }

    if (socket.connected) {
      // Socket already connected (e.g. navigated from login page)
      authenticateWithToken();
    } else {
      socket.connect();
    }

    socket.on("connect", () => {
      authenticateWithToken();
    });

    socket.on("connect_error", () => {
      setConnected(false);
    });

    socket.on("disconnect", () => setConnected(false));

    socket.on("draft-started", (state: DraftState) => {
      setDraftState(state);
    });

    socket.on(
      "pick-made",
      ({ draftState: state }: { draftState: DraftState }) => {
        setDraftState(state);
      }
    );

    socket.on("draft-complete", (state: DraftState) => {
      setDraftState(state);
    });

    // Full state push — sent when the super-admin switches/reconfigures the
    // current draft or undoes a pick
    socket.on(
      "draft-state",
      ({
        draftState: state,
        chatHistory,
      }: {
        draftState: DraftState;
        chatHistory?: ChatMessage[];
      }) => {
        setDraftState(state);
        if (chatHistory) {
          setMessages(chatHistory);
        }
      }
    );

    socket.on("chat-message", (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on(
      "auto-draft-updated",
      ({ email, enabled }: { email: string; enabled: boolean }) => {
        setDraftState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            autoDraft: { ...prev.autoDraft, [email]: enabled },
          };
        });
      }
    );

    socket.on(
      "user-online",
      ({
        onlineUsers,
      }: {
        email: string;
        name: string;
        onlineUsers: string[];
      }) => {
        setDraftState((prev) => {
          if (!prev) return prev;
          return { ...prev, onlineUsers };
        });
      }
    );

    socket.on(
      "user-offline",
      ({
        onlineUsers,
      }: {
        email: string;
        name: string;
        onlineUsers: string[];
      }) => {
        setDraftState((prev) => {
          if (!prev) return prev;
          return { ...prev, onlineUsers };
        });
      }
    );

    return () => {
      socket.off("connect");
      socket.off("connect_error");
      socket.off("disconnect");
      socket.off("draft-started");
      socket.off("pick-made");
      socket.off("draft-complete");
      socket.off("draft-state");
      socket.off("chat-message");
      socket.off("auto-draft-updated");
      socket.off("user-online");
      socket.off("user-offline");
    };
  }, [router]);

  useEffect(() => {
    if (draftState?.theme) {
      applyThemeAttr(draftState.theme);
    }
  }, [draftState?.theme]);

  const handlePick = useCallback(
    (golferName: string) => {
      const socket = getSocket();
      socket.emit(
        "make-pick",
        { golferName },
        (res: { success: boolean; error?: string }) => {
          if (!res.success) {
            showToast(res.error || "Pick failed");
          }
        }
      );
    },
    [showToast]
  );

  const handleAdminPick = useCallback(
    (userEmail: string, golferName: string) => {
      const socket = getSocket();
      socket.emit(
        "admin-pick",
        { userEmail, golferName },
        (res: { success: boolean; error?: string }) => {
          if (!res.success) {
            showToast(res.error || "Admin pick failed");
          }
        }
      );
    },
    [showToast]
  );

  const handleStartDraft = useCallback(
    (totalRounds: number, draftFormat: string) => {
      const socket = getSocket();
      socket.emit(
        "start-draft",
        { totalRounds, draftFormat },
        (res: { success: boolean; error?: string }) => {
          if (!res.success) {
            showToast(res.error || "Failed to start draft");
          }
        }
      );
    },
    [showToast]
  );

  const handleToggleAutoDraft = useCallback(() => {
    if (!currentUser || !draftState) return;
    const socket = getSocket();
    const enabled = !draftState.autoDraft[currentUser.email];
    socket.emit(
      "toggle-auto-draft",
      { enabled },
      (res: { success: boolean; error?: string }) => {
        if (!res.success) {
          showToast(res.error || "Failed to toggle auto-draft");
        }
      }
    );
  }, [currentUser, draftState, showToast]);

  const handleAdminToggleAutoDraft = useCallback(
    (userEmail: string, enabled: boolean) => {
      const socket = getSocket();
      socket.emit(
        "admin-toggle-auto-draft",
        { userEmail, enabled },
        (res: { success: boolean; error?: string }) => {
          if (!res.success) {
            showToast(res.error || "Failed to toggle auto-draft");
          }
        }
      );
    },
    [showToast]
  );

  const handleUndoPick = useCallback(() => {
    const socket = getSocket();
    socket.emit(
      "sa-undo-pick",
      {},
      (res: { success: boolean; error?: string }) => {
        if (!res.success) {
          showToast(res.error || "Undo failed");
        }
      }
    );
  }, [showToast]);

  const handleSendChat = useCallback(
    (text: string) => {
      const socket = getSocket();
      socket.emit(
        "chat-message",
        { text },
        (res: { success: boolean; error?: string }) => {
          if (!res.success) {
            showToast(res.error || "Chat message failed to send");
          }
        }
      );
    },
    [showToast]
  );

  const handleLogout = useCallback(() => {
    localStorage.removeItem("kgolfdraft_token");
    getSocket().disconnect();
    router.push("/");
  }, [router]);

  if (!currentUser || !draftState) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-theme-400 text-lg">
          {connected ? "Loading draft..." : "Connecting to server..."}
        </p>
      </div>
    );
  }

  // No draft has been set as current yet
  if (!draftState.draftId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4 text-center">
        <p className="text-theme-300 text-lg">
          No draft is set up yet. Check back when the commissioner opens one!
        </p>
        {currentUser.isSuperAdmin && (
          <button
            onClick={() => router.push("/super-admin")}
            className="px-4 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 text-white text-sm font-medium"
          >
            Open Super Admin Panel
          </button>
        )}
        <button
          onClick={handleLogout}
          className="text-theme-500 hover:text-theme-300 text-xs underline"
        >
          Logout
        </button>
      </div>
    );
  }

  const isMyTurn =
    draftState.status === "active" &&
    draftState.currentPicker?.email === currentUser.email;

  const myTeam = draftState.teams[currentUser.email] || [];
  const myAutoDraft = draftState.autoDraft[currentUser.email] || false;

  return (
    <div className={`h-screen flex flex-col ${isMyTurn ? "animate-your-turn" : ""}`}>
      {/* Error toast (in-site, replaces alert popups) */}
      {toast && (
        <div
          onClick={() => setToast(null)}
          role="alert"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] px-4 py-2 rounded-lg bg-red-800 border border-red-600 text-white text-sm shadow-xl cursor-pointer"
        >
          {toast}
        </div>
      )}

      {/* Header */}
      <header className="bg-theme-900 border-b border-theme-700 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">
              {draftState.draftName || getTheme(draftState.theme).appTitle}
            </h1>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                draftState.status === "waiting"
                  ? "bg-gray-600"
                  : draftState.status === "active"
                  ? "bg-green-600"
                  : "bg-blue-600"
              }`}
            >
              {draftState.status === "waiting"
                ? "Waiting"
                : draftState.status === "active"
                ? `Round ${draftState.currentRound}/${draftState.totalRounds}`
                : "Complete"}
            </span>
            {draftState.draftFormat === "thirdRoundReversal" &&
              draftState.status !== "waiting" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-theme-700">
                  3rd Round Reversal
                </span>
              )}
          </div>

          <div className="flex items-center gap-3 text-sm">
            {draftState.status === "active" && (
              <>
                {isMyTurn && (
                  <span className="text-yellow-300 font-bold animate-pulse">
                    Your pick!
                  </span>
                )}
                {!isMyTurn && draftState.currentPicker && (
                  <span className="text-theme-300">
                    {draftState.currentPicker.name} is picking...
                  </span>
                )}
                <button
                  onClick={handleToggleAutoDraft}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    myAutoDraft
                      ? "bg-blue-600 hover:bg-blue-500 text-white"
                      : "bg-gray-700 hover:bg-gray-600 text-gray-300"
                  }`}
                >
                  Auto-draft: {myAutoDraft ? "ON" : "OFF"}
                </button>
              </>
            )}
            <span className="text-theme-400">{currentUser.name}</span>
            {currentUser.isSuperAdmin ? (
              <button
                onClick={() => router.push("/super-admin")}
                className="text-purple-400 hover:text-purple-300 text-xs underline"
              >
                Super Admin
              </button>
            ) : (
              currentUser.isAdmin && (
                <span className="text-yellow-400 text-xs">(Admin)</span>
              )
            )}
            <button
              onClick={handleLogout}
              className="text-theme-500 hover:text-theme-300 text-xs underline"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Admin Panel */}
      <div className="px-4 pt-2 flex-shrink-0">
        <AdminPanel
          draftState={draftState}
          currentUser={currentUser}
          onStartDraft={handleStartDraft}
          onAdminPick={handleAdminPick}
          onAdminToggleAutoDraft={handleAdminToggleAutoDraft}
          onUndoPick={handleUndoPick}
        />
      </div>

      {/* Main content - 3 column layout on desktop, stacked on mobile */}
      <main className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 p-4">
        {/* Left: Available Players */}
        <div className="lg:w-64 xl:w-72 flex-shrink-0 h-64 lg:h-full bg-theme-900/40 rounded-lg p-3">
          <PlayerList
            draftState={draftState}
            currentUser={currentUser}
            onPick={
              currentUser.isAdmin && draftState.currentPicker
                ? (golferName) =>
                    draftState.currentPicker!.email === currentUser.email
                      ? handlePick(golferName)
                      : handleAdminPick(
                          draftState.currentPicker!.email,
                          golferName
                        )
                : handlePick
            }
          />
        </div>

        {/* Center: Draft Board + My Team */}
        <div className="flex-1 min-w-0 flex flex-col gap-3 h-96 lg:h-full">
          <div className="flex-1 min-h-0 bg-theme-900/40 rounded-lg p-3 overflow-hidden">
            <DraftBoard draftState={draftState} currentUser={currentUser} />
          </div>
          <div className="flex-shrink-0 bg-theme-900/40 rounded-lg p-3 max-h-48 overflow-y-auto scroll-thin">
            <MyTeam team={myTeam} currentUser={currentUser} />
          </div>
        </div>

        {/* Right: Chat */}
        <div className="lg:w-72 xl:w-80 flex-shrink-0 h-72 lg:h-full bg-theme-900/40 rounded-lg p-3">
          <Chat messages={messages} onSend={handleSendChat} />
        </div>
      </main>
    </div>
  );
}
