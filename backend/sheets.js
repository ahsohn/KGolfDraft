const { google } = require("googleapis");
const path = require("path");

let sheetsClient = null;
let sheetId = null;

async function init() {
  const keyPath = path.resolve(
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || "./service-account-key.json"
  );
  sheetId = process.env.GOOGLE_SHEET_ID;

  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  sheetsClient = google.sheets({ version: "v4", auth });
  console.log("Google Sheets API initialized");
}

async function getPlayers() {
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "Players!A2:B",
  });
  const rows = res.data.values || [];
  return rows.map((row) => ({
    name: row[0] || "",
    rank: parseInt(row[1], 10) || 999,
  }));
}

async function getUsers() {
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "Users!A2:D",
  });
  const rows = res.data.values || [];
  return rows.map((row) => ({
    email: (row[0] || "").toLowerCase().trim(),
    name: row[1] || "",
    draftOrder: parseInt(row[2], 10) || 0,
    isAdmin: (row[3] || "").toUpperCase() === "TRUE",
  }));
}

async function getExistingPicks() {
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "Picks!A2:E",
  });
  const rows = res.data.values || [];
  return rows.map((row) => ({
    round: parseInt(row[0], 10),
    pickNumber: parseInt(row[1], 10),
    userEmail: row[2] || "",
    userName: row[3] || "",
    golferName: row[4] || "",
  }));
}

async function writePick(pick) {
  await sheetsClient.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: "Picks!A:E",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          pick.round,
          pick.pickNumber,
          pick.userEmail,
          pick.userName,
          pick.golferName,
        ],
      ],
    },
  });
}

async function clearPicks() {
  try {
    await sheetsClient.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: "Picks!A2:E",
    });
  } catch (err) {
    console.error("Error clearing picks:", err.message);
  }
}

async function writeChatLog(messages) {
  const sheetName = "Chat Log";

  // Ensure the "Chat Log" tab exists
  try {
    const spreadsheet = await sheetsClient.spreadsheets.get({
      spreadsheetId: sheetId,
    });
    const exists = spreadsheet.data.sheets.some(
      (s) => s.properties.title === sheetName
    );

    if (exists) {
      // Clear existing content
      await sheetsClient.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: `${sheetName}!A:D`,
      });
    } else {
      // Create the tab
      await sheetsClient.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [
            { addSheet: { properties: { title: sheetName } } },
          ],
        },
      });
    }
  } catch (err) {
    console.error("Error preparing Chat Log sheet:", err.message);
    return;
  }

  // Build rows: header + messages
  const header = ["Timestamp", "Sender", "Message", "Type"];
  const rows = messages.map((msg) => [
    new Date(msg.timestamp).toLocaleString(),
    msg.sender,
    msg.text,
    msg.isSystem ? "system" : "user",
  ]);

  await sheetsClient.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${sheetName}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [header, ...rows],
    },
  });

  console.log(`Chat log saved: ${messages.length} messages`);
}

async function writeDraftBoard(users, picks, totalRounds) {
  const sheetName = "Draft Board";

  // Ensure the tab exists
  try {
    const spreadsheet = await sheetsClient.spreadsheets.get({
      spreadsheetId: sheetId,
    });
    const exists = spreadsheet.data.sheets.some(
      (s) => s.properties.title === sheetName
    );

    if (exists) {
      await sheetsClient.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: `${sheetName}!A:Z`,
      });
    } else {
      await sheetsClient.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [
            { addSheet: { properties: { title: sheetName } } },
          ],
        },
      });
    }
  } catch (err) {
    console.error("Error preparing Draft Board sheet:", err.message);
    return;
  }

  const sortedUsers = [...users].sort((a, b) => a.draftOrder - b.draftOrder);

  // Header row: "Round", then each user's name
  const header = ["Round", ...sortedUsers.map((u) => u.name)];
  const rows = [header];

  for (let round = 1; round <= totalRounds; round++) {
    const row = [round];
    for (const user of sortedUsers) {
      const pick = picks.find(
        (p) => p.round === round && p.userEmail === user.email
      );
      row.push(pick ? pick.golferName : "");
    }
    rows.push(row);
  }

  await sheetsClient.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${sheetName}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: rows },
  });

  console.log(`Draft Board saved: ${totalRounds} rounds x ${sortedUsers.length} users`);
}

module.exports = { init, getPlayers, getUsers, getExistingPicks, writePick, clearPicks, writeChatLog, writeDraftBoard };
