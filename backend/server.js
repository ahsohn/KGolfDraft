require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const db = require("./db");
const draft = require("./draft");

const PORT = process.env.PORT || 3001;
const SUPER_ADMIN_PIN = process.env.SUPER_ADMIN_PIN || "";

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Simple token-based session store: token -> { email, name, isAdmin, isSuperAdmin }
const sessions = new Map();

// Chat history for the current draft (mirrored to Postgres)
let chatHistory = [];
const MAX_CHAT_HISTORY = 200;

function addChatMessage(sender, text, isSystem = false) {
  const msg = {
    id: uuidv4(),
    sender,
    text,
    isSystem,
    timestamp: Date.now(),
  };
  chatHistory.push(msg);
  if (chatHistory.length > MAX_CHAT_HISTORY) {
    chatHistory.shift();
  }

  const state = draft.getState();
  if (state.draftId) {
    db.insertChatMessage(state.draftId, msg).catch((err) => {
      console.error("Error saving chat message:", err.message);
    });
  }
  return msg;
}

async function loadChatHistory() {
  const state = draft.getState();
  if (state.draftId) {
    try {
      chatHistory = await db.getChatMessages(state.draftId, MAX_CHAT_HISTORY);
    } catch (err) {
      console.error("Error loading chat history:", err.message);
      chatHistory = [];
    }
  } else {
    chatHistory = [];
  }
}

// Push the full draft state (and chat) to everyone — used when the
// super-admin switches or reconfigures the current draft, or undoes a pick.
function broadcastState(includeChat = false) {
  const payload = { draftState: draft.getState() };
  if (includeChat) {
    payload.chatHistory = chatHistory;
  }
  io.to("draft").emit("draft-state", payload);
}

// --- HTTP endpoints ---

app.get("/health", (req, res) => {
  const state = draft.getState();
  res.json({
    status: "ok",
    draftStatus: state.status,
    theme: state.theme,
    draftName: state.draftName,
  });
});

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// Download draft results as CSV. Auth: session token of an admin/super-admin.
app.get("/api/drafts/:id/export.csv", async (req, res) => {
  const session = sessions.get(req.query.token);
  if (!session || (!session.isAdmin && !session.isSuperAdmin)) {
    res.status(401).send("Unauthorized");
    return;
  }

  try {
    const draftId = parseInt(req.params.id, 10);
    const draftRow = await db.getDraft(draftId);
    if (!draftRow) {
      res.status(404).send("Draft not found");
      return;
    }
    const picks = await db.getPicks(draftId);

    const lines = [
      ["Round", "Pick Number", "User Name", "User Email", "Selection"]
        .map(csvEscape)
        .join(","),
      ...picks.map((p) =>
        [p.round, p.pickNumber, p.userName, p.userEmail, p.golferName]
          .map(csvEscape)
          .join(",")
      ),
    ];

    const safeName = draftRow.name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "draft";
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName} results.csv"`
    );
    res.send(lines.join("\n"));
  } catch (err) {
    console.error("Error exporting CSV:", err.message);
    res.status(500).send("Export failed");
  }
});

// --- Socket.IO ---

