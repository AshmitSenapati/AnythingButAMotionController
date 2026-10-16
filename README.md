# Anything but a Game Controller

> Turn your iPhone into a high-precision, low-latency motion steering wheel for a neon arcade maze game running on your laptop.

---

## 1. Overview & Technology Stack

The project consists of three interconnected systems designed for seamless local real-time multiplayer networking:

```
┌──────────────────────────────────────┐          WebSocket           ┌──────────────────────────────────────┐
│             mobile/                  │ ───────────────────────────> │              server/                 │
│  React Native + Expo SDK 57 (TS)     │    controller-data (30Hz)    │       Node.js + Express              │
│  • DeviceMotion / Accelerometer      │ <─────────────────────────── │         Socket.IO 4.8                │
│  • On-Screen Touch Joystick          │       room-state (sync)      │    Authoritative Room Manager        │
│  • Live Latency Telemetry            │                              └──────────────────────────────────────┘
└──────────────────────────────────────┘                                                 │
                                                                                         │ room-state
                                                                                         │ controller-data
                                                                                         ▼
                                                                      ┌──────────────────────────────────────┐
                                                                      │              client/                 │
                                                                      │         React 19 + Vite 6            │
                                                                      │    • Canvas 2D Neon Maze Engine      │
                                                                      │    • Exponential Motion Smoothing    │
                                                                      │    • 8-Point Boundary Collision      │
                                                                      └──────────────────────────────────────┘
```

### Technology Stack Details

- **`client/` (Laptop Web Game)**:
  - React 19 + Vite (built for desktop browsers, tested in Chrome/Edge/Safari).
  - Canvas 2D rendering at 60 FPS with physics acceleration, friction, and 8-point boundary collision detection.
  - Dual control system: automatically uses phone motion tilt when paired; falls back seamlessly to keyboard controls (`W`, `A`, `S`, `D` or arrow keys) when unpaired.
- **`server/` (Real-Time Networking Engine)**:
  - Node.js + Express + Socket.IO 4.8.
  - Native Node.js `--watch` file-watching mode (zero external Nodemon dependencies).
  - Authoritative room state management with 6-character room codes (`create-room`, `join-room`, `leave-room`, `controller-data`, `ping-latency`).
  - Dynamic LAN CORS handling and 30-second disconnect grace periods for StrictMode remounts and brief Wi-Fi handoffs.
- **`mobile/` (iPhone Controller App)**:
  - React Native 0.86 + Expo SDK 57 + TypeScript (aligned with the current iOS App Store version of Expo Go).
  - High-frequency sensor ingestion via `expo-sensors` (`DeviceMotion` and `Accelerometer`).
  - Tactile on-screen backup dual-axis `VirtualJoystick` using React Native `PanResponder` (claims touch responder with zero page scrolling).
  - Seamless mode switching between Tilt Motion and Touch Joystick with preserved calibration.
  - In-app LAN IP auto-detection from Expo host URI with manual configuration modal (⚙).
  - Live round-trip latency (RTT in ms) telemetry.

---

## 2. Quick Setup & Startup Instructions

### Prerequisites
- **Node.js**: v18.0.0 or later (v22 recommended).
- **npm**: v9.0.0 or later.
- **iPhone**: Running iOS 15+ with the free **Expo Go** app installed from the App Store.
- Both laptop and phone connected to the **same Wi-Fi network**.

---

### Step 1: Start the Backend Server

Open a terminal (PowerShell on Windows) and run:
```powershell
cd server
npm install
node --watch server.js
```
The server will start on port `3001`:
```text
Maze controller server running on port 3001
Health check: http://localhost:3001/health
```

---

### Step 2: Start the Laptop Web Client

Open a second terminal and run:
```powershell
cd client
npm install
npm run dev
```
Vite will start with host exposure enabled (`--host`):
```text
  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.1.150:5173/
```
Open `http://localhost:5173/` in your laptop browser to display the maze and your 6-character room code (e.g. `ABC123`).

---

### Step 3: Start the Mobile Controller App

Open a third terminal and run:
```powershell
cd mobile
npm install
npx expo start --lan
```
1. Open the **Camera** on your iPhone and scan the terminal QR code (or open **Expo Go** and select the project under *Recently in Development*).
2. The app will launch and automatically detect your laptop's LAN IP.
3. Enter the 6-character room code from your laptop and press **Pair**.

---

## 3. Configuring the Backend URL

On physical mobile devices, `localhost` points to the phone itself. The mobile app provides three mechanisms to resolve the laptop's LAN address:

1. **Auto-Detection (Default in Expo Go)**:
   The app extracts the host IP from `Constants.expoConfig?.hostUri` (e.g. `192.168.1.150:8081` $\rightarrow$ `http://192.168.1.150:3001`).
