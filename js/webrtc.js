/**
 * CineSync - WebRTC & PeerJS Synchronizer
 * Handles real-time video/audio streaming, peer discovery, low-latency control sync, and live chat.
 */

export class SyncEngine {
  constructor(options = {}) {
    this.isHost = options.isHost || false;
    this.userName = options.userName || 'Anonymous';
    this.userColor = options.userColor || this.getRandomColor();
    this.roomId = options.roomId || null;

    // Callbacks
    this.onStreamReceived = options.onStreamReceived || (() => {});
    this.onPeersUpdated = options.onPeersUpdated || (() => {});
    this.onChatReceived = options.onChatReceived || (() => {});
    this.onReactionReceived = options.onReactionReceived || (() => {});
    this.onStateSync = options.onStateSync || (() => {});
    this.onActionExecuted = options.onActionExecuted || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onClientActionRequest = options.onClientActionRequest || (() => {});
    this.onSubtitlesSync = options.onSubtitlesSync || (() => {});

    // Internal State
    this.peer = null;
    this.mediaStream = null;
    this.currentSubtitles = null; // { vttContent, fileName }
    this.hostConn = null; // Client's connection to host
    this.clients = new Map(); // Host's map of client connections: peerId -> { conn, call, name, color }
    this.allowClientControls = true;
    this.heartbeatTimer = null;
    this.isDestroyed = false;
  }

