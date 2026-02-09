// Socket.IO Service for Mobile App
class SocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      console.log('🔌 Connecting to Socket.IO at:', url);

      this.socket = io(url, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      });

      this.socket.on('connect', () => {
        console.log('✅ Socket connected:', this.socket.id);
        this.connected = true;
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('❌ Socket connection error:', error);
        reject(error);
      });

      this.socket.on('disconnect', () => {
        console.log('🔌 Socket disconnected');
        this.connected = false;
      });
    });
  }

  joinRoom(connectionId, userType) {
    if (!this.connected) {
      console.error('Socket not connected');
      return;
    }
    console.log(`Joining room: ${connectionId} as ${userType}`);
    this.socket.emit('join-room', { connectionId, userType });
  }

  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  emit(event, data) {
    if (this.socket && this.connected) {
      this.socket.emit(event, data);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.connected = false;
    }
  }
}

const socketService = new SocketService();