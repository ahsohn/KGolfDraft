"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import ConfirmAction from "@/components/ConfirmAction";
import {
  DraftDetail,
  DraftSummary,
  GroupUser,
  User,
} from "@/lib/types";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

// Shared Clubhouse styles
const cardCls = "border border-gold/40 bg-cream/[0.03] p-5";
const headingCls = "font-serif text-lg font-semibold";
const inputCls =
  "bg-[rgba(10,43,29,0.6)] border border-gold/30 text-cream placeholder-cream/35 text-sm focus:outline-none focus:border-gold";
const selectCls =
  "px-2.5 py-2 bg-[rgba(10,43,29,0.9)] border border-gold/30 text-cream text-sm focus:outline-none focus:border-gold";
const fieldLabelCls =
  "block text-[10px] tracking-[2px] uppercase text-gold mb-1.5";
const goldBtnCls =
  "bg-gold hover:bg-gold-bright text-clubhouse font-semibold text-[11px] tracking-[2px] uppercase";
const goldOutlineBtnCls =
  "border border-gold text-gold hover:bg-gold/15 text-[11px] tracking-[2px] uppercase";
const creamOutlineBtnCls =
  "border border-cream/30 text-cream/70 hover:text-cream hover:border-cream/60 text-[11px] tracking-[2px] uppercase";
const chipCls =
  "text-[10px] tracking-[2px] uppercase px-2 py-0.5 whitespace-nowrap";
const thCls =
  "py-1.5 pr-2.5 text-left text-[10px] tracking-[2px] uppercase text-gold font-medium border-b border-gold";

// Promise wrapper around socket.emit-with-callback
function emitAsync<T extends { success: boolean; error?: string }>(
  event: string,
  payload: object
): Promise<T> {
  return new Promise((resolve) => {
    getSocket().emit(event, payload, (res: T) => resolve(res));
  });
}

function statusChip(status: string) {
  const styles: Record<string, string> = {
    waiting: "border border-gold/50 text-gold",
    active: "border border-clock/60 text-clock",
    complete: "border border-cream/35 text-cream/60",
  };
  return (
    <span className={`${chipCls} ${styles[status] || styles.complete}`}>
      {status}
    </span>
  );
}

function currentChip() {
  return <span className={`${chipCls} bg-gold text-clubhouse`}>Current</span>;
}

