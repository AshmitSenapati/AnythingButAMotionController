import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { io } from "socket.io-client";
import { QRCodeSVG } from "qrcode.react";

const MAZES = {
  easy: {
    name: "Easy",
    level: "01",
    cell: 32,
    radius: 10,
    grid: [
      "111111111111111",
      "101000000000101",
      "101110111010101",
      "100010001010001",
      "111011101011111",
      "101010101000001",
      "101010101111101",
      "101010001010001",
      "101010111010101",
      "100010000010101",
      "101111111010111",
      "100010000010001",
      "111011111111101",
      "100000000000021",
      "111111111111111",
    ],
  },
  hard: {
    name: "Hard",
    level: "02",
    cell: 28,
    radius: 9,
    grid: [
      "11111111111111111",
      "10000010000000101",
      "11111010101110101",
      "10000010101010001",
      "10111111101011101",
      "10001000001010001",
      "11101011111010111",
      "10100010000010101",
      "10111110111010101",
      "10000010100010101",
      "10101010101110101",
      "10101000100010001",
      "10101111111011101",
      "10101000001010001",
      "10101011101110111",
      "10100000100000021",
      "11111111111111111",
    ],
  },
  expert: {
    name: "Expert",
    level: "03",
    cell: 26,
    radius: 8,
    grid: [
      "1111111111111111111",
      "1010000000000000001",
      "1010111111111111101",
      "1010000010000000101",
      "1011111010111011101",
      "1000100010001010001",
      "1110101111101110111",
      "1010100000101000101",
      "1010111110101011101",
      "1010100000101010001",
      "1010101111101011101",
      "1010001000100010001",
      "1011111110101110111",
      "1000000000100010001",
      "1010111111111011101",
      "1010000010000010001",
      "1011111010111110101",
      "1000001000000000121",
      "1111111111111111111",
    ],
  },
};

