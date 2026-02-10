"use client";

import { DraftState, User } from "@/lib/types";

interface Props {
  draftState: DraftState;
  currentUser: User;
}

export default function DraftBoard({ draftState, currentUser }: Props) {
  const { users, picks, totalRounds, status } = draftState;
  const sortedUsers = [...users].sort((a, b) => a.draftOrder - b.draftOrder);

  // Build a grid: rows = rounds, columns = users (in draft order)
  function getPickForCell(round: number, user: User) {
    return picks.find(
      (p) => p.round === round && p.userEmail === user.email
    );
  }

  // Determine which column index in a given round corresponds to which user
  function getUserForRoundSlot(round: number, slotIndex: number) {
    // Odd rounds: ascending, even rounds: descending
    if (round % 2 === 0) {
      return sortedUsers[sortedUsers.length - 1 - slotIndex];
    }
    return sortedUsers[slotIndex];
  }

  const rounds = [];
  for (let r = 1; r <= totalRounds; r++) {
    rounds.push(r);
  }

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-lg font-bold mb-2 px-1">Draft Board</h2>

      <div className="flex-1 overflow-auto scroll-thin">
        <table className="w-full text-sm border-collapse min-w-[600px]">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 bg-green-900 px-2 py-2 text-left text-xs text-green-300 border-b border-green-700">
                Rd
              </th>
              {sortedUsers.map((user) => (
                <th
                  key={user.email}
                  className={`sticky top-0 z-10 bg-green-900 px-2 py-2 text-center text-xs border-b border-green-700 ${
                    user.email === currentUser.email
                      ? "text-yellow-300"
                      : "text-green-300"
                  }`}
                >
                  <div>{user.name}</div>
                  <div className="text-green-500 font-normal">
                    #{user.draftOrder}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rounds.map((round) => (
              <tr key={round}>
                <td className="sticky left-0 z-10 bg-green-900 px-2 py-1 text-green-400 font-mono text-xs border-b border-green-800">
                  {round}
                </td>
                {sortedUsers.map((user) => {
                  const pick = getPickForCell(round, user);
                  const isCurrentPick =
                    status === "active" &&
                    draftState.currentRound === round &&
                    draftState.currentPicker?.email === user.email;

                  return (
                    <td
                      key={user.email}
                      className={`px-2 py-1 text-center text-xs border-b border-green-800 ${
                        isCurrentPick
                          ? "bg-yellow-900/40 ring-1 ring-yellow-500/50"
                          : pick
                          ? "bg-green-800/30"
                          : ""
                      }`}
                    >
                      {pick ? (
                        <span className="text-white font-medium">
                          {pick.golferName}
                        </span>
                      ) : isCurrentPick ? (
                        <span className="text-yellow-400 animate-pulse">
                          ...
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
