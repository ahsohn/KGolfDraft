"use client";

import { useState } from "react";
import { Player, DraftState, User } from "@/lib/types";

interface Props {
  draftState: DraftState;
  currentUser: User;
  onPick: (golferName: string) => void;
}

export default function PlayerList({ draftState, currentUser, onPick }: Props) {
  const [search, setSearch] = useState("");

  const isMyTurn =
    draftState.status === "active" &&
    draftState.currentPicker?.email === currentUser.email;

  const canPick =
    isMyTurn ||
    (currentUser.isAdmin && draftState.status === "active");

  const filtered = draftState.availablePlayers.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  function handlePick(player: Player) {
    if (!canPick) return;
    if (
      confirm(
        `Pick ${player.name} (Rank #${player.rank})?`
      )
    ) {
      onPick(player.name);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-lg font-bold mb-2 px-1">
        Available Players ({draftState.availablePlayers.length})
      </h2>

      <input
        type="text"
        placeholder="Search players..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-2 mb-2 rounded bg-green-950 border border-green-700 text-white placeholder-green-600 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
      />

      <div className="flex-1 overflow-y-auto scroll-thin space-y-1">
        {filtered.map((player) => (
          <button
            key={player.name}
            onClick={() => handlePick(player)}
            disabled={!canPick}
            className={`w-full text-left px-3 py-2 rounded text-sm flex justify-between items-center transition-colors ${
              canPick
                ? "hover:bg-green-700 cursor-pointer"
                : "cursor-default opacity-80"
            } ${
              isMyTurn ? "bg-green-800/50" : "bg-green-900/30"
            }`}
          >
            <span className="font-medium">{player.name}</span>
            <span className="text-green-400 text-xs">#{player.rank}</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-green-500 text-sm text-center py-4">
            No players found
          </p>
        )}
      </div>
    </div>
  );
}
