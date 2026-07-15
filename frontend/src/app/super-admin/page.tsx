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

// Promise wrapper around socket.emit-with-callback
function emitAsync<T extends { success: boolean; error?: string }>(
  event: string,
  payload: object
): Promise<T> {
  return new Promise((resolve) => {
    getSocket().emit(event, payload, (res: T) => resolve(res));
  });
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    waiting: "bg-gray-600",
    active: "bg-green-600",
    complete: "bg-blue-600",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full text-white ${
        colors[status] || "bg-gray-600"
      }`}
    >
      {status}
    </span>
  );
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
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-theme-400 text-lg">Loading...</p>
      </div>
    );
  }

  const editable = detail?.draft.status === "waiting";

  return (
    <div className="min-h-screen p-4 max-w-6xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <h1 className="text-2xl font-bold text-white">Super Admin</h1>
        <div className="flex items-center gap-3 text-sm">
          {notice && <span className="text-green-400">{notice}</span>}
          <button
            onClick={() => router.push("/draft")}
            className="text-theme-300 hover:text-white underline"
          >
            Back to Draft
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {(["drafts", "users"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium ${
              tab === t
                ? "bg-theme-600 text-white"
                : "bg-theme-900 text-theme-300 hover:bg-theme-800"
            }`}
          >
            {t === "drafts" ? "Drafts" : "Group Users"}
          </button>
        ))}
      </div>

      {tab === "drafts" && (
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Left: create + list */}
          <div className="space-y-4">
            <form
              onSubmit={handleCreateDraft}
              className="bg-theme-900/50 rounded-lg p-4 border border-theme-800 space-y-3"
            >
              <h2 className="text-sm font-bold text-theme-200">
                Create New Draft
              </h2>
              <input
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Draft name (e.g. Masters 2027)"
                className="w-full px-3 py-2 rounded bg-theme-950 border border-theme-700 text-white text-sm"
              />
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <label className="block text-xs text-theme-400 mb-1">
                    Theme
                  </label>
                  <select
                    value={newTheme}
                    onChange={(e) => setNewTheme(e.target.value)}
                    className="px-2 py-1.5 rounded bg-theme-950 border border-theme-700 text-white text-sm"
                  >
                    <option value="golf">Golf</option>
                    <option value="worldcup">World Cup</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-theme-400 mb-1">
                    Format
                  </label>
                  <select
                    value={newFormat}
                    onChange={(e) => setNewFormat(e.target.value)}
                    className="px-2 py-1.5 rounded bg-theme-950 border border-theme-700 text-white text-sm"
                  >
                    <option value="snake">Standard Snake</option>
                    <option value="thirdRoundReversal">
                      3rd Round Reversal
                    </option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-theme-400 mb-1">
                    Rounds
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={newFormat === "thirdRoundReversal" ? 6 : newRounds}
                    disabled={newFormat === "thirdRoundReversal"}
                    onChange={(e) => setNewRounds(Number(e.target.value))}
                    className="w-16 px-2 py-1.5 rounded bg-theme-950 border border-theme-700 text-white text-sm disabled:opacity-50"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-theme-600 hover:bg-theme-500 text-white text-sm font-medium"
                >
                  Create
                </button>
              </div>
            </form>

            <div className="bg-theme-900/50 rounded-lg p-4 border border-theme-800">
              <h2 className="text-sm font-bold text-theme-200 mb-2">
                All Drafts
              </h2>
              {drafts.length === 0 && (
                <p className="text-theme-500 text-sm">No drafts yet.</p>
              )}
              <div className="space-y-2">
                {drafts.map((d) => (
                  <div
                    key={d.id}
                    className={`p-2 rounded border cursor-pointer ${
                      selectedId === d.id
                        ? "border-theme-500 bg-theme-800/50"
                        : "border-theme-800 hover:border-theme-600"
                    }`}
                    onClick={() => {
                      setSelectedId(d.id);
                      loadDetail(d.id);
                    }}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white text-sm font-medium flex-1">
                        {d.name}
                      </span>
                      {d.isCurrent && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-700 text-white">
                          current
                        </span>
                      )}
                      {statusBadge(d.status)}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-theme-400 flex-wrap">
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
                          className="text-purple-400 hover:text-purple-300 underline"
                        >
                          Make Current
                        </button>
                      )}
                      {d.pickCount > 0 && (
                        <a
                          href={csvUrl(d.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="text-theme-300 hover:text-white underline"
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
                        className="text-red-400 hover:text-red-300 underline"
                        confirmClassName="px-2 py-0.5 rounded bg-red-700 hover:bg-red-600 text-white text-xs font-medium"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: selected draft detail */}
          <div className="space-y-4">
            {!detail && (
              <div className="bg-theme-900/50 rounded-lg p-4 border border-theme-800">
                <p className="text-theme-500 text-sm">
                  Select a draft to manage its settings, players, and draft
                  order.
                </p>
              </div>
            )}

            {detail && (
              <>
                {/* Settings */}
                <div className="bg-theme-900/50 rounded-lg p-4 border border-theme-800 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-bold text-theme-200 flex-1">
                      {detail.draft.name}
                    </h2>
                    {detail.draft.isCurrent && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-700 text-white">
                        current
                      </span>
                    )}
                    {statusBadge(detail.draft.status)}
                  </div>

                  {editable ? (
                    <div className="space-y-2">
                      <input
                        value={settingsName}
                        onChange={(e) => setSettingsName(e.target.value)}
                        className="w-full px-3 py-2 rounded bg-theme-950 border border-theme-700 text-white text-sm"
                      />
                      <div className="flex flex-wrap gap-2 items-end">
                        <select
                          value={settingsTheme}
                          onChange={(e) => setSettingsTheme(e.target.value)}
                          className="px-2 py-1.5 rounded bg-theme-950 border border-theme-700 text-white text-sm"
                        >
                          <option value="golf">Golf</option>
                          <option value="worldcup">World Cup</option>
                        </select>
                        <select
                          value={settingsFormat}
                          onChange={(e) => setSettingsFormat(e.target.value)}
                          className="px-2 py-1.5 rounded bg-theme-950 border border-theme-700 text-white text-sm"
                        >
                          <option value="snake">Standard Snake</option>
                          <option value="thirdRoundReversal">
                            3rd Round Reversal
                          </option>
                        </select>
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
                          className="w-16 px-2 py-1.5 rounded bg-theme-950 border border-theme-700 text-white text-sm disabled:opacity-50"
                        />
                        <button
                          onClick={handleSaveSettings}
                          className="px-3 py-1.5 rounded bg-theme-600 hover:bg-theme-500 text-white text-sm"
                        >
                          Save Settings
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-theme-400">
                      {detail.draft.draftFormat === "thirdRoundReversal"
                        ? "3rd Round Reversal"
                        : "Standard Snake"}{" "}
                      · {detail.draft.totalRounds} rounds ·{" "}
                      {detail.draft.theme === "worldcup" ? "World Cup" : "Golf"}{" "}
                      theme
                    </p>
                  )}

                  <div className="flex items-center gap-3 flex-wrap">
                    {detail.draft.isCurrent &&
                      detail.picks.length > 0 &&
                      detail.draft.status !== "waiting" && (
                        <ConfirmAction
                          label="Undo Last Pick"
                          confirmLabel="Confirm Undo"
                          onConfirm={handleUndoPick}
                          className="px-3 py-1.5 rounded bg-purple-700 hover:bg-purple-600 text-white text-xs font-medium"
                          confirmClassName="px-3 py-1.5 rounded bg-red-700 hover:bg-red-600 text-white text-xs font-medium"
                        />
                      )}
                    {detail.picks.length > 0 && (
                      <a
                        href={csvUrl(detail.draft.id)}
                        className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium"
                      >
                        Download Results CSV
                      </a>
                    )}
                  </div>
                </div>

                {/* Players */}
                <div className="bg-theme-900/50 rounded-lg p-4 border border-theme-800 space-y-2">
                  <h2 className="text-sm font-bold text-theme-200">
                    Players ({detail.players.length})
                  </h2>
                  {detail.picks.length === 0 ? (
                    <>
                      <p className="text-xs text-theme-400">
                        One per line: <code>Name, Rank</code> (rank optional —
                        line order is used if omitted). Paste from a
                        spreadsheet works too.
                      </p>
                      <textarea
                        value={playersText}
                        onChange={(e) => setPlayersText(e.target.value)}
                        rows={10}
                        placeholder={"Scottie Scheffler, 1\nRory McIlroy, 2"}
                        className="w-full px-3 py-2 rounded bg-theme-950 border border-theme-700 text-white text-sm font-mono"
                      />
                      <button
                        onClick={handleSavePlayers}
                        className="px-3 py-1.5 rounded bg-theme-600 hover:bg-theme-500 text-white text-sm"
                      >
                        Save Players
                      </button>
                    </>
                  ) : (
                    <p className="text-xs text-theme-400">
                      Player list is locked once picks have been made.
                    </p>
                  )}
                </div>

                {/* Participants / draft order */}
                <div className="bg-theme-900/50 rounded-lg p-4 border border-theme-800 space-y-2">
                  <h2 className="text-sm font-bold text-theme-200">
                    Participants & Draft Order
                  </h2>
                  {editable ? (
                    <>
                      <div className="space-y-1">
                        {users.map((u) => {
                          const entry = partEdit[u.email] || {
                            included: false,
                            order: 0,
                          };
                          return (
                            <div
                              key={u.email}
                              className="flex items-center gap-2 text-sm"
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
                              />
                              <span className="flex-1 text-white">
                                {u.name}{" "}
                                <span className="text-theme-500 text-xs">
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
                                  className="w-14 px-2 py-1 rounded bg-theme-950 border border-theme-700 text-white text-xs"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <button
                        onClick={handleSaveParticipants}
                        className="px-3 py-1.5 rounded bg-theme-600 hover:bg-theme-500 text-white text-sm"
                      >
                        Save Participants
                      </button>
                    </>
                  ) : (
                    <div className="space-y-1">
                      {detail.participants.map((p) => (
                        <p key={p.email} className="text-sm text-white">
                          <span className="text-theme-400">
                            #{p.draftOrder}
                          </span>{" "}
                          {p.name}
                        </p>
                      ))}
                    </div>
                  )}
                </div>

                {/* Picks / results */}
                {detail.picks.length > 0 && (
                  <div className="bg-theme-900/50 rounded-lg p-4 border border-theme-800">
                    <h2 className="text-sm font-bold text-theme-200 mb-2">
                      Picks ({detail.picks.length})
                    </h2>
                    <div className="max-h-72 overflow-y-auto scroll-thin">
                      <table className="w-full text-xs text-left">
                        <thead className="text-theme-400 sticky top-0 bg-theme-900">
                          <tr>
                            <th className="py-1 pr-2">#</th>
                            <th className="py-1 pr-2">Rd</th>
                            <th className="py-1 pr-2">Team</th>
                            <th className="py-1">Selection</th>
                          </tr>
                        </thead>
                        <tbody className="text-white">
                          {detail.picks.map((p) => (
                            <tr
                              key={p.pickNumber}
                              className="border-t border-theme-800"
                            >
                              <td className="py-1 pr-2">{p.pickNumber}</td>
                              <td className="py-1 pr-2">{p.round}</td>
                              <td className="py-1 pr-2">{p.userName}</td>
                              <td className="py-1">{p.golferName}</td>
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
        <div className="max-w-3xl space-y-4">
          <form
            onSubmit={handleAddUser}
            className="bg-theme-900/50 rounded-lg p-4 border border-theme-800"
          >
            <h2 className="text-sm font-bold text-theme-200 mb-2">
              Add User to Group
            </h2>
            <div className="flex flex-wrap gap-2 items-center">
              <input
                required
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="email@example.com"
                className="flex-1 min-w-[180px] px-3 py-2 rounded bg-theme-950 border border-theme-700 text-white text-sm"
              />
              <input
                required
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="Display name"
                className="flex-1 min-w-[140px] px-3 py-2 rounded bg-theme-950 border border-theme-700 text-white text-sm"
              />
              <label className="flex items-center gap-1 text-xs text-theme-300">
                <input
                  type="checkbox"
                  checked={newUserIsAdmin}
                  onChange={(e) => setNewUserIsAdmin(e.target.checked)}
                />
                Admin
              </label>
              <button
                type="submit"
                className="px-4 py-2 rounded bg-theme-600 hover:bg-theme-500 text-white text-sm font-medium"
              >
                Add
              </button>
            </div>
          </form>

          <div className="bg-theme-900/50 rounded-lg p-4 border border-theme-800">
            <h2 className="text-sm font-bold text-theme-200 mb-2">
              Group Users ({users.length})
            </h2>
            <div className="space-y-2">
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
    <div className="flex flex-wrap items-center gap-2 text-sm border-t border-theme-800 pt-2 first:border-t-0 first:pt-0">
      <span className="text-theme-400 text-xs w-52 truncate">{user.email}</span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1 min-w-[120px] px-2 py-1 rounded bg-theme-950 border border-theme-700 text-white text-sm"
      />
      {user.isSuperAdmin ? (
        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-700 text-white">
          super-admin
        </span>
      ) : (
        <label className="flex items-center gap-1 text-xs text-theme-300">
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
          />
          Admin
        </label>
      )}
      <button
        onClick={() => onSave({ ...user, name, isAdmin })}
        disabled={!dirty}
        className="px-2 py-1 rounded bg-theme-600 hover:bg-theme-500 disabled:opacity-40 text-white text-xs"
      >
        Save
      </button>
      {!user.isSuperAdmin && (
        <ConfirmAction
          label="Remove"
          confirmLabel="Really remove?"
          onConfirm={() => onDelete(user)}
          className="px-2 py-1 rounded bg-red-800 hover:bg-red-700 text-white text-xs"
          confirmClassName="px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-xs"
        />
      )}
    </div>
  );
}