2. **In-App Settings Screen (⚙ Button)**:
   Tap the gear icon in the top right to open the **Backend Server Address** modal. You can:
   - Type any custom IP or hostname.
   - Tap **"⚡ Use detected Expo LAN IP"** to autofill.
   - Tap **"Test Connection"** to send an HTTP `/health` probe before saving.
   - Your choice is persisted in device `AsyncStorage`.
3. **Environment Variable**:
   Create `mobile/.env` from `mobile/.env.example`:
   ```bash
   EXPO_PUBLIC_SERVER_URL=http://192.168.1.150:3001
   ```

---

## 4. Room Pairing & Reconnection Architecture

```
Phone Controller (mobile/)                 Backend Server (server/)                 Laptop Client (client/)
       │                                              │                                        │
       │                                              │ <─── socket.emit("create-room") ────── │
       │                                              │ ─── ack({ roomCode: "ABC123" }) ─────> │
       │                                              │                                        │
       │ ─── socket.emit("join-room", { ... }) ─────> │                                        │
       │ <── ack({ success: true, state }) ────────── │ ─── io.to().emit("room-state") ──────> │
       │                                              │                                        │
       │ ─── socket.emit("controller-data") (30Hz) ─> │ ─── io.to().emit("controller-data") ──> │
       │                                              │                                        │
       │ ─── socket.emit("leave-room") ─────────────> │                                        │
       │ <── ack({ success: true }) ───────────────── │ ─── io.to().emit("room-state") ──────> │
       │     (isPaired = false)                       │     (controllerConnected = false)      │
```

- **Authoritative Server State**: The server maintains a canonical map of active rooms. Sockets store `socket.data.roomCode` and `socket.data.role`.
- **Single-Controller Guarantee**: If another socket attempts to join an occupied room, the server rejects the request with a descriptive error.
- **Explicit Unpair (`leave-room`)**: Tapping **Unpair** on the phone immediately emits `leave-room`. The server verifies sender identity (`room.controllerId === socket.id`), unassigns the controller, removes the socket from the room, and broadcasts `room-state` so the laptop updates instantly.
- **Connection != Pairing**: A socket connection to the server does not imply room membership. UI badges clearly separate `SERVER ONLINE / OFFLINE` from `CONTROLLER PAIRED / WAITING`.
- **30-Second Grace Period**: If the laptop refreshes or experiences a brief network drop, the room is kept alive for 30 seconds before deletion. If the laptop or controller reconnects within that window, the room code and session are preserved.
- **Idempotent Operations**: Repeated unpair or re-pair calls are safely handled without throwing uncaught exceptions.

---

## 5. Motion Calibration & Sensor Processing

```
Raw Sensor (30Hz)
  │ (DeviceMotion gamma/beta or Accelerometer X/Y)
  ▼
Baseline Subtraction: delta = (raw - neutralBaseline) * sensitivity
  │
  ▼
Deadzone Gate: threshold = 2.0°
  │ (if |delta| < 2.0° -> 0; prevents micro-tremor jitter at rest)
  ▼
Exponential Low-Pass Filter: smoothed = prev + alpha * (delta - prev)
  │ (alpha = 0.35; removes sensor noise and network step-jitter)
  ▼
Clamped Output: [-45°, +45°] (normalized to [-1.0, 1.0] on canvas)
```

1. **Axis Mapping**:
   - Steering (Left / Right): Roll / $\gamma$ or Accelerometer $X$.
   - Speed / Pitch (Forward / Backward): Pitch / $\beta$ or Accelerometer $-Y$.
2. **Neutral Calibration**:
   - Resting posture for a phone held in hands is typically tilted forward $30^\circ$ to $45^\circ$.
   - On activation, the controller auto-calibrates the initial angle so the ball does not immediately accelerate.
   - Tapping **"🎯 Calibrate Neutral Position"** re-baselines the current resting angle at any time.
3. **Sensitivity Control**:
   - Configurable multiplier from `0.5x` (Precise) to `2.5x` (Nitro) via the in-app stepper/presets.
4. **Gated Transmission**:
   - Sensors only stream when `isPaired === true` and the socket is actively connected.
   - On unpair or disconnect, values are immediately clamped to zero.

---

## 6. Latency Measurement & Telemetry

- **Measurement Approach**: The mobile app emits a lightweight `ping-latency` event every 3 seconds when connected. The server acknowledges immediately with a timestamp callback, yielding an exact round-trip time (RTT in ms).
- **Typical Performance**:
  - 5GHz Wi-Fi: **5ms – 20ms** (imperceptible delay).
  - 2.4GHz Wi-Fi: **20ms – 60ms** (smooth gameplay).
  - Congested networks: $> 100\text{ms}$ (warning shown in telemetry pill).
