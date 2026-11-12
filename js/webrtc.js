/**
 * CineSync - Rock-Solid WebRTC Engine with High-Performance MQTT Signaling
 * Zero dependency on fragile PeerJS cloud servers.
 * Direct P2P WebRTC data channels and ultra-low-latency media streaming.
 */

// Global STUN & Working TURN Relays for 100% NAT/Firewall & Router Hairpinning Traversal
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:openrelay.metered.ca:80' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  sdpSemantics: 'unified-plan',
  iceCandidatePoolSize: 10
};

// Public High-Capacity WebSocket MQTT Brokers
const BROKER_SERVERS = [
  { host: 'broker.emqx.io', port: 8084, path: '/mqtt' },
  { host: 'test.mosquitto.org', port: 8081, path: '' }
];

/**
 * Lightweight resilient MQTT client wrapper over Paho MQTT
 */
class MqttSignaling {
  constructor(clientId) {
    this.clientId = clientId || 'cs_' + Math.random().toString(36).substring(2, 9);
    this.client = null;
    this.isConnected = false;
    this.subscriptions = new Set();
    this.handlers = []; // Array of (topic, data) => void
  }

  async connect() {
    let lastError = null;

    for (const broker of BROKER_SERVERS) {
      try {
        await this._attemptBroker(broker);
        console.log(`[MqttSignaling] Connected to broker: ${broker.host}:${broker.port}`);
        return;
      } catch (err) {
        console.warn(`[MqttSignaling] Failed to connect to ${broker.host}:${broker.port}:`, err);
        lastError = err;
      }
    }

    throw lastError || new Error('Unable to connect to any signaling broker.');
  }

