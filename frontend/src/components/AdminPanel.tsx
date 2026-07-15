"use client";

import { useEffect, useState } from "react";
import { DraftState, User } from "@/lib/types";
import ConfirmAction from "./ConfirmAction";

interface Props {
  draftState: DraftState;
  currentUser: User;
  onStartDraft: (totalRounds: number, draftFormat: string) => void;
  onAdminPick: (userEmail: string, golferName: string) => void;
  onAdminToggleAutoDraft: (userEmail: string, enabled: boolean) => void;
  onUndoPick: () => void;
}

export default function AdminPanel({
  draftState,
  currentUser,
  onStartDraft,
  onAdminPick,
  onAdminToggleAutoDraft,
  onUndoPick,
}: Props) {
  const [rounds, setRounds] = useState(draftState.totalRounds || 10);
  const [draftFormat, setDraftFormat] = useState<string>(
    draftState.draftFormat || "snake"
  );
  const [showPanel, setShowPanel] = useState(false);
  const [adminPickPlayer, setAdminPickPlayer] = useState("");

  // Re-sync the start-draft defaults when the super-admin switches drafts
  useEffect(() => {
    setRounds(draftState.totalRounds || 10);
    setDraftFormat(draftState.draftFormat || "snake");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftState.draftId]);

  if (!currentUser.isAdmin) return null;

  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
  const csvUrl =
    draftState.draftId != null && typeof window !== "undefined"
      ? `${backendUrl}/api/drafts/${draftState.draftId}/export.csv?token=${
          localStorage.getItem("kgolfdraft_token") || ""
        }`
      : null;

  const canUndo =
    currentUser.isSuperAdmin &&
    draftState.picks.length > 0 &&
    (draftState.status === "active" || draftState.status === "complete");

  return (
    <div className="mb-4">
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="text-sm text-yellow-400 hover:text-yellow-300 underline"
      >
        {showPanel ? "Hide Admin Panel" : "Show Admin Panel"}
      </button>

      {showPanel && (
        <div className="mt-2 bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-4 space-y-4">
          <h3 className="text-sm font-bold text-yellow-300">Admin Controls</h3>

          {/* Start Draft */}
          {draftState.status === "waiting" && (
            <div className="flex items-end gap-2">
              <div>
                <label className="block text-xs text-yellow-200 mb-1">
                  Total Rounds
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={draftFormat === "thirdRoundReversal" ? 6 : rounds}
                  disabled={draftFormat === "thirdRoundReversal"}
                  title={
                    draftFormat === "thirdRoundReversal"
                      ? "Rounds are fixed at 6 for 3rd Round Reversal"
                      : undefined
                  }
                  onChange={(e) => setRounds(Number(e.target.value))}
                  className="w-20 px-2 py-1 rounded bg-theme-950 border border-yellow-700 text-white text-sm focus:outline-none disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs text-yellow-200 mb-1">
                  Draft Format
                </label>
                <select
                  value={draftFormat}
                  onChange={(e) => setDraftFormat(e.target.value)}
                  className="px-2 py-1 rounded bg-theme-950 border border-yellow-700 text-white text-sm focus:outline-none"
                >
                  <option value="snake">Standard Snake</option>
                  <option value="thirdRoundReversal">3rd Round Reversal</option>
                </select>
              </div>
              <button
                onClick={() => onStartDraft(rounds, draftFormat)}
                className="px-4 py-1.5 rounded bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-medium transition-colors"
              >
                Start Draft
              </button>
              <span className="text-xs text-theme-400">
                {draftState.onlineUsers.length} of{" "}
                {draftState.users.length} online
              </span>
            </div>
          )}

          {/* User Management */}
          {draftState.status === "active" && (
            <div>
              <h4 className="text-xs font-semibold text-yellow-200 mb-2">
                Players
              </h4>
              <div className="space-y-1">
                {draftState.users.map((user) => {
                  const isOnline = draftState.onlineUsers.includes(user.email);
                  const isOnClock =
                    draftState.currentPicker?.email === user.email;
                  const isAutoDraft = draftState.autoDraft[user.email];

                  return (
                    <div
                      key={user.email}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isOnline ? "bg-green-400" : "bg-gray-600"
                        }`}
                      />
                      <span
                        className={`flex-1 ${
                          isOnClock ? "text-yellow-300 font-bold" : "text-white"
                        }`}
                      >
                        {user.name}
                        {isOnClock && " (on clock)"}
                      </span>

                      <button
                        onClick={() =>
                          onAdminToggleAutoDraft(user.email, !isAutoDraft)
                        }
                        className={`px-2 py-0.5 rounded text-xs ${
                          isAutoDraft
                            ? "bg-blue-700 text-white"
                            : "bg-gray-700 text-gray-300"
                        }`}
                      >
                        {isAutoDraft ? "Auto: ON" : "Auto: OFF"}
                      </button>

                      {isOnClock && (
                        <div className="flex items-center gap-1">
                          <select
                            value={adminPickPlayer}
                            onChange={(e) => setAdminPickPlayer(e.target.value)}
                            className="px-1 py-0.5 rounded bg-theme-950 border border-yellow-700 text-white text-xs max-w-[140px]"
                          >
                            <option value="">Select player...</option>
                            {draftState.availablePlayers.map((p) => (
                              <option key={p.name} value={p.name}>
                                {p.name} (#{p.rank})
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => {
                              const name = adminPickPlayer || draftState.availablePlayers[0]?.name;
                              if (name) {
                                onAdminPick(user.email, name);
                                setAdminPickPlayer("");
                              }
                            }}
                            className="px-2 py-0.5 rounded bg-red-700 hover:bg-red-600 text-white text-xs whitespace-nowrap"
                          >
                            Pick
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {draftState.status === "complete" && (
            <p className="text-sm text-yellow-200">Draft is complete.</p>
          )}

          {/* Super-admin / export tools */}
          {(canUndo || (csvUrl && draftState.picks.length > 0)) && (
            <div className="flex items-center gap-3 pt-1 border-t border-yellow-700/30">
              {canUndo && (
                <ConfirmAction
                  label="Undo Last Pick"
                  confirmLabel="Confirm Undo"
                  onConfirm={onUndoPick}
                  className="px-3 py-1 rounded bg-purple-700 hover:bg-purple-600 text-white text-xs font-medium"
                  confirmClassName="px-3 py-1 rounded bg-red-700 hover:bg-red-600 text-white text-xs font-medium"
                />
              )}
              {csvUrl && draftState.picks.length > 0 && (
                <a
                  href={csvUrl}
                  className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium"
                >
                  Download Results CSV
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