- **Limitations**:
  - Wi-Fi airtime congestion or bluetooth interference can create jitter spikes.
  - The laptop canvas implements internal exponential motion smoothing ($k = 15/\text{s}$) to bridge any missing or late packets cleanly.

---

## 7. Windows, iPhone & Firewall Troubleshooting

### Problem: Phone Shows "Server Unreachable" / Red Banner
1. **Verify Same Wi-Fi**: On iPhone, go to **Settings > Wi-Fi** and ensure you are on the same SSID as your laptop (disable mobile data temporarily if your router isolates subnets).
2. **Windows Defender Firewall (Crucial)**:
   By default, Windows blocks incoming connections on non-standard ports. Open PowerShell as Administrator and run:
   ```powershell
   netsh advfirewall firewall add rule name="ABGC Node Server 3001" dir=in action=allow protocol=TCP localport=3001
   netsh advfirewall firewall add rule name="ABGC Vite Dev 5173" dir=in action=allow protocol=TCP localport=5173
   ```
3. **Verify IP in Settings**: Tap the ⚙ icon on the phone and verify the IP matches your laptop's Wi-Fi IP (`ipconfig` in cmd).

### Problem: Motion Sensors Inactive / Denied
- On iOS Safari (web controller), iOS requires an explicit user tap to grant motion access.
- On the native app (Expo), ensure **Motion & Fitness** is enabled in **Settings > Privacy & Security > Motion & Fitness**.
- If sensors are unavailable, use the built-in **Virtual Joystick** for touch-based navigation.

---

## 8. Building Standalone iOS Binaries (EAS Build)

When you are ready to create a standalone `.ipa` for TestFlight or internal testing without Expo Go:

1. Install EAS CLI:
   ```bash
   npm install -g eas-cli
   ```
2. Log into your Expo account:
   ```bash
   eas login
   ```
3. Run the automated build:
   ```bash
   cd mobile

   # Build for iOS Simulator (test on Mac without signing certificates)
   eas build --profile development --platform ios

   # Build for TestFlight / Physical iPhone Distribution
   eas build --profile preview --platform ios
   ```
The configuration in `mobile/eas.json` and `mobile/app.json` includes `NSMotionUsageDescription` and bundle ID `com.anythingbutagamecontroller.mobile`.

---

## 9. Automated & Manual Test Checklist

### Automated Regression Tests (Server)
Run in `server/`:
```bash
npm test
```
**Results: 10/10 tests pass**:
- [x] Room creation with 6-character code.
- [x] Controller connection and initial state validation.
- [x] Valid room join with acknowledgement.
- [x] Motion data forwarding to laptop socket.
- [x] Rejection of invalid / non-existent room codes.
- [x] Rejection of malformed room codes.
- [x] Controller disconnection updates `room-state` on laptop.
- [x] Role conflict rejection (second controller cannot steal room).
- [x] 30-second grace period preserves room during laptop remounts.
- [x] Explicit `leave-room` clears controller and notifies laptop immediately.
- [x] Repeated unpair calls are safe and idempotent.
- [x] Unauthorized sockets cannot unpair another device's room.

### Client Build & Lint Checks
Run in `client/`:
```bash
npm run lint    # 0 errors, 0 warnings
npm run build   # Vite builds production bundle in < 260ms
```

### Mobile TypeScript Validation
Run in `mobile/`:
```bash
npm run type-check  # tsc --noEmit: 0 errors
```

### Manual Physical Device Regression Checklist
- [x] **Room Code Display**: Laptop opens at `http://localhost:5173` and displays a 6-character code.
- [x] **Connection & Discovery**: Mobile app starts on iPhone, auto-detects laptop IP, shows `ONLINE` pill.
- [x] **Pairing**: Entering the room code transitions both devices to `CONTROLLER PAIRED`.
- [x] **Tilt Steering**: Tilting phone moves the blue ball on the laptop screen with smooth interpolation.
- [x] **Neutral Calibration**: Tapping **Calibrate** sets current resting angle as center and preserves calibration across mode switches.
- [x] **Non-Scrolling Joystick**: Dragging the on-screen joystick up, down, left, and right steers the ball without scrolling the screen.
- [x] **Joystick Neutral Reset**: Releasing the joystick or switching apps immediately resets movement to zero.
- [x] **Repeated Mode Switching**: Switching between Tilt Motion and Joystick multiple times keeps both control methods responsive.
- [x] **Unpair Synchronization**: Tapping **Unpair** immediately resets the laptop badge to `WAITING FOR CONTROLLER`.
- [x] **Keyboard Fallback**: Arrow keys and `W A S D` immediately control the ball when phone is unpaired.
- [x] **Re-Pairing**: Re-entering the same room code re-pairs instantly without restarting either server or client.
- [x] **App Backgrounding**: Sending the app to background pauses sensors and resumes cleanly upon return.
