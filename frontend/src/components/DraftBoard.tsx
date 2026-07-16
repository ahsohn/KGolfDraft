"use client";

import { DraftState, User } from "@/lib/types";

interface Props {
  draftState: DraftState;
  currentUser: User;
  mobile?: boolean;
}

// "First Last" → "F. Last" for board cells
function abbreviate(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

// "Order of Selection" — the pick grid (the section title is rendered by the
// page; on mobile the round column sticks while the board scrolls sideways).
export default function DraftBoard({
  draftState,
  currentUser,
  mobile = false,
}: Props) {
  const { users, picks, totalRounds, status } = draftState;
  const sortedUsers = [...users].sort((a, b) => a.draftOrder - b.draftOrder);

  // A user can have multiple picks in a round (compensatory picks)
  function getPicksForCell(round: number, user: User) {
    return picks.filter((p) => p.round === round && p.userEmail === user.email);
  }

  const rounds = [];
  for (let r = 1; r <= totalRounds; r++) {
    rounds.push(r);
  }

  const stickyCls = mobile ? "sticky left-0 z-10 bg-clubhouse pl-4" : "";

  return (
    <table
      // border-separate: sticky cells mis-paint in collapsed tables (Chromium)
      className={`w-full border-separate border-spacing-0 table-fixed ${
        mobile ? "min-w-[620px]" : "min-w-[560px]"
      }`}
    >
      <thead>
        <tr>
          <th
            className={`${
              mobile ? "w-[46px]" : "w-[34px]"
            } text-left font-medium text-[11px] tracking-[2px] uppercase text-gold border-b border-gold ${stickyCls} ${
              mobile ? "px-1 py-2.5" : "px-1 py-2"
            }`}
          >
            Rd
          </th>
          {sortedUsers.map((user) => (
            <th
              key={user.email}
              className={`font-semibold tracking-[1px] uppercase border-b border-gold ${
                mobile ? "px-1 py-2.5 text-[11px]" : "px-1 py-2 text-xs"
              } ${
                user.email === currentUser.email
                  ? "text-gold"
                  : "text-cream/85"
              }`}
            >
              {user.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rounds.map((round) => (
          <tr key={round}>
            <td
              className={`text-gold tabular-nums border-b border-cream/[0.08] ${stickyCls} ${
                mobile ? "px-1 py-[13px] text-xs" : "px-1 py-[11px] text-[13px]"
              }`}
            >
              {round}
            </td>
            {sortedUsers.map((user) => {
              const cellPicks = getPicksForCell(round, user);
              const isCurrentPick =
                status === "active" &&
                draftState.currentRound === round &&
                draftState.currentPicker?.email === user.email;
              const isMe = user.email === currentUser.email;

              return (
                <td
                  key={user.email}
                  className={`border-b border-cream/[0.08] ${
                    mobile ? "px-[3px] py-1.5" : "px-[3px] py-[5px]"
                  }`}
                >
                  {cellPicks.map((pick) => (
                    <div
                      key={pick.pickNumber}
                      className={`px-1 py-[5px] text-center bg-cream/[0.07] text-cream overflow-hidden text-ellipsis whitespace-nowrap ${
                        mobile ? "text-[11px]" : "text-xs"
                      }`}
                      title={pick.golferName}
                    >
                      {abbreviate(pick.golferName)}
                    </div>
                  ))}
                  {isCurrentPick && (
                    <div
                      className={`px-1 py-[5px] text-center italic bg-clock text-clubhouse whitespace-nowrap ${
                        mobile ? "text-[11px]" : "text-xs"
                      } ${isMe ? "animate-soft-blink" : ""}`}
                    >
                      {isMe ? "your pick" : "picking"}
                    </div>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
