# Anything but a Game Controller

A real-time arcade maze game where your smartphone acts as an interactive motion and touch controller paired with a laptop browser game.

- **Frontend**: React 19 + Vite 6 web application running a 60 FPS HTML5 Canvas maze game, hosted on [Vercel](https://anything-but-a-motion-controller.vercel.app).
- **Backend**: Node.js + Express + Socket.IO 4.8 real-time authoritative room server, hosted on [Render](https://anythingbutamotioncontroller.onrender.com).
- **Mobile Controller**: React Native + Expo SDK 57 mobile application supporting tilt steering and virtual joystick input.

---

## Features

- **Room-Code-Based Pairing**: Connect laptop and phone in seconds using a 6-character room code; room codes automatically persist across laptop browser refreshes.
- **Real-Time Socket.IO Networking**: Ultra-low-latency bi-directional event stream between laptop and mobile device.
- **Dual Control Options**:
  - **Tilt Motion**: Physical gyroscope/accelerometer steering with one-tap neutral resting-angle calibration.
  - **Virtual Joystick**: On-screen touch thumbstick with locked touch responsiveness (no page scrolling).
- **Browser-Based Laptop Gameplay**: Canvas 2D engine with smooth physics, wall collision detection, 3 difficulty tiers (Easy, Hard, Expert), and keyboard fallback (`W A S D` or arrow keys).
- **Standalone Android APK**: Directly installable APK that connects to the deployed game without requiring Expo Go or an Expo account.
- **Cross-Platform Expo App**: Full development support for running the controller on iOS and Android via Expo Go.

---

## Android Setup (Standalone APK)

You can install the pre-built Android controller APK directly onto your Android device:

- **Download APK**: [application-03ddafad-abba-436b-83ce-646c74bda177.apk](./application-03ddafad-abba-436b-83ce-646c74bda177.apk)

> [!NOTE]
> If cloning or browsing this repository on GitHub, ensure `application-03ddafad-abba-436b-83ce-646c74bda177.apk` has been placed in the repository root for the download link above to resolve.

### Installation Instructions

1. Download [`application-03ddafad-abba-436b-83ce-646c74bda177.apk`](./application-03ddafad-abba-436b-83ce-646c74bda177.apk) directly to your Android phone (or transfer it from your computer via USB).
2. Open the downloaded `.apk` file from your device's notification bar or file manager.
3. If prompted by Android security (*"Install unknown apps"*), tap **Settings** and toggle **Allow from this source**.
4. Tap **Install** and open **Anything but a Game Controller**.
5. The standalone APK works completely independently—no Expo Go installation or Expo account required. It automatically connects to the production Render backend (`https://anythingbutamotioncontroller.onrender.com`).
6. Open the game on your laptop at [https://anything-but-a-motion-controller.vercel.app](https://anything-but-a-motion-controller.vercel.app).
7. Enter the 6-character room code shown on the laptop into the phone and tap **JOIN SESSION**.

---

## iOS Setup (Expo Go)

To run the mobile controller on an iPhone, use the existing Expo mobile project:

1. Install **Expo Go** from the iOS App Store on your iPhone.
2. Ensure your iPhone and laptop are connected to the **same Wi-Fi network**.
3. Open a terminal on your computer and start the Expo development server:
   ```bash
   cd mobile
   npm install
   npx expo start --lan
   ```
4. Open the native **Camera** app on your iPhone, scan the terminal QR code, and tap the banner to open the app in Expo Go.
5. The iPhone must be able to reach your laptop's local development server and backend on the local network.
6. Open the game in your laptop browser, enter the 6-character room code into the app, and tap **JOIN SESSION**.

> [!IMPORTANT]
> Keep your Expo account credentials private. Never commit authentication tokens or personal credentials to version control.

---

## Local Development

### Prerequisites
- **Node.js**: v18.0.0 or later (v22 recommended)
- **npm**: v9.0.0 or later

### 1. Start the Backend Server
```bash
cd server
npm install
npm run dev
```
The server runs on port `3001` with Node's native file watcher (`node --watch server.js`). Health check available at `http://localhost:3001/health`.

### 2. Start the Laptop Web Game
In a second terminal:
```bash
cd client
npm install
npm run dev
```
Vite runs on port `5173` with network host access enabled. Open `http://localhost:5173` in your browser.

### 3. Start the Mobile Controller App
In a third terminal:
```bash
cd mobile
npm install
npm start
```
Use `npx expo start --lan` when testing with a physical device on the same local network.

---

## Environment Variables & Configuration

| Service | Variable | Purpose | Local Default | Production URL |
| :--- | :--- | :--- | :--- | :--- |
| **Backend** (`server/`) | `PORT` | HTTP/Socket.IO port | `3001` | Assigned by Render |
| **Backend** (`server/`) | `CLIENT_ORIGIN` | Allowed CORS frontend origin | `http://localhost:5173` | `https://anything-but-a-motion-controller.vercel.app` |
| **Frontend** (`client/`) | `VITE_SERVER_URL` | Socket.IO backend target | `http://localhost:3001` | `https://anythingbutamotioncontroller.onrender.com` |
| **Mobile** (`mobile/`) | `EXPO_PUBLIC_SERVER_URL` | Target backend for controller | `http://<LAN_IP>:3001` | `https://anythingbutamotioncontroller.onrender.com` |

*Tip: The mobile app also includes an in-app settings modal (⚙) to test connections and switch between local LAN IPs and the production Render backend at runtime.*

---

## Deployment Information

- **Frontend Deployment (Vercel)**:
  - Repository root: `client`
  - Framework: Vite
  - Build command: `npm run build`
  - Output directory: `dist`
  - Production URL: `https://anything-but-a-motion-controller.vercel.app`
- **Backend Deployment (Render)**:
  - Repository root: `server`
  - Build command: `npm install`
  - Start command: `npm start`
  - Health check path: `/health`
  - Production URL: `https://anythingbutamotioncontroller.onrender.com`
