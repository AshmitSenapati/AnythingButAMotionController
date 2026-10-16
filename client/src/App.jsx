
import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { io } from "socket.io-client";

const INITIAL_MAZE = [
  "111111111111111",
  "100000100000001",
  "101110101110101",
  "100010000010001",
  "111010111010111",
  "100000100000001",
  "101110101110101",
  "100000000000001",
  "101110111011101",
  "100010000010001",
  "111010111010111",
  "100000100000001",
  "101110101110101",
  "100000000000201",
  "111111111111111",
];

const CELL = 32;
const BALL_RADIUS = 10;
const START = { x: 1.5 * CELL, y: 1.5 * CELL };

function createMaze() {
  return INITIAL_MAZE.map((row) => row.split("").map(Number));
}

const ROOM_STORAGE_KEY = "abgc_laptop_room_code";

function getPersistedRoomCode() {
  try {
    const saved = sessionStorage.getItem(ROOM_STORAGE_KEY);
    if (saved && /^[A-Z0-9]{6}$/.test(saved.trim().toUpperCase())) {
      return saved.trim().toUpperCase();
    }
  } catch {
    // Ignore storage availability errors
  }
  return "";
}

function setPersistedRoomCode(code) {
  try {
    if (code) {
      sessionStorage.setItem(ROOM_STORAGE_KEY, code.trim().toUpperCase());
    } else {
      sessionStorage.removeItem(ROOM_STORAGE_KEY);
    }
  } catch {
    // Ignore storage availability errors
  }
}

function getServerUrl() {
  if (import.meta.env.VITE_SERVER_URL) {
    return import.meta.env.VITE_SERVER_URL;
  }
  if (typeof window !== "undefined" && window.location.hostname) {
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    return `${protocol}//${window.location.hostname}:3001`;
  }
  return "http://localhost:3001";
}

