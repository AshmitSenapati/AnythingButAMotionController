import { io, Socket } from 'socket.io-client';
import {
  ConnectionStatus,
  ControllerDataPayload,
  JoinRoomResult,
  LeaveRoomResult,
  RoomState,
} from '../types';

export type StatusListener = (status: ConnectionStatus, error?: string) => void;
export type LatencyListener = (ms: number | null) => void;
export type RoomStateListener = (state: RoomState | null) => void;

class SocketService {
  private socket: Socket | null = null;
  private currentUrl = '';
  private pairedRoom: string | null = null;
  private isPaired = false;
  private lastSentTime = 0;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  private statusListeners = new Set<StatusListener>();
  private latencyListeners = new Set<LatencyListener>();
  private roomStateListeners = new Set<RoomStateListener>();

  public status: ConnectionStatus = 'disconnected';
  public latency: number | null = null;
  public activeRoomState: RoomState | null = null;

  connect(url: string) {
    if (this.socket && this.currentUrl === url && this.socket.connected) {
      return;
    }

    this.disconnect();
    this.currentUrl = url;
    this.notifyStatus('connecting');

    console.log(`[SOCKET] Connecting to: ${url}`);

    const socket = io(url, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      transports: ['polling', 'websocket'],
    });

    this.socket = socket;

    socket.on('connect', () => {
      console.log(`[SOCKET] Connected to: ${url} (socket ID: ${socket.id})`);
      this.notifyStatus('connected');
      this.startLatencyPing();

      // If we were previously paired before a disconnect, attempt to re-join
      if (this.pairedRoom) {
        console.log(
          `[PAIR RECONNECT] Attempting re-join for room "${this.pairedRoom}" on ${this.currentUrl}`
        );
        socket
          .timeout(5000)
          .emit(
            'join-room',
            { roomCode: this.pairedRoom, role: 'controller' },
            (err: unknown, result: JoinRoomResult) => {
              if (err || !result?.success) {
                console.warn(
                  `[PAIR RECONNECT FAILED] Room "${this.pairedRoom}": ${
                    err ? 'timeout' : result?.error
                  } (server: ${this.currentUrl})`
                );
                this.isPaired = false;
                this.pairedRoom = null;
                this.activeRoomState = null;
                this.notifyRoomState(null);
                this.notifyStatus(
                  'connected',
                  err
                    ? 'Reconnection timed out. Please pair again.'
                    : result?.error || 'Room expired. Please pair again.'
                );
              } else {
                console.log(
                  `[PAIR RECONNECT SUCCESS] Re-joined room "${result.roomCode}" on ${this.currentUrl}`
                );
                this.isPaired = true;
                this.pairedRoom = result.roomCode || this.pairedRoom;
                this.activeRoomState = result.state || null;
                this.notifyRoomState(this.activeRoomState);
              }
            }
          );
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(
        `[SOCKET] Disconnected from: ${this.currentUrl} (reason: ${reason})`
      );
      this.stopLatencyPing();
      this.notifyStatus('disconnected', `Disconnected: ${reason}`);
    });

    socket.io.on('reconnect_attempt', (attempt) => {
      console.log(
        `[SOCKET] Reconnect attempt #${attempt} to ${this.currentUrl}`
      );
      this.notifyStatus('reconnecting');
    });

    socket.on('connect_error', (err) => {
      console.warn(
        `[SOCKET] Connection error to ${this.currentUrl}: ${
          err.message || 'Server unreachable'
        }`
      );
      this.stopLatencyPing();
      this.notifyStatus(
        'error',
        `Connection failed: ${err.message || 'Server unreachable'}`
      );
    });

    socket.on('room-state', (state: RoomState) => {
      if (this.pairedRoom && state?.roomCode === this.pairedRoom) {
        this.activeRoomState = state;
        this.notifyRoomState(state);

        if (!state.controllerConnected && this.isPaired) {
          // Authoritatively removed from room
          console.log(
            `[ROOM STATE] Controller authoritatively removed from room "${this.pairedRoom}"`
          );
          this.isPaired = false;
          this.pairedRoom = null;
          this.notifyStatus(
            'connected',
            'Controller was removed or disconnected from room.'
          );
        }
      }
    });
  }

  disconnect() {
    this.stopLatencyPing();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.notifyStatus('disconnected');
  }

