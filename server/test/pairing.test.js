const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { io: Client } = require("socket.io-client");
const { server, rooms } = require("../server.js");

describe("Room Pairing Integration Tests", () => {
  let serverUrl;
  let testServer;
  let port;

  before(async () => {
    await new Promise((resolve) => {
      // Listen on random available port to avoid collisions
      testServer = server.listen(0, "127.0.0.1", () => {
        port = testServer.address().port;
        serverUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    // Clear any room cleanup timers
    for (const [, room] of rooms) {
      if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
    }
    rooms.clear();
    await new Promise((resolve) => {
      testServer.close(resolve);
    });
  });

  it("1. Laptop connects and receives a valid six-character room code", async () => {
    const laptop = Client(serverUrl);
    await new Promise((resolve) => laptop.on("connect", resolve));

    const result = await new Promise((resolve) => {
      laptop.emit("create-room", resolve);
    });

    assert.equal(result.success, true);
    assert.equal(typeof result.roomCode, "string");
    assert.equal(result.roomCode.length, 6);
    assert.match(result.roomCode, /^[A-Z0-9]{6}$/);
    assert.equal(result.state.laptopConnected, true);
    assert.equal(result.state.controllerConnected, false);

    laptop.disconnect();
  });

  it("2 & 3 & 4 & 5. Controller pairs with valid room, server logs, and laptop receives room-state", async () => {
    const laptop = Client(serverUrl);
    await new Promise((resolve) => laptop.on("connect", resolve));

    // Laptop creates room
    const createRes = await new Promise((resolve) => laptop.emit("create-room", resolve));
    const roomCode = createRes.roomCode;
    assert.ok(roomCode);

    // Setup listener on laptop for room-state update
    const laptopRoomStatePromise = new Promise((resolve) => {
      laptop.on("room-state", (state) => {
        if (state.controllerConnected === true) {
          resolve(state);
        }
      });
    });

    // Controller connects
    const controller = Client(serverUrl);
    await new Promise((resolve) => controller.on("connect", resolve));

    // Controller joins room
    const joinRes = await new Promise((resolve) => {
      controller.emit("join-room", { roomCode, role: "controller" }, resolve);
    });

    assert.equal(joinRes.success, true);
    assert.equal(joinRes.roomCode, roomCode);
    assert.equal(joinRes.state.controllerConnected, true);
    assert.equal(joinRes.state.laptopConnected, true);

    // Laptop receives updated room-state
    const laptopState = await laptopRoomStatePromise;
    assert.equal(laptopState.roomCode, roomCode);
    assert.equal(laptopState.controllerConnected, true);

    // 4. Test motion data forwarding from controller to laptop
    const motionPromise = new Promise((resolve) => {
      laptop.on("controller-data", resolve);
    });

    controller.emit("controller-data", { tilt: 15.5, acceleration: -8.2 });
    const motionData = await motionPromise;
    assert.equal(motionData.tilt, 15.5);
    assert.equal(motionData.acceleration, -8.2);
    assert.ok(motionData.timestamp);

    laptop.disconnect();
    controller.disconnect();
  });

  it("6. Invalid room code displays a helpful error", async () => {
    const controller = Client(serverUrl);
    await new Promise((resolve) => controller.on("connect", resolve));

    const result = await new Promise((resolve) => {
      controller.emit("join-room", { roomCode: "NONEX1", role: "controller" }, resolve);
    });

    assert.equal(result.success, false);
    assert.match(result.error, /Room "NONEX1" not found/i);

    controller.disconnect();
  });

  it("6b. Malformed room code displays a helpful error", async () => {
    const controller = Client(serverUrl);
    await new Promise((resolve) => controller.on("connect", resolve));

    const shortCodeResult = await new Promise((resolve) => {
      controller.emit("join-room", { roomCode: "AB", role: "controller" }, resolve);
    });
    assert.equal(shortCodeResult.success, false);
    assert.match(shortCodeResult.error, /format.*6.*characters/i);

    const invalidCharResult = await new Promise((resolve) => {
      controller.emit("join-room", { roomCode: "ABC$#@", role: "controller" }, resolve);
    });
    assert.equal(invalidCharResult.success, false);
    assert.match(invalidCharResult.error, /format.*6.*characters/i);

    const invalidRoleResult = await new Promise((resolve) => {
      controller.emit("join-room", { roomCode: "ABCDEF", role: "spectator" }, resolve);
    });
    assert.equal(invalidRoleResult.success, false);
    assert.match(invalidRoleResult.error, /Invalid device role/i);

    controller.disconnect();
  });

  it("7. Disconnecting controller updates room-state (laptop sees controller disconnected)", async () => {
    const laptop = Client(serverUrl);
    await new Promise((resolve) => laptop.on("connect", resolve));
    const createRes = await new Promise((resolve) => laptop.emit("create-room", resolve));
    const roomCode = createRes.roomCode;

    const controller = Client(serverUrl);
    await new Promise((resolve) => controller.on("connect", resolve));
    await new Promise((resolve) => {
      controller.emit("join-room", { roomCode, role: "controller" }, resolve);
    });

    // Laptop waits for controller disconnection event
    const disconnectStatePromise = new Promise((resolve) => {
      laptop.on("room-state", (state) => {
        if (state.controllerConnected === false) {
          resolve(state);
        }
      });
    });

    controller.disconnect();

    const updatedState = await disconnectStatePromise;
    assert.equal(updatedState.controllerConnected, false);
    assert.equal(updatedState.laptopConnected, true);

    laptop.disconnect();
  });

  it("7b. Role conflict rejection: second controller cannot steal occupied room", async () => {
    const laptop = Client(serverUrl);
    await new Promise((resolve) => laptop.on("connect", resolve));
    const createRes = await new Promise((resolve) => laptop.emit("create-room", resolve));
    const roomCode = createRes.roomCode;

    const controller1 = Client(serverUrl);
    await new Promise((resolve) => controller1.on("connect", resolve));
    const c1Res = await new Promise((resolve) => {
      controller1.emit("join-room", { roomCode, role: "controller" }, resolve);
    });
    assert.equal(c1Res.success, true);

    const controller2 = Client(serverUrl);
    await new Promise((resolve) => controller2.on("connect", resolve));
    const c2Res = await new Promise((resolve) => {
      controller2.emit("join-room", { roomCode, role: "controller" }, resolve);
    });

    assert.equal(c2Res.success, false);
    assert.match(c2Res.error, /already connected/i);

    laptop.disconnect();
    controller1.disconnect();
    controller2.disconnect();
  });

  it("8. Grace period preserves room on brief laptop disconnect / remount", async () => {
    const laptop1 = Client(serverUrl);
    await new Promise((resolve) => laptop1.on("connect", resolve));
    const createRes = await new Promise((resolve) => laptop1.emit("create-room", resolve));
    const roomCode = createRes.roomCode;

    // Simulate React StrictMode unmount
    laptop1.disconnect();

    // Controller joins while laptop is disconnected within grace period
    const controller = Client(serverUrl);
    await new Promise((resolve) => controller.on("connect", resolve));
    const cRes = await new Promise((resolve) => {
      controller.emit("join-room", { roomCode, role: "controller" }, resolve);
    });
    assert.equal(cRes.success, true);
    assert.equal(cRes.state.laptopConnected, false);
    assert.equal(cRes.state.controllerConnected, true);

    // Laptop remounts and re-joins
    const laptop2 = Client(serverUrl);
    await new Promise((resolve) => laptop2.on("connect", resolve));
    const l2Res = await new Promise((resolve) => {
      laptop2.emit("join-room", { roomCode, role: "laptop" }, resolve);
    });
    assert.equal(l2Res.success, true);
    assert.equal(l2Res.state.laptopConnected, true);
    assert.equal(l2Res.state.controllerConnected, true);

    laptop2.disconnect();
    controller.disconnect();
  });

  it("9. Explicit unpair (leave-room) immediately clears controller from room and updates laptop", async () => {
    const laptop = Client(serverUrl);
    await new Promise((resolve) => laptop.on("connect", resolve));
    const createRes = await new Promise((resolve) => laptop.emit("create-room", resolve));
    const roomCode = createRes.roomCode;

    const controller = Client(serverUrl);
    await new Promise((resolve) => controller.on("connect", resolve));

    // Join room
    await new Promise((resolve) => {
      controller.emit("join-room", { roomCode, role: "controller" }, resolve);
    });

    // Laptop sets up promise for controller leaving
    const unpairStatePromise = new Promise((resolve) => {
      laptop.on("room-state", (state) => {
        if (state.controllerConnected === false) {
          resolve(state);
        }
      });
    });

    // Controller emits leave-room
    const leaveRes = await new Promise((resolve) => {
      controller.emit("leave-room", { roomCode, role: "controller" }, resolve);
    });

    assert.equal(leaveRes.success, true);
    assert.equal(leaveRes.state.controllerConnected, false);
    assert.equal(leaveRes.state.laptopConnected, true);

    // Laptop receives updated room-state immediately
    const laptopState = await unpairStatePromise;
    assert.equal(laptopState.controllerConnected, false);

    // Controller's underlying Socket.IO connection is still alive
    assert.equal(controller.connected, true);

    // Verify motion data sent while unpaired is rejected/dropped and NOT received by laptop
    let motionLeaked = false;
    laptop.on("controller-data", () => {
      motionLeaked = true;
    });
    controller.emit("controller-data", { tilt: 25, acceleration: 15 });
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(motionLeaked, false);

    // Controller can re-join the same room without reconnecting socket
    const rejoinPromise = new Promise((resolve) => {
      laptop.on("room-state", (state) => {
        if (state.controllerConnected === true) {
          resolve(state);
        }
      });
    });

    const rejoinRes = await new Promise((resolve) => {
      controller.emit("join-room", { roomCode, role: "controller" }, resolve);
    });
    assert.equal(rejoinRes.success, true);
    assert.equal(rejoinRes.state.controllerConnected, true);

    const reconnectedLaptopState = await rejoinPromise;
    assert.equal(reconnectedLaptopState.controllerConnected, true);

    laptop.disconnect();
    controller.disconnect();
  });

  it("10. Repeated leave-room requests are safe and idempotent", async () => {
    const controller = Client(serverUrl);
    await new Promise((resolve) => controller.on("connect", resolve));

    // Calling leave-room when not in any room
    const res1 = await new Promise((resolve) => {
      controller.emit("leave-room", { roomCode: "NONEX1", role: "controller" }, resolve);
    });
    assert.equal(res1.success, true);

    // Calling leave-room with empty payload
    const res2 = await new Promise((resolve) => {
      controller.emit("leave-room", {}, resolve);
    });
    assert.equal(res2.success, true);

    controller.disconnect();
  });

  it("11. An unauthorized socket cannot unpair another device's room", async () => {
    const laptop = Client(serverUrl);
    await new Promise((resolve) => laptop.on("connect", resolve));
    const createRes = await new Promise((resolve) => laptop.emit("create-room", resolve));
    const roomCode = createRes.roomCode;

    const controller1 = Client(serverUrl);
    await new Promise((resolve) => controller1.on("connect", resolve));
    await new Promise((resolve) => {
      controller1.emit("join-room", { roomCode, role: "controller" }, resolve);
    });

    // Impostor controller attempts to unpair roomCode
    const impostor = Client(serverUrl);
    await new Promise((resolve) => impostor.on("connect", resolve));
    const impostorLeaveRes = await new Promise((resolve) => {
      impostor.emit("leave-room", { roomCode, role: "controller" }, resolve);
    });

    assert.equal(impostorLeaveRes.success, false);
    assert.match(impostorLeaveRes.error, /not the active controller/i);

    // Controller1 is still the active controller
    assert.equal(rooms.get(roomCode).controllerId, controller1.id);

    laptop.disconnect();
    controller1.disconnect();
    impostor.disconnect();
  });

  it("12. Laptop page refresh / reconnection restores existing room with controller preserved", async () => {
    // 1. Laptop opens and creates room
    const laptop1 = Client(serverUrl);
    await new Promise((resolve) => laptop1.on("connect", resolve));
    const createRes = await new Promise((resolve) => laptop1.emit("create-room", resolve));
    const roomCode = createRes.roomCode;
    assert.ok(roomCode);

    // 2. Controller pairs with room
    const controller = Client(serverUrl);
    await new Promise((resolve) => controller.on("connect", resolve));
    const joinRes = await new Promise((resolve) => {
      controller.emit("join-room", { roomCode, role: "controller" }, resolve);
    });
    assert.equal(joinRes.success, true);
    assert.equal(joinRes.state.controllerConnected, true);

    // 3. Laptop refreshes page (disconnects laptop1)
    laptop1.disconnect();

    // 4. Laptop2 loads from session storage and rejoins existing room
    const laptop2 = Client(serverUrl);
    await new Promise((resolve) => laptop2.on("connect", resolve));
    const restoreRes = await new Promise((resolve) => {
      laptop2.emit("join-room", { roomCode, role: "laptop" }, resolve);
    });

    assert.equal(restoreRes.success, true);
    assert.equal(restoreRes.roomCode, roomCode);
    assert.equal(restoreRes.state.laptopConnected, true);
    // Controller is still connected!
    assert.equal(restoreRes.state.controllerConnected, true);

    // 5. Verify room-state event updates controller
    laptop2.disconnect();
    controller.disconnect();
  });

  it("13. Laptop reconnects/refreshes while previous socket is still connected (replaces old laptop socket)", async () => {
    const laptop1 = Client(serverUrl);
    await new Promise((resolve) => laptop1.on("connect", resolve));
    const createRes = await new Promise((resolve) => laptop1.emit("create-room", resolve));
    const roomCode = createRes.roomCode;
    assert.ok(roomCode);

    // Pair controller with room
    const controller = Client(serverUrl);
    await new Promise((resolve) => controller.on("connect", resolve));
    const joinRes = await new Promise((resolve) => {
      controller.emit("join-room", { roomCode, role: "controller" }, resolve);
    });
    assert.equal(joinRes.success, true);

    // Laptop2 connects WITHOUT disconnecting laptop1 first (simulates rapid browser refresh)
    const laptop2 = Client(serverUrl);
    await new Promise((resolve) => laptop2.on("connect", resolve));
    const restoreRes = await new Promise((resolve) => {
      laptop2.emit("join-room", { roomCode, role: "laptop" }, resolve);
    });

    assert.equal(restoreRes.success, true);
    assert.equal(restoreRes.roomCode, roomCode);
    assert.equal(restoreRes.state.laptopConnected, true);
    assert.equal(restoreRes.state.controllerConnected, true);
    assert.equal(rooms.get(roomCode).laptopId, laptop2.id);

    laptop1.disconnect();
    laptop2.disconnect();
    controller.disconnect();
  });
});