  _attemptBroker(broker) {
    return new Promise((resolve, reject) => {
      try {
        const PahoClass = window.Paho;
        if (!PahoClass || !PahoClass.MQTT) {
          throw new Error('MQTT library (Paho) is not loaded.');
        }

        const client = new PahoClass.MQTT.Client(
          broker.host,
          Number(broker.port),
          broker.path || '',
          this.clientId
        );

        let timeoutTimer = setTimeout(() => {
          try { client.disconnect(); } catch (e) {}
          reject(new Error(`Connection to broker ${broker.host} timed out.`));
        }, 5000);

        client.onConnectionLost = (resp) => {
          this.isConnected = false;
          if (resp && resp.errorCode !== 0) {
            console.warn('[MqttSignaling] Connection lost:', resp.errorMessage);
          }
        };

        client.onMessageArrived = (message) => {
          try {
            const data = JSON.parse(message.payloadString);
            this.handlers.forEach((h) => {
              try { h(message.destinationName, data); } catch (e) { console.error('[Handler Error]', e); }
            });
          } catch (err) {
            console.warn('[MqttSignaling] Non-JSON message on', message.destinationName, message.payloadString);
          }
        };

        client.connect({
          useSSL: true,
          cleanSession: true,
          keepAliveInterval: 30,
          timeout: 4,
          onSuccess: () => {
            clearTimeout(timeoutTimer);
            this.client = client;
            this.isConnected = true;
            resolve();
          },
          onFailure: (err) => {
            clearTimeout(timeoutTimer);
            reject(err);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  subscribe(topic) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.client) {
        return reject(new Error('Signaling client not connected.'));
      }
      this.client.subscribe(topic, {
        qos: 0,
        onSuccess: () => {
          this.subscriptions.add(topic);
          resolve();
        },
        onFailure: (err) => reject(err)
      });
    });
  }

  send(topic, payload) {
    if (!this.isConnected || !this.client) {
      console.warn('[MqttSignaling] Cannot send, not connected:', topic);
      return;
    }
    try {
      const PahoClass = window.Paho;
      const jsonStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const msg = new PahoClass.MQTT.Message(jsonStr);
      msg.destinationName = topic;
      msg.qos = 0;
      this.client.send(msg);
    } catch (err) {
      console.error('[MqttSignaling Send Error]', topic, err);
    }
  }

  onMessage(handler) {
    this.handlers.push(handler);
  }

  disconnect() {
    this.isConnected = false;
    this.handlers = [];
    if (this.client) {
      try {
        this.client.disconnect();
      } catch (e) {}
      this.client = null;
    }
  }
}

/**
 * CineSync Unified WebRTC Sync Engine
 */
export class SyncEngine {
  constructor(options = {}) {
    this.isHost = options.isHost || false;
    this.userName = options.userName || 'Anonymous';
    this.userColor = options.userColor || this.getRandomColor();
    this.roomId = options.roomId ? this.cleanRoomId(options.roomId) : null;

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
    this.signaling = null;
    this.mediaStream = null;
    this.currentSubtitles = null; // { vttContent, fileName }
    this.allowClientControls = true;
    this.heartbeatTimer = null;
    this.isDestroyed = false;

    // Host State: clientId -> { pc, dc, name, color, pendingCandidates }
    this.clients = new Map();

    // Client State:
    this.clientId = null;
    this.clientPc = null;
    this.clientDc = null;
    this.hostConn = null; // Wrapper with .send() and .open
    this.remoteMediaStream = null;
    this.clientPendingCandidates = [];
  }

  cleanRoomId(id) {
    return String(id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  }

  getRandomColor() {
    const colors = ['#8B5CF6', '#06B6D4', '#10B981', '#F43F5E', '#F59E0B', '#3B82F6', '#EC4899'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  // =========================================================================
  // HOST INITIALIZATION & HANDSHAKE
  // =========================================================================

  /**
   * Starts Host mode, connects to signaling, and listens for viewer joins.
   * @param {string} customRoomId
   * @param {MediaStream} initialStream
   * @returns {Promise<string>} roomId
   */
  async startHost(customRoomId, initialStream) {
    this.isHost = true;
    const randCode = 'tv-' + Math.random().toString(36).substring(2, 6) + Math.random().toString(36).substring(2, 5);
    this.roomId = customRoomId ? this.cleanRoomId(customRoomId) : randCode;
    this.mediaStream = initialStream;

    console.log(`[SyncEngine Host] Starting Watch Party for room: ${this.roomId}`);

    const hostClientId = 'host_' + Math.random().toString(36).substring(2, 8);
    this.signaling = new MqttSignaling(hostClientId);
    await this.signaling.connect();

    // Host subscribes to incoming messages from any viewer in this room
    await this.signaling.subscribe(`cinesync/v2/${this.roomId}/host/#`);

    // Listen for viewer signals
    this.signaling.onMessage((topic, data) => {
      this.handleHostSignalReceived(topic, data);
    });

    this.onStatusChange('open', { id: this.roomId, isHost: true });
    this.startHeartbeat();

    return this.roomId;
  }

  /**
   * Handles incoming signaling messages received on Host
   */
  async handleHostSignalReceived(topic, data) {
    if (!data || !data.type) return;

    const clientId = data.clientId;
    if (!clientId) return;

    switch (data.type) {
      case 'JOIN': {
        console.log(`[SyncEngine Host] Viewer ${data.name || clientId} requested JOIN`);
        await this.handleHostViewerJoin(clientId, data);
        break;
      }

      case 'ANSWER': {
        const clientObj = this.clients.get(clientId);
        if (clientObj && clientObj.pc) {
          if (clientObj.pc.signalingState !== 'have-local-offer') {
            console.log(`[SyncEngine Host] Answer from ${clientId} received in state ${clientObj.pc.signalingState}. Ignoring duplicate.`);
            return;
          }
          try {
            console.log(`[SyncEngine Host] Applying WebRTC Answer from ${clientId}`);
            await clientObj.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

            // Process any early buffered ICE candidates
            if (clientObj.pendingCandidates && clientObj.pendingCandidates.length > 0) {
              for (const cand of clientObj.pendingCandidates) {
                try {
                  const candObj = typeof cand === 'string' ? JSON.parse(cand) : cand;
                  await clientObj.pc.addIceCandidate(new RTCIceCandidate(candObj));
                } catch (ce) {}
              }
              clientObj.pendingCandidates = [];
            }
          } catch (err) {
            console.error(`[SyncEngine Host] Error setting remote description from ${clientId}:`, err);
          }
        }
        break;
      }

      case 'CANDIDATE': {
        if (!data.candidate) return;
        const clientObj = this.clients.get(clientId);
        if (clientObj && clientObj.pc) {
          if (clientObj.pc.remoteDescription && clientObj.pc.remoteDescription.type) {
            try {
              const candObj = typeof data.candidate === 'string' ? JSON.parse(data.candidate) : data.candidate;
              await clientObj.pc.addIceCandidate(new RTCIceCandidate(candObj));
            } catch (e) {
              console.warn('[SyncEngine Host] addIceCandidate error:', e);
            }
          } else {
            clientObj.pendingCandidates.push(data.candidate);
          }
        }
        break;
      }

      case 'REQUEST_ACTION': {
        console.log(`[SyncEngine Host] Action request via signaling: ${data.action} by ${data.sender}`);
        if (this.allowClientControls) {
          this.onClientActionRequest(data.action, data.time, data.sender || 'Viewer');
        }
        break;
      }

      case 'CHAT': {
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
        this.broadcast({
          type: 'REACTION',
          emoji: data.emoji,
          sender: data.sender || 'Viewer'
        });
        break;
      }
    }
  }

  /**
   * Initiates WebRTC PeerConnection and DataChannel for a joining viewer
   */
  async handleHostViewerJoin(clientId, data) {
    // If client is already connecting or connected, DO NOT destroy the connection!
    if (this.clients.has(clientId)) {
      const existing = this.clients.get(clientId);
      if (existing.pc && existing.pc.connectionState !== 'closed' && existing.pc.connectionState !== 'failed') {
        console.log(`[SyncEngine Host] Client ${clientId} is already negotiating. Re-sending local offer.`);
        if (existing.pc.localDescription) {
          this.signaling.send(`cinesync/v2/${this.roomId}/client/${clientId}`, {
            type: 'OFFER',
            sdp: existing.pc.localDescription
          });
        }
        return;
      }
      try { if (existing.dc) existing.dc.close(); } catch (e) {}
      try { if (existing.pc) existing.pc.close(); } catch (e) {}
      this.clients.delete(clientId);
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const clientName = data.name || 'Viewer';
    const clientColor = data.color || this.getRandomColor();

    const clientObj = {
      id: clientId,
      pc,
      dc: null,
      name: clientName,
      color: clientColor,
      pendingCandidates: []
    };
    this.clients.set(clientId, clientObj);

    // 1. Add video/audio tracks from active host stream
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        try {
          pc.addTrack(track, this.mediaStream);
        } catch (trackErr) {
          console.warn('[SyncEngine Host] Track add error:', trackErr);
        }
      });
    }

    // 2. Create WebRTC DataChannel for ultra-fast sync & chat
    const dc = pc.createDataChannel('cinesync_sync', { ordered: true });
    clientObj.dc = dc;

    dc.onopen = () => {
      console.log(`[SyncEngine Host] DataChannel opened with viewer ${clientName} (${clientId})`);
      this.broadcastPeerList();

      // Announce viewer joined
      this.broadcast({
        type: 'SYSTEM_MSG',
        text: `${clientName} joined the watch party! 🎉`
      });

      // Send active subtitles to this viewer immediately
      if (this.currentSubtitles) {
        this.safeSendDc(dc, {
          type: 'SUBTITLES_SYNC',
          vttContent: this.currentSubtitles.vttContent,
          fileName: this.currentSubtitles.fileName
        });
      }

      // Request latest playback state from host app to sync new viewer
      const targetConnWrapper = {
        send: (msg) => this.safeSendDc(dc, msg)
      };
      this.onStateSync({ type: 'REQUEST_LATEST_STATE', targetConn: targetConnWrapper });
    };

    dc.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        this.handleHostDataReceived(clientId, payload);
      } catch (err) {
        console.warn('[SyncEngine Host] Non-JSON DataChannel message:', event.data);
      }
    };

    dc.onclose = () => {
      console.log(`[SyncEngine Host] DataChannel closed with ${clientId}`);
      this.removeClient(clientId);
    };

    dc.onerror = (err) => {
      console.warn(`[SyncEngine Host] DataChannel error with ${clientId}:`, err);
      this.removeClient(clientId);
    };

    pc.onconnectionstatechange = () => {
      console.log(`[SyncEngine Host] Client ${clientId} connectionState:`, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.removeClient(clientId);
      }
    };

    // 3. ICE Candidate gathering
    pc.onicecandidate = (event) => {
      if (event.candidate && this.signaling) {
        this.signaling.send(`cinesync/v2/${this.roomId}/client/${clientId}`, {
          type: 'CANDIDATE',
          candidate: event.candidate
        });
      }
    };

    // 4. Create and send SDP Offer
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.signaling.send(`cinesync/v2/${this.roomId}/client/${clientId}`, {
        type: 'OFFER',
        sdp: pc.localDescription
      });
      console.log(`[SyncEngine Host] Sent SDP Offer to viewer ${clientId}`);
    } catch (offerErr) {
      console.error(`[SyncEngine Host] Error creating offer for ${clientId}:`, offerErr);
    }
  }

  /**
   * Processes data received from viewer over WebRTC DataChannel
   */
  handleHostDataReceived(clientId, data) {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'REQUEST_ACTION': {
        if (!this.allowClientControls) {
          const clientObj = this.clients.get(clientId);
          if (clientObj && clientObj.dc) {
            this.safeSendDc(clientObj.dc, {
              type: 'NOTICE',
              text: 'Viewer playback control is currently turned off by the host.'
            });
          }
          return;
        }
        this.onClientActionRequest(data.action, data.time, data.sender || 'Viewer');
        break;
      }

      case 'REQUEST_STREAM': {
        const clientObj = this.clients.get(clientId);
        if (clientObj && clientObj.pc && this.mediaStream) {
          const senders = clientObj.pc.getSenders();
          this.mediaStream.getTracks().forEach((track) => {
            const sender = senders.find((s) => s.track && s.track.kind === track.kind);
            if (sender) {
              sender.replaceTrack(track).catch(() => {});
            } else {
              try { clientObj.pc.addTrack(track, this.mediaStream); } catch (e) {}
            }
          });
        }
        break;
      }

      case 'CHAT': {
        // Broadcast chat to all clients and local UI
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
        // Broadcast reaction to all clients and local UI
        this.broadcast({
          type: 'REACTION',
          emoji: data.emoji,
          sender: data.sender || 'Viewer'
        });
        break;
      }
    }
  }

