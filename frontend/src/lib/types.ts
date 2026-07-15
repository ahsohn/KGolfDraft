export interface User {
  email: string;
  name: string;
  isAdmin: boolean;
  isSuperAdmin?: boolean;
  draftOrder: number;
}

export interface Player {
  name: string;
  rank: number;
}

export interface Pick {
  round: number;
  pickNumber: number;
  userEmail: string;
  userName: string;
  golferName: string;
}

export interface DraftState {
  draftId: number | null;
  draftName: string | null;
  status: "waiting" | "active" | "complete";
  currentRound: number;
  currentPickInRound: number;
  totalRounds: number;
  draftFormat: "snake" | "thirdRoundReversal";
  theme: "golf" | "worldcup";
  overallPick: number;
  users: User[];
  availablePlayers: Player[];
  picks: Pick[];
  teams: Record<string, Player[]>;
  autoDraft: Record<string, boolean>;
  onlineUsers: string[];
  currentPicker: User | null;
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  isSystem: boolean;
  timestamp: number;
}

// --- Super-admin types ---

export interface GroupUser {
  id: number;
  email: string;
  name: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

export interface DraftSummary {
  id: number;
  name: string;
  theme: "golf" | "worldcup";
  draftFormat: "snake" | "thirdRoundReversal";
  totalRounds: number;
  status: "waiting" | "active" | "complete";
  isCurrent: boolean;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  pickCount: number;
  participantCount: number;
}

export interface Participant {
  email: string;
  name: string;
  isAdmin: boolean;
  draftOrder: number;
}

export interface DraftDetail {
  draft: DraftSummary;
  players: Player[];
  participants: Participant[];
  picks: Pick[];
}
