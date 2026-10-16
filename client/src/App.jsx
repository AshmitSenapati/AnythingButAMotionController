import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { io } from "socket.io-client";
import { QRCodeSVG } from "qrcode.react";

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
    let saved = localStorage.getItem(ROOM_STORAGE_KEY);
    if (!saved) {
      saved = sessionStorage.getItem(ROOM_STORAGE_KEY);
      if (saved && /^[A-Z0-9]{6}$/.test(saved.trim().toUpperCase())) {
        localStorage.setItem(ROOM_STORAGE_KEY, saved.trim().toUpperCase());
      }
    }
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
      const clean = code.trim().toUpperCase();
      localStorage.setItem(ROOM_STORAGE_KEY, clean);
      sessionStorage.setItem(ROOM_STORAGE_KEY, clean);
    } else {
      localStorage.removeItem(ROOM_STORAGE_KEY);
      sessionStorage.removeItem(ROOM_STORAGE_KEY);
    }
  } catch {
    // Ignore storage availability errors
  }
}

function getServerUrl() {
  const envUrl =
    import.meta.env.VITE_SERVER_URL || import.meta.env.VITE_BACKEND_URL;
  if (envUrl) {
    return envUrl.trim().replace(/\/+$/, "");
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
  const [copied, setCopied] = useState(false);

  const width = INITIAL_MAZE[0].length * CELL;
  const height = INITIAL_MAZE.length * CELL;

  const [roomCode, setRoomCode] = useState(getPersistedRoomCode);
  const [serverConnected, setServerConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [controllerConnected, setControllerConnected] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState("");

  const [telemetry, setTelemetry] = useState({
    x: 0,
    y: 0,
    activeDir: { up: false, down: false, left: false, right: false },
    activeSource: "UNPAIRED",
  });

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
    setStatus("playing");
  }, []);

  const handleCopyCode = useCallback(() => {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [roomCode]);

  const handleExplicitNewRoom = useCallback(() => {
    if (!socketRef.current || !socketRef.current.connected) return;
    isRoomOpInFlightRef.current = false;
    setRecoveryNotice("");
    const serverUrl = getServerUrl();
    console.log(`[LAPTOP] Explicitly creating new room on ${serverUrl}`);
    socketRef.current.timeout(8000).emit("create-room", (err, result) => {
      if (result?.success) {
        console.log(`[LAPTOP] New room generated: ${result.roomCode}`);
        setRoomCode(result.roomCode);
        roomCodeRef.current = result.roomCode;
        setPersistedRoomCode(result.roomCode);
        setControllerConnected(false);
        controllerConnectedRef.current = false;
      }
    });
  }, []);

  // Telemetry poll to update dashboard gauges smoothly
  useEffect(() => {
    const interval = setInterval(() => {
      const keys = keysRef.current || {};
      let kx = 0;
      let ky = 0;
      if (keys.arrowleft || keys.left || keys.a || keys.keya) kx -= 1;
      if (keys.arrowright || keys.right || keys.d || keys.keyd) kx += 1;
      if (keys.arrowup || keys.up || keys.w || keys.keyw) ky -= 1;
      if (keys.arrowdown || keys.down || keys.s || keys.keys) ky += 1;

      const sm = smoothedMotionRef.current || { x: 0, y: 0 };
      const isControllerActive =
        controllerConnectedRef.current && Math.hypot(sm.x, sm.y) > 0.05;
      const isKeyboardActive = kx !== 0 || ky !== 0;

      const effX = isControllerActive ? sm.x : kx;
      const effY = isControllerActive ? sm.y : ky;

      setTelemetry({
        x: effX,
        y: effY,
        activeDir: {
          up: effY < -0.15,
          down: effY > 0.15,
          left: effX < -0.15,
          right: effX > 0.15,
        },
        activeSource: isControllerActive
          ? "MOTION CONTROLLER"
          : isKeyboardActive
          ? "KEYBOARD FALLBACK"
          : controllerConnectedRef.current
          ? "CONTROLLER STANDBY"
          : "KEYBOARD READY",
      });
    }, 75);

    return () => clearInterval(interval);
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
      console.log(`[LAPTOP] Emitting create-room to ${serverUrl}`);

      sock.timeout(8000).emit("create-room", (err, result) => {
        isRoomOpInFlightRef.current = false;
        if (!isMounted) return;
        if (result?.success) {
          console.log(`[LAPTOP] Room successfully created: ${result.roomCode}`);
          setRoomCode(result.roomCode);
          roomCodeRef.current = result.roomCode;
          setPersistedRoomCode(result.roomCode);
          setControllerConnected(false);
          controllerConnectedRef.current = false;
          setRecoveryNotice("");
        } else {
          console.error(`[LAPTOP] create-room failed:`, result?.error || err);
          setRecoveryNotice(
            result?.error || "Failed to create room. Please verify backend server."
          );
        }
      });
    }

    function initRoomSession(sock) {
      const persisted = getPersistedRoomCode();

      if (!persisted) {
        createNewRoom(sock);
        return;
      }

      if (isRoomOpInFlightRef.current) return;
      isRoomOpInFlightRef.current = true;

      console.log(`[LAPTOP] Attempting to restore persisted room: "${persisted}" on ${serverUrl}`);
      sock.timeout(8000).emit(
        "join-room",
        { roomCode: persisted, role: "laptop" },
        (err, result) => {
          isRoomOpInFlightRef.current = false;
          if (!isMounted) return;

          if (result?.success) {
            console.log(`[LAPTOP] Successfully restored room "${result.roomCode}"`);
            setRoomCode(result.roomCode);
            roomCodeRef.current = result.roomCode;
            setPersistedRoomCode(result.roomCode);
            const hasController = Boolean(result.state?.controllerConnected);
            setControllerConnected(hasController);
            controllerConnectedRef.current = hasController;
            setRecoveryNotice("");
            return;
          }

          if (err) {
            console.warn(
              `[LAPTOP] Room restore timed out waiting for server. Retaining persisted code "${persisted}".`,
              err
            );
            setRecoveryNotice("Connecting to existing room...");
            return;
          }

          const errorMessage = String(result?.error || "");
          console.warn(`[LAPTOP] Persisted room restore error: ${errorMessage}`);

          if (/not found|expired|invalid/i.test(errorMessage)) {
            console.warn(
              `[LAPTOP] Persisted room "${persisted}" no longer exists on server. Creating new room.`
            );
            setPersistedRoomCode("");
            roomCodeRef.current = "";
            setRoomCode("");
            setRecoveryNotice(
              `Previous room "${persisted}" expired or was removed. Created a new room.`
            );
            createNewRoom(sock);
          } else {
            console.warn(
              `[LAPTOP] Non-fatal join error for room "${persisted}". Retaining code in storage.`
            );
            setRecoveryNotice(errorMessage);
          }
        }
      );
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

      if (status === "playing" && (isMovementKey || key === " ")) {
        event.preventDefault();
      } else if (status !== "playing" && (key === " " || isMovementKey)) {
        event.preventDefault();
      }

      keysRef.current[key] = true;
      if (code) {
        keysRef.current[code] = true;
      }

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
    if (!canvas) return;
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

      if (
        isWall(x, y - BALL_RADIUS) ||
        isWall(x, y + BALL_RADIUS) ||
        isWall(x - BALL_RADIUS, y) ||
        isWall(x + BALL_RADIUS, y)
      ) {
        return true;
      }

      const diag = BALL_RADIUS * 0.7071;
      return (
        isWall(x - diag, y - diag) ||
        isWall(x + diag, y - diag) ||
        isWall(x - diag, y + diag) ||
        isWall(x + diag, y + diag)
      );
    }

    function drawMaze() {
      ctx.fillStyle = "#080b12";
      ctx.fillRect(0, 0, width, height);

      mazeRef.current.forEach((row, rowIndex) => {
        row.forEach((cell, colIndex) => {
          const x = colIndex * CELL;
          const y = rowIndex * CELL;

          if (cell === 1) {
            ctx.fillStyle = "#151e2d";
            ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
            ctx.strokeStyle = "#1e2c44";
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
          } else if (cell === 2) {
            ctx.fillStyle = "rgba(212, 255, 0, 0.12)";
            ctx.fillRect(x, y, CELL, CELL);
            ctx.beginPath();
            ctx.arc(x + CELL / 2, y + CELL / 2, 9, 0, Math.PI * 2);
            ctx.fillStyle = "#d4ff00";
            ctx.shadowColor = "rgba(212, 255, 0, 0.85)";
            ctx.shadowBlur = 18;
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

        let kx = 0;
        let ky = 0;
        if (keys.arrowleft || keys.left || keys.a || keys.keya) kx -= 1;
        if (keys.arrowright || keys.right || keys.d || keys.keyd) kx += 1;
        if (keys.arrowup || keys.up || keys.w || keys.keyw) ky -= 1;
        if (keys.arrowdown || keys.down || keys.s || keys.keys) ky += 1;

        const hasKeyboardInput = kx !== 0 || ky !== 0;

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

      // Draw player ball (Cool Cyan with glowing core)
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "#00f0ff";
      ctx.shadowColor = "rgba(0, 240, 255, 0.85)";
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

  const controllerUrl =
    typeof window !== "undefined" && roomCode
      ? `${window.location.origin}/controller?room=${roomCode}`
      : "";

  return (
    <main className="app">
      {/* ====================================================================
          A. Header / Wordmark
          ==================================================================== */}
      <header className="topbar">
        <a href="/" className="brand" aria-label="MOTION LAB Home">
          <div className="brand-icon-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="3" />
              <path d="M12 18h.01" />
              <path d="M2 12a10 10 0 0 1 3-7" strokeDasharray="2 2" stroke="var(--accent-lime)" />
              <path d="M22 12a10 10 0 0 1-3 7" strokeDasharray="2 2" stroke="var(--accent-cyan)" />
            </svg>
          </div>
          <div className="brand-info">
            <p className="brand-eyebrow">EXPERIMENTAL PERIPHERAL LAB</p>
            <h1 className="brand-title">
              MOTION <span>LAB</span>
            </h1>
          </div>
        </a>

        <div className="topbar-meta">
          <div className="system-badge" title="Socket.IO Backend Status">
            <span
              className={`pulse-dot ${
                serverConnected
                  ? "online"
                  : isReconnecting
                  ? "reconnecting"
                  : "offline"
              }`}
            />
            BACKEND:{" "}
            {serverConnected
              ? "ONLINE"
              : isReconnecting
              ? "RECONNECTING"
              : "OFFLINE"}
          </div>

          <div
            className="system-badge"
            style={{
              borderColor: controllerConnected ? "rgba(212, 255, 0, 0.3)" : undefined,
              color: controllerConnected ? "var(--accent-lime)" : undefined,
            }}
          >
            ● CONTROLLER:{" "}
            {controllerConnected ? "LINKED" : "AWAITING PAIR"}
          </div>
        </div>
      </header>

      {/* ====================================================================
          B. Hero Section
          ==================================================================== */}
      <section className="hero">
        <div className="hero-content">
          <div className="hero-eyebrow">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            MOTION TELEMETRY SYSTEM // 001
          </div>
          <h2 className="hero-headline">
            YOUR PHONE. <em>YOUR MOVEMENT.</em> YOUR GAME.
          </h2>
          <p className="hero-description">
            Turn your smartphone into a motion-powered controller. No dedicated
            gaming hardware required. Real-time accelerometer telemetry and
            virtual analog control right from your browser.
          </p>
        </div>

        <div className="hero-motion-graphic" aria-hidden="true">
          <svg className="motion-radar-svg" viewBox="0 0 200 200" fill="none">
            {/* Concentric Gimbal Rings */}
            <circle cx="100" cy="100" r="90" stroke="#1c2536" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx="100" cy="100" r="66" stroke="#243044" strokeWidth="1.5" />
            <circle cx="100" cy="100" r="42" stroke="rgba(0, 240, 255, 0.25)" strokeWidth="1" />
            <circle cx="100" cy="100" r="16" stroke="rgba(212, 255, 0, 0.3)" strokeWidth="1.5" />

            {/* Axes */}
            <line x1="100" y1="6" x2="100" y2="194" stroke="#1f2c42" strokeWidth="1" />
            <line x1="6" y1="100" x2="194" y2="100" stroke="#1f2c42" strokeWidth="1" />

            {/* Degree Marks */}
            <text x="104" y="24" fill="#5e6b7d" fontSize="8" fontFamily="DM Mono">0° N</text>
            <text x="168" y="96" fill="#5e6b7d" fontSize="8" fontFamily="DM Mono">+90°</text>
            <text x="104" y="188" fill="#5e6b7d" fontSize="8" fontFamily="DM Mono">180°</text>
            <text x="12" y="96" fill="#5e6b7d" fontSize="8" fontFamily="DM Mono">-90°</text>

            {/* Motion Vector Sweep */}
            <path d="M 100 100 L 160 40" stroke="var(--accent-cyan)" strokeWidth="2" strokeLinecap="round" />
            <circle cx="160" cy="40" r="4" fill="var(--accent-cyan)" />
            <circle cx="100" cy="100" r="3" fill="var(--accent-lime)" />
          </svg>
        </div>
      </section>

      {/* ====================================================================
          C. Main Layout: Game Arena + Hardware Session Sidebar
          ==================================================================== */}
      <div className="main-layout">
        {/* Game Panel */}
        <section className="panel-card" aria-label="Game Canvas Arena">
          <div className="panel-header">
            <div className="panel-title-wrap">
              <span className="panel-tag">ARENA // 01</span>
              <h3 className="panel-title">Neon Labyrinth</h3>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "var(--text-muted)",
                }}
              >
                TARGET:
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "var(--accent-lime)",
                  fontWeight: 600,
                }}
              >
                GREEN PORTAL
              </span>
            </div>
          </div>

          <div
            className="game-viewport-wrap"
            tabIndex={0}
            onClick={() => canvasRef.current?.focus()}
            aria-label="Interactive Maze Canvas"
          >
            {/* Calibration Corner Ticks */}
            <span className="corner-tick top-left" />
            <span className="corner-tick top-right" />
            <span className="corner-tick bottom-left" />
            <span className="corner-tick bottom-right" />

            <canvas
              ref={canvasRef}
              tabIndex={0}
              width={width}
              height={height}
              aria-label="Maze game canvas. Steer the cyan orb to the lime goal using tilt or keys."
            />

            {status !== "playing" && (
              <div className="game-overlay">
                <div className="overlay-modal">
                  <div
                    className={`overlay-badge ${
                      status === "won" ? "victory" : "ready"
                    }`}
                  >
                    {status === "won" ? "STAGE COMPLETE" : "SYSTEM ARMED"}
                  </div>
                  <h3>
                    {status === "won"
                      ? "Labyrinth Conquered!"
                      : "Ready to Roll?"}
                  </h3>
                  <p>
                    {status === "won"
                      ? `Escape executed in ${elapsed} seconds with flawless navigation.`
                      : "Tilt your paired phone controller or use WASD / Arrow keys to reach the green exit."}
                  </p>
                  <button className="btn-primary" onClick={resetGame}>
                    {status === "won" ? "Run Arena Again" : "Engage Simulator"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="game-footer-strip">
            <div className="legend-group">
              <span className="legend-item">
                <i className="legend-dot orb" /> PLAYER ORB
              </span>
              <span className="legend-item">
                <i className="legend-dot goal" /> EXIT PORTAL
              </span>
              <span className="legend-item">
                <i className="legend-dot wall" /> BARRIERS
              </span>
            </div>
            <div>STATUS: {status.toUpperCase()}</div>
          </div>
        </section>

        {/* Sidebar Controls */}
        <aside className="sidebar">
          {/* 1. Session Token Card */}
          <div className="session-card">
            <div className="session-card-header">
              <span className="session-card-title">PAIRING IDENTIFIER</span>
              <span
                className={`session-state-pill ${
                  controllerConnected ? "paired" : "waiting"
                }`}
              >
                {controllerConnected ? "● CONTROLLER BOUND" : "○ SCAN / ENTER TOKEN"}
              </span>
            </div>

            {recoveryNotice && (
              <div
                style={{
                  fontSize: "11px",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  background: "#22170d",
                  color: "#ffc078",
                  border: "1px solid #573315",
                  marginBottom: "12px",
                }}
              >
                {recoveryNotice}
              </div>
            )}

            <div className="token-container">
              <span className="token-label">SESSION TOKEN</span>
              <div className={`token-value ${controllerConnected ? "paired" : ""}`}>
                {roomCode || "------"}
              </div>
            </div>

            {/* QR Code Section */}
            {roomCode && (
              <div className="qr-preview-row">
                <div className="qr-box">
                  <QRCodeSVG
                    value={controllerUrl}
                    size={92}
                    bgColor="transparent"
                    fgColor="#d4ff00"
                    level="M"
                  />
                </div>
                <div className="qr-copy">
                  <p className="qr-copy-title">Instant Mobile Link</p>
                  <p className="qr-copy-desc">
                    Point your camera or Expo controller to connect directly to this session.
                  </p>
                </div>
              </div>
            )}

            <div className="session-actions">
              <button
                className="btn-secondary"
                disabled={!roomCode}
                onClick={handleCopyCode}
                title="Copy pairing token to clipboard"
              >
                {copied ? "✓ Copied!" : "Copy Token"}
              </button>
              <button
                className="btn-secondary"
                disabled={!serverConnected}
                onClick={handleExplicitNewRoom}
                title="Generate a fresh room token"
              >
                New Session
              </button>
            </div>
          </div>

          {/* 2. Live Telemetry / Controller Status Visualization */}
          <div className="telemetry-card">
            <div className="telemetry-header">
              <span className="telemetry-title">LIVE INPUT TELEMETRY</span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color: controllerConnected ? "var(--accent-lime)" : "var(--text-muted)",
                }}
              >
                {controllerConnected ? "STREAMING 30HZ" : "KEYBOARD MODE"}
              </span>
            </div>

            <div className="telemetry-grid">
              {/* Gyro Compass Crosshair */}
              <div className="gyro-compass" title="Live motion deflection vector">
                <div className="compass-ring" />
                <div className="compass-axis-h" />
                <div className="compass-axis-v" />
                <div
                  className={`compass-dot ${
                    telemetry.x === 0 && telemetry.y === 0 ? "inactive" : ""
                  }`}
                  style={{
                    transform: `translate(${telemetry.x * 38}px, ${
                      telemetry.y * 38
                    }px)`,
                  }}
                />
              </div>

              {/* Arrow Matrix & Source Indicator */}
              <div className="direction-matrix">
                <div className="arrow-pad" aria-label="Active directional inputs">
                  <div
                    className={`arrow-key up ${
                      telemetry.activeDir.up ? "active" : ""
                    }`}
                  >
                    ↑
                  </div>
                  <div
                    className={`arrow-key left ${
                      telemetry.activeDir.left ? "active" : ""
                    }`}
                  >
                    ←
                  </div>
                  <div
                    className={`arrow-key down ${
                      telemetry.activeDir.down ? "active" : ""
                    }`}
                  >
                    ↓
                  </div>
                  <div
                    className={`arrow-key right ${
                      telemetry.activeDir.right ? "active" : ""
                    }`}
                  >
                    →
                  </div>
                </div>

                <div className="active-source-badge">
                  SOURCE: <span>{telemetry.activeSource}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Performance Metrics (Timer & Personal Best) */}
          <div className="stats-strip">
            <div className="stat-metric">
              <div className="stat-metric-label">TIME ELAPSED</div>
              <div className="stat-metric-value">
                {String(elapsed).padStart(2, "0")}
                <small>s</small>
              </div>
            </div>

            <div className="stat-metric">
              <div className="stat-metric-label">RECORD ESCAPE</div>
              <div className="stat-metric-value">
                {bestTime === null ? "--" : bestTime}
                <small>{bestTime === null ? "" : "s"}</small>
              </div>
            </div>
          </div>

          <button className="btn-restart-game" onClick={resetGame}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19" />
            </svg>
            Restart Arena Run
          </button>
        </aside>
      </div>

      {/* ====================================================================
          E. Instructions / 3-Step Onboarding
          ==================================================================== */}
      <section className="onboarding-section">
        <div className="onboarding-header">
          <p className="onboarding-eyebrow">QUICK START PROTOCOL</p>
          <h3 className="onboarding-title">How Motion Lab Works</h3>
        </div>

        <div className="steps-grid">
          <div className="step-card">
            <span className="step-number">STEP 01</span>
            <h4>Host Arena on Laptop</h4>
            <p>
              The labyrinth physics engine executes locally in your browser at 60 FPS.
              Keyboard WASD / Arrow controls are active as an immediate fallback.
            </p>
          </div>

          <div className="step-card">
            <span className="step-number">STEP 02</span>
            <h4>Link Mobile Controller</h4>
            <p>
              Open the Expo Go app or scan the session QR code with your phone camera.
              Enter your 6-character hardware token to securely bind the device.
            </p>
          </div>

          <div className="step-card">
            <span className="step-number">STEP 03</span>
            <h4>Drive with Pure Motion</h4>
            <p>
              Tilt your phone in physical space or drag the tactile analog thumbstick
              to steer the orb around obstacles and conquer the maze.
            </p>
          </div>
        </div>
      </section>

      {/* ====================================================================
          Footer
          ==================================================================== */}
      <footer className="site-footer">
        <div className="footer-left">
          <span>MOTION LAB</span> // EXPERIMENTAL GAMING PERIPHERAL
        </div>
        <div>BUILT FOR ZERO-LATENCY PLAY · 2026</div>
      </footer>
    </main>
  );
}
