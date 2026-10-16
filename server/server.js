const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT) || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN;

function isOriginAllowed(origin, callback) {
  // Allow requests without Origin (e.g. server-to-server, curl, tests)
  if (!origin) return callback(null, true);

  if (CLIENT_ORIGIN) {
    if (CLIENT_ORIGIN === "*") return callback(null, true);
    const allowed = CLIENT_ORIGIN.split(",").map((o) =>
      o.trim().replace(/\/+$/, "")
    );
    const normalizedOrigin = String(origin).trim().replace(/\/+$/, "");
    if (allowed.includes(normalizedOrigin)) return callback(null, true);
  }

  // Allow localhost, 127.0.0.1, IPv6 loopback, and local network IPs (e.g. phone connecting over LAN)
  try {
    const { hostname } = new URL(origin);
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return callback(null, true);
    }
  } catch {
    // If origin is not a valid URL, reject
  }

  return callback(new Error(`CORS origin not allowed: ${origin}`));
}

app.use(
  cors({
    origin: isOriginAllowed,
    credentials: true,
  })
);
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: isOriginAllowed,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const rooms = new Map();

function isValidRoomCode(code) {
  return typeof code === "string" && /^[A-Z0-9]{6}$/.test(code);
}

function generateRoomCode() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;

  do {
    code = Array.from(
      { length: 6 },
      () => characters[crypto.randomInt(characters.length)]
    ).join("");
  } while (rooms.has(code));

  return code;
}

function getPublicRoomState(roomCode) {
  const room = rooms.get(roomCode);

  if (!room) return null;

  return {
    roomCode,
    laptopConnected: Boolean(room.laptopId),
    controllerConnected: Boolean(room.controllerId),
  };
}

function broadcastRoomState(roomCode) {
  const state = getPublicRoomState(roomCode);

  if (state) {
    io.to(roomCode).emit("room-state", state);
  }
}

function leaveCurrentRoom(socket) {
  const previousRoomCode = socket.data?.roomCode;
  const previousRole = socket.data?.role;
  if (!previousRoomCode) return;

  const room = rooms.get(previousRoomCode);
  socket.leave(previousRoomCode);
  socket.data.roomCode = null;
  socket.data.role = null;

  if (!room) return;

  if (previousRole === "laptop" && room.laptopId === socket.id) {
    room.laptopId = null;
  }
  if (previousRole === "controller" && room.controllerId === socket.id) {
    room.controllerId = null;
  }

  broadcastRoomState(previousRoomCode);
  checkRoomExpiry(previousRoomCode);
}

function checkRoomExpiry(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  if (!room.laptopId && !room.controllerId) {
    if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
    // Grace period (30s) before deleting empty rooms so reconnects & StrictMode don't kill active pairing
    room.cleanupTimer = setTimeout(() => {
      const currentRoom = rooms.get(roomCode);
      if (currentRoom && !currentRoom.laptopId && !currentRoom.controllerId) {
        rooms.delete(roomCode);
        console.log(`[ROOM REMOVED] Room ${roomCode} removed (inactivity timeout)`);
      }
    }, 30000);
    console.log(`[ROOM STATE] Room ${roomCode} empty; will expire in 30s if no client reconnects`);
  } else {
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }
  }
}

app.get("/", (req, res) => {
  res.json({
    name: "Anything but a Game Controller",
    status: "running",
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    activeRooms: rooms.size,
    timestamp: Date.now(),
  });
});

