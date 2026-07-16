"use client";

import { Player, User } from "@/lib/types";

interface Props {
  team: Player[];
  currentUser: User;
  variant?: "row" | "chips";
}

// "My Card" — the current user's selections. Desktop shows a horizontal row
// inside a panel; mobile shows horizontally scrollable pinline chips.
export default function MyTeam({ team, variant = "row" }: Props) {
  if (variant === "chips") {
    return (
      <div className="flex gap-2 overflow-x-auto scroll-thin pb-1">
        {team.length === 0 ? (
          <span className="font-serif italic text-[13px] text-cream/50 py-2">
            No selections yet
          </span>
        ) : (
          team.map((player, idx) => (
            <span
              key={player.name}
              className="border border-gold/40 px-3 py-2 font-serif text-[13px] whitespace-nowrap flex-shrink-0"
            >
              <span className="text-gold mr-1.5">{idx + 1}</span>
              {player.name}
            </span>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-6 flex-wrap">
      <span className="font-serif text-lg font-semibold flex-shrink-0">
        My Card
      </span>
      {team.length === 0 ? (
        <span className="font-serif italic text-sm text-cream/50">
          No selections yet
        </span>
      ) : (
        team.map((player, idx) => (
          <div key={player.name} className="flex items-baseline gap-2">
            <span className="text-gold text-[13px]">{idx + 1}.</span>
            <span className="font-serif text-[15px]">{player.name}</span>
            <span className="text-xs text-cream/50">№{player.rank}</span>
          </div>
        ))
      )}
    </div>
  );
}
