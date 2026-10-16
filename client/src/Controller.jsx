import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./Controller.css";

function getServerUrl() {
  if (import.meta.env.VITE_SERVER_URL) {
    return import.meta.env.VITE_SERVER_URL.trim().replace(/\/+$/, "");
  }
  if (typeof window !== "undefined" && window.location.hostname) {
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    return `${protocol}//${window.location.hostname}:3001`;
  }
  return "http://localhost:3001";
}

export default function Controller() {
  const socketRef = useRef(null);
  const neutralRef = useRef({ beta: 0, gamma: 0 });
  const latestRef = useRef({ beta: 0, gamma: 0 });
  const lastSentRef = useRef(0);
  const isPairedRef = useRef(false);
  const pairedRoomRef = useRef("");
  const calibratedRef = useRef(false);

  const [roomCode, setRoomCode] = useState("");
  const [connected, setConnected] = useState(false);
  const [isPaired, setIsPaired] = useState(false);
  const [pairedRoom, setPairedRoom] = useState("");
  const [isPairing, setIsPairing] = useState(false);
  const [sensorEnabled, setSensorEnabled] = useState(false);
  const [calibrated, setCalibrated] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [error, setError] = useState("");
  const [laptopOnline, setLaptopOnline] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const serverUrl = getServerUrl();
    const socket = io(serverUrl, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      if (!isMounted) return;
      setConnected(true);
      setError("");

      // If we were previously paired before a reconnect, attempt to rejoin automatically
      if (pairedRoomRef.current) {
        socket.timeout(5000).emit(
          "join-room",
          { roomCode: pairedRoomRef.current, role: "controller" },
          (err, result) => {
            if (!isMounted) return;
            if (err || !result?.success) {
              setIsPaired(false);
              isPairedRef.current = false;
              pairedRoomRef.current = "";
              setPairedRoom("");
              setError(
                err
                  ? "Reconnection timed out. Please pair again."
                  : result?.error || "Room expired. Please pair again."
              );
            } else {
              setIsPaired(true);
              isPairedRef.current = true;
              pairedRoomRef.current = result.roomCode;
              setPairedRoom(result.roomCode);
              setLaptopOnline(Boolean(result.state?.laptopConnected));
            }
          }
        );
      }
    });

    socket.on("disconnect", () => {
      if (!isMounted) return;
      setConnected(false);
      setIsPaired(false);
      isPairedRef.current = false;
      setPairedRoom("");
      setIsPairing(false);
    });

    socket.on("room-state", (state) => {
      if (!isMounted) return;
      if (state?.roomCode === pairedRoomRef.current) {
        setLaptopOnline(Boolean(state.laptopConnected));
        if (!state.controllerConnected && isPairedRef.current) {
          setIsPaired(false);
          isPairedRef.current = false;
          pairedRoomRef.current = "";
          setPairedRoom("");
          setError("Controller was disconnected from the room.");
        }
      }
    });

    return () => {
      isMounted = false;
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  function joinRoom() {
    const code = roomCode.trim().toUpperCase();

    if (code.length !== 6) {
      setError("Enter the six-character room code from your laptop.");
      return;
    }

    const socket = socketRef.current;

    if (!socket?.connected) {
      setError("Connecting to the server. Try again in a moment.");
      return;
    }

    setIsPairing(true);
    setError("");

    socket.timeout(5000).emit(
      "join-room",
      { roomCode: code, role: "controller" },
      (err, result) => {
        setIsPairing(false);

        if (err) {
          setError("Connection timed out. Server did not respond.");
          setIsPaired(false);
          isPairedRef.current = false;
          setPairedRoom("");
          return;
        }

        if (!result?.success) {
          setError(result?.error || "Unable to join this room.");
          setIsPaired(false);
          isPairedRef.current = false;
          setPairedRoom("");
          return;
        }

        setIsPaired(true);
        isPairedRef.current = true;
        pairedRoomRef.current = result.roomCode;
        setPairedRoom(result.roomCode);
        setRoomCode(result.roomCode);
        setLaptopOnline(Boolean(result.state?.laptopConnected));
        setError("");
      }
    );
  }

  function unpair() {
    const socket = socketRef.current;
    const currentRoom = pairedRoomRef.current || roomCode;

    // Immediately stop sending motion, reset tilt, and clear pairing state locally
    setIsPaired(false);
    isPairedRef.current = false;
    pairedRoomRef.current = "";
    setPairedRoom("");
    setTilt({ x: 0, y: 0 });
    setError("");

    // Emit explicit leave-room event to notify server without disconnecting the socket
    if (socket?.connected && currentRoom) {
      socket.timeout(5000).emit(
        "leave-room",
        { roomCode: currentRoom, role: "controller" },
        (err, result) => {
          if (err) {
            console.warn("Unpair acknowledgment timed out:", err);
            return;
          }
          if (!result?.success) {
            console.warn("Unpair acknowledgment error:", result?.error);
          }
        }
      );
    }
  }

  const onOrientation = useCallback((event) => {
    if (event.beta == null || event.gamma == null) return;

    latestRef.current = {
      beta: event.beta,
      gamma: event.gamma,
    };

    // Auto-calibrate on the very first orientation reading so the phone doesn't drift immediately
    if (!calibratedRef.current) {
      neutralRef.current = { beta: event.beta, gamma: event.gamma };
      calibratedRef.current = true;
      setCalibrated(true);
    }

    const rawX = event.gamma - neutralRef.current.gamma;
    const rawY = event.beta - neutralRef.current.beta;

    // 2.0-degree deadzone to eliminate hand tremors and resting drift
    const deadzone = 2.0;
    const x = Math.abs(rawX) < deadzone ? 0 : rawX - Math.sign(rawX) * deadzone;
    const y = Math.abs(rawY) < deadzone ? 0 : rawY - Math.sign(rawY) * deadzone;

    const clampedX = Math.max(-45, Math.min(45, x));
    const clampedY = Math.max(-45, Math.min(45, y));

    setTilt({
      x: clampedX,
      y: clampedY,
    });

    const now = performance.now();

    // Limit network traffic to approximately 30 updates per second
    if (now - lastSentRef.current < 33) return;

    lastSentRef.current = now;

    const socket = socketRef.current;

    // Only transmit motion when connected and paired to a room
    if (socket?.connected && isPairedRef.current) {
      socket.emit("controller-data", {
        tilt: clampedX,
        acceleration: clampedY,
      });
    }
  }, []);

  async function enableMotion() {
    try {
      setError("");

      // iOS Safari requires a user gesture to request motion permission.
      if (
        typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function"
      ) {
        const permission = await DeviceOrientationEvent.requestPermission();

        if (permission !== "granted") {
          setError(
            "Motion permission was not granted. In iOS Settings > Safari, check that Motion & Orientation Access is allowed."
          );
          return;
        }
      }

      if (typeof DeviceOrientationEvent === "undefined") {
        setError("This browser does not support device orientation sensors.");
        return;
      }

      // Reset calibration so current resting angle becomes neutral
      calibratedRef.current = false;
      setCalibrated(false);

      // Cleanly attach stable orientation listener
      window.removeEventListener("deviceorientation", onOrientation);
      window.addEventListener("deviceorientation", onOrientation);
      setSensorEnabled(true);
    } catch (err) {
      if (err.name === "NotAllowedError" || err.name === "SecurityError") {
        setError("Motion sensors require permission and a secure context (HTTPS or localhost).");
      } else {
        setError(err.message || "Could not enable motion sensors.");
      }
    }
  }

  function calibrate() {
    if (latestRef.current.beta != null && latestRef.current.gamma != null) {
      neutralRef.current = { ...latestRef.current };
    }
    calibratedRef.current = true;
    setCalibrated(true);
  }

  useEffect(() => {
    return () => {
      window.removeEventListener("deviceorientation", onOrientation);
    };
  }, [onOrientation]);

  return (
    <main className="controller-page">
      <header className="controller-header">
        <div className="controller-logo">M</div>
        <div>
          <p className="controller-eyebrow">ANYTHING BUT A</p>
          <h1>Motion Controller</h1>
        </div>
        <span className={`connection-pill ${connected ? "online" : ""}`}>
          {connected ? "SERVER ONLINE" : "CONNECTING"}
        </span>
      </header>

      <section className="controller-content">
        <p className="controller-eyebrow">YOUR PHONE IS THE CONTROLLER</p>
        <h2>
          Move naturally.<br />
          <span>Play differently.</span>
        </h2>
        <p className="controller-description">
          Pair with your laptop, hold your phone comfortably, and tilt to
          navigate the maze.
        </p>

        <section className="controller-card">
          <label htmlFor="room-code">LAPTOP ROOM CODE</label>

          {isPaired ? (
            <div className="paired-container">
              <div className="paired-banner">
                <span className="paired-dot" />
                <div>
                  <strong>PAIRED TO {pairedRoom || roomCode}</strong>
                  <p className="paired-status">
                    {laptopOnline
                      ? "Laptop game connected and ready"
                      : "Laptop temporarily offline"}
                  </p>
                </div>
              </div>
              <button className="unpair-button" onClick={unpair}>
                Unpair
              </button>
            </div>
          ) : (
            <div className="join-row">
              <input
                id="room-code"
                value={roomCode}
                onChange={(event) => {
                  setRoomCode(event.target.value.toUpperCase().slice(0, 6));
                  setError("");
                }}
                placeholder="ABC123"
                maxLength={6}
                autoCapitalize="characters"
                autoComplete="off"
                disabled={isPairing}
              />
              <button
                onClick={joinRoom}
                disabled={!connected || isPairing || roomCode.trim().length !== 6}
              >
                {isPairing ? "Pairing..." : "Pair"}
              </button>
            </div>
          )}

          {!isPaired && (
            <p className="controller-hint">
              Generate the code on the laptop's maze game first.
            </p>
          )}
        </section>

        <section className="sensor-card">
          <div className="sensor-card-heading">
            <div>
              <p className="controller-eyebrow">MOTION SENSORS</p>
              <h3>{sensorEnabled ? "Sensors enabled" : "Ready to activate"}</h3>
            </div>
            <span
              className={`sensor-indicator ${sensorEnabled ? "active" : ""}`}
            />
          </div>

          {!sensorEnabled ? (
            <button className="motion-button" onClick={enableMotion}>
              Enable Motion Sensors
            </button>
          ) : (
            <>
              <div className="tilt-visual">
                <div className="tilt-crosshair">
                  <div
                    className="tilt-ball"
                    style={{
                      left: `${50 + (tilt.x / 45) * 38}%`,
                      top: `${50 + (tilt.y / 45) * 38}%`,
                    }}
                  />
                </div>
              </div>

              <div className="tilt-readings">
                <div>
                  <span>TILT X</span>
                  <strong>{tilt.x.toFixed(1)}°</strong>
                </div>
                <div>
                  <span>TILT Y</span>
                  <strong>{tilt.y.toFixed(1)}°</strong>
                </div>
              </div>

              <button className="motion-button" onClick={calibrate}>
                Calibrate Neutral Position
              </button>

              <p className="controller-hint">
                {calibrated
                  ? "Neutral position saved. Keep tilting to move."
                  : "Hold your phone in a comfortable neutral position, then calibrate."}
              </p>
            </>
          )}
        </section>

        {error && <p className="controller-error">{error}</p>}

        <p className="controller-footer">
          Keep your phone steady when calibrating. Use gentle tilts for precise
          movement.
        </p>
      </section>
    </main>
  );
}