io.on("connection", (socket) => {
  const clientIp = socket.handshake.address;
  console.log(`[CONNECT] Socket ${socket.id} connected from ${clientIp}`);

  socket.on("create-room", (callback) => {
    if (typeof callback !== "function") return;

    leaveCurrentRoom(socket);

    const roomCode = generateRoomCode();

    rooms.set(roomCode, {
      laptopId: socket.id,
      controllerId: null,
      createdAt: Date.now(),
      cleanupTimer: null,
    });

    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.role = "laptop";

    const state = getPublicRoomState(roomCode);

    callback({
      success: true,
      roomCode,
      state,
    });

    broadcastRoomState(roomCode);
    console.log(`[ROOM CREATE] Socket ${socket.id} created room ${roomCode}`);
  });

  socket.on("join-room", (payload, callback) => {
    if (typeof callback !== "function") return;

    const rawCode = payload?.roomCode;
    const roomCode = String(rawCode || "")
      .trim()
      .toUpperCase();

    const role = payload?.role;

    console.log(
      `[JOIN ATTEMPT] Socket ${socket.id} attempting to join room "${roomCode || rawCode}" as role "${role}"`
    );

    if (!["laptop", "controller"].includes(role)) {
      const reason = `Invalid device role: "${role}". Must be "laptop" or "controller".`;
      console.log(`[JOIN REJECTED] Socket ${socket.id} - Reason: ${reason}`);
      callback({ success: false, error: reason });
      return;
    }

    if (!isValidRoomCode(roomCode)) {
      const reason = "Invalid room code format. Must be exactly 6 alphanumeric characters.";
      console.log(`[JOIN REJECTED] Socket ${socket.id} - Reason: ${reason}`);
      callback({ success: false, error: reason });
      return;
    }

    const room = rooms.get(roomCode);

    if (!room) {
      const reason = `Room "${roomCode}" not found.`;
      console.log(`[JOIN REJECTED] Socket ${socket.id} - Reason: ${reason}`);
      callback({ success: false, error: reason });
      return;
    }

    if (role === "laptop" && room.laptopId && room.laptopId !== socket.id) {
      const existingSocket = io.sockets.sockets.get(room.laptopId);
      if (existingSocket && existingSocket.connected) {
        const reason = `A laptop is already connected to room "${roomCode}".`;
        console.log(`[JOIN REJECTED] Socket ${socket.id} - Reason: ${reason}`);
        callback({ success: false, error: reason });
        return;
      }
      console.log(`[JOIN RECOVERY] Stale laptop socket ${room.laptopId} replaced by ${socket.id}`);
      room.laptopId = null;
    }

    if (
      role === "controller" &&
      room.controllerId &&
      room.controllerId !== socket.id
    ) {
      const existingSocket = io.sockets.sockets.get(room.controllerId);
      if (existingSocket && existingSocket.connected) {
        const reason = `A controller is already connected to room "${roomCode}".`;
        console.log(`[JOIN REJECTED] Socket ${socket.id} - Reason: ${reason}`);
        callback({ success: false, error: reason });
        return;
      }
      console.log(`[JOIN RECOVERY] Stale controller socket ${room.controllerId} replaced by ${socket.id}`);
      room.controllerId = null;
    }

    if (socket.data.roomCode && socket.data.roomCode !== roomCode) {
      leaveCurrentRoom(socket);
    }

    // Cancel pending cleanup timer since a device is active in the room
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }

    if (role === "laptop") {
      room.laptopId = socket.id;
    } else {
      room.controllerId = socket.id;
    }

    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.role = role;

    const state = getPublicRoomState(roomCode);

    callback({
      success: true,
      roomCode,
      state,
    });

    broadcastRoomState(roomCode);
    console.log(
      `[JOIN SUCCESS] Socket ${socket.id} joined room ${roomCode} as ${role} (laptop: ${Boolean(
        room.laptopId
      )}, controller: ${Boolean(room.controllerId)})`
    );
  });

  socket.on("leave-room", (payload, callback) => {
    const cb = typeof callback === "function" ? callback : () => {};

    const rawCode = payload?.roomCode || socket.data?.roomCode;
    const roomCode = String(rawCode || "")
      .trim()
      .toUpperCase();

    const role = payload?.role || socket.data?.role || "controller";

    console.log(
      `[LEAVE ATTEMPT] Socket ${socket.id} attempting to leave room "${roomCode || rawCode}" as role "${role}"`
    );

    if (!roomCode) {
      socket.data.roomCode = null;
      socket.data.role = null;
      cb({ success: true, message: "No active room." });
      return;
    }

    const room = rooms.get(roomCode);

    if (!room) {
      socket.leave(roomCode);
      socket.data.roomCode = null;
      socket.data.role = null;
      console.log(`[LEAVE NOTICE] Socket ${socket.id} left non-existent room ${roomCode}`);
      cb({ success: true, message: "Room not found or already closed." });
      return;
    }

    // Role-specific verification: ensure socket is actually the assigned device
    if (role === "controller") {
      if (room.controllerId && room.controllerId !== socket.id) {
        const reason = `Socket ${socket.id} is not the active controller for room "${roomCode}".`;
        console.log(`[LEAVE REJECTED] ${reason}`);
        socket.leave(roomCode);
        if (socket.data?.roomCode === roomCode) {
          socket.data.roomCode = null;
          socket.data.role = null;
        }
        cb({ success: false, error: reason });
        return;
      }

      if (room.controllerId === socket.id) {
        room.controllerId = null;
      }
    } else if (role === "laptop") {
      if (room.laptopId && room.laptopId !== socket.id) {
        const reason = `Socket ${socket.id} is not the active laptop for room "${roomCode}".`;
        console.log(`[LEAVE REJECTED] ${reason}`);
        socket.leave(roomCode);
        if (socket.data?.roomCode === roomCode) {
          socket.data.roomCode = null;
          socket.data.role = null;
        }
        cb({ success: false, error: reason });
        return;
      }

      if (room.laptopId === socket.id) {
        room.laptopId = null;
      }
    }

    socket.leave(roomCode);
    if (socket.data?.roomCode === roomCode) {
      socket.data.roomCode = null;
      socket.data.role = null;
    }

    const state = getPublicRoomState(roomCode);

    cb({
      success: true,
      roomCode,
      state,
    });

    broadcastRoomState(roomCode);
    console.log(
      `[LEAVE SUCCESS] Socket ${socket.id} left room ${roomCode} as ${role} (laptop: ${Boolean(
        room.laptopId
      )}, controller: ${Boolean(room.controllerId)})`
    );
    console.log(
      `[ROOM STATE] Room ${roomCode}: laptop=${Boolean(room.laptopId)}, controller=${Boolean(
        room.controllerId
      )}`
    );
    checkRoomExpiry(roomCode);
  });

  socket.on("controller-data", (payload) => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);

    if (
      !room ||
      socket.data.role !== "controller" ||
      room.controllerId !== socket.id
    ) {
      return;
    }

    const tilt = Number(payload?.tilt);
    const acceleration = Number(payload?.acceleration);

    if (
      !Number.isFinite(tilt) ||
      !Number.isFinite(acceleration) ||
      Math.abs(tilt) > 90 ||
      Math.abs(acceleration) > 100
    ) {
      return;
    }

    // Only send motion data to the laptop, not back to the controller.
    if (room.laptopId) {
      io.to(room.laptopId).emit("controller-data", {
        tilt,
        acceleration,
        timestamp: Date.now(),
      });
    }
  });

  socket.on("ping-latency", (callback) => {
    if (typeof callback === "function") {
      callback(Date.now());
    }
  });

  socket.on("disconnect", (reason) => {
    const roomCode = socket.data.roomCode;
    const role = socket.data.role;

    console.log(
      `[DISCONNECT] Socket ${socket.id} disconnected (${reason}) (role: ${role || "none"}, room: ${roomCode || "none"})`
    );

    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    if (role === "laptop" && room.laptopId === socket.id) {
      room.laptopId = null;
    }

    if (role === "controller" && room.controllerId === socket.id) {
      room.controllerId = null;
    }

    broadcastRoomState(roomCode);
    console.log(
      `[ROOM STATE] Room ${roomCode}: laptop=${Boolean(room.laptopId)}, controller=${Boolean(
        room.controllerId
      )}`
    );
    checkRoomExpiry(roomCode);
  });
});

if (require.main === module) {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Maze controller server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });
}

module.exports = { app, server, io, rooms, generateRoomCode, isValidRoomCode };
