"use client";

import { useState } from "react";
import { DraftState, User } from "@/lib/types";

interface Props {
  draftState: DraftState;
  currentUser: User;
  onStartDraft: (totalRounds: number) => void;
  onAdminPick: (userEmail: string, golferName: string) => void;
  onAdminToggleAutoDraft: (userEmail: string, enabled: boolean) => void;
}

export default function AdminPanel({
  draftState,
  currentUser,
  onStartDraft,
  onAdminPick,
  onAdminToggleAutoDraft,
}: Props) {
  const [rounds, setRounds] = useState(10);
  const [showPanel, setShowPanel] = useState(false);

  if (!currentUser.isAdmin) return null;

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
                  value={rounds}
                  onChange={(e) => setRounds(Number(e.target.value))}
                  className="w-20 px-2 py-1 rounded bg-green-950 border border-yellow-700 text-white text-sm focus:outline-none"
                />
              </div>
              <button
                onClick={() => onStartDraft(rounds)}
                className="px-4 py-1.5 rounded bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-medium transition-colors"
              >
                Start Draft
              </button>
              <span className="text-xs text-green-400">
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
                        <button
                          onClick={() => {
                            const top = draftState.availablePlayers[0];
                            if (top) {
                              onAdminPick(user.email, top.name);
                            }
                          }}
                          className="px-2 py-0.5 rounded bg-red-700 hover:bg-red-600 text-white text-xs"
                        >
                          Pick for them
                        </button>
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
        </div>
      )}
    </div>
  );
}
