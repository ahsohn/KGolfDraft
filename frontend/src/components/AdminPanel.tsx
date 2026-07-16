"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DraftState, User } from "@/lib/types";
import ConfirmAction from "./ConfirmAction";

interface Props {
  draftState: DraftState;
  currentUser: User;
  onStartDraft: (totalRounds: number, draftFormat: string) => void;
  onAdminToggleAutoDraft: (userEmail: string, enabled: boolean) => void;
  onUndoPick: () => void;
}

// The collapsible admin card (visibility is controlled by the page's ADMIN
// header button). Admins pick on behalf of the on-clock user via The Field.
export default function AdminPanel({
  draftState,
  currentUser,
  onStartDraft,
  onAdminToggleAutoDraft,
  onUndoPick,
}: Props) {
  const router = useRouter();
  const [rounds, setRounds] = useState(draftState.totalRounds || 10);
  const [draftFormat, setDraftFormat] = useState<string>(
    draftState.draftFormat || "snake"
  );

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
    <div className="border border-gold/50 bg-cream/[0.04] px-5 py-4">
      <div className="flex items-baseline justify-between mb-3">
        <span className="font-serif text-lg font-semibold">Admin</span>
        <span className="text-[11px] tracking-[2px] uppercase text-cream/50">
          {draftState.onlineUsers.length} of {draftState.users.length} present
        </span>
      </div>

      {/* Start Draft */}
      {draftState.status === "waiting" && (
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-[10px] tracking-[2px] uppercase text-gold mb-1.5">
              Rounds
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
              className="w-16 px-2.5 py-2 bg-[rgba(10,43,29,0.6)] border border-gold/30 text-cream text-sm focus:outline-none focus:border-gold disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-[10px] tracking-[2px] uppercase text-gold mb-1.5">
              Format
            </label>
            <select
              value={draftFormat}
              onChange={(e) => setDraftFormat(e.target.value)}
              className="px-2.5 py-2 bg-[rgba(10,43,29,0.9)] border border-gold/30 text-cream text-sm focus:outline-none focus:border-gold"
            >
              <option value="snake">Standard Snake</option>
              <option value="thirdRoundReversal">3rd Round Reversal</option>
            </select>
          </div>
          <button
            onClick={() => onStartDraft(rounds, draftFormat)}
            className="px-5 py-[9px] bg-gold hover:bg-gold-bright text-clubhouse font-semibold text-[11px] tracking-[2px] uppercase"
          >
            Start Draft
          </button>
        </div>
      )}

      {/* Participants: presence + auto-draft control */}
      {draftState.status === "active" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-2">
          {draftState.users.map((user) => {
            const isOnline = draftState.onlineUsers.includes(user.email);
            const isOnClock = draftState.currentPicker?.email === user.email;
            const isAutoDraft = draftState.autoDraft[user.email];

            return (
              <div
                key={user.email}
                className="flex items-center gap-2.5 text-[13px] min-h-[28px]"
              >
                <span
                  className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${
                    isOnline ? "bg-gold" : "bg-cream/20"
                  }`}
                />
                <span
                  className={`flex-1 font-serif text-sm ${
                    isOnClock ? "text-clock font-bold" : "text-cream"
                  }`}
                >
                  {user.name}
                  {isOnClock && " — on the clock"}
                </span>
                <button
                  onClick={() =>
                    onAdminToggleAutoDraft(user.email, !isAutoDraft)
                  }
                  className={`border border-gold/40 px-2 py-[3px] text-[10px] tracking-[1.5px] uppercase ${
                    isAutoDraft
                      ? "bg-gold text-clubhouse"
                      : "bg-transparent text-cream/55"
                  }`}
                >
                  {isAutoDraft ? "Auto On" : "Auto Off"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {draftState.status === "complete" && (
        <p className="font-serif italic text-sm text-cream/70">
          The draft is complete.
        </p>
      )}

      {/* Undo / export / super-admin tools */}
      {(canUndo ||
        (csvUrl && draftState.picks.length > 0) ||
        currentUser.isSuperAdmin) && (
        <div className="flex items-center gap-4 flex-wrap mt-3.5 pt-3 border-t border-gold/25">
          {canUndo && (
            <ConfirmAction
              label="Undo Last Pick"
              confirmLabel="Confirm Undo"
              onConfirm={onUndoPick}
              className="border border-gold text-gold hover:bg-gold/15 px-4 py-[7px] text-[11px] tracking-[2px] uppercase"
              confirmClassName="border border-rosewood/50 text-rosewood hover:bg-rosewood/10 px-4 py-[7px] text-[11px] tracking-[2px] uppercase"
            />
          )}
          {csvUrl && draftState.picks.length > 0 && (
            <a
              href={csvUrl}
              className="border border-cream/30 text-cream/70 hover:text-cream hover:border-cream/60 px-4 py-[7px] text-[11px] tracking-[2px] uppercase"
            >
              Download Results CSV
            </a>
          )}
          {currentUser.isSuperAdmin && (
            <button
              onClick={() => router.push("/super-admin")}
              className="ml-auto text-[11px] tracking-[2px] uppercase text-gold hover:text-cream border-b border-gold/50 pb-px"
            >
              Super Admin Panel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
