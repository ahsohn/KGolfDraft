"use client";

import { useEffect, useState } from "react";
import { Player, DraftState, User } from "@/lib/types";
import { getTheme } from "@/lib/themes";

interface Props {
  draftState: DraftState;
  currentUser: User;
  onPick: (golferName: string) => void;
}

export default function PlayerList({ draftState, currentUser, onPick }: Props) {
  const [search, setSearch] = useState("");
  // Player awaiting in-place confirmation (no native confirm() popup)
  const [pendingPick, setPendingPick] = useState<string | null>(null);

  // A pick was made (by anyone) — clear any pending confirmation
  useEffect(() => {
    setPendingPick(null);
  }, [draftState.overallPick, draftState.status]);

  const isMyTurn =
    draftState.status === "active" &&
    draftState.currentPicker?.email === currentUser.email;

  const canPick =
    isMyTurn ||
    (currentUser.isAdmin && draftState.status === "active");

  const theme = getTheme(draftState.theme);

  const filtered = draftState.availablePlayers.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  function handleConfirm(player: Player) {
    setPendingPick(null);
    onPick(player.name);
  }

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-lg font-bold mb-2 px-1">
        {theme.availableHeading} ({draftState.availablePlayers.length})
      </h2>

      <input
        type="text"
        placeholder={theme.searchPlaceholder}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-2 mb-2 rounded bg-theme-950 border border-theme-700 text-white placeholder-theme-600 text-sm focus:outline-none focus:ring-1 focus:ring-theme-500"
      />

      <div className="flex-1 overflow-y-auto scroll-thin space-y-1">
        {filtered.map((player) =>
          pendingPick === player.name ? (
            <div
              key={player.name}
              className="px-3 py-2 rounded text-sm bg-theme-800 border border-theme-500"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium">Pick {player.name}?</span>
                <span className="text-theme-400 text-xs">#{player.rank}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleConfirm(player)}
                  className="flex-1 py-1 rounded bg-theme-600 hover:bg-theme-500 text-white text-xs font-semibold transition-colors"
                >
                  Confirm Pick
                </button>
                <button
                  onClick={() => setPendingPick(null)}
                  className="flex-1 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              key={player.name}
              onClick={() => canPick && setPendingPick(player.name)}
              disabled={!canPick}
              className={`w-full text-left px-3 py-2 rounded text-sm flex justify-between items-center transition-colors ${
                canPick
                  ? "hover:bg-theme-700 cursor-pointer"
                  : "cursor-default opacity-80"
              } ${
                isMyTurn ? "bg-theme-800/50" : "bg-theme-900/30"
              }`}
            >
              <span className="font-medium">{player.name}</span>
              <span className="text-theme-400 text-xs">#{player.rank}</span>
            </button>
          )
        )}
        {filtered.length === 0 && (
          <p className="text-theme-500 text-sm text-center py-4">
            No players found
          </p>
        )}
      </div>
    </div>
  );
}
