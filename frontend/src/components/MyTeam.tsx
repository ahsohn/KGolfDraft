"use client";

import { Player, User } from "@/lib/types";

interface Props {
  team: Player[];
  currentUser: User;
}

export default function MyTeam({ team, currentUser }: Props) {
  return (
    <div>
      <h2 className="text-lg font-bold mb-2 px-1">
        My Team ({team.length})
      </h2>

      {team.length === 0 ? (
        <p className="text-green-500 text-sm px-1">No picks yet</p>
      ) : (
        <div className="space-y-1">
          {team.map((player, idx) => (
            <div
              key={player.name}
              className="flex justify-between items-center px-3 py-2 rounded bg-green-800/30 text-sm"
            >
              <span>
                <span className="text-green-500 mr-2">{idx + 1}.</span>
                <span className="font-medium">{player.name}</span>
              </span>
              <span className="text-green-400 text-xs">#{player.rank}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
