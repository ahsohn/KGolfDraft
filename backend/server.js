require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const sheets = require("./sheets");
const draft = require("./draft");

const PORT = process.env.PORT || 3001;

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

// Simple token-based session store: token -> { email, name, isAdmin }
const sessions = new Map();

// Chat history (in-memory, resets when server restarts)
const chatHistory = [];
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
  return msg;
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", draftStatus: draft.getState().status });
});

// --- Socket.IO ---

io.on("connection", (socket) => {
  let currentUser = null;

  socket.on("login", async ({ email, token }, callback) => {
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

    // Validate email against users sheet
    const state = draft.getState();
    const user = state.users.find((u) => u.email === normalizedEmail);
    if (!user) {
      callback({ success: false, error: "Email not found" });
      return;
    }

    const newToken = uuidv4();
    currentUser = {
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin,
      draftOrder: user.draftOrder,
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

  socket.on("start-draft", ({ totalRounds }, callback) => {
    if (!currentUser || !currentUser.isAdmin) {
      callback({ success: false, error: "Admin access required" });
      return;
    }

    const result = draft.startDraft(totalRounds);
    if (result.error) {
      callback({ success: false, error: result.error });
      return;
    }

    const state = draft.getState();
    const msg = addChatMessage(
      "System",
      `Draft started! ${state.totalRounds} rounds, ${state.users.length} players. Good luck!`,
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

  socket.on("disconnect", () => {
    if (currentUser) {
      draft.setUserOffline(currentUser.email);
      const state = draft.getState();

      io.to("draft").emit("user-offline", {
        email: currentUser.email,
        name: currentUser.name,
        onlineUsers: state.onlineUsers,
      });

      const msg = addChatMessage(
        "System",
        `${currentUser.name} disconnected`,
        true
      );
      io.to("draft").emit("chat-message", msg);
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

  // Save chat log to Google Sheet
  sheets.writeChatLog(chatHistory).catch((err) => {
    console.error("Error saving chat log:", err.message);
  });
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
    `${pick.userName} picked ${pick.golferName} (Round ${pick.round}, Pick #${pick.pickNumber})${suffix}`,
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
    `${pick.userName} auto-drafted ${pick.golferName} (Round ${pick.round}, Pick #${pick.pickNumber})`,
    true
  );

  io.to("draft").emit("pick-made", { pick, draftState: state });
  io.to("draft").emit("chat-message", pickMsg);
  emitAfterPick(state, state.status === "complete");
});

// Start server
async function main() {
  try {
    await sheets.init();
    await draft.initialize();
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

main();