io.on("connection", (socket) => {
  let currentUser = null;

  function requireSuperAdmin(callback) {
    if (!currentUser || !currentUser.isSuperAdmin) {
      callback({ success: false, error: "Super-admin access required" });
      return false;
    }
    return true;
  }

  socket.on("login", async ({ email, pin, token }, callback) => {
    const normalizedEmail = (email || "").toLowerCase().trim();

    // Check for existing session via token
    if (token && sessions.has(token)) {
      const session = sessions.get(token);
      currentUser = session;
      draft.setUserOnline(currentUser.email);
      socket.join("draft");

      const state = draft.getState();
      callback({
        success: true,
        user: currentUser,
        token,
        draftState: state,
        chatHistory,
      });

      io.to("draft").emit("user-online", {
        email: currentUser.email,
        name: currentUser.name,
        onlineUsers: state.onlineUsers,
      });
      return;
    }

    // Validate email against the users table
    let user;
    try {
      user = await db.getUserByEmail(normalizedEmail);
    } catch (err) {
      console.error("Login lookup failed:", err.message);
      callback({ success: false, error: "Server error, try again" });
      return;
    }
    if (!user) {
      callback({ success: false, error: "Email not found" });
      return;
    }

    // Super-admin logins require the PIN
    if (user.isSuperAdmin) {
      if (!SUPER_ADMIN_PIN) {
        callback({
          success: false,
          error: "SUPER_ADMIN_PIN is not configured on the server",
        });
        return;
      }
      if (!pin) {
        callback({ success: false, requiresPin: true });
        return;
      }
      if (pin !== SUPER_ADMIN_PIN) {
        callback({
          success: false,
          requiresPin: true,
          error: "Incorrect PIN",
        });
        return;
      }
    }

    const state = draft.getState();
    const participant = state.users.find((u) => u.email === user.email);

    const newToken = uuidv4();
    currentUser = {
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin,
      isSuperAdmin: user.isSuperAdmin,
      draftOrder: participant ? participant.draftOrder : 0,
    };
    sessions.set(newToken, currentUser);
    draft.setUserOnline(currentUser.email);
    socket.join("draft");

    const updatedState = draft.getState();
    callback({
      success: true,
      user: currentUser,
      token: newToken,
      draftState: updatedState,
      chatHistory,
    });

    const joinMsg = addChatMessage(
      "System",
      `${currentUser.name} joined the draft`,
      true
    );
    io.to("draft").emit("chat-message", joinMsg);
    io.to("draft").emit("user-online", {
      email: currentUser.email,
      name: currentUser.name,
      onlineUsers: updatedState.onlineUsers,
    });
  });

  socket.on("start-draft", async ({ totalRounds, draftFormat }, callback) => {
    if (!currentUser || !currentUser.isAdmin) {
      callback({ success: false, error: "Admin access required" });
      return;
    }

    const result = await draft.startDraft(totalRounds, draftFormat);
    if (result.error) {
      callback({ success: false, error: result.error });
      return;
    }

    const state = draft.getState();
    const formatNote =
      state.draftFormat === "thirdRoundReversal"
        ? " (3rd Round Reversal)"
        : "";
    const msg = addChatMessage(
      "System",
      `Draft started! ${state.totalRounds} rounds, ${state.users.length} players${formatNote}. Good luck!`,
      true
    );

    io.to("draft").emit("draft-started", state);
    io.to("draft").emit("chat-message", msg);

    const picker = draft.getCurrentPicker();
    if (picker) {
      const turnMsg = addChatMessage(
        "System",
        `Round ${state.currentRound} — ${picker.name} is on the clock!`,
        true
      );
      io.to("draft").emit("chat-message", turnMsg);
    }

    callback({ success: true });
  });

  socket.on("make-pick", ({ golferName }, callback) => {
    if (!currentUser) {
      callback({ success: false, error: "Not logged in" });
      return;
    }

    const result = draft.makePick(currentUser.email, golferName);
    if (result.error) {
      callback({ success: false, error: result.error });
      return;
    }

    emitPickMade(result.pick, result.complete);
    callback({ success: true });
  });

  socket.on("admin-pick", ({ userEmail, golferName }, callback) => {
    if (!currentUser || !currentUser.isAdmin) {
      callback({ success: false, error: "Admin access required" });
      return;
    }

    const result = draft.makePick(userEmail, golferName, true);
    if (result.error) {
      callback({ success: false, error: result.error });
      return;
    }

    emitPickMade(result.pick, result.complete, true);
    callback({ success: true });
  });

  socket.on("toggle-auto-draft", ({ enabled }, callback) => {
    if (!currentUser) {
      callback({ success: false, error: "Not logged in" });
      return;
    }

    const result = draft.setAutoDraft(currentUser.email, enabled);
    if (result.error) {
      callback({ success: false, error: result.error });
      return;
    }

    io.to("draft").emit("auto-draft-updated", {
      email: currentUser.email,
      enabled,
    });

    const msg = addChatMessage(
      "System",
      `${currentUser.name} ${enabled ? "enabled" : "disabled"} auto-draft`,
      true
    );
    io.to("draft").emit("chat-message", msg);
    callback({ success: true });
  });

  socket.on("admin-toggle-auto-draft", ({ userEmail, enabled }, callback) => {
    if (!currentUser || !currentUser.isAdmin) {
      callback({ success: false, error: "Admin access required" });
      return;
    }

    const result = draft.setAutoDraft(userEmail, enabled);
    if (result.error) {
      callback({ success: false, error: result.error });
      return;
    }

    const state = draft.getState();
    const targetUser = state.users.find((u) => u.email === userEmail);
    const targetName = targetUser ? targetUser.name : userEmail;

    io.to("draft").emit("auto-draft-updated", { email: userEmail, enabled });

    const msg = addChatMessage(
      "System",
      `Admin ${enabled ? "enabled" : "disabled"} auto-draft for ${targetName}`,
      true
    );
    io.to("draft").emit("chat-message", msg);
    callback({ success: true });
  });

  socket.on("chat-message", ({ text }, callback) => {
    if (!currentUser) {
      callback({ success: false, error: "Not logged in" });
      return;
    }

    const msg = addChatMessage(currentUser.name, text);
    io.to("draft").emit("chat-message", msg);
    callback({ success: true });
  });

  // --- Super-admin events ---

  socket.on("sa-get-overview", async (_payload, callback) => {
    if (!requireSuperAdmin(callback)) return;
    try {
      const [users, drafts] = await Promise.all([
        db.listUsers(),
        db.listDrafts(),
      ]);
      callback({ success: true, users, drafts });
    } catch (err) {
      console.error("sa-get-overview:", err.message);
      callback({ success: false, error: err.message });
    }
  });

  socket.on("sa-save-user", async ({ id, email, name, isAdmin }, callback) => {
    if (!requireSuperAdmin(callback)) return;
    if (!email || !name) {
      callback({ success: false, error: "Email and name are required" });
      return;
    }
    try {
      await db.saveUser({ id, email, name, isAdmin });
      await draft.loadCurrentDraft();
      broadcastState();
      callback({ success: true, users: await db.listUsers() });
    } catch (err) {
      console.error("sa-save-user:", err.message);
      callback({ success: false, error: err.message });
    }
  });

  socket.on("sa-delete-user", async ({ id }, callback) => {
    if (!requireSuperAdmin(callback)) return;
    try {
      await db.deleteUser(id);
      await draft.loadCurrentDraft();
      broadcastState();
      callback({ success: true, users: await db.listUsers() });
    } catch (err) {
      console.error("sa-delete-user:", err.message);
      callback({ success: false, error: err.message });
    }
  });

  socket.on(
    "sa-create-draft",
    async ({ name, theme, draftFormat, totalRounds }, callback) => {
      if (!requireSuperAdmin(callback)) return;
      if (!name) {
        callback({ success: false, error: "Draft name is required" });
        return;
      }
      try {
        const id = await db.createDraft({ name, theme, draftFormat, totalRounds });
        callback({ success: true, draftId: id, drafts: await db.listDrafts() });
      } catch (err) {
        console.error("sa-create-draft:", err.message);
        callback({ success: false, error: err.message });
      }
    }
  );

  socket.on(
    "sa-update-draft",
    async ({ id, name, theme, draftFormat, totalRounds }, callback) => {
      if (!requireSuperAdmin(callback)) return;
      try {
        const existing = await db.getDraft(id);
        if (!existing) {
          callback({ success: false, error: "Draft not found" });
          return;
        }
        if (existing.status !== "waiting") {
          callback({
            success: false,
            error: "Only drafts that haven't started can be edited",
          });
          return;
        }
        await db.updateDraftSettings(id, { name, theme, draftFormat, totalRounds });
        if (existing.isCurrent) {
          await draft.loadCurrentDraft();
          broadcastState();
        }
        callback({ success: true, drafts: await db.listDrafts() });
      } catch (err) {
        console.error("sa-update-draft:", err.message);
        callback({ success: false, error: err.message });
      }
    }
  );

  socket.on("sa-delete-draft", async ({ id }, callback) => {
    if (!requireSuperAdmin(callback)) return;
    try {
      const existing = await db.getDraft(id);
      if (!existing) {
        callback({ success: false, error: "Draft not found" });
        return;
      }
      if (existing.isCurrent && existing.status === "active") {
        callback({
          success: false,
          error: "Cannot delete the draft that is currently in progress",
        });
        return;
      }
      await db.deleteDraft(id);
      if (existing.isCurrent) {
        await draft.loadCurrentDraft();
        await loadChatHistory();
        broadcastState(true);
      }
      callback({ success: true, drafts: await db.listDrafts() });
    } catch (err) {
      console.error("sa-delete-draft:", err.message);
      callback({ success: false, error: err.message });
    }
  });

  socket.on("sa-set-current-draft", async ({ id }, callback) => {
    if (!requireSuperAdmin(callback)) return;
    try {
      await db.setCurrentDraft(id);
      await draft.loadCurrentDraft();
      await loadChatHistory();
      broadcastState(true);
      callback({ success: true, drafts: await db.listDrafts() });
    } catch (err) {
      console.error("sa-set-current-draft:", err.message);
      callback({ success: false, error: err.message });
    }
  });

  socket.on("sa-get-draft-detail", async ({ id }, callback) => {
    if (!requireSuperAdmin(callback)) return;
    try {
      const draftRow = await db.getDraft(id);
      if (!draftRow) {
        callback({ success: false, error: "Draft not found" });
        return;
      }
      const [players, participants, picks] = await Promise.all([
        db.getDraftPlayers(id),
        db.getDraftParticipants(id),
        db.getPicks(id),
      ]);
      callback({ success: true, draft: draftRow, players, participants, picks });
    } catch (err) {
      console.error("sa-get-draft-detail:", err.message);
      callback({ success: false, error: err.message });
    }
  });

  socket.on("sa-set-players", async ({ draftId, players }, callback) => {
    if (!requireSuperAdmin(callback)) return;
    try {
      const existing = await db.getDraft(draftId);
      if (!existing) {
        callback({ success: false, error: "Draft not found" });
        return;
      }
      if (existing.pickCount > 0) {
        callback({
          success: false,
          error: "Cannot modify the player list after picks have been made",
        });
        return;
      }
      const cleaned = (players || [])
        .filter((p) => p && p.name && String(p.name).trim())
        .map((p, i) => ({
          name: String(p.name).trim(),
          rank: parseInt(p.rank, 10) || i + 1,
        }));
      await db.setDraftPlayers(draftId, cleaned);
      if (existing.isCurrent) {
        await draft.loadCurrentDraft();
        broadcastState();
      }
      callback({ success: true, players: await db.getDraftPlayers(draftId) });
    } catch (err) {
      console.error("sa-set-players:", err.message);
      callback({ success: false, error: err.message });
    }
  });

  socket.on(
    "sa-set-participants",
    async ({ draftId, participants }, callback) => {
      if (!requireSuperAdmin(callback)) return;
      try {
        const existing = await db.getDraft(draftId);
        if (!existing) {
          callback({ success: false, error: "Draft not found" });
          return;
        }
        if (existing.status !== "waiting") {
          callback({
            success: false,
            error: "Cannot change participants after the draft has started",
          });
          return;
        }
        const cleaned = (participants || [])
          .filter((p) => p && p.email)
          .map((p) => ({
            email: p.email,
            draftOrder: parseInt(p.draftOrder, 10) || 0,
          }));
        const orders = cleaned.map((p) => p.draftOrder);
        if (new Set(orders).size !== orders.length || orders.some((o) => o < 1)) {
          callback({
            success: false,
            error: "Draft order numbers must be unique and start at 1",
          });
          return;
        }
        await db.setDraftParticipants(draftId, cleaned);
        if (existing.isCurrent) {
          await draft.loadCurrentDraft();
          broadcastState();
        }
        callback({
          success: true,
          participants: await db.getDraftParticipants(draftId),
        });
      } catch (err) {
        console.error("sa-set-participants:", err.message);
        callback({ success: false, error: err.message });
      }
    }
  );

  socket.on("sa-undo-pick", async (_payload, callback) => {
    if (!requireSuperAdmin(callback)) return;
    try {
      const result = await draft.undoLastPick();
      if (result.error) {
        callback({ success: false, error: result.error });
        return;
      }

      const undoMsg = addChatMessage(
        "System",
        `Super-admin undid pick #${result.pick.pickNumber}: ${result.pick.userName} → ${result.pick.golferName}`,
        true
      );
      io.to("draft").emit("chat-message", undoMsg);

      if (result.autoDraftDisabledFor) {
        io.to("draft").emit("auto-draft-updated", {
          email: result.autoDraftDisabledFor,
          enabled: false,
        });
      }

      broadcastState();

      const picker = draft.getCurrentPicker();
      if (picker) {
        const turnMsg = addChatMessage(
          "System",
          `${picker.name} is back on the clock!`,
          true
        );
        io.to("draft").emit("chat-message", turnMsg);
      }

      callback({ success: true, pick: result.pick });
    } catch (err) {
      console.error("sa-undo-pick:", err.message);
      callback({ success: false, error: err.message });
    }
  });

  socket.on("disconnect", () => {
    if (currentUser) {
      draft.setUserOffline(currentUser.email);
      const state = draft.getState();

      io.to("draft").emit("user-offline", {
        email: currentUser.email,
        name: currentUser.name,
        onlineUsers: state.onlineUsers,
      });
    }
  });
});