export default function SuperAdminPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [tab, setTab] = useState<"drafts" | "users">("drafts");
  const [notice, setNotice] = useState("");

  const [users, setUsers] = useState<GroupUser[]>([]);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<DraftDetail | null>(null);

  // Draft settings form (for the selected draft)
  const [settingsName, setSettingsName] = useState("");
  const [settingsTheme, setSettingsTheme] = useState("golf");
  const [settingsFormat, setSettingsFormat] = useState("snake");
  const [settingsRounds, setSettingsRounds] = useState(10);

  // Players editor
  const [playersText, setPlayersText] = useState("");

  // Participants editor: email -> { included, order }
  const [partEdit, setPartEdit] = useState<
    Record<string, { included: boolean; order: number }>
  >({});

  // Create-draft form
  const [newName, setNewName] = useState("");
  const [newTheme, setNewTheme] = useState("golf");
  const [newFormat, setNewFormat] = useState("snake");
  const [newRounds, setNewRounds] = useState(10);

  // New-user form
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 4000);
  }, []);

  const loadOverview = useCallback(async () => {
    const res = await emitAsync<{
      success: boolean;
      error?: string;
      users?: GroupUser[];
      drafts?: DraftSummary[];
    }>("sa-get-overview", {});
    if (res.success) {
      setUsers(res.users || []);
      setDrafts(res.drafts || []);
    } else {
      flash(res.error || "Failed to load overview");
    }
  }, [flash]);

  const loadDetail = useCallback(
    async (id: number) => {
      const res = await emitAsync<
        { success: boolean; error?: string } & Partial<DraftDetail> & {
            draft?: DraftSummary;
          }
      >("sa-get-draft-detail", { id });
      if (res.success && res.draft) {
        const d: DraftDetail = {
          draft: res.draft,
          players: res.players || [],
          participants: res.participants || [],
          picks: res.picks || [],
        };
        setDetail(d);
        setSettingsName(d.draft.name);
        setSettingsTheme(d.draft.theme);
        setSettingsFormat(d.draft.draftFormat);
        setSettingsRounds(d.draft.totalRounds);
        setPlayersText(
          d.players.map((p) => `${p.name}, ${p.rank}`).join("\n")
        );
      } else {
        flash(res.error || "Failed to load draft");
        setDetail(null);
      }
    },
    [flash]
  );

  // Rebuild the participants editor whenever the detail or user list changes
  useEffect(() => {
    if (!detail) return;
    const next: Record<string, { included: boolean; order: number }> = {};
    let nextOrder = detail.participants.length;
    for (const u of users) {
      const existing = detail.participants.find((p) => p.email === u.email);
      next[u.email] = existing
        ? { included: true, order: existing.draftOrder }
        : { included: false, order: ++nextOrder };
    }
    setPartEdit(next);
  }, [detail, users]);

  // Connect + authenticate
  useEffect(() => {
    const socket = getSocket();
    const token = localStorage.getItem("kgolfdraft_token");
    if (!token) {
      router.push("/");
      return;
    }

    let cancelled = false;

    function authenticate() {
      socket.emit(
        "login",
        { email: "", token },
        (res: { success: boolean; user?: User }) => {
          if (cancelled) return;
          if (res.success && res.user) {
            if (!res.user.isSuperAdmin) {
              router.push("/draft");
              return;
            }
            setCurrentUser(res.user);
          } else {
            localStorage.removeItem("kgolfdraft_token");
            router.push("/");
          }
        }
      );
    }

    if (socket.connected) {
      authenticate();
    } else {
      socket.connect();
      socket.on("connect", authenticate);
    }

    return () => {
      cancelled = true;
      socket.off("connect", authenticate);
    };
  }, [router]);

  // Load data once authenticated
  useEffect(() => {
    if (currentUser) {
      loadOverview();
    }
  }, [currentUser, loadOverview]);

  async function handleCreateDraft(e: React.FormEvent) {
    e.preventDefault();
    const res = await emitAsync<{
      success: boolean;
      error?: string;
      draftId?: number;
      drafts?: DraftSummary[];
    }>("sa-create-draft", {
      name: newName.trim(),
      theme: newTheme,
      draftFormat: newFormat,
      totalRounds: newRounds,
    });
    if (res.success) {
      setDrafts(res.drafts || []);
      setNewName("");
      if (res.draftId) {
        setSelectedId(res.draftId);
        loadDetail(res.draftId);
      }
      flash("Draft created");
    } else {
      flash(res.error || "Failed to create draft");
    }
  }

  async function handleSaveSettings() {
    if (!detail) return;
    const res = await emitAsync<{
      success: boolean;
      error?: string;
      drafts?: DraftSummary[];
    }>("sa-update-draft", {
      id: detail.draft.id,
      name: settingsName.trim(),
      theme: settingsTheme,
      draftFormat: settingsFormat,
      totalRounds: settingsRounds,
    });
    if (res.success) {
      setDrafts(res.drafts || []);
      loadDetail(detail.draft.id);
      flash("Draft settings saved");
    } else {
      flash(res.error || "Failed to save settings");
    }
  }

  async function handleSetCurrent(id: number) {
    const res = await emitAsync<{
      success: boolean;
      error?: string;
      drafts?: DraftSummary[];
    }>("sa-set-current-draft", { id });
    if (res.success) {
      setDrafts(res.drafts || []);
      if (selectedId) loadDetail(selectedId);
      flash("Current draft updated — participants will see it now");
    } else {
      flash(res.error || "Failed to set current draft");
    }
  }

  async function handleDeleteDraft(d: DraftSummary) {
    const res = await emitAsync<{
      success: boolean;
      error?: string;
      drafts?: DraftSummary[];
    }>("sa-delete-draft", { id: d.id });
    if (res.success) {
      setDrafts(res.drafts || []);
      if (selectedId === d.id) {
        setSelectedId(null);
        setDetail(null);
      }
      flash("Draft deleted");
    } else {
      flash(res.error || "Failed to delete draft");
    }
  }

  async function handleSavePlayers() {
    if (!detail) return;
    const players = playersText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, i) => {
        const [name, rank] = line.split(/[,\t]/).map((s) => s.trim());
        return { name, rank: parseInt(rank, 10) || i + 1 };
      });
    const res = await emitAsync<{ success: boolean; error?: string }>(
      "sa-set-players",
      { draftId: detail.draft.id, players }
    );
    if (res.success) {
      loadDetail(detail.draft.id);
      flash(`Saved ${players.length} players`);
    } else {
      flash(res.error || "Failed to save players");
    }
  }

  async function handleSaveParticipants() {
    if (!detail) return;
    const participants = Object.entries(partEdit)
      .filter(([, v]) => v.included)
      .map(([email, v]) => ({ email, draftOrder: v.order }));
    const res = await emitAsync<{ success: boolean; error?: string }>(
      "sa-set-participants",
      { draftId: detail.draft.id, participants }
    );
    if (res.success) {
      loadDetail(detail.draft.id);
      loadOverview();
      flash(`Saved ${participants.length} participants`);
    } else {
      flash(res.error || "Failed to save participants");
    }
  }

  async function handleUndoPick() {
    const res = await emitAsync<{ success: boolean; error?: string }>(
      "sa-undo-pick",
      {}
    );
    if (res.success) {
      if (selectedId) loadDetail(selectedId);
      flash("Pick undone");
    } else {
      flash(res.error || "Undo failed");
    }
  }

  async function handleSaveUser(u: GroupUser) {
    const res = await emitAsync<{
      success: boolean;
      error?: string;
      users?: GroupUser[];
    }>("sa-save-user", {
      id: u.id,
      email: u.email,
      name: u.name,
      isAdmin: u.isAdmin,
    });
    if (res.success) {
      setUsers(res.users || []);
      flash("User saved");
    } else {
      flash(res.error || "Failed to save user");
    }
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    const res = await emitAsync<{
      success: boolean;
      error?: string;
      users?: GroupUser[];
    }>("sa-save-user", {
      email: newUserEmail.trim(),
      name: newUserName.trim(),
      isAdmin: newUserIsAdmin,
    });
    if (res.success) {
      setUsers(res.users || []);
      setNewUserEmail("");
      setNewUserName("");
      setNewUserIsAdmin(false);
      flash("User added");
    } else {
      flash(res.error || "Failed to add user");
    }
  }

  async function handleDeleteUser(u: GroupUser) {
    const res = await emitAsync<{
      success: boolean;
      error?: string;
      users?: GroupUser[];
    }>("sa-delete-user", { id: u.id });
    if (res.success) {
      setUsers(res.users || []);
      flash("User removed");
    } else {
      flash(res.error || "Failed to remove user");
    }
  }

  function csvUrl(draftId: number) {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("kgolfdraft_token") || ""
        : "";
    return `${BACKEND_URL}/api/drafts/${draftId}/export.csv?token=${token}`;
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center border-t-[3px] border-gold">
        <p className="font-serif italic text-lg text-cream/60">Loading…</p>
      </div>
    );
  }

  const editable = detail?.draft.status === "waiting";

  return (
    <div className="min-h-screen border-t-[3px] border-gold px-4 sm:px-8 pt-6 pb-12">
      <div className="max-w-[1100px] mx-auto">
        {/* Header */}
        <header className="flex items-baseline justify-between flex-wrap gap-2 mb-5">
          <h1 className="font-serif text-3xl font-semibold">Super Admin</h1>
          <div className="flex items-baseline gap-4">
            {notice && (
              <span className="font-serif italic text-sm text-gold">
                {notice}
              </span>
            )}
            <button
              onClick={() => router.push("/draft")}
              className="text-xs tracking-[2px] uppercase text-gold hover:text-cream border-b border-gold/50 pb-px"
            >
              Back to Draft
            </button>
          </div>
        </header>

        {/* Tabs */}
        <div className="flex gap-7 mb-6 border-b border-gold/30">
          {(["drafts", "users"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px px-0.5 pt-2 pb-3 text-xs tracking-[2.5px] uppercase border-b-2 ${
                tab === t
                  ? "border-gold text-cream"
                  : "border-transparent text-cream/45 hover:text-cream/70"
              }`}
            >
              {t === "drafts" ? "Drafts" : "Group Users"}
            </button>
          ))}
        </div>

        {tab === "drafts" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left: create + list */}
            <div className="flex flex-col gap-5">
              <form
                onSubmit={handleCreateDraft}
                className={`${cardCls} flex flex-col gap-3`}
              >
                <span className={headingCls}>Create New Draft</span>
                <input
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Draft name (e.g. Masters 2027)"
                  className={`w-full px-3 py-[11px] ${inputCls}`}
                />
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className={fieldLabelCls}>Theme</label>
                    <select
                      value={newTheme}
                      onChange={(e) => setNewTheme(e.target.value)}
                      className={selectCls}
                    >
                      <option value="golf">Golf</option>
                      <option value="worldcup">World Cup</option>
                    </select>
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Format</label>
                    <select
                      value={newFormat}
                      onChange={(e) => setNewFormat(e.target.value)}
                      className={selectCls}
                    >
                      <option value="snake">Standard Snake</option>
                      <option value="thirdRoundReversal">
                        3rd Round Reversal
                      </option>
                    </select>
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Rounds</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={newFormat === "thirdRoundReversal" ? 6 : newRounds}
                      disabled={newFormat === "thirdRoundReversal"}
                      onChange={(e) => setNewRounds(Number(e.target.value))}
                      className={`w-16 px-2.5 py-2 disabled:opacity-50 ${inputCls}`}
                    />
                  </div>
                  <button
                    type="submit"
                    className={`px-5 py-[9px] ${goldBtnCls}`}
                  >
                    Create
                  </button>
                </div>
              </form>

              <div className={cardCls}>
                <span className={headingCls}>All Drafts</span>
                {drafts.length === 0 && (
                  <p className="font-serif italic text-sm text-cream/50 mt-3">
                    No drafts yet.
                  </p>
                )}
                <div className="flex flex-col gap-2.5 mt-3">
                  {drafts.map((d) => (
                    <div
                      key={d.id}
                      className={`px-3.5 py-3 border cursor-pointer ${
                        selectedId === d.id
                          ? "border-gold bg-gold/[0.08]"
                          : "border-gold/25 hover:border-gold/50"
                      }`}
                      onClick={() => {
                        setSelectedId(d.id);
                        loadDetail(d.id);
                      }}
                    >
                      <div className="flex items-baseline gap-2.5 flex-wrap">
                        <span className="font-serif text-base flex-1">
                          {d.name}
                        </span>
                        {d.isCurrent && currentChip()}
                        {statusChip(d.status)}
                      </div>
                      <div className="flex items-baseline gap-3.5 mt-1.5 text-xs text-cream/55 flex-wrap">
                        <span>
                          {new Date(d.createdAt).toLocaleDateString()}
                        </span>
                        <span>{d.participantCount} participants</span>
                        <span>{d.pickCount} picks</span>
                        <span className="flex-1" />
                        {!d.isCurrent && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetCurrent(d.id);
                            }}
                            className="text-[11px] tracking-[1.5px] uppercase text-gold hover:text-cream border-b border-gold/50"
                          >
                            Make Current
                          </button>
                        )}
                        {d.pickCount > 0 && (
                          <a
                            href={csvUrl(d.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[11px] tracking-[1.5px] uppercase text-cream/55 hover:text-cream border-b border-cream/30"
                          >
                            CSV
                          </a>
                        )}
                        <ConfirmAction
                          label="Delete"
                          confirmLabel={
                            d.pickCount > 0
                              ? `Delete + ${d.pickCount} picks?`
                              : "Delete?"
                          }
                          onConfirm={() => handleDeleteDraft(d)}
                          className="text-[11px] tracking-[1.5px] uppercase text-rosewood hover:text-cream border-b border-rosewood/40"
                          confirmClassName="px-2.5 py-1 border border-rosewood/50 text-rosewood hover:bg-rosewood/10 text-[10px] tracking-[2px] uppercase"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: selected draft detail */}
            <div className="flex flex-col gap-5">
              {!detail && (
                <div className={cardCls}>
                  <p className="font-serif italic text-sm text-cream/50">
                    Select a draft to manage its settings, players, and draft
                    order.
                  </p>
                </div>
              )}

              {detail && (
                <>
                  {/* Settings */}
                  <div className={cardCls}>
                    <div className="flex items-baseline gap-2.5 flex-wrap">
                      <span className={`${headingCls} flex-1`}>
                        {detail.draft.name}
                      </span>
                      {detail.draft.isCurrent && currentChip()}
                      {statusChip(detail.draft.status)}
                    </div>

                    {editable ? (
                      <div className="flex flex-col gap-3 mt-3.5">
                        <input
                          value={settingsName}
                          onChange={(e) => setSettingsName(e.target.value)}
                          className={`w-full px-3 py-[11px] ${inputCls}`}
                        />
                        <div className="flex flex-wrap gap-3 items-end">
                          <div>
                            <label className={fieldLabelCls}>Theme</label>
                            <select
                              value={settingsTheme}
                              onChange={(e) => setSettingsTheme(e.target.value)}
                              className={selectCls}
                            >
                              <option value="golf">Golf</option>
                              <option value="worldcup">World Cup</option>
                            </select>
                          </div>
                          <div>
                            <label className={fieldLabelCls}>Format</label>
                            <select
                              value={settingsFormat}
                              onChange={(e) =>
                                setSettingsFormat(e.target.value)
                              }
                              className={selectCls}
                            >
                              <option value="snake">Standard Snake</option>
                              <option value="thirdRoundReversal">
                                3rd Round Reversal
                              </option>
                            </select>
                          </div>
                          <div>
                            <label className={fieldLabelCls}>Rounds</label>
                            <input
                              type="number"
                              min={1}
                              max={20}
                              value={
                                settingsFormat === "thirdRoundReversal"
                                  ? 6
                                  : settingsRounds
                              }
                              disabled={settingsFormat === "thirdRoundReversal"}
                              onChange={(e) =>
                                setSettingsRounds(Number(e.target.value))
                              }
                              className={`w-16 px-2.5 py-2 disabled:opacity-50 ${inputCls}`}
                            />
                          </div>
                          <button
                            onClick={handleSaveSettings}
                            className={`px-5 py-[9px] ${goldBtnCls}`}
                          >
                            Save Settings
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-cream/55 mt-2 mb-3.5">
                        {detail.draft.draftFormat === "thirdRoundReversal"
                          ? "3rd Round Reversal"
                          : "Standard Snake"}{" "}
                        · {detail.draft.totalRounds} rounds ·{" "}
                        {detail.draft.theme === "worldcup"
                          ? "World Cup"
                          : "Golf"}{" "}
                        theme
                      </p>
                    )}

                    {(detail.picks.length > 0 ||
                      (detail.draft.isCurrent &&
                        detail.draft.status !== "waiting")) && (
                      <div className="flex items-center gap-3 flex-wrap mt-3.5">
                        {detail.draft.isCurrent &&
                          detail.picks.length > 0 &&
                          detail.draft.status !== "waiting" && (
                            <ConfirmAction
                              label="Undo Last Pick"
                              confirmLabel="Confirm Undo"
                              onConfirm={handleUndoPick}
                              className={`px-4 py-2 ${goldOutlineBtnCls}`}
                              confirmClassName="px-4 py-2 border border-rosewood/50 text-rosewood hover:bg-rosewood/10 text-[11px] tracking-[2px] uppercase"
                            />
                          )}
                        {detail.picks.length > 0 && (
                          <a
                            href={csvUrl(detail.draft.id)}
                            className={`px-4 py-2 ${creamOutlineBtnCls}`}
                          >
                            Download Results CSV
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Players */}
                  <div className={cardCls}>
                    <span className={headingCls}>
                      Players ({detail.players.length})
                    </span>
                    {detail.picks.length === 0 ? (
                      <div className="flex flex-col gap-2.5 mt-2">
                        <p className="text-xs text-cream/55">
                          One per line: <code>Name, Rank</code> (rank optional
                          — line order is used if omitted). Paste from a
                          spreadsheet works too.
                        </p>
                        <textarea
                          value={playersText}
                          onChange={(e) => setPlayersText(e.target.value)}
                          rows={10}
                          placeholder={"Scottie Scheffler, 1\nRory McIlroy, 2"}
                          className={`w-full px-3 py-2.5 font-mono ${inputCls}`}
                        />
                        <button
                          onClick={handleSavePlayers}
                          className={`self-start px-5 py-[9px] ${goldBtnCls}`}
                        >
                          Save Players
                        </button>
                      </div>
                    ) : (
                      <p className="font-serif italic text-xs text-cream/55 mt-2">
                        The player list is locked once picks have been made.
                      </p>
                    )}
                  </div>

                  {/* Participants / draft order */}
                  <div className={cardCls}>
                    <span className={headingCls}>
                      Participants &amp; Draft Order
                    </span>
                    {editable ? (
                      <div className="flex flex-col gap-2.5 mt-3">
                        <div className="flex flex-col gap-1">
                          {users.map((u) => {
                            const entry = partEdit[u.email] || {
                              included: false,
                              order: 0,
                            };
                            return (
                              <div
                                key={u.email}
                                className="flex items-center gap-2.5 text-sm py-1 border-b border-cream/[0.08]"
                              >
                                <input
                                  type="checkbox"
                                  checked={entry.included}
                                  onChange={(e) =>
                                    setPartEdit((prev) => ({
                                      ...prev,
                                      [u.email]: {
                                        ...entry,
                                        included: e.target.checked,
                                      },
                                    }))
                                  }
                                  className="accent-[#c9a227]"
                                />
                                <span className="flex-1 font-serif">
                                  {u.name}{" "}
                                  <span className="text-cream/50 text-xs font-sans">
                                    {u.email}
                                  </span>
                                </span>
                                {entry.included && (
                                  <input
                                    type="number"
                                    min={1}
                                    value={entry.order}
                                    onChange={(e) =>
                                      setPartEdit((prev) => ({
                                        ...prev,
                                        [u.email]: {
                                          ...entry,
                                          order: Number(e.target.value),
                                        },
                                      }))
                                    }
                                    className={`w-14 px-2 py-1 text-xs ${inputCls}`}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <button
                          onClick={handleSaveParticipants}
                          className={`self-start px-5 py-[9px] ${goldBtnCls}`}
                        >
                          Save Participants
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1.5 mt-3">
                        {detail.participants.map((p) => (
                          <div
                            key={p.email}
                            className="flex items-baseline gap-2.5 text-sm py-1 border-b border-cream/[0.08]"
                          >
                            <span className="text-gold text-xs w-5">
                              {p.draftOrder}
                            </span>
                            <span className="font-serif">{p.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Picks / results */}
                  {detail.picks.length > 0 && (
                    <div className={cardCls}>
                      <span className={headingCls}>
                        Picks ({detail.picks.length})
                      </span>
                      <div className="max-h-[280px] overflow-y-auto scroll-thin mt-3">
                        <table className="w-full text-[13px] text-left border-collapse">
                          <thead className="sticky top-0 bg-sheethead">
                            <tr>
                              <th className={thCls}>#</th>
                              <th className={thCls}>Rd</th>
                              <th className={thCls}>Team</th>
                              <th className={`${thCls} pr-0`}>Selection</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.picks.map((p) => (
                              <tr key={p.pickNumber}>
                                <td className="py-1.5 pr-2.5 border-b border-cream/[0.08] text-cream/55 tabular-nums">
                                  {p.pickNumber}
                                </td>
                                <td className="py-1.5 pr-2.5 border-b border-cream/[0.08] text-cream/55">
                                  {p.round}
                                </td>
                                <td className="py-1.5 pr-2.5 border-b border-cream/[0.08]">
                                  {p.userName}
                                </td>
                                <td className="py-1.5 border-b border-cream/[0.08] font-serif">
                                  {p.golferName}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {tab === "users" && (
          <div className="max-w-[760px] flex flex-col gap-5">
            <form onSubmit={handleAddUser} className={cardCls}>
              <span className={headingCls}>Add User to Group</span>
              <div className="flex flex-wrap gap-2.5 items-center mt-3">
                <input
                  required
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="email@example.com"
                  className={`flex-1 min-w-[180px] px-3 py-2.5 ${inputCls}`}
                />
                <input
                  required
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Display name"
                  className={`flex-1 min-w-[140px] px-3 py-2.5 ${inputCls}`}
                />
                <label className="flex items-center gap-1.5 text-[11px] tracking-[1.5px] uppercase text-cream/70">
                  <input
                    type="checkbox"
                    checked={newUserIsAdmin}
                    onChange={(e) => setNewUserIsAdmin(e.target.checked)}
                    className="accent-[#c9a227]"
                  />
                  Admin
                </label>
                <button
                  type="submit"
                  className={`px-5 py-2.5 ${goldBtnCls}`}
                >
                  Add
                </button>
              </div>
            </form>

            <div className={cardCls}>
              <span className={headingCls}>Group Users ({users.length})</span>
              <div className="flex flex-col mt-2">
                {users.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    onSave={handleSaveUser}
                    onDelete={handleDeleteUser}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function UserRow({
  user,
  onSave,
  onDelete,
}: {
  user: GroupUser;
  onSave: (u: GroupUser) => void;
  onDelete: (u: GroupUser) => void;
}) {
  const [name, setName] = useState(user.name);
  const [isAdmin, setIsAdmin] = useState(user.isAdmin);

  useEffect(() => {
    setName(user.name);
    setIsAdmin(user.isAdmin);
  }, [user]);

  const dirty = name !== user.name || isAdmin !== user.isAdmin;

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm py-2.5 border-b border-cream/[0.08]">
      <span className="text-cream/50 text-xs w-[200px] truncate">
        {user.email}
      </span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1 min-w-[120px] px-2.5 py-[7px] bg-[rgba(10,43,29,0.6)] border border-gold/30 text-cream font-serif text-sm focus:outline-none focus:border-gold"
      />
      {user.isSuperAdmin ? (
        <span className={`${chipCls} bg-gold text-clubhouse`}>
          Super Admin
        </span>
      ) : (
        <label className="flex items-center gap-1.5 text-[11px] tracking-[1.5px] uppercase text-cream/70">
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
            className="accent-[#c9a227]"
          />
          Admin
        </label>
      )}
      <button
        onClick={() => onSave({ ...user, name, isAdmin })}
        disabled={!dirty}
        className="px-3 py-1.5 border border-gold/50 text-gold text-[10px] tracking-[2px] uppercase disabled:opacity-45 enabled:hover:bg-gold/15"
      >
        Save
      </button>
      {!user.isSuperAdmin && (
        <ConfirmAction
          label="Remove"
          confirmLabel="Really remove?"
          onConfirm={() => onDelete(user)}
          className="px-3 py-1.5 border border-rosewood/50 text-rosewood text-[10px] tracking-[2px] uppercase hover:bg-rosewood/10"
          confirmClassName="px-3 py-1.5 border border-rosewood bg-rosewood/15 text-rosewood text-[10px] tracking-[2px] uppercase"
        />
      )}
    </div>
  );
}