  /**
   * Sets or updates active outbound MediaStream for Host
   * @param {MediaStream} stream
   */
  setOutboundStream(stream) {
    this.mediaStream = stream;
    if (!this.isHost) return;

    this.clients.forEach(async (clientObj) => {
      try {
        if (!clientObj.pc) return;
        const senders = clientObj.pc.getSenders();
        stream.getTracks().forEach(async (track) => {
          const sender = senders.find((s) => s.track && s.track.kind === track.kind);
          if (sender) {
            await sender.replaceTrack(track);
          } else {
            clientObj.pc.addTrack(track, stream);
          }
        });
      } catch (err) {
        console.warn('[SyncEngine] Error replacing tracks for client:', clientObj.id, err);
      }
    });
  }

  removeClient(clientId) {
    if (this.clients.has(clientId)) {
      const client = this.clients.get(clientId);
      this.clients.delete(clientId);
      try { if (client.dc) client.dc.close(); } catch (e) {}
      try { if (client.pc) client.pc.close(); } catch (e) {}

      this.broadcast({
        type: 'SYSTEM_MSG',
        text: `${client.name} left the room.`
      });
      this.broadcastPeerList();
    }
  }

  broadcastPeerList() {
    const peers = [
      { id: 'host', name: `${this.userName} (Host)`, color: this.userColor, isHost: true }
    ];

    this.clients.forEach((c) => {
      peers.push({
        id: c.id,
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
   * Broadcasts message to all connected clients over WebRTC DataChannel
   */
  broadcast(data) {
    this.clients.forEach((c) => {
      if (c.dc && c.dc.readyState === 'open') {
        this.safeSendDc(c.dc, data);
      }
    });

    // Mirror chat and reaction to local UI
    if (data.type === 'CHAT') {
      this.onChatReceived(data);
    } else if (data.type === 'REACTION') {
      this.onReactionReceived(data);
    }
  }

  safeSendDc(dc, data) {
    try {
      if (dc && dc.readyState === 'open') {
        const str = typeof data === 'string' ? data : JSON.stringify(data);
        dc.send(str);
      }
    } catch (e) {
      console.warn('[DataChannel Send Error]', e);
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
  // CLIENT INITIALIZATION & HANDSHAKE
  // =========================================================================

  /**
   * Connects Viewer to Watch Party host
   * @param {string} hostRoomId
   */
  async startClient(hostRoomId) {
    this.isHost = false;
    this.roomId = this.cleanRoomId(hostRoomId);
    this.clientId = 'cl_' + Math.random().toString(36).substring(2, 9);
    this.remoteMediaStream = null;

    console.log(`[SyncEngine Client] Connecting to room "${this.roomId}" as ${this.userName} (${this.clientId})`);

    return new Promise(async (resolve, reject) => {
      let isResolved = false;
      let hasReceivedOffer = false;
      let joinRetryInterval = null;
      let timeoutTimer = null;

      const cleanup = () => {
        if (joinRetryInterval) {
          clearInterval(joinRetryInterval);
          joinRetryInterval = null;
        }
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }
      };

      const markConnected = () => {
        if (isResolved) return;
        isResolved = true;
        cleanup();
        console.log('[SyncEngine Client] Connection fully established with Host!');
        this.onStatusChange('connected', { hostRoomId: this.roomId });
        const wrapper = this.hostConn || {
          send: (d) => this.safeSendDc(this.clientDc, d),
          get open() { return true; },
          close: () => { if (this.clientDc) this.clientDc.close(); }
        };
        resolve(wrapper);
      };

      try {
        this.signaling = new MqttSignaling(this.clientId);
        await this.signaling.connect();

        // 1. Subscribe to client-specific channel
        const clientTopic = `cinesync/v2/${this.roomId}/client/${this.clientId}`;
        await this.signaling.subscribe(clientTopic);

        // 2. Prepare WebRTC PeerConnection
        const pc = new RTCPeerConnection(RTC_CONFIG);
        this.clientPc = pc;
        this.clientPendingCandidates = [];

        // Receive remote MediaStream from Host
        pc.ontrack = (event) => {
          console.log('[SyncEngine Client] Remote video track received from Host!', event.track.kind);
          if (!this.remoteMediaStream) {
            this.remoteMediaStream = new MediaStream();
          }
          if (event.track) {
            const existing = this.remoteMediaStream.getTracks().find(t => t.kind === event.track.kind);
            if (existing) this.remoteMediaStream.removeTrack(existing);
            this.remoteMediaStream.addTrack(event.track);
          }
          const streamToPass = (event.streams && event.streams[0]) || this.remoteMediaStream;
          this.onStreamReceived(streamToPass);
          markConnected();
        };

        // Track connection state
        pc.onconnectionstatechange = () => {
          console.log('[SyncEngine Client] WebRTC connectionState:', pc.connectionState);
          if (pc.connectionState === 'connected') {
            markConnected();
          } else if (pc.connectionState === 'failed') {
            console.warn('[SyncEngine Client] WebRTC connectionState failed.');
          }
        };

        // Receive WebRTC DataChannel created by Host
        pc.ondatachannel = (event) => {
          console.log('[SyncEngine Client] DataChannel received from Host!');
          const dc = event.channel;
          this.clientDc = dc;

          this.hostConn = {
            send: (msg) => this.safeSendDc(dc, msg),
            get open() { return dc.readyState === 'open'; },
            close: () => dc.close()
          };

          dc.onopen = () => {
            console.log('[SyncEngine Client] DataChannel successfully open!');
            markConnected();
            this.safeSendDc(dc, { type: 'REQUEST_STREAM' });
          };

          dc.onmessage = (msgEvent) => {
            try {
              const data = JSON.parse(msgEvent.data);
              this.handleClientDataReceived(data);
            } catch (err) {
              console.warn('[SyncEngine Client] DataChannel parse error:', msgEvent.data);
            }
          };

          dc.onclose = () => {
            console.warn('[SyncEngine Client] DataChannel closed.');
            this.onStatusChange('disconnected', { reason: 'Host closed the room.' });
          };

          dc.onerror = (err) => {
            console.warn('[SyncEngine Client] DataChannel error:', err);
          };
        };

        // ICE candidate handler
        pc.onicecandidate = (event) => {
          if (event.candidate && this.signaling) {
            this.signaling.send(`cinesync/v2/${this.roomId}/host/${this.clientId}`, {
              type: 'CANDIDATE',
              clientId: this.clientId,
              candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate
            });
          }
        };

        // 3. Listen for signals from Host
        this.signaling.onMessage(async (topic, data) => {
          if (!data || !data.type) return;

          switch (data.type) {
            case 'OFFER': {
              console.log('[SyncEngine Client] Received SDP Offer from Host');
              hasReceivedOffer = true;
              if (joinRetryInterval) {
                clearInterval(joinRetryInterval);
                joinRetryInterval = null;
              }

              try {
                await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

                // Process early buffered candidates
                if (this.clientPendingCandidates.length > 0) {
                  for (const cand of this.clientPendingCandidates) {
                    try {
                      await pc.addIceCandidate(new RTCIceCandidate(cand));
                    } catch (ce) {}
                  }
                  this.clientPendingCandidates = [];
                }

                // Create and send SDP Answer
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                this.signaling.send(`cinesync/v2/${this.roomId}/host/${this.clientId}`, {
                  type: 'ANSWER',
                  clientId: this.clientId,
                  sdp: pc.localDescription
                });
                console.log('[SyncEngine Client] Sent SDP Answer to Host');
              } catch (answerErr) {
                console.error('[SyncEngine Client] Error processing offer:', answerErr);
              }
              break;
            }

            case 'CANDIDATE': {
              if (!data.candidate) return;
              if (pc.remoteDescription && pc.remoteDescription.type) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (e) {
                  console.warn('[SyncEngine Client] addIceCandidate error:', e);
                }
              } else {
                this.clientPendingCandidates.push(data.candidate);
              }
              break;
            }
          }
        });

        // 4. Send JOIN signal to Host with retry only until first offer received
        const sendJoin = () => {
          if (isResolved || hasReceivedOffer) return;
          console.log(`[SyncEngine Client] Sending JOIN signal to Host (room: ${this.roomId})...`);
          this.signaling.send(`cinesync/v2/${this.roomId}/host/${this.clientId}`, {
            type: 'JOIN',
            clientId: this.clientId,
            name: this.userName,
            color: this.userColor
          });
        };

        sendJoin();
        joinRetryInterval = setInterval(sendJoin, 3000);

        // 5. Connection Timeout Safeguard (only if no offer or connection at all after 15s)
        timeoutTimer = setTimeout(() => {
          cleanup();
          if (!isResolved) {
            isResolved = true;
            const errMsg = `Connection to host "${this.roomId}" timed out. Make sure the Host tab is open and has started the party!`;
            this.onStatusChange('error', { error: { message: errMsg } });
            reject(new Error(errMsg));
          }
        }, 15000);

      } catch (err) {
        cleanup();
        this.onStatusChange('error', { error: err });
        reject(err);
      }
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
      this.onClientActionRequest(action, time, `${this.userName} (Host)`);
    } else {
      const payload = {
        type: 'REQUEST_ACTION',
        action,
        time,
        sender: this.userName,
        clientId: this.clientId
      };
      let sent = false;
      if (this.hostConn && this.hostConn.open) {
        this.hostConn.send(payload);
        sent = true;
      }
      if (!sent && this.signaling) {
        this.signaling.send(`cinesync/v2/${this.roomId}/host/${this.clientId}`, payload);
      }
    }
  }

  sendChat(text) {
    if (!text || !text.trim()) return;
    if (this.isHost) {
      this.broadcast({
        type: 'CHAT',
        text: text.trim(),
        sender: `${this.userName} (Host)`,
        color: this.userColor,
        time: Date.now()
      });
    } else {
      const payload = {
        type: 'CHAT',
        text: text.trim(),
        sender: this.userName,
        color: this.userColor,
        clientId: this.clientId
      };
      if (this.hostConn && this.hostConn.open) {
        this.hostConn.send(payload);
      } else if (this.signaling) {
        this.signaling.send(`cinesync/v2/${this.roomId}/host/${this.clientId}`, payload);
      }
    }
  }

  sendReaction(emoji) {
    if (this.isHost) {
      this.broadcast({
        type: 'REACTION',
        emoji,
        sender: `${this.userName} (Host)`
      });
    } else {
      const payload = {
        type: 'REACTION',
        emoji,
        sender: this.userName,
        clientId: this.clientId
      };
      if (this.hostConn && this.hostConn.open) {
        this.hostConn.send(payload);
      } else if (this.signaling) {
        this.signaling.send(`cinesync/v2/${this.roomId}/host/${this.clientId}`, payload);
      }
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
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    if (this.clientDc) {
      try { this.clientDc.close(); } catch (e) {}
    }
    if (this.clientPc) {
      try { this.clientPc.close(); } catch (e) {}
    }

    this.clients.forEach((c) => {
      try { if (c.dc) c.dc.close(); } catch (e) {}
      try { if (c.pc) c.pc.close(); } catch (e) {}
    });
    this.clients.clear();

    if (this.signaling) {
      this.signaling.disconnect();
    }
  }
}
