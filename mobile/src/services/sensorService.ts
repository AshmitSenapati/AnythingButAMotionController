import { Accelerometer, DeviceMotion } from 'expo-sensors';
import { AppState, AppStateStatus } from 'react-native';
import { MotionReading, SensorStatus } from '../types';

export type SensorDataListener = (reading: MotionReading) => void;
export type SensorStatusListener = (status: SensorStatus) => void;

class SensorService {
  private subscription: { remove: () => void } | null = null;
  private sensorMode: 'deviceMotion' | 'accelerometer' | 'none' = 'none';

  private neutralBaseline = { x: 0, y: 0 };
  private calibrated = false;
  private latestRaw = { x: 0, y: 0, z: 0 };
  private smoothed = { x: 0, y: 0 };

  private sensitivity = 1.0;
  private deadzoneDegrees = 2.0;
  private isRunning = false;

  private dataListeners = new Set<SensorDataListener>();
  private statusListeners = new Set<SensorStatusListener>();

  public status: SensorStatus = 'checking';

  constructor() {
    AppState.addEventListener('change', this.handleAppStateChange);
  }

  private handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (nextAppState === 'active') {
      if (this.isRunning && !this.subscription) {
        this.resume();
      }
    } else {
      if (this.subscription) {
        this.pause();
      }
    }
  };

  async checkAvailability(): Promise<SensorStatus> {
    this.status = 'checking';
    this.notifyStatus('checking');

    try {
      const dmAvailable = await DeviceMotion.isAvailableAsync();
      if (dmAvailable) {
        const { status } = await DeviceMotion.requestPermissionsAsync();
        if (status === 'granted') {
          this.sensorMode = 'deviceMotion';
          this.status = 'available';
          this.notifyStatus('available');
          return 'available';
        }
      }

      const accAvailable = await Accelerometer.isAvailableAsync();
      if (accAvailable) {
        const { status } = await Accelerometer.requestPermissionsAsync();
        if (status === 'granted') {
          this.sensorMode = 'accelerometer';
          this.status = 'available';
          this.notifyStatus('available');
          return 'available';
        } else {
          this.sensorMode = 'none';
          this.status = 'denied';
          this.notifyStatus('denied');
          return 'denied';
        }
      }

      this.sensorMode = 'none';
      this.status = 'unavailable';
      this.notifyStatus('unavailable');
      return 'unavailable';
    } catch (err) {
      console.warn('Sensor availability check error:', err);
      this.sensorMode = 'none';
      this.status = 'unavailable';
      this.notifyStatus('unavailable');
      return 'unavailable';
    }
  }

  async start(): Promise<boolean> {
    if (this.subscription) return true;

    if (this.status !== 'available' && this.status !== 'active') {
      const available = await this.checkAvailability();
      if (available !== 'available') {
        return false;
      }
    }

    this.isRunning = true;
    this.smoothed = { x: 0, y: 0 };

    if (this.sensorMode === 'deviceMotion') {
      DeviceMotion.setUpdateInterval(33);
      this.subscription = DeviceMotion.addListener((data) => {
        let rawDegreesX = 0;
        let rawDegreesY = 0;

        if (data.rotation) {
          // beta: pitch (forward/back), gamma: roll (left/right)
          rawDegreesX = (data.rotation.gamma * 180) / Math.PI;
          rawDegreesY = (data.rotation.beta * 180) / Math.PI;
        } else if (data.accelerationIncludingGravity) {
          // Fallback if rotation not calculated
          rawDegreesX = (data.accelerationIncludingGravity.x / 9.8) * 45;
          rawDegreesY = (-data.accelerationIncludingGravity.y / 9.8) * 45;
        }

        this.processReading(rawDegreesX, rawDegreesY, 0);
      });
    } else if (this.sensorMode === 'accelerometer') {
      Accelerometer.setUpdateInterval(33);
      this.subscription = Accelerometer.addListener((data) => {
        // In portrait mode: x is roll (left/right), y is pitch (forward/back)
        const rawDegreesX = data.x * 45;
        const rawDegreesY = -data.y * 45;
        this.processReading(rawDegreesX, rawDegreesY, data.z);
      });
    }

    this.status = 'active';
    this.notifyStatus('active');
    return true;
  }

  stop() {
    this.isRunning = false;
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }
    this.smoothed = { x: 0, y: 0 };
    if (this.status === 'active') {
      this.status = 'available';
      this.notifyStatus('available');
    }
  }

  private pause() {
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }
  }

  private resume() {
    if (this.isRunning) {
      this.start();
    }
  }

  private processReading(rawX: number, rawY: number, rawZ: number) {
    this.latestRaw = { x: rawX, y: rawY, z: rawZ };

    // Auto-calibrate on the very first reading
    if (!this.calibrated) {
      this.neutralBaseline = { x: rawX, y: rawY };
      this.calibrated = true;
    }

    // Subtract baseline
    const deltaX = (rawX - this.neutralBaseline.x) * this.sensitivity;
    const deltaY = (rawY - this.neutralBaseline.y) * this.sensitivity;

    // Apply deadzone to eliminate resting hand tremors
    const dz = this.deadzoneDegrees;
    const deadzoneX =
      Math.abs(deltaX) < dz ? 0 : deltaX - Math.sign(deltaX) * dz;
    const deadzoneY =
      Math.abs(deltaY) < dz ? 0 : deltaY - Math.sign(deltaY) * dz;

    // Exponential smoothing filter (alpha = 0.35)
    const alpha = 0.35;
    this.smoothed.x = this.smoothed.x + alpha * (deadzoneX - this.smoothed.x);
    this.smoothed.y = this.smoothed.y + alpha * (deadzoneY - this.smoothed.y);

    // Clamp to -45 to +45 degrees
    const clampedTilt = Math.max(-45, Math.min(45, this.smoothed.x));
    const clampedAcceleration = Math.max(-45, Math.min(45, this.smoothed.y));

    // Normalized -1 to 1 for indicators
    const normalizedX = Math.max(-1, Math.min(1, clampedTilt / 25));
    const normalizedY = Math.max(-1, Math.min(1, clampedAcceleration / 25));

    const reading: MotionReading = {
      tilt: clampedTilt,
      acceleration: clampedAcceleration,
      normalizedX,
      normalizedY,
      rawX,
      rawY,
      rawZ,
    };

    this.dataListeners.forEach((l) => l(reading));
  }

  calibrate() {
    this.neutralBaseline = {
      x: this.latestRaw.x,
      y: this.latestRaw.y,
    };
    this.calibrated = true;
    this.smoothed = { x: 0, y: 0 };
  }

  resetCalibration() {
    this.calibrated = false;
    this.neutralBaseline = { x: 0, y: 0 };
  }

  setSensitivity(val: number) {
    this.sensitivity = Math.max(0.5, Math.min(2.5, val));
  }

  getSensitivity() {
    return this.sensitivity;
  }

  setDeadzone(degrees: number) {
    this.deadzoneDegrees = Math.max(0, Math.min(10, degrees));
  }

  getDeadzone() {
    return this.deadzoneDegrees;
  }

  isCalibrated() {
    return this.calibrated;
  }

  subscribeData(listener: SensorDataListener): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  subscribeStatus(listener: SensorStatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  private notifyStatus(status: SensorStatus) {
    this.status = status;
    this.statusListeners.forEach((l) => l(status));
  }
}

export const sensorService = new SensorService();