  joinRoom(roomCode: string): Promise<JoinRoomResult> {
    return new Promise((resolve) => {
      const code = roomCode.trim().toUpperCase();
      console.log(
        `[PAIR ATTEMPT] Requesting join for room "${code}" on ${this.currentUrl}`
      );
      if (!this.socket?.connected) {
        console.warn(
          `[PAIR FAILED] Socket not connected to server: ${this.currentUrl}`
        );
        resolve({
          success: false,
          error: 'Not connected to server. Check server address.',
        });
        return;
      }

      this.socket
        .timeout(6000)
        .emit(
          'join-room',
          { roomCode: code, role: 'controller' },
          (err: unknown, result: JoinRoomResult) => {
            if (err) {
              console.warn(
                `[PAIR TIMEOUT] Server did not acknowledge join-room for "${code}" within 6s (server: ${this.currentUrl})`
              );
              resolve({
                success: false,
                error: 'Connection timed out. Server did not acknowledge.',
              });
              return;
            }

            if (!result?.success) {
              console.warn(
                `[PAIR REJECTED] Server rejected join for room "${code}": "${result?.error}" (server: ${this.currentUrl})`
              );
              resolve({
                success: false,
                error: result?.error || 'Failed to join room.',
              });
              return;
            }

            console.log(
              `[PAIR SUCCESS] Joined room "${result.roomCode || code}" on ${this.currentUrl}`
            );
            this.isPaired = true;
            this.pairedRoom = result.roomCode || code;
            this.activeRoomState = result.state || null;
            this.notifyRoomState(this.activeRoomState);
            resolve(result);
          }
        );
    });
  }

  leaveRoom(): Promise<LeaveRoomResult> {
    return new Promise((resolve) => {
      const currentRoom = this.pairedRoom;
      console.log(
        `[UNPAIR] Leaving room "${currentRoom}" on ${this.currentUrl}`
      );

      // Immediate local state reset
      this.isPaired = false;
      this.pairedRoom = null;
      this.activeRoomState = null;
      this.notifyRoomState(null);

      if (!this.socket?.connected || !currentRoom) {
        resolve({ success: true });
        return;
      }

      this.socket
        .timeout(5000)
        .emit(
          'leave-room',
          { roomCode: currentRoom, role: 'controller' },
          (err: unknown, result: LeaveRoomResult) => {
            if (err) {
              resolve({ success: true, error: 'Unpair timed out.' });
              return;
            }
            resolve(result || { success: true });
          }
        );
    });
  }

  sendControllerData(tilt: number, acceleration: number): boolean {
    if (!this.socket?.connected || !this.isPaired || !this.pairedRoom) {
      return false;
    }

    const now = Date.now();
    // Throttle to ~30Hz (33ms)
    if (now - this.lastSentTime < 30) {
      return false;
    }

    this.lastSentTime = now;

    const payload: ControllerDataPayload = {
      tilt: Number(tilt.toFixed(2)),
      acceleration: Number(acceleration.toFixed(2)),
    };

    this.socket.emit('controller-data', payload);
    return true;
  }

  private startLatencyPing() {
    this.stopLatencyPing();
    const ping = () => {
      if (!this.socket?.connected) return;
      const start = Date.now();
      this.socket.timeout(3000).emit('ping-latency', (err: unknown) => {
        if (!err) {
          const rtt = Date.now() - start;
          this.latency = rtt;
          this.notifyLatency(rtt);
        } else {
          this.latency = null;
          this.notifyLatency(null);
        }
      });
    };

    ping();
    this.pingInterval = setInterval(ping, 3000);
  }

  private stopLatencyPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.latency = null;
    this.notifyLatency(null);
  }

  // --- Listeners and Subscriptions ---

  subscribeStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  subscribeLatency(listener: LatencyListener): () => void {
    this.latencyListeners.add(listener);
    listener(this.latency);
    return () => this.latencyListeners.delete(listener);
  }

  subscribeRoomState(listener: RoomStateListener): () => void {
    this.roomStateListeners.add(listener);
    listener(this.activeRoomState);
    return () => this.roomStateListeners.delete(listener);
  }

  private notifyStatus(status: ConnectionStatus, error?: string) {
    this.status = status;
    this.statusListeners.forEach((l) => l(status, error));
  }

  private notifyLatency(ms: number | null) {
    this.latency = ms;
    this.latencyListeners.forEach((l) => l(ms));
  }

  private notifyRoomState(state: RoomState | null) {
    this.activeRoomState = state;
    this.roomStateListeners.forEach((l) => l(state));
  }

  getIsPaired() {
    return this.isPaired;
  }

  getPairedRoom() {
    return this.pairedRoom;
  }

  isConnected() {
    return Boolean(this.socket?.connected);
  }
}

export const socketService = new SocketService();
