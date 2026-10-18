# Anything but a Game Controller — iPhone Controller App (Mobile)

Real-time iPhone motion controller built with **React Native**, **Expo SDK 57** (compatible with the current iOS App Store version of Expo Go), **TypeScript**, **`expo-sensors`**, and **`socket.io-client`**.

Pairs with the laptop maze arcade game over local Wi-Fi, turning your physical iPhone into a zero-latency motion steering wheel.

---

## Features

- **Device Motion & Accelerometer**: 30Hz high-frequency sensor capture via `expo-sensors`.
- **Neutral Baseline Calibration**: One-tap resting angle calibration with automatic initial baseline capture.
- **Deadzone & Exponential Smoothing**: Eliminates resting hand tremors and network packet jitter.
- **Backup Virtual Joystick**: Smooth dual-axis touch thumbstick for playing without tilting (claims gestures with zero page scrolling).
- **Live Latency Telemetry**: Real-time Socket.IO WebSocket round-trip time (RTT in ms).
- **LAN Auto-Detection**: Auto-resolves your Windows laptop's LAN IP from Expo's Metro server (`hostUri`).
- **Interactive Server Settings**: In-app modal (⚙) to configure custom IP, test connectivity, and view firewall instructions.
- **Graceful Lifecycle Management**: Pauses sensors when app is sent to background; cleanly unpairs and gates movement to active room state.

---

## Quick Start (Development with Expo Go)

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Expo Development Server
```bash
npm start
```
Or to explicitly bind to your local area network:
```bash
npx expo start --lan
```

### 3. Open on Your iPhone
1. Download **Expo Go** from the iOS App Store.
2. Ensure your iPhone is connected to the **same Wi-Fi network** as your Windows laptop.
3. Open the Camera app on your iPhone and scan the QR code printed in your terminal (or tap the project under *Recently in Development* in Expo Go).

---

## Scripts

- `npm start`: Starts Metro bundler.
- `npm run type-check`: Runs TypeScript checks (`tsc --noEmit`).
- `npm run ios`: Starts Expo targeting iOS simulator (macOS only).
- `npm run android`: Starts Expo targeting Android emulator/device.
- `npm run web`: Starts Expo in browser.

---

## EAS Build (Standalone iOS App)

When ready to package a standalone `.ipa` for TestFlight or Ad-Hoc distribution without Expo Go:

1. Install EAS CLI globally:
   ```bash
   npm install -g eas-cli
   ```
2. Log in with your Expo account:
   ```bash
   eas login
   ```
3. Build for iOS (Simulator or Internal Distribution):
   ```bash
   # Simulator build (run on macOS Xcode simulator)
   eas build --profile development --platform ios

   # Ad-Hoc / Internal TestFlight distribution
   eas build --profile preview --platform ios
   ```
Configuration is defined in `eas.json` with `com.anythingbutagamecontroller.mobile` bundle ID and `NSMotionUsageDescription`.
