"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { DraftState, User, ChatMessage } from "@/lib/types";
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
      socket.off("chat-message");
      socket.off("auto-draft-updated");
      socket.off("user-online");
      socket.off("user-offline");
    };
  }, [router]);

  const handlePick = useCallback(
    (golferName: string) => {
      const socket = getSocket();
      socket.emit(
        "make-pick",
        { golferName },
        (res: { success: boolean; error?: string }) => {
          if (!res.success) {
            alert(res.error || "Pick failed");
          }
        }
      );
    },
    []
  );

  const handleAdminPick = useCallback(
    (userEmail: string, golferName: string) => {
      const socket = getSocket();
      socket.emit(
        "admin-pick",
        { userEmail, golferName },
        (res: { success: boolean; error?: string }) => {
          if (!res.success) {
            alert(res.error || "Admin pick failed");
          }
        }
      );
    },
    []
  );

  const handleStartDraft = useCallback((totalRounds: number) => {
    const socket = getSocket();
    socket.emit(
      "start-draft",
      { totalRounds },
      (res: { success: boolean; error?: string }) => {
        if (!res.success) {
          alert(res.error || "Failed to start draft");
        }
      }
    );
  }, []);

  const handleToggleAutoDraft = useCallback(() => {
    if (!currentUser || !draftState) return;
    const socket = getSocket();
    const enabled = !draftState.autoDraft[currentUser.email];
    socket.emit(
      "toggle-auto-draft",
      { enabled },
      (res: { success: boolean; error?: string }) => {
        if (!res.success) {
          alert(res.error || "Failed to toggle auto-draft");
        }
      }
    );
  }, [currentUser, draftState]);

  const handleAdminToggleAutoDraft = useCallback(
    (userEmail: string, enabled: boolean) => {
      const socket = getSocket();
      socket.emit(
        "admin-toggle-auto-draft",
        { userEmail, enabled },
        (res: { success: boolean; error?: string }) => {
          if (!res.success) {
            alert(res.error || "Failed to toggle auto-draft");
          }
        }
      );
    },
    []
  );

  const handleSendChat = useCallback((text: string) => {
    const socket = getSocket();
    socket.emit(
      "chat-message",
      { text },
      (res: { success: boolean; error?: string }) => {
        if (!res.success) {
          console.error("Chat send failed:", res.error);
        }
      }
    );
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("kgolfdraft_token");
    getSocket().disconnect();
    router.push("/");
  }, [router]);

  if (!currentUser || !draftState) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-green-400 text-lg">
          {connected ? "Loading draft..." : "Connecting to server..."}
        </p>
      </div>
    );
  }

  const isMyTurn =
    draftState.status === "active" &&
    draftState.currentPicker?.email === currentUser.email;

  const myTeam = draftState.teams[currentUser.email] || [];
  const myAutoDraft = draftState.autoDraft[currentUser.email] || false;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-green-900 border-b border-green-700 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">KGolfDraft</h1>
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
                  <span className="text-green-300">
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
            <span className="text-green-400">{currentUser.name}</span>
            {currentUser.isAdmin && (
              <span className="text-yellow-400 text-xs">(Admin)</span>
            )}
            <button
              onClick={handleLogout}
              className="text-green-500 hover:text-green-300 text-xs underline"
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
        />
      </div>

      {/* Main content - 3 column layout on desktop, stacked on mobile */}
      <main className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 p-4">
        {/* Left: Available Players */}
        <div className="lg:w-64 xl:w-72 flex-shrink-0 h-64 lg:h-full bg-green-900/40 rounded-lg p-3">
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
          <div className="flex-1 min-h-0 bg-green-900/40 rounded-lg p-3 overflow-hidden">
            <DraftBoard draftState={draftState} currentUser={currentUser} />
          </div>
          <div className="flex-shrink-0 bg-green-900/40 rounded-lg p-3 max-h-48 overflow-y-auto scroll-thin">
            <MyTeam team={myTeam} currentUser={currentUser} />
          </div>
        </div>

        {/* Right: Chat */}
        <div className="lg:w-72 xl:w-80 flex-shrink-0 h-72 lg:h-full bg-green-900/40 rounded-lg p-3">
          <Chat messages={messages} onSend={handleSendChat} />
        </div>
      </main>
    </div>
  );
}