function handleDraftComplete(state) {
  const completeMsg = addChatMessage(
    "System",
    "The draft is complete! Check out the final teams.",
    true
  );
  io.to("draft").emit("draft-complete", state);
  io.to("draft").emit("chat-message", completeMsg);
}

function emitAfterPick(state, complete) {
  if (complete) {
    handleDraftComplete(state);
  } else {
    const picker = draft.getCurrentPicker();
    if (picker) {
      const turnMsg = addChatMessage(
        "System",
        `Round ${state.currentRound} — ${picker.name} is on the clock!`,
        true
      );
      io.to("draft").emit("chat-message", turnMsg);
    }
  }
}

function emitPickMade(pick, complete, isAdminOverride = false) {
  const state = draft.getState();
  const suffix = isAdminOverride ? " (admin pick)" : "";
  const pickMsg = addChatMessage(
    "System",
    `${pick.userName} picked ${pick.golferName}${suffix}`,
    true
  );

  io.to("draft").emit("pick-made", { pick, draftState: state });
  io.to("draft").emit("chat-message", pickMsg);
  emitAfterPick(state, complete);
}

// Auto-draft callback — when draft.js auto-picks, emit via socket
draft.setOnPickCallback((pick, isAutoDraft) => {
  const state = draft.getState();
  const pickMsg = addChatMessage(
    "System",
    `${pick.userName} auto-drafted ${pick.golferName}`,
    true
  );

  io.to("draft").emit("pick-made", { pick, draftState: state });
  io.to("draft").emit("chat-message", pickMsg);
  emitAfterPick(state, state.status === "complete");
});

// Start server
async function main() {
  try {
    await db.init();
    await draft.loadCurrentDraft();
    await loadChatHistory();
    if (!SUPER_ADMIN_PIN) {
      console.warn(
        "WARNING: SUPER_ADMIN_PIN is not set — super-admin login is disabled"
      );
    }
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

main();