  getRandomColor() {
    const colors = ['#8B5CF6', '#06B6D4', '#10B981', '#F43F5E', '#F59E0B', '#3B82F6', '#EC4899'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /**
   * Initializes Host Peer
   * @param {string} customRoomId
   * @param {MediaStream} initialStream
   */
  async startHost(customRoomId, initialStream) {
    this.isHost = true;
    const randPart = Math.random().toString(36).substring(2, 6) + Math.random().toString(36).substring(2, 5);
    this.roomId = customRoomId || 'tv-' + randPart;
    this.mediaStream = initialStream;

    return new Promise((resolve, reject) => {
      try {
        const PeerClass = window.Peer;
        if (!PeerClass) {
          throw new Error('PeerJS library not loaded. Check internet or local vendor.');
        }

        // Initialize Host Peer with STUN and TURN Relays
        this.peer = new PeerClass(this.roomId, {
          debug: 1,
          pingInterval: 5000,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun.cloudflare.com:3478' },
              {
                urls: [
                  'turn:eu-0.turn.peerjs.com:3478',
                  'turn:us-0.turn.peerjs.com:3478'
                ],
                username: 'peerjs',
                credential: 'peerjsp'
              }
            ],
            sdpSemantics: 'unified-plan'
          }
        });

        this.peer.on('open', (id) => {
          this.roomId = id;
          this.onStatusChange('open', { id, isHost: true });
          this.startHeartbeat();
          resolve(id);
        });

        this.peer.on('connection', (conn) => {
          this.handleHostIncomingConnection(conn);
        });

        this.peer.on('error', (err) => {
          console.error('[SyncEngine Host Error]', err);
          if (err.type === 'unavailable-id') {
            // Room ID collision: retry with randomized suffix
            this.roomId = 'tv-' + Math.random().toString(36).substring(2, 9);
            this.peer.destroy();
            this.startHost(this.roomId, initialStream).then(resolve).catch(reject);
            return;
          }
          this.onStatusChange('error', { error: err });
          reject(err);
        });

        this.peer.on('disconnected', () => {
          this.onStatusChange('disconnected', {});
          if (!this.isDestroyed && this.peer && !this.peer.destroyed) {
            console.warn('[Host Disconnected from broker] Reconnecting...');
            this.peer.reconnect();
          }
        });

        // Periodic signaling keep-alive to prevent background tab sleeping disconnects
        if (this.peerKeepAlive) clearInterval(this.peerKeepAlive);
        this.peerKeepAlive = setInterval(() => {
          if (!this.isDestroyed && this.peer && !this.peer.destroyed && this.peer.disconnected) {
            this.peer.reconnect();
          }
        }, 3000);

      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Sets or updates the active outbound MediaStream for Host
   * @param {MediaStream} stream
   */
  setOutboundStream(stream) {
    this.mediaStream = stream;
    if (!this.isHost) return;

    // Call or replace tracks for all existing clients
    this.clients.forEach((clientInfo, peerId) => {
      try {
        if (clientInfo.call) {
          clientInfo.call.close();
        }
        const call = this.peer.call(peerId, this.mediaStream);
        clientInfo.call = call;
      } catch (err) {
        console.warn('[SyncEngine] Error re-calling client:', peerId, err);
      }
    });
  }

  /**
   * Handles incoming DataConnection on Host
   * @param {DataConnection} conn
   */
  handleHostIncomingConnection(conn) {
    console.log('[SyncEngine Host] Client connected to DataChannel:', conn.peer);

    conn.on('open', () => {
      console.log('[SyncEngine Host] DataChannel opened with client:', conn.peer);
    });

    conn.on('data', (data) => {
      this.handleHostDataReceived(conn, data);
    });

    conn.on('close', () => {
      this.removeClient(conn.peer);
    });

    conn.on('error', (err) => {
      console.warn('[SyncEngine Client Conn Error]', conn.peer, err);
      this.removeClient(conn.peer);
    });
  }

  /**
   * Processes data received by Host from a client
   */
  handleHostDataReceived(conn, data) {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'HELLO': {
        const clientName = data.name || 'Viewer';
        const clientColor = data.color || this.getRandomColor();

        // Save client
        let clientCall = null;
        if (this.mediaStream) {
          try {
            clientCall = this.peer.call(conn.peer, this.mediaStream);
          } catch (err) {
            console.error('[SyncEngine] Call to peer failed:', err);
          }
        }

        this.clients.set(conn.peer, {
          conn,
          call: clientCall,
          name: clientName,
          color: clientColor
        });

        // Broadcast join notice
        this.broadcast({
          type: 'SYSTEM_MSG',
          text: `${clientName} joined the watch party! 🎉`
        });

        // Send active subtitles to newly joined client if available
        if (this.currentSubtitles) {
          conn.send({
            type: 'SUBTITLES_SYNC',
            vttContent: this.currentSubtitles.vttContent,
            fileName: this.currentSubtitles.fileName
          });
        }

        // Send current state and peer list
        this.broadcastPeerList();
        this.onStateSync({ type: 'REQUEST_LATEST_STATE', targetConn: conn });
        break;
      }

      case 'REQUEST_ACTION': {
        if (!this.allowClientControls) {
          conn.send({
            type: 'NOTICE',
            text: 'Viewer playback control is currently turned off by the host.'
          });
          return;
        }

        // Notify Host App to execute action on host video
        this.onClientActionRequest(data.action, data.time, data.sender || 'Viewer');
        break;
      }

      case 'REQUEST_STREAM': {
        if (this.mediaStream) {
          try {
            const clientCall = this.peer.call(conn.peer, this.mediaStream);
            const client = this.clients.get(conn.peer);
            if (client) client.call = clientCall;
          } catch (err) {
            console.error('[SyncEngine] Re-call failed:', err);
          }
        }
        break;
      }

      case 'CHAT': {
        // Relay chat to everyone including sender
        this.broadcast({
          type: 'CHAT',
          text: data.text,
          sender: data.sender || 'Viewer',
          color: data.color || '#8B5CF6',
          time: Date.now()
        });
        break;
      }

      case 'REACTION': {
        // Relay reaction to everyone
        this.broadcast({
          type: 'REACTION',
          emoji: data.emoji,
          sender: data.sender || 'Viewer'
        });
        break;
      }
    }
  }

  removeClient(peerId) {
    if (this.clients.has(peerId)) {
      const client = this.clients.get(peerId);
      this.clients.delete(peerId);
      this.broadcast({
        type: 'SYSTEM_MSG',
        text: `${client.name} left the room.`
      });
      this.broadcastPeerList();
    }
  }

  broadcastPeerList() {
    const peers = [
      { id: this.peer ? this.peer.id : 'host', name: `${this.userName} (Host)`, color: this.userColor, isHost: true }
    ];

    this.clients.forEach((c) => {
      peers.push({
        id: c.conn.peer,
        name: c.name,
        color: c.color,
        isHost: false
      });
    });

    this.onPeersUpdated(peers);
    this.broadcast({
      type: 'PEER_LIST',
      peers
    });
  }

  /**
   * Broadcasts a JSON message to all connected clients
   * @param {Object} data
   */
  broadcast(data) {
    this.clients.forEach((c) => {
      try {
        if (c.conn && c.conn.open) {
          c.conn.send(data);
        }
      } catch (err) {
        console.warn('[SyncEngine Broadcast Error]', err);
      }
    });

    // Also dispatch to local host listeners for chat, reactions, etc.
    if (data.type === 'CHAT') {
      this.onChatReceived(data);
    } else if (data.type === 'REACTION') {
      this.onReactionReceived(data);
    }
  }

  startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.isHost && this.clients.size > 0) {
        this.onStateSync({ type: 'HEARTBEAT_TICK' });
      }
    }, 2500);
  }

  // =========================================================================
  // CLIENT IMPLEMENTATION
  // =========================================================================

  /**
   * Initializes Client and connects to Host Room
   * @param {string} hostRoomId
   */
  async startClient(hostRoomId) {
    this.isHost = false;
    this.roomId = hostRoomId;

    return new Promise((resolve, reject) => {
      try {
        const PeerClass = window.Peer;
        if (!PeerClass) {
          throw new Error('PeerJS library not loaded.');
        }

        const cleanRoomId = String(hostRoomId).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');

        this.peer = new PeerClass({
          debug: 1,
          pingInterval: 5000,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun.cloudflare.com:3478' },
              {
                urls: [
                  'turn:eu-0.turn.peerjs.com:3478',
                  'turn:us-0.turn.peerjs.com:3478'
                ],
                username: 'peerjs',
                credential: 'peerjsp'
              }
            ],
            sdpSemantics: 'unified-plan'
          }
        });

        this.peer.on('open', (myId) => {
          this.onStatusChange('open', { id: myId, isHost: false });
          this.connectToHost(cleanRoomId).then(resolve).catch(reject);
        });

        // Listen for incoming media call from Host
        this.peer.on('call', (call) => {
          try {
            console.log('[SyncEngine Client] Received incoming media call from Host!');
            call.answer(); // Answer without outbound media stream
            call.on('stream', (remoteStream) => {
              console.log('[SyncEngine Client] MediaStream tracks received:', remoteStream.getTracks());
              this.onStreamReceived(remoteStream);
            });
            call.on('error', (err) => {
              console.warn('[SyncEngine Client Call Error]', err);
            });
          } catch (callErr) {
            console.error('[SyncEngine Answer Error]', callErr);
          }
        });

        this.peer.on('error', (err) => {
          console.error('[SyncEngine Client Error]', err);
          let friendly = err.message || err;
          if (err.type === 'peer-unavailable') {
            friendly = `Watch party room "${cleanRoomId}" not found. Verify the Host tab is active and party is started!`;
          }
          this.onStatusChange('error', { error: { message: friendly } });
          reject(new Error(friendly));
        });

      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Connects DataChannel to Host with automatic fast retry and TURN fallback
   * @param {string} hostRoomId
   */
  connectToHost(hostRoomId) {
    const cleanId = String(hostRoomId).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');

    return new Promise((resolve, reject) => {
      console.log('[SyncEngine Client] Initiating connection to host:', cleanId);

      let isDone = false;
      let activeConn = null;

      const setupConn = (conn) => {
        conn.on('open', () => {
          if (isDone) return;
          isDone = true;
          clearTimeout(timeout);
          clearTimeout(retryTimer);
          this.hostConn = conn;
          console.log('[SyncEngine Client] Connected to host DataChannel successfully!');
          this.onStatusChange('connected', { hostRoomId: cleanId });

          // Send HELLO
          conn.send({
            type: 'HELLO',
            name: this.userName,
            color: this.userColor
          });

          // Explicitly request video stream
          conn.send({
            type: 'REQUEST_STREAM'
          });

          resolve(conn);
        });

        conn.on('data', (data) => {
          this.handleClientDataReceived(data);
        });

        conn.on('close', () => {
          this.onStatusChange('disconnected', { reason: 'Host closed the room.' });
        });

        conn.on('error', (err) => {
          console.warn('[SyncEngine Client Conn Attempt Error]:', err);
        });
      };

      activeConn = this.peer.connect(cleanId);
      setupConn(activeConn);

      // Auto-retry once after 6.5s if first attempt was delayed by ICE
      const retryTimer = setTimeout(() => {
        if (!isDone && this.peer && !this.peer.destroyed) {
          console.log('[SyncEngine Client] Retrying connection request to host...');
          try {
            const retryConn = this.peer.connect(cleanId);
            setupConn(retryConn);
          } catch (e) {
            console.warn('Retry error:', e);
          }
        }
      }, 6500);

      const timeout = setTimeout(() => {
        clearTimeout(retryTimer);
        if (!isDone) {
          isDone = true;
          reject(new Error(`Connection to host "${cleanId}" timed out. Make sure the Host tab is open and has started the party!`));
        }
      }, 16000);
    });
  }

  handleClientDataReceived(data) {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'SYNC_STATE':
      case 'HEARTBEAT':
        this.onStateSync(data);
        break;

      case 'ACTION_EXECUTED':
        this.onActionExecuted(data);
        break;

      case 'CHAT':
        this.onChatReceived(data);
        break;

      case 'SYSTEM_MSG':
        this.onChatReceived({
          type: 'SYSTEM',
          text: data.text,
          time: Date.now()
        });
        break;

      case 'REACTION':
        this.onReactionReceived(data);
        break;

      case 'SUBTITLES_SYNC':
        this.onSubtitlesSync(data.vttContent, data.fileName);
        break;

      case 'PEER_LIST':
        this.onPeersUpdated(data.peers || []);
        break;

      case 'NOTICE':
        this.onStatusChange('notice', { message: data.text });
        break;
    }
  }

  // =========================================================================
  // ACTIONS DISPATCHED BY USER
  // =========================================================================

  sendActionRequest(action, time = 0) {
    if (this.isHost) {
      // Host executes directly
      this.onClientActionRequest(action, time, `${this.userName} (Host)`);
    } else if (this.hostConn && this.hostConn.open) {
      this.hostConn.send({
        type: 'REQUEST_ACTION',
        action,
        time,
        sender: this.userName
      });
    }
  }

  sendChat(text) {
    if (!text.trim()) return;
    if (this.isHost) {
      this.broadcast({
        type: 'CHAT',
        text: text.trim(),
        sender: `${this.userName} (Host)`,
        color: this.userColor,
        time: Date.now()
      });
    } else if (this.hostConn && this.hostConn.open) {
      this.hostConn.send({
        type: 'CHAT',
        text: text.trim(),
        sender: this.userName,
        color: this.userColor
      });
    }
  }

  sendReaction(emoji) {
    if (this.isHost) {
      this.broadcast({
        type: 'REACTION',
        emoji,
        sender: `${this.userName} (Host)`
      });
    } else if (this.hostConn && this.hostConn.open) {
      this.hostConn.send({
        type: 'REACTION',
        emoji,
        sender: this.userName
      });
    }
  }

  requestStreamFromHost() {
    if (this.hostConn && this.hostConn.open) {
      this.hostConn.send({ type: 'REQUEST_STREAM' });
    }
  }

  syncSubtitles(vttContent, fileName) {
    this.currentSubtitles = { vttContent, fileName };
    if (this.isHost) {
      this.broadcast({
        type: 'SUBTITLES_SYNC',
        vttContent,
        fileName
      });
    }
  }

  destroy() {
    this.isDestroyed = true;
    if (this.peerKeepAlive) clearInterval(this.peerKeepAlive);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.hostConn) this.hostConn.close();
    this.clients.forEach(c => {
      if (c.conn) c.conn.close();
      if (c.call) c.call.close();
    });
    this.clients.clear();
    if (this.peer) this.peer.destroy();
  }
}