function parseMazeGrid(grid) {
  return grid.map((row) => row.split("").map(Number));
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
  const ballRef = useRef({ x: 1.5 * MAZES.easy.cell, y: 1.5 * MAZES.easy.cell });
  const velocityRef = useRef({ x: 0, y: 0 });
  const previousTimeRef = useRef(0);
  const elapsedRef = useRef(0);

  const [difficulty, setDifficulty] = useState("easy");
  const mazeConfig = MAZES[difficulty] || MAZES.easy;
  const mazeRef = useRef(parseMazeGrid(mazeConfig.grid));

  const [status, setStatus] = useState("ready");
  const [elapsed, setElapsed] = useState(0);
  const [bestTimes, setBestTimes] = useState({
    easy: null,
    hard: null,
    expert: null,
  });
  const [copied, setCopied] = useState(false);

  const width = mazeConfig.grid[0].length * mazeConfig.cell;
  const height = mazeConfig.grid.length * mazeConfig.cell;

  const [roomCode, setRoomCode] = useState(getPersistedRoomCode);
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
    const cfg = MAZES[difficulty] || MAZES.easy;
    mazeRef.current = parseMazeGrid(cfg.grid);
    ballRef.current = { x: 1.5 * cfg.cell, y: 1.5 * cfg.cell };
    velocityRef.current = { x: 0, y: 0 };
    smoothedMotionRef.current = { x: 0, y: 0 };
    previousTimeRef.current = 0;
    elapsedRef.current = 0;
    setElapsed(0);
    setStatus("playing");
  }, [difficulty]);

  const handleDifficultyChange = (newDiff) => {
    if (newDiff === difficulty) return;
    setDifficulty(newDiff);
    const cfg = MAZES[newDiff] || MAZES.easy;
    mazeRef.current = parseMazeGrid(cfg.grid);
    ballRef.current = { x: 1.5 * cfg.cell, y: 1.5 * cfg.cell };
    velocityRef.current = { x: 0, y: 0 };
    smoothedMotionRef.current = { x: 0, y: 0 };
    previousTimeRef.current = 0;
    elapsedRef.current = 0;
    setElapsed(0);
    setStatus("ready");
  };

  const handleNextLevel = () => {
    if (difficulty === "easy") {
      handleDifficultyChange("hard");
    } else if (difficulty === "hard") {
      handleDifficultyChange("expert");
    } else {
      resetGame();
    }
  };

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

  // Main Canvas Render & Physics Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let running = true;

    const currentCell = mazeConfig.cell;
    const currentRadius = mazeConfig.radius;

    function isWall(x, y) {
      const col = Math.floor(x / currentCell);
      const row = Math.floor(y / currentCell);

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
        x - currentRadius < 0 ||
        x + currentRadius > width ||
        y - currentRadius < 0 ||
        y + currentRadius > height
      ) {
        return true;
      }

      if (
        isWall(x, y - currentRadius) ||
        isWall(x, y + currentRadius) ||
        isWall(x - currentRadius, y) ||
        isWall(x + currentRadius, y)
      ) {
        return true;
      }

      const diag = currentRadius * 0.7071;
      return (
        isWall(x - diag, y - diag) ||
        isWall(x + diag, y - diag) ||
        isWall(x - diag, y + diag) ||
        isWall(x + diag, y + diag)
      );
    }

    function drawMaze() {
      ctx.fillStyle = "#080a0f";
      ctx.fillRect(0, 0, width, height);

      mazeRef.current.forEach((row, rowIndex) => {
        row.forEach((cell, colIndex) => {
          const x = colIndex * currentCell;
          const y = rowIndex * currentCell;

          if (cell === 1) {
            ctx.fillStyle = "#151e2d";
            ctx.fillRect(x + 1, y + 1, currentCell - 2, currentCell - 2);
            ctx.strokeStyle = "#1e2c44";
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 1, y + 1, currentCell - 2, currentCell - 2);
          } else if (cell === 2) {
            ctx.fillStyle = "rgba(212, 255, 0, 0.15)";
            ctx.fillRect(x, y, currentCell, currentCell);
            ctx.beginPath();
            ctx.arc(
              x + currentCell / 2,
              y + currentCell / 2,
              Math.max(6, currentRadius),
              0,
              Math.PI * 2
            );
            ctx.fillStyle = "#d4ff00";
            ctx.shadowColor = "rgba(212, 255, 0, 0.85)";
            ctx.shadowBlur = 16;
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
          currentRadius,
          Math.min(width - currentRadius, ball.x + velocity.x * dt)
        );
        const nextY = Math.max(
          currentRadius,
          Math.min(height - currentRadius, ball.y + velocity.y * dt)
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
                    x: (colIndex + 0.5) * currentCell,
                    y: (rowIndex + 0.5) * currentCell,
                  }
                : null
            )
          )
          .find(Boolean);

        if (
          goal &&
          Math.hypot(ball.x - goal.x, ball.y - goal.y) < currentCell * 0.35
        ) {
          setStatus("won");
          setBestTimes((prev) => ({
            ...prev,
            [difficulty]:
              prev[difficulty] === null
                ? elapsedRef.current
                : Math.min(prev[difficulty], elapsedRef.current),
          }));
        }
      }

      drawMaze();

      // Draw player ball (Cool Cyan with glowing center)
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, currentRadius, 0, Math.PI * 2);
      ctx.fillStyle = "#00f0ff";
      ctx.shadowColor = "rgba(0, 240, 255, 0.85)";
      ctx.shadowBlur = 18;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.arc(ball.x - 2, ball.y - 2, Math.max(2, currentRadius * 0.3), 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      animationRef.current = requestAnimationFrame(frame);
    }

    animationRef.current = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(animationRef.current);
    };
  }, [status, width, height, difficulty, mazeConfig]);

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

  const currentBest = bestTimes[difficulty];

  return (
    <main className="app">
      {/* Top Header */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">M</div>
          <div>
            <p className="brand-eyebrow">ANYTHING BUT A</p>
            <h1>Game Controller</h1>
          </div>
        </div>

        <div className="topbar-badges">
          <div className="status-pill">
            <span
              className={`status-dot ${
                serverConnected
                  ? "online"
                  : isReconnecting
                  ? "reconnecting"
                  : "offline"
              }`}
            />
            SERVER {serverConnected ? "ONLINE" : isReconnecting ? "RECONNECTING" : "OFFLINE"}
          </div>

          <div
            className="status-pill"
            style={{
              borderColor: controllerConnected ? "rgba(212, 255, 0, 0.3)" : undefined,
              color: controllerConnected ? "var(--accent-lime)" : undefined,
            }}
          >
            <span className={`status-dot ${controllerConnected ? "online" : "offline"}`} />
            {controllerConnected ? "PHONE PAIRED" : "KEYBOARD MODE"}
          </div>

          <div className="status-pill" style={{ color: "var(--accent-lime)" }}>
            ● MAZE MODE
          </div>
        </div>
      </header>

      {/* Hero Heading */}
      <section className="hero">
        <p className="brand-eyebrow">THE MOTION-POWERED LABYRINTH</p>
        <h2>
          Navigate the maze. <span>Reach the green exit.</span>
        </h2>
        <p className="hero-subtitle">
          Guide the blue orb through walls and dead ends. Steer with Arrow keys
          or WASD on your keyboard, or pair your phone as a motion controller.
        </p>
      </section>

      {/* Main Game Arena Layout */}
      <section className="game-layout">
        {/* Visual Centerpiece: The Maze Panel */}
        <div className="game-panel">
          <div className="panel-heading">
            <div className="panel-heading-title">
              <span className="level-tag">LEVEL {mazeConfig.level}</span>
              <h3>{mazeConfig.name} Labyrinth</h3>
            </div>

            {/* Difficulty Selector */}
            <div className="difficulty-selector" role="group" aria-label="Maze Difficulty">
              <button
                className={`diff-btn ${difficulty === "easy" ? "active" : ""}`}
                onClick={() => handleDifficultyChange("easy")}
              >
                EASY
              </button>
              <button
                className={`diff-btn ${difficulty === "hard" ? "active" : ""}`}
                onClick={() => handleDifficultyChange("hard")}
              >
                HARD
              </button>
              <button
                className={`diff-btn ${difficulty === "expert" ? "active" : ""}`}
                onClick={() => handleDifficultyChange("expert")}
              >
                EXPERT
              </button>
            </div>
          </div>

          {/* Canvas Wrapper */}
          <div
            className="canvas-wrap"
            tabIndex={0}
            onClick={() => canvasRef.current?.focus()}
            aria-label="Maze canvas"
          >
            <canvas
              ref={canvasRef}
              tabIndex={0}
              width={width}
              height={height}
              aria-label="Maze game canvas. Steer the blue orb to the green exit."
            />

            {/* In-Canvas Overlays */}
            {status !== "playing" && (
              <div className="game-overlay">
                <div className="overlay-card">
                  <div
                    className={`overlay-symbol ${
                      status === "won" ? "won" : "ready"
                    }`}
                  >
                    {status === "won" ? "✓" : "↗"}
                  </div>
                  <h3>
                    {status === "won"
                      ? "Maze conquered!"
                      : "Ready to roll?"}
                  </h3>
                  <p>
                    {status === "won"
                      ? `Escaped the ${mazeConfig.name} maze in ${elapsed} seconds!`
                      : `Use arrow keys or WASD, or tilt your paired phone controller.`}
                  </p>
                  <div className="overlay-actions">
                    <button className="btn-primary" onClick={resetGame}>
                      {status === "won" ? "Play again" : "Start game"}
                    </button>
                    {status === "won" && difficulty !== "expert" && (
                      <button className="btn-secondary" onClick={handleNextLevel}>
                        Next: {difficulty === "easy" ? "Hard" : "Expert"} Level →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Game Footer Legend */}
          <div className="game-footer">
            <div className="legend-group">
              <span><i className="blue-dot" /> YOU</span>
              <span><i className="green-dot" /> EXIT</span>
              <span>WALLS = OBSTACLES</span>
            </div>
            <div>
              INPUT: {controllerConnected ? "PHONE CONTROLLER" : "KEYBOARD (ARROWS / WASD)"}
            </div>
          </div>
        </div>

        {/* Sidebar Controls */}
        <aside className="sidebar">
          {/* Card 1: Time & Record */}
          <div className="stat-card">
            <div className="stat-metric-row">
              <div className="stat-metric-box">
                <div className="stat-label">TIME ELAPSED</div>
                <div className="stat-value">
                  {String(elapsed).padStart(2, "0")}<span>s</span>
                </div>
              </div>

              <div className="stat-metric-box">
                <div className="stat-label">PERSONAL BEST</div>
                <div className="stat-value">
                  {currentBest === null ? "--" : currentBest}
                  <span>{currentBest === null ? "" : "s"}</span>
                </div>
              </div>
            </div>

            <button className="btn-restart" onClick={resetGame}>
              ↻ &nbsp; Restart maze
            </button>
          </div>

          {/* Card 2: Phone Pairing */}
          <div className="pairing-card">
            <div className="pairing-header">
              <span className="pairing-title">PHONE CONTROLLER</span>
              <span
                className={`controller-pill ${
                  controllerConnected ? "connected" : "disconnected"
                }`}
              >
                ● {controllerConnected ? "CONNECTED" : "WAITING FOR PHONE"}
              </span>
            </div>

            {recoveryNotice && (
              <div
                style={{
                  fontSize: "11px",
                  padding: "6px 8px",
                  borderRadius: "4px",
                  background: "#22170d",
                  color: "#ffc078",
                  border: "1px solid #573315",
                  marginBottom: "10px",
                }}
              >
                {recoveryNotice}
              </div>
            )}

            <div className="room-token-box">
              <span className="room-token-label">ROOM CODE</span>
              <div
                className={`room-token-code ${
                  controllerConnected ? "paired" : ""
                }`}
              >
                {roomCode || "------"}
              </div>
            </div>

            {/* Quick Camera QR Code Link */}
            {roomCode && (
              <div className="qr-compact-row">
                <div className="qr-compact-box">
                  <QRCodeSVG
                    value={controllerUrl}
                    size={76}
                    bgColor="transparent"
                    fgColor="#d4ff00"
                    level="M"
                  />
                </div>
                <div className="qr-compact-info">
                  <p>
                    <strong>Scan with phone</strong>
                    Point your camera or Expo app to control the maze with motion.
                  </p>
                </div>
              </div>
            )}

            <div className="pairing-actions">
              <button
                className="btn-secondary"
                disabled={!roomCode}
                onClick={handleCopyCode}
                title="Copy room code to clipboard"
              >
                {copied ? "✓ Copied!" : "Copy code"}
              </button>
              <button
                className="btn-secondary"
                disabled={!serverConnected}
                onClick={handleExplicitNewRoom}
                title="Generate a fresh room code"
              >
                New room
              </button>
            </div>
          </div>

          {/* Card 3: Controls */}
          <div className="controls-card">
            <div className="controls-eyebrow">HOW TO PLAY</div>
            <div className="key-pad">
              <div className="key-unit up">↑</div>
              <div className="key-unit left">←</div>
              <div className="key-unit down">↓</div>
              <div className="key-unit right">→</div>
            </div>
            <p className="key-caption">
              Arrow keys or <b>W A S D</b> to steer.
            </p>
            <p className="key-caption" style={{ marginTop: "6px", color: "var(--accent-lime)" }}>
              Or tilt your paired phone controller.
            </p>
          </div>
        </aside>
      </section>

      {/* Page Footer */}
      <footer className="page-footer">
        <span>BUILT FOR PLAY. POWERED BY MOTION.</span>
        <span>ANYTHING BUT A GAME CONTROLLER © 2026</span>
      </footer>
    </main>
  );
}
