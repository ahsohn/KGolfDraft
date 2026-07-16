"use client";

import { useEffect, useState } from "react";
import { Player, DraftState, User } from "@/lib/types";
import { getTheme } from "@/lib/themes";

interface Props {
  draftState: DraftState;
  currentUser: User;
  onPick: (golferName: string) => void;
  mobile?: boolean;
}

// "The Field" — the searchable list of available players with the inline
// confirm card (the section title is rendered by the page).
export default function PlayerList({
  draftState,
  currentUser,
  onPick,
  mobile = false,
}: Props) {
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
    isMyTurn || (currentUser.isAdmin && draftState.status === "active");

  const theme = getTheme(draftState.theme);

  const filtered = draftState.availablePlayers.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  function handleConfirm(player: Player) {
    setPendingPick(null);
    onPick(player.name);
  }

  return (
    <div className={`flex flex-col ${mobile ? "" : "h-full min-h-0"}`}>
      <input
        type="text"
        placeholder={theme.searchPlaceholder}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={`w-full bg-[rgba(10,43,29,0.6)] border border-gold/30 text-cream placeholder-cream/35 focus:outline-none focus:border-gold ${
          mobile ? "px-3.5 py-3 text-[15px] mb-1.5" : "px-3 py-[9px] text-sm mb-3"
        }`}
      />

      <div
        className={`flex flex-col ${
          mobile ? "" : "flex-1 overflow-y-auto scroll-thin"
        }`}
      >
        {filtered.map((player) =>
          pendingPick === player.name ? (
            <div
              key={player.name}
              className={`border border-gold bg-gold/10 flex-shrink-0 ${
                mobile ? "p-3 my-[3px]" : "px-2 py-2.5 my-0.5"
              }`}
            >
              <div
                className={`font-serif ${
                  mobile ? "text-base mb-2.5" : "text-[15px] mb-2"
                }`}
              >
                Select {player.name}?
              </div>
              <div className={`flex ${mobile ? "gap-2.5" : "gap-2"}`}>
                <button
                  onClick={() => handleConfirm(player)}
                  className={`flex-1 bg-gold hover:bg-gold-bright text-clubhouse font-semibold tracking-[2px] uppercase ${
                    mobile ? "h-11 text-xs" : "py-2 text-[11px]"
                  }`}
                >
                  Confirm
                </button>
                <button
                  onClick={() => setPendingPick(null)}
                  className={`flex-1 border border-cream/30 text-cream/70 tracking-[2px] uppercase ${
                    mobile ? "h-11 text-xs" : "py-2 text-[11px]"
                  }`}
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
              className={`w-full flex items-baseline gap-3 text-left border-b border-cream/10 flex-shrink-0 ${
                mobile ? "px-1 py-[13px] min-h-[44px]" : "px-2 py-[9px]"
              } ${
                canPick
                  ? "cursor-pointer hover:bg-gold/[0.08]"
                  : "cursor-default"
              }`}
            >
              <span
                className={`text-gold tabular-nums flex-shrink-0 ${
                  mobile ? "text-[13px] w-[26px]" : "text-xs w-6"
                }`}
              >
                {player.rank}
              </span>
              <span
                className={`flex-1 font-serif ${
                  mobile ? "text-[17px]" : "text-[15px]"
                }`}
              >
                {player.name}
              </span>
            </button>
          )
        )}
        {filtered.length === 0 && (
          <p
            className={`text-center font-serif italic text-cream/50 ${
              mobile ? "text-[15px] py-5" : "text-sm py-4"
            }`}
          >
            {theme.noResultsText}
          </p>
        )}
      </div>
    </div>
  );
}
