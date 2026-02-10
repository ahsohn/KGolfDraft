export interface User {
  email: string;
  name: string;
  isAdmin: boolean;
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
  status: "waiting" | "active" | "complete";
  currentRound: number;
  currentPickInRound: number;
  totalRounds: number;
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