export default function App() {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const keysRef = useRef({});
  const ballRef = useRef({ ...START });
  const velocityRef = useRef({ x: 0, y: 0 });
  const mazeRef = useRef(createMaze());
  const previousTimeRef = useRef(0);
  const elapsedRef = useRef(0);

  const [status, setStatus] = useState("ready");
  const [elapsed, setElapsed] = useState(0);
  const [bestTime, setBestTime] = useState(null);
  const [moves, setMoves] = useState(0);

  const width = INITIAL_MAZE[0].length * CELL;
  const height = INITIAL_MAZE.length * CELL;

  const [roomCode, setRoomCode] = useState(() => getPersistedRoomCode());
  const [serverConnected, setServerConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [controllerConnected, setControllerConnected] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState("");

  const socketRef = useRef(null);
  const remoteMotionRef = useRef({ x: 0, y: 0, timestamp: 0 });
  const smoothedMotionRef = useRef({ x: 0, y: 0 });
  const roomCodeRef = useRef(getPersistedRoomCode());
  const controllerConnectedRef = useRef(false);
  const isRoomOpInFlightRef = useRef(false);

  const resetGame = useCallback(() => {
    ballRef.current = { ...START };
    velocityRef.current = { x: 0, y: 0 };
    smoothedMotionRef.current = { x: 0, y: 0 };
    previousTimeRef.current = 0;
    elapsedRef.current = 0;
    setElapsed(0);
    setMoves(0);
    setStatus("playing");
  }, []);

  const handleExplicitNewRoom = useCallback(() => {
    if (!socketRef.current || !socketRef.current.connected) return;
    isRoomOpInFlightRef.current = false;
    setRecoveryNotice("");
    socketRef.current.timeout(5000).emit("create-room", (err, result) => {
      if (result?.success) {
        setRoomCode(result.roomCode);
        roomCodeRef.current = result.roomCode;
        setPersistedRoomCode(result.roomCode);
        setControllerConnected(false);
        controllerConnectedRef.current = false;
      }
    });
  }, []);

  useEffect(() => {
    let isMounted = true;
    const serverUrl = getServerUrl();
    const socket = io(serverUrl, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    function createNewRoom(sock) {
      if (isRoomOpInFlightRef.current) return;
      isRoomOpInFlightRef.current = true;

      sock.timeout(5000).emit("create-room", (err, result) => {
        isRoomOpInFlightRef.current = false;
        if (!isMounted) return;
        if (result?.success) {
          setRoomCode(result.roomCode);
          roomCodeRef.current = result.roomCode;
          setPersistedRoomCode(result.roomCode);
          setControllerConnected(false);
          controllerConnectedRef.current = false;
        } else {
          setRecoveryNotice(
            result?.error || "Failed to create room. Please verify backend server."
          );
        }
      });
    }

    function initRoomSession(sock) {
      const activeRoom = roomCodeRef.current || getPersistedRoomCode();

      if (activeRoom) {
        // Attempt restoring room session
        sock.timeout(5000).emit(
          "join-room",
          { roomCode: activeRoom, role: "laptop" },
          (err, result) => {
            if (!isMounted) return;
            if (result?.success) {
              setRoomCode(result.roomCode);
              roomCodeRef.current = result.roomCode;
              setPersistedRoomCode(result.roomCode);
              const hasController = Boolean(result.state?.controllerConnected);
              setControllerConnected(hasController);
              controllerConnectedRef.current = hasController;
              setRecoveryNotice("");
            } else {
              // Stored room expired or not found; explain recovery failure and create fresh room
              setPersistedRoomCode("");
              roomCodeRef.current = "";
              setRoomCode("");
              setRecoveryNotice(
                `Previous room "${activeRoom}" expired or was removed. Created a new room.`
              );
              createNewRoom(sock);
            }
          }
        );
      } else {
        createNewRoom(sock);
      }
    }

    socket.on("connect", () => {
      if (!isMounted) return;
      setServerConnected(true);
      setIsReconnecting(false);
      initRoomSession(socket);
    });

    socket.on("disconnect", () => {
      if (!isMounted) return;
      setServerConnected(false);
      setIsReconnecting(true);
      setControllerConnected(false);
      controllerConnectedRef.current = false;
      remoteMotionRef.current = { x: 0, y: 0, timestamp: 0 };
      smoothedMotionRef.current = { x: 0, y: 0 };
    });

    socket.on("room-state", (state) => {
      if (!isMounted) return;
      if (state && state.roomCode === roomCodeRef.current) {
        const isConnected = Boolean(state.controllerConnected);
        setControllerConnected(isConnected);
        controllerConnectedRef.current = isConnected;

        // Reset motion data immediately if controller unpairs or disconnects
        if (!isConnected) {
          remoteMotionRef.current = { x: 0, y: 0, timestamp: 0 };
          smoothedMotionRef.current = { x: 0, y: 0 };
        }
      }
    });

    socket.on("controller-data", (data) => {
      remoteMotionRef.current = {
        x: Math.max(-1, Math.min(1, data.tilt / 25)),
        y: Math.max(-1, Math.min(1, data.acceleration / 25)),
        timestamp: data.timestamp || Date.now(),
      };
    });

    return () => {
      isMounted = false;
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      const target = event.target;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = event.key ? event.key.toLowerCase() : "";
      const code = event.code ? event.code.toLowerCase() : "";

      const isMovementKey =
        [
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
          "left",
          "right",
          "up",
          "down",
          "w",
          "a",
          "s",
          "d",
        ].includes(key) ||
        [
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
          "keyw",
          "keya",
          "keys",
          "keyd",
        ].includes(code);

      // Prevent arrow-key page scrolling only while the game is capturing those keys
      if (status === "playing" && (isMovementKey || key === " ")) {
        event.preventDefault();
      } else if (status !== "playing" && (key === " " || isMovementKey)) {
        event.preventDefault();
      }

      keysRef.current[key] = true;
      if (code) {
        keysRef.current[code] = true;
      }

      // If user presses movement key or space while not playing, start or restart game
      if (status !== "playing" && (key === " " || isMovementKey)) {
        resetGame();
      }
    }

    function onKeyUp(event) {
      const key = event.key ? event.key.toLowerCase() : "";
      const code = event.code ? event.code.toLowerCase() : "";
      keysRef.current[key] = false;
      if (code) {
        keysRef.current[code] = false;
      }
    }

    function onBlur() {
      keysRef.current = {};
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [resetGame, status]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let running = true;

    function isWall(x, y) {
      const col = Math.floor(x / CELL);
      const row = Math.floor(y / CELL);

      if (
        row < 0 ||
        row >= mazeRef.current.length ||
        col < 0 ||
        col >= mazeRef.current[0].length
      ) {
        return true;
      }

      return mazeRef.current[row][col] === 1;
    }

    function collides(x, y) {
      if (
        x - BALL_RADIUS < 0 ||
        x + BALL_RADIUS > width ||
        y - BALL_RADIUS < 0 ||
        y + BALL_RADIUS > height
      ) {
        return true;
      }

      // Check 4 cardinal points (top, bottom, left, right)
      if (
        isWall(x, y - BALL_RADIUS) ||
        isWall(x, y + BALL_RADIUS) ||
        isWall(x - BALL_RADIUS, y) ||
        isWall(x + BALL_RADIUS, y)
      ) {
        return true;
      }

      // Check 4 diagonal points along circle perimeter (r * sqrt(2)/2)
      const diag = BALL_RADIUS * 0.7071;
      return (
        isWall(x - diag, y - diag) ||
        isWall(x + diag, y - diag) ||
        isWall(x - diag, y + diag) ||
        isWall(x + diag, y + diag)
      );
    }

    function drawMaze() {
      ctx.fillStyle = "#0a1020";
      ctx.fillRect(0, 0, width, height);

      mazeRef.current.forEach((row, rowIndex) => {
        row.forEach((cell, colIndex) => {
          const x = colIndex * CELL;
          const y = rowIndex * CELL;

          if (cell === 1) {
            ctx.fillStyle = "#273958";
            ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
          } else if (cell === 2) {
            ctx.fillStyle = "#123c32";
            ctx.fillRect(x, y, CELL, CELL);
            ctx.beginPath();
            ctx.arc(x + CELL / 2, y + CELL / 2, 9, 0, Math.PI * 2);
            ctx.fillStyle = "#34f5a1";
            ctx.shadowColor = "#34f5a1";
            ctx.shadowBlur = 14;
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        });
      });
    }

    function frame(time) {
      if (!running) return;

      const dt = previousTimeRef.current
        ? Math.min((time - previousTimeRef.current) / 1000, 0.04)
        : 0;

      previousTimeRef.current = time;

      const keys = keysRef.current;
      const ball = ballRef.current;
      const velocity = velocityRef.current;

      if (status === "playing") {
        let ax;
        let ay;

        // Remote controller motion processing
        let hasActiveControllerInput = false;
        if (controllerConnectedRef.current) {
          const smoothingSpeed = 15;
          const blend = Math.min(1, smoothingSpeed * dt);
          smoothedMotionRef.current.x +=
            (remoteMotionRef.current.x - smoothedMotionRef.current.x) * blend;
          smoothedMotionRef.current.y +=
            (remoteMotionRef.current.y - smoothedMotionRef.current.y) * blend;

          const controllerMag = Math.hypot(
            smoothedMotionRef.current.x,
            smoothedMotionRef.current.y
          );
          const isFresh =
            Date.now() - (remoteMotionRef.current.timestamp || 0) < 1500;
          if (isFresh && controllerMag > 0.05) {
            hasActiveControllerInput = true;
          }
        } else {
          smoothedMotionRef.current = { x: 0, y: 0 };
        }

        // Keyboard input processing (Arrow keys + WASD)
        let kx = 0;
        let ky = 0;
        if (keys.arrowleft || keys.left || keys.a || keys.keya) kx -= 1;
        if (keys.arrowright || keys.right || keys.d || keys.keyd) kx += 1;
        if (keys.arrowup || keys.up || keys.w || keys.keyw) ky -= 1;
        if (keys.arrowdown || keys.down || keys.s || keys.keys) ky += 1;

        const hasKeyboardInput = kx !== 0 || ky !== 0;

        // Arbitration: combine safely if both active, or use active source directly
        if (hasActiveControllerInput && hasKeyboardInput) {
          const kMag = Math.hypot(kx, ky) || 1;
          ax = smoothedMotionRef.current.x + kx / kMag;
          ay = smoothedMotionRef.current.y + ky / kMag;
          const totalMag = Math.hypot(ax, ay);
          if (totalMag > 1) {
            ax /= totalMag;
            ay /= totalMag;
          }
        } else if (hasKeyboardInput) {
          const kMag = Math.hypot(kx, ky) || 1;
          ax = kx / kMag;
          ay = ky / kMag;
        } else if (hasActiveControllerInput) {
          ax = smoothedMotionRef.current.x;
          ay = smoothedMotionRef.current.y;
        } else {
          ax = 0;
          ay = 0;
        }

        const acceleration = 900;
        const friction = Math.exp(-5 * dt);
        const maxSpeed = 230;

        velocity.x = (velocity.x + ax * acceleration * dt) * friction;
        velocity.y = (velocity.y + ay * acceleration * dt) * friction;

        const speed = Math.hypot(velocity.x, velocity.y);

        if (speed > maxSpeed) {
          velocity.x = (velocity.x / speed) * maxSpeed;
          velocity.y = (velocity.y / speed) * maxSpeed;
        }

        const nextX = Math.max(
          BALL_RADIUS,
          Math.min(width - BALL_RADIUS, ball.x + velocity.x * dt)
        );
        const nextY = Math.max(
          BALL_RADIUS,
          Math.min(height - BALL_RADIUS, ball.y + velocity.y * dt)
        );

        if (!collides(nextX, ball.y)) {
          ball.x = nextX;
        } else {
          velocity.x = 0;
        }

        if (!collides(ball.x, nextY)) {
          ball.y = nextY;
        } else {
          velocity.y = 0;
        }

        const goal = mazeRef.current
          .flatMap((row, rowIndex) =>
            row.map((cell, colIndex) =>
              cell === 2
                ? {
                    x: (colIndex + 0.5) * CELL,
                    y: (rowIndex + 0.5) * CELL,
                  }
                : null
            )
          )
          .find(Boolean);

        if (
          goal &&
          Math.hypot(ball.x - goal.x, ball.y - goal.y) < CELL * 0.3
        ) {
          setStatus("won");
          setBestTime((previous) =>
            previous === null
              ? elapsedRef.current
              : Math.min(previous, elapsedRef.current)
          );
        }
      }

      drawMaze();

      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "#70a5ff";
      ctx.shadowColor = "#4e83ff";
      ctx.shadowBlur = 18;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.arc(ball.x - 3, ball.y - 3, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      animationRef.current = requestAnimationFrame(frame);
    }

    animationRef.current = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(animationRef.current);
    };
  }, [status, width, height]);

  useEffect(() => {
    if (status !== "playing") return;

    const timer = setInterval(() => {
      setElapsed((time) => {
        const next = time + 1;
        elapsedRef.current = next;
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [status]);

  const handleKeyHelp = () => {
    setMoves((count) => count + 1);
  };

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">M</div>
          <div>
            <p className="eyebrow">ANYTHING BUT A</p>
            <h1>Game Controller</h1>
          </div>
        </div>
        <div className="live-badge">
          <span />
          MAZE MODE
        </div>
      </header>

      <section className="hero">
        <p className="eyebrow">MOTION ARCADE / 001</p>
        <h2>Find your <span>way out.</span></h2>
        <p className="subtitle">
          Navigate the maze. Reach the green exit. Don't hit the walls.
        </p>
      </section>

      <section className="game-layout">
        <div className="game-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">CURRENT CHALLENGE</p>
              <h3>The Neon Labyrinth</h3>
            </div>
            <span className="level-tag">LEVEL 01</span>
          </div>

          <div
            className="canvas-wrap"
            tabIndex={0}
            onClick={() => canvasRef.current?.focus()}
            style={{ outline: "none" }}
          >
            <canvas
              ref={canvasRef}
              tabIndex={0}
              width={width}
              height={height}
              aria-label="Maze game. Use arrow keys or WASD to move the blue ball to the green exit."
              style={{ outline: "none" }}
            />
            {status !== "playing" && (
              <div className="game-overlay">
                <div className="overlay-card">
                  <div className="overlay-symbol">
                    {status === "won" ? "✓" : "↗"}
                  </div>
                  <h3>
                    {status === "won"
                      ? "Maze conquered!"
                      : "Ready to roll?"}
                  </h3>
                  <p>
                    {status === "won"
                      ? `You escaped in ${elapsed} seconds.`
                      : "Reach the green exit using your keyboard."}
                  </p>
                  <button className="primary-button" onClick={resetGame}>
                    {status === "won" ? "Play again" : "Start game"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="game-footer">
            <span><i className="blue-dot" /> YOU</span>
            <span><i className="green-dot" /> EXIT</span>
            <span>WALLS = OBSTACLES</span>
          </div>
        </div>

        <aside className="sidebar">
          <div className="stat-card">
            <p className="eyebrow">TIME ELAPSED</p>
            <div className="stat-value">{String(elapsed).padStart(2, "0")}<span>s</span></div>
            <p className="stat-caption">Beat your personal best.</p>
          </div>

          <div className="stat-card">
            <p className="eyebrow">PERSONAL BEST</p>
            <div className="stat-value">
              {bestTime === null ? "--" : bestTime}<span>{bestTime === null ? "" : "s"}</span>
            </div>
            <p className="stat-caption">Fastest escape this session.</p>
          </div>

          <div className="control-card">
            <p className="eyebrow">HOW TO PLAY</p>
            <div className="key-row">
              <div className="key">↑</div>
              <div className="key">←</div>
              <div className="key">↓</div>
              <div className="key">→</div>
            </div>
            <p>Arrow keys or <b>W A S D</b> to move.</p>
            <p className="muted">Mobile tilt controls are coming next.</p>
            <button
              className="secondary-button"
              onClick={handleKeyHelp}
              title="Demo interaction counter"
            >
              Controls checked · {moves}
            </button>
          </div>

          <div className="control-card">
            <p className="eyebrow">PHONE PAIRING</p>

            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "9px",
                  fontFamily: '"DM Mono", monospace',
                  padding: "3px 6px",
                  borderRadius: "4px",
                  background: serverConnected
                    ? "#10251c"
                    : isReconnecting
                    ? "#2d2314"
                    : "#281b21",
                  color: serverConnected
                    ? "#70f4b3"
                    : isReconnecting
                    ? "#ffd166"
                    : "#ffb3b3",
                  border: `1px solid ${
                    serverConnected
                      ? "#20553d"
                      : isReconnecting
                      ? "#684f1a"
                      : "#5b2c3a"
                  }`,
                }}
              >
                ● SERVER{" "}
                {serverConnected
                  ? "ONLINE"
                  : isReconnecting
                  ? "RECONNECTING..."
                  : "OFFLINE"}
              </span>

              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "9px",
                  fontFamily: '"DM Mono", monospace',
                  padding: "3px 6px",
                  borderRadius: "4px",
                  background: controllerConnected ? "#10251c" : "#172238",
                  color: controllerConnected ? "#34f5a1" : "#8ea0bd",
                  border: `1px solid ${controllerConnected ? "#20553d" : "#2d3d57"}`,
                }}
              >
                ● {controllerConnected ? "CONTROLLER PAIRED" : "WAITING FOR CONTROLLER"}
              </span>
            </div>

            <h3>
              {controllerConnected
                ? "Controller connected"
                : roomCode
                ? "Waiting for controller"
                : isReconnecting
                ? "Reconnecting to server..."
                : "Connecting to server"}
            </h3>

            <p className="stat-caption">
              {controllerConnected
                ? "Phone controller paired & active! Tilt to move."
                : roomCode
                ? "Controller disconnected · Enter code on phone to pair."
                : isReconnecting
                ? "Reconnecting to backend..."
                : "Waiting for room code..."}
            </p>

            {recoveryNotice && (
              <div
                style={{
                  fontSize: "11px",
                  padding: "6px 8px",
                  borderRadius: "4px",
                  background: "#2a1c10",
                  color: "#ffc078",
                  border: "1px solid #6b3e14",
                  marginTop: "8px",
                  marginBottom: "8px",
                }}
              >
                {recoveryNotice}
              </div>
            )}

            <div
              style={{
                fontSize: "28px",
                letterSpacing: "5px",
                fontWeight: 700,
                color: controllerConnected ? "#34f5a1" : "#70f4b3",
                marginTop: "12px",
              }}
            >
              {roomCode || "------"}
            </div>

            <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                className="secondary-button"
                disabled={!roomCode}
                onClick={() => navigator.clipboard.writeText(roomCode)}
              >
                Copy room code
              </button>
              <button
                className="secondary-button"
                disabled={!serverConnected}
                onClick={handleExplicitNewRoom}
                title="Generate a fresh room code"
              >
                New room
              </button>
            </div>
          </div>

          <button className="reset-button" onClick={resetGame}>
            ↻ &nbsp; Restart maze
          </button>
        </aside>
      </section>

      <footer className="page-footer">
        <span>BUILT FOR PLAY. POWERED BY MOTION.</span>
        <span>ABGC © 2026</span>
      </footer>
    </main>
  );
}
