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

// Sliding pill for the auto-draft toggle
function AutoTogglePill({ on, size }: { on: boolean; size: "sm" | "lg" }) {
  const track =
    size === "sm" ? "w-[34px] h-[18px]" : "w-10 h-[22px]";
  const knob =
    size === "sm"
      ? `w-3.5 h-3.5 ${on ? "left-[18px]" : "left-0.5"}`
      : `w-[18px] h-[18px] ${on ? "left-5" : "left-0.5"}`;
  return (
    <span
      className={`relative inline-block rounded-full transition-colors duration-200 flex-shrink-0 ${track} ${
        on ? "bg-gold" : "bg-cream/15"
      }`}
    >
      <span
        className={`absolute top-0.5 rounded-full transition-all duration-200 ${knob} ${
          on ? "bg-clubhouse" : "bg-cream/50"
        }`}
      />
    </span>
  );
}

export default function DraftPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);

  // Client-only UI state
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [mobileView, setMobileView] = useState<"feed" | "board">("feed");
  const [chatOpen, setChatOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // Chat messages already seen (for the peek-bar unread badge)
  const [seenCount, setSeenCount] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 899px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (chatOpen) setSeenCount(messages.length);
  }, [chatOpen, messages.length]);

  // In-site error toast (replaces native alert() popups)
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
      <div className="min-h-screen flex items-center justify-center border-t-[3px] border-gold">
        <p className="font-serif italic text-lg text-cream/60">
          {connected ? "Loading the draft…" : "Connecting to the clubhouse…"}
        </p>
      </div>
    );
  }

  // No draft has been set as current yet
  if (!draftState.draftId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5 px-4 text-center border-t-[3px] border-gold">
        <p className="font-serif italic text-lg text-cream/70 max-w-md">
          No draft is set up yet. Check back when the commissioner opens one!
        </p>
        {currentUser.isSuperAdmin && (
          <button
            onClick={() => router.push("/super-admin")}
            className="border border-gold text-gold hover:bg-gold/15 px-5 py-2.5 text-[11px] tracking-[2px] uppercase"
          >
            Super Admin Panel
          </button>
        )}
        <button
          onClick={handleLogout}
          className="text-[11px] tracking-[2px] uppercase text-cream/45 hover:text-cream border-b border-cream/30 pb-px"
        >
          Leave
        </button>
      </div>
    );
  }

  const isMyTurn =
    draftState.status === "active" &&
    draftState.currentPicker?.email === currentUser.email;

  const myTeam = draftState.teams[currentUser.email] || [];
  const myAutoDraft = draftState.autoDraft[currentUser.email] || false;
  const theme = getTheme(draftState.theme);
  const remainNoun = draftState.theme === "worldcup" ? "countries" : "players";

  const draftName = draftState.draftName || theme.appTitle;
  const formatLabel =
    draftState.draftFormat === "thirdRoundReversal"
      ? "3rd Round Reversal"
      : "Snake Format";
  const roundLabel =
    draftState.status === "active"
      ? `Round ${draftState.currentRound} of ${draftState.totalRounds}`
      : draftState.status === "waiting"
      ? "Awaiting start"
      : "Complete";
  const pickLabel = `Pick ${draftState.currentRound}.${String(
    draftState.currentPickInRound
  ).padStart(2, "0")}`;

  const stripText =
    draftState.status === "waiting"
      ? "Awaiting the commissioner…"
      : draftState.status === "complete"
      ? "The draft is complete"
      : isMyTurn
      ? `Mr. ${currentUser.name}, you are on the clock`
      : `Mr. ${draftState.currentPicker?.name} is now on the clock`;

  // Recent picks for the mobile "Round n so far" section
  const recentPicks = draftState.picks.slice(-4).reverse().map((p) => {
    const idxInRound = draftState.picks.filter(
      (q) => q.round === p.round && q.pickNumber <= p.pickNumber
    ).length;
    return {
      ...p,
      label: `${p.round}.${String(idxInRound).padStart(2, "0")}`,
    };
  });

  const lastUserMsg = [...messages].reverse().find((m) => !m.isSystem);
  const unread = Math.max(0, messages.length - seenCount);

  const stripStateCls =
    isMyTurn && draftState.status === "active"
      ? "bg-clock animate-clock-pulse"
      : "bg-cream";

  const toastEl = toast && (
    <div
      onClick={() => setToast(null)}
      role="alert"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] px-4 py-2.5 bg-clubhouse border border-gold text-cream text-sm shadow-[0_8px_30px_rgba(0,0,0,0.5)] cursor-pointer"
    >
      {toast}
    </div>
  );

  // ---------- Mobile: one-scroll feed / full-board takeover / chat sheet ----------
  if (isMobile) {
    return (
      <div className="h-screen flex flex-col bg-clubhouse border-t-[3px] border-gold overflow-hidden relative">
        {toastEl}

        {/* Compact header */}
        <header className="flex items-baseline justify-between px-4 pt-3.5 pb-3 flex-shrink-0">
          <div className="flex items-baseline gap-2.5 min-w-0">
            <span className="font-serif text-xl font-semibold whitespace-nowrap overflow-hidden text-ellipsis">
              {draftName}
            </span>
            <span className="text-[10px] tracking-[2px] uppercase text-gold whitespace-nowrap">
              {draftState.status === "active"
                ? `Rd ${draftState.currentRound} / ${draftState.totalRounds}`
                : draftState.status === "waiting"
                ? "Waiting"
                : "Complete"}
            </span>
          </div>
          <div className="flex items-baseline gap-4 flex-shrink-0">
            {currentUser.isAdmin && (
              <button
                onClick={() => setShowAdminPanel((v) => !v)}
                className="text-[10px] tracking-[2px] uppercase text-gold"
              >
                Admin
              </button>
            )}
            <button
              onClick={handleLogout}
              className="text-[10px] tracking-[2px] uppercase text-cream/45"
            >
              Leave
            </button>
          </div>
        </header>

        {/* On-clock strip */}
        <div
          className={`px-4 py-[11px] flex items-center justify-center gap-2.5 border-t border-gold/35 border-b border-b-gold/50 flex-shrink-0 text-clubhouse ${stripStateCls}`}
        >
          <span className="font-serif italic text-[15px] text-center">
            {stripText}
          </span>
          {draftState.status === "active" && (
            <span className="text-[10px] tracking-[2px] uppercase opacity-65 whitespace-nowrap">
              {pickLabel}
            </span>
          )}
        </div>

        {mobileView === "feed" ? (
          <div className="flex-1 min-h-0 overflow-y-auto scroll-thin px-4 pt-4 pb-2 flex flex-col gap-5">
            {/* Admin panel */}
            {showAdminPanel && currentUser.isAdmin && (
              <div className="flex-shrink-0">
                <AdminPanel
                  draftState={draftState}
                  currentUser={currentUser}
                  onStartDraft={handleStartDraft}
                  onAdminToggleAutoDraft={handleAdminToggleAutoDraft}
                  onUndoPick={handleUndoPick}
                />
              </div>
            )}

            {/* My Card */}
            <div className="flex-shrink-0">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-[11px] tracking-[2.5px] uppercase text-gold">
                  My Card
                </span>
                <span className="text-[11px] text-cream/45">
                  {myTeam.length} of {draftState.totalRounds}
                </span>
              </div>
              <MyTeam team={myTeam} currentUser={currentUser} variant="chips" />
              {draftState.status === "active" && (
                <button
                  onClick={handleToggleAutoDraft}
                  className={`flex items-center justify-between w-full border border-gold/25 px-3 py-2.5 mt-2 text-[11px] tracking-[2px] uppercase min-h-[44px] ${
                    myAutoDraft ? "text-gold" : "text-cream/55"
                  }`}
                >
                  Auto-draft {myAutoDraft ? "On" : "Off"}
                  <AutoTogglePill on={myAutoDraft} size="lg" />
                </button>
              )}
            </div>

            {/* Round so far */}
            {draftState.status !== "waiting" && (
              <div className="flex-shrink-0">
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-[11px] tracking-[2.5px] uppercase text-gold">
                    {draftState.status === "complete"
                      ? "Final picks"
                      : `Round ${draftState.currentRound} so far`}
                  </span>
                  <button
                    onClick={() => setMobileView("board")}
                    className="py-2 text-[11px] text-cream/60 border-b border-cream/30"
                  >
                    Full board
                  </button>
                </div>
                <div className="flex flex-col">
                  {recentPicks.length === 0 && (
                    <p className="font-serif italic text-[13px] text-cream/50 py-2">
                      No picks yet this round
                    </p>
                  )}
                  {recentPicks.map((p) => (
                    <div
                      key={p.pickNumber}
                      className="flex items-baseline gap-2.5 py-[9px] border-b border-cream/[0.08]"
                    >
                      <span className="text-[11px] text-gold w-8 tabular-nums flex-shrink-0">
                        {p.label}
                      </span>
                      <span className="text-[13px] text-cream/60 w-14 flex-shrink-0 overflow-hidden text-ellipsis whitespace-nowrap">
                        {p.userName}
                      </span>
                      <span className="flex-1 font-serif text-sm">
                        {p.golferName}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* The Field */}
            <div className="flex-shrink-0 pb-2">
              <div className="mb-2">
                <span className="text-[11px] tracking-[2.5px] uppercase text-gold">
                  {theme.availableHeading} ·{" "}
                  {draftState.availablePlayers.length} remain
                </span>
              </div>
              <PlayerList
                draftState={draftState}
                currentUser={currentUser}
                mobile
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
          </div>
        ) : (
          <>
            {/* Full board takeover */}
            <div className="flex items-center justify-between px-4 py-3 flex-shrink-0 border-b border-gold/35">
              <button
                onClick={() => setMobileView("feed")}
                className="py-2 pr-2 text-[11px] tracking-[2px] uppercase text-gold"
              >
                ‹ Back
              </button>
              <span className="font-serif text-[17px] font-semibold">
                Order of Selection
              </span>
              <span className="w-12" />
            </div>
            {/* No x-padding: the round column sticks flush left (content would show in a padding gutter) */}
            <div className="flex-1 min-h-0 overflow-auto scroll-thin pt-1.5 pb-4">
              <DraftBoard
                draftState={draftState}
                currentUser={currentUser}
                mobile
              />
              <div className="mt-3.5 text-center text-[11px] tracking-[2px] uppercase text-cream/40">
                ← swipe to see all teams →
              </div>
            </div>
          </>
        )}

        {/* Veranda peek bar */}
        <button
          onClick={() => setChatOpen(true)}
          className="flex-shrink-0 bg-sheet border-t border-gold/50 px-4 pt-3 pb-5 text-left w-full"
        >
          <span className="block w-9 h-1 rounded-sm bg-cream/25 mx-auto mb-2.5" />
          <span className="flex items-baseline gap-2 text-[13px] text-cream">
            <span className="text-[10px] tracking-[2px] uppercase text-gold flex-shrink-0">
              Veranda
            </span>
            {lastUserMsg && (
              <span className="font-serif font-semibold whitespace-nowrap">
                {lastUserMsg.sender}
              </span>
            )}
            <span className="text-cream/70 overflow-hidden text-ellipsis whitespace-nowrap flex-1">
              {lastUserMsg
                ? lastUserMsg.text
                : "Join the conversation on the veranda"}
            </span>
            {unread > 0 && (
              <span className="bg-gold text-clubhouse text-[10px] font-bold rounded-[9px] px-[7px] py-px flex-shrink-0">
                {unread}
              </span>
            )}
          </span>
        </button>

        {/* Chat sheet */}
        {chatOpen && (
          <>
            <div
              onClick={() => setChatOpen(false)}
              className="absolute inset-0 bg-[rgba(5,24,16,0.55)] z-10"
            />
            <div className="absolute left-0 right-0 bottom-0 top-[24%] z-20 bg-sheet border-t border-gold rounded-t-[18px] shadow-[0_-12px_40px_rgba(0,0,0,0.45)] flex flex-col px-4 pt-3 pb-[18px]">
              <button
                onClick={() => setChatOpen(false)}
                className="pb-3 w-full"
                aria-label="Close chat"
              >
                <span className="block w-9 h-1 rounded-sm bg-cream/25 mx-auto" />
              </button>
              <div className="text-center font-serif text-lg font-semibold mb-3 text-cream">
                Veranda
              </div>
              <Chat messages={messages} onSend={handleSendChat} mobile />
            </div>
          </>
        )}
      </div>
    );
  }

  // ---------- Desktop ≥900px ----------
  return (
    <div className="h-screen flex flex-col bg-clubhouse border-t-[3px] border-gold overflow-hidden">
      {toastEl}

      {/* Header */}
      <header className="flex items-center justify-between px-8 py-4 border-b border-gold/35 flex-shrink-0">
        <div className="flex items-baseline gap-4 min-w-0">
          <span className="font-serif text-[28px] font-semibold whitespace-nowrap">
            {draftName}
          </span>
          <span className="text-xs tracking-[3px] uppercase text-gold whitespace-nowrap">
            {roundLabel} · {formatLabel}
          </span>
        </div>
        <div className="flex items-center gap-6 text-sm flex-shrink-0">
          {draftState.status === "active" && (
            <button
              onClick={handleToggleAutoDraft}
              className={`flex items-center gap-2 text-xs tracking-[2px] uppercase ${
                myAutoDraft ? "text-gold" : "text-cream/55"
              }`}
            >
              Auto-draft {myAutoDraft ? "On" : "Off"}
              <AutoTogglePill on={myAutoDraft} size="sm" />
            </button>
          )}
          {currentUser.isAdmin && (
            <button
              onClick={() => setShowAdminPanel((v) => !v)}
              className="text-xs tracking-[2px] uppercase text-gold border-b border-gold/50 pb-px"
            >
              Admin
            </button>
          )}
          <span className="font-serif text-base">Mr. {currentUser.name}</span>
          <button
            onClick={handleLogout}
            className="text-xs tracking-[2px] uppercase text-cream/45 hover:text-cream border-b border-cream/30 pb-px"
          >
            Leave
          </button>
        </div>
      </header>

      {/* On-clock strip */}
      <div
        className={`px-8 py-3 flex items-center justify-center gap-3.5 border-b border-gold/50 flex-shrink-0 text-clubhouse ${stripStateCls}`}
      >
        <span className="w-10 h-px bg-gold" />
        <span className="font-serif italic text-[19px]">{stripText}</span>
        {draftState.status === "active" && (
          <span className="text-xs tracking-[2px] uppercase opacity-65">
            {pickLabel}
          </span>
        )}
        <span className="w-10 h-px bg-gold" />
      </div>

      {/* Admin panel */}
      {showAdminPanel && currentUser.isAdmin && (
        <div className="mx-8 mt-4 flex-shrink-0">
          <AdminPanel
            draftState={draftState}
            currentUser={currentUser}
            onStartDraft={handleStartDraft}
            onAdminToggleAutoDraft={handleAdminToggleAutoDraft}
            onUndoPick={handleUndoPick}
          />
        </div>
      )}

      {/* Main: The Field | Order of Selection + My Card | Veranda */}
      <main className="flex-1 min-h-0 grid grid-cols-[300px_minmax(0,1fr)_310px] gap-5 px-8 pt-5 pb-7">
        {/* The Field */}
        <div className="border border-gold/40 bg-cream/[0.03] p-[18px] flex flex-col min-h-0">
          <div className="text-center mb-3.5">
            <div className="font-serif text-xl font-semibold">
              {theme.availableHeading}
            </div>
            <div className="text-[11px] tracking-[2.5px] uppercase text-gold mt-0.5">
              {draftState.availablePlayers.length} {remainNoun} remain
            </div>
          </div>
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

        {/* Order of Selection + My Card */}
        <div className="flex flex-col gap-5 min-h-0 min-w-0">
          <div className="flex-1 min-h-0 border border-gold/40 bg-cream/[0.03] flex flex-col">
            <div className="text-center pt-3.5 pb-2.5 px-[18px]">
              <span className="font-serif text-xl font-semibold">
                Order of Selection
              </span>
            </div>
            <div className="flex-1 overflow-auto scroll-thin px-[18px] pb-[18px]">
              <DraftBoard draftState={draftState} currentUser={currentUser} />
            </div>
          </div>
          <div className="flex-shrink-0 border border-gold/40 bg-cream/[0.03] px-[18px] py-4">
            <MyTeam team={myTeam} currentUser={currentUser} variant="row" />
          </div>
        </div>

        {/* Veranda */}
        <div className="border border-gold/40 bg-cream/[0.03] p-[18px] flex flex-col min-h-0">
          <div className="text-center font-serif text-xl font-semibold mb-3.5">
            Veranda
          </div>
          <Chat messages={messages} onSend={handleSendChat} />
        </div>
      </main>
    </div>
  );
}
