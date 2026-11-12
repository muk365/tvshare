/**
 * CineSync - Main Application Orchestrator
 * Connects UI, Video Engine, Audio Routing, and WebRTC Synchronization.
 */

import { AudioEngine } from './audio.js';
import { ReactionEngine } from './reactions.js';
import { UIManager } from './ui.js';
import { SyncEngine } from './webrtc.js';
import { SubtitleEngine } from './subtitles.js';

class App {
  constructor() {
    // Sub-engines
    this.audioEngine = new AudioEngine();
    this.uiManager = new UIManager();
    this.subtitleEngine = null;
    this.reactionEngine = null;
    this.syncEngine = null;

    // State
    this.isHost = false;
    this.currentVideoFile = null;
    this.pendingSubtitleFile = null;
    this.videoDuration = 0;
    this.isScrubbing = false;
    this.idleTimer = null;
    this.currentRoomId = '';
    this.allowViewerControls = true;
    this.localVolume = parseFloat(localStorage.getItem('cinesync_vol') || '0.9');

    // DOM Elements
    this.dom = {
      viewLobby: document.getElementById('viewLobby'),
      viewRoom: document.getElementById('viewRoom'),
      hostBtn: document.getElementById('startHostBtn'),
      joinBtn: document.getElementById('startJoinBtn'),
      hostNameInput: document.getElementById('hostNameInput'),
      joinNameInput: document.getElementById('joinNameInput'),
      roomIdInput: document.getElementById('roomIdInput'),
      videoFileInput: document.getElementById('videoFileInput'),
      dropzone: document.getElementById('dropzone'),
      selectedFilePill: document.getElementById('selectedFilePill'),
      selectedFileName: document.getElementById('selectedFileName'),
      selectedFileMeta: document.getElementById('selectedFileMeta'),
      demoVideoBtn: document.getElementById('demoVideoBtn'),
      
      // Theater Elements
      videoElement: document.getElementById('mainVideo'),
      playerContainer: document.getElementById('playerContainer'),
      playerOverlay: document.getElementById('playerOverlay'),
      reactionsCanvas: document.getElementById('reactionsCanvas'),
      ambientCanvas: document.getElementById('ambientCanvas'),
      videoTitle: document.getElementById('videoTitle'),
      streamTypeBadge: document.getElementById('streamTypeBadge'),
      roleBadge: document.getElementById('roleBadge'),
      viewerCountBadge: document.getElementById('viewerCountBadge'),
      
      // Subtitles Elements
      lobbySubtitleInput: document.getElementById('lobbySubtitleInput'),
      chooseSubtitleBtn: document.getElementById('chooseSubtitleBtn'),
      lobbySubtitlePill: document.getElementById('lobbySubtitlePill'),
      lobbySubtitleName: document.getElementById('lobbySubtitleName'),
      removeLobbySubtitleBtn: document.getElementById('removeLobbySubtitleBtn'),
      
      ccBtn: document.getElementById('ccBtn'),
      subtitlesMenu: document.getElementById('subtitlesMenu'),
      subtitlesToggleSwitch: document.getElementById('subtitlesToggleSwitch'),
      theaterSubtitleInput: document.getElementById('theaterSubtitleInput'),
      uploadSubtitleTheaterBtn: document.getElementById('uploadSubtitleTheaterBtn'),
      theaterSubtitlePill: document.getElementById('theaterSubtitlePill'),
      theaterSubtitleName: document.getElementById('theaterSubtitleName'),
      offsetMinusBtn: document.getElementById('offsetMinusBtn'),
      offsetPlusBtn: document.getElementById('offsetPlusBtn'),
      offsetResetBtn: document.getElementById('offsetResetBtn'),
      offsetValue: document.getElementById('offsetValue'),
      sizePills: document.querySelectorAll('.size-pill-btn'),
      subtitlePositionSlider: document.getElementById('subtitlePositionSlider'),
      subtitlePositionValue: document.getElementById('subtitlePositionValue'),
      subtitlesOverlay: document.getElementById('subtitlesOverlay'),
      subtitleText: document.getElementById('subtitleText'),

      // Controls
      playPauseBtn: document.getElementById('playPauseBtn'),
      playPauseIcon: document.getElementById('playPauseIcon'),
      skipBackBtn: document.getElementById('skipBackBtn'),
      skipForwardBtn: document.getElementById('skipForwardBtn'),
      timelineWrapper: document.getElementById('timelineWrapper'),
      timelineProgress: document.getElementById('timelineProgress'),
      timelineBuffer: document.getElementById('timelineBuffer'),
      timelineTooltip: document.getElementById('timelineTooltip'),
      timeCurrent: document.getElementById('timeCurrent'),
      timeTotal: document.getElementById('timeTotal'),
      volumeBtn: document.getElementById('volumeBtn'),
      volumeIcon: document.getElementById('volumeIcon'),
      volumeSlider: document.getElementById('volumeSlider'),
      fullscreenBtn: document.getElementById('fullscreenBtn'),
      pipBtn: document.getElementById('pipBtn'),
      
      // Drawer & Tabs
      sideDrawer: document.getElementById('sideDrawer'),
      toggleDrawerBtn: document.getElementById('toggleDrawerBtn'),
      drawerTabs: document.querySelectorAll('.drawer-tab'),
      tabPanels: document.querySelectorAll('.tab-panel'),
      chatMessages: document.getElementById('chatMessages'),
      chatInput: document.getElementById('chatInput'),
      sendChatBtn: document.getElementById('sendChatBtn'),
      viewersList: document.getElementById('viewersList'),
      allowControlsSwitch: document.getElementById('allowControlsSwitch'),
      
      // Share Modal
      shareRoomBtn: document.getElementById('shareRoomBtn'),
      shareModal: document.getElementById('shareModal'),
      closeShareModalBtn: document.getElementById('closeShareModalBtn'),
      shareRoomCode: document.getElementById('shareRoomCode'),
      shareRoomLink: document.getElementById('shareRoomLink'),
      copyLinkBtn: document.getElementById('copyLinkBtn'),
      qrContainer: document.getElementById('qrContainer')
    };

    this.init();
  }

  init() {
    this.subtitleEngine = new SubtitleEngine(
      this.dom.videoElement,
      this.dom.subtitlesOverlay,
      this.dom.subtitleText
    );
    this.setupUrlParams();
    this.setupEventListeners();
    this.setupFileSelection();
    this.setupSubtitles();
    this.setupReactionCanvas();
    this.setupVolume();
  }

  /**
   * Check if page was loaded with ?room=XYZ
   */
  setupUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room && this.dom.roomIdInput) {
      this.dom.roomIdInput.value = room;
      this.uiManager.showToast(`Room code "${room}" detected from invite link!`, 'info');
      // Scroll to join card
      setTimeout(() => {
        const joinCard = document.querySelector('.join-card');
        if (joinCard) joinCard.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    }
  }

  setupEventListeners() {
    // Start Party (Host)
    this.dom.hostBtn.addEventListener('click', () => this.handleStartHost());

    // Join Party (Client)
    this.dom.joinBtn.addEventListener('click', () => this.handleStartJoin());

    // Demo Video Generator
    if (this.dom.demoVideoBtn) {
      this.dom.demoVideoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.loadDemoSynthwaveVideo();
      });
    }

    // Video Playback Controls
    this.dom.videoElement.addEventListener('click', () => this.togglePlayPause());
    this.dom.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
    this.dom.skipBackBtn.addEventListener('click', () => this.skipSeconds(-5));
    this.dom.skipForwardBtn.addEventListener('click', () => this.skipSeconds(5));

    // Scrubber / Timeline
    this.dom.timelineWrapper.addEventListener('mousemove', (e) => this.handleTimelineHover(e));
    this.dom.timelineWrapper.addEventListener('click', (e) => this.handleTimelineClick(e));

    // Video Events
    this.dom.videoElement.addEventListener('timeupdate', () => this.handleTimeUpdate());
    this.dom.videoElement.addEventListener('loadedmetadata', () => this.handleMetadataLoaded());
    this.dom.videoElement.addEventListener('play', () => this.updatePlayIcon(true));
    this.dom.videoElement.addEventListener('pause', () => this.updatePlayIcon(false));

    // Fullscreen & PiP
    this.dom.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
    this.dom.pipBtn.addEventListener('click', () => this.togglePiP());

    // Reactions (Clicking emoji icons)
    document.querySelectorAll('.reaction-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.dataset.emoji || btn.innerText.trim();
        this.triggerReaction(emoji);
      });
    });

    // Chat
    this.dom.sendChatBtn.addEventListener('click', () => this.sendChatMessage());
    this.dom.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.sendChatMessage();
    });

    // Drawer Toggle & Tabs
    this.dom.toggleDrawerBtn.addEventListener('click', () => {
      this.dom.sideDrawer.classList.toggle('collapsed');
    });

    this.dom.drawerTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;
        this.dom.drawerTabs.forEach(t => t.classList.remove('active'));
        this.dom.tabPanels.forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const targetPanel = document.getElementById(`panel-${targetTab}`);
        if (targetPanel) targetPanel.classList.add('active');
      });
    });

    // Host Controls Toggle Permission
    if (this.dom.allowControlsSwitch) {
      this.dom.allowControlsSwitch.addEventListener('change', (e) => {
        this.allowViewerControls = e.target.checked;
        if (this.syncEngine) {
          this.syncEngine.allowClientControls = this.allowViewerControls;
          this.syncEngine.broadcast({
            type: 'NOTICE',
            text: this.allowViewerControls 
              ? 'Host enabled viewer playback controls.' 
              : 'Host locked playback controls.'
          });
        }
        this.uiManager.showToast(
          this.allowViewerControls ? 'Viewer controls unlocked' : 'Viewer controls locked',
          'info'
        );
      });
    }

    // Share Modal
    this.dom.shareRoomBtn.addEventListener('click', () => this.openShareModal());
    this.dom.closeShareModalBtn.addEventListener('click', () => this.closeShareModal());
    const drawerShareBtn = document.getElementById('drawerShareBtn');
    if (drawerShareBtn) {
      drawerShareBtn.addEventListener('click', () => this.openShareModal());
    }
    this.dom.copyLinkBtn.addEventListener('click', () => {
      const link = this.getInviteLink();
      this.uiManager.copyToClipboard(link, this.dom.copyLinkBtn, 'Copy Link');
    });

    // Autohide Controls on Idle
    this.dom.playerContainer.addEventListener('mousemove', () => this.resetIdleTimer());
    this.dom.playerContainer.addEventListener('mouseleave', () => {
      if (!this.dom.videoElement.paused) {
        this.dom.playerOverlay.classList.add('idle-hidden');
      }
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => this.handleKeyboard(e));
  }

  setupFileSelection() {
    const { dropzone, videoFileInput, selectedFilePill, selectedFileName, selectedFileMeta } = this.dom;

    dropzone.addEventListener('click', () => videoFileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-active');
    });

    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-active'));

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-active');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        this.selectFile(e.dataTransfer.files[0]);
      }
    });

    videoFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.selectFile(e.target.files[0]);
      }
    });
  }

  selectFile(file) {
    if (!file.type.startsWith('video/')) {
      this.uiManager.showToast('Please select a valid video file (MP4, WebM, MKV, etc.)', 'warning');
      return;
    }

    this.currentVideoFile = file;
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);

    this.dom.selectedFileName.innerText = file.name;
    this.dom.selectedFileMeta.innerText = `${sizeMb} MB • Ready to stream`;
    this.dom.selectedFilePill.classList.add('active');

    this.uiManager.showToast(`Selected "${file.name}"`, 'success');
  }

  setupSubtitles() {
    // Lobby Subtitles selection
    if (this.dom.chooseSubtitleBtn && this.dom.lobbySubtitleInput) {
      this.dom.chooseSubtitleBtn.addEventListener('click', () => this.dom.lobbySubtitleInput.click());
      this.dom.lobbySubtitleInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.selectLobbySubtitle(e.target.files[0]);
        }
      });
    }

    if (this.dom.removeLobbySubtitleBtn) {
      this.dom.removeLobbySubtitleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeLobbySubtitle();
      });
    }

    // Theater Subtitles CC button & menu popup
    if (this.dom.ccBtn && this.dom.subtitlesMenu) {
      this.dom.ccBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dom.subtitlesMenu.classList.toggle('open');
      });

      document.addEventListener('click', (e) => {
        if (this.dom.subtitlesMenu.classList.contains('open') &&
            !this.dom.subtitlesMenu.contains(e.target) &&
            e.target !== this.dom.ccBtn) {
          this.dom.subtitlesMenu.classList.remove('open');
        }
      });
    }

    if (this.dom.uploadSubtitleTheaterBtn && this.dom.theaterSubtitleInput) {
      this.dom.uploadSubtitleTheaterBtn.addEventListener('click', () => this.dom.theaterSubtitleInput.click());
      this.dom.theaterSubtitleInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.uploadSubtitleFile(e.target.files[0]);
        }
      });
    }

    if (this.dom.subtitlesToggleSwitch) {
      this.dom.subtitlesToggleSwitch.addEventListener('change', (e) => {
        const isShowing = this.subtitleEngine.toggle(e.target.checked);
        this.dom.ccBtn.classList.toggle('active', isShowing);
      });
    }

    // Offset controls
    if (this.dom.offsetMinusBtn) {
      this.dom.offsetMinusBtn.addEventListener('click', () => {
        const offset = this.subtitleEngine.adjustOffset(-0.5);
        this.dom.offsetValue.innerText = `${offset > 0 ? '+' : ''}${offset.toFixed(1)}s`;
      });
    }

    if (this.dom.offsetPlusBtn) {
      this.dom.offsetPlusBtn.addEventListener('click', () => {
        const offset = this.subtitleEngine.adjustOffset(0.5);
        this.dom.offsetValue.innerText = `${offset > 0 ? '+' : ''}${offset.toFixed(1)}s`;
      });
    }

    if (this.dom.offsetResetBtn) {
      this.dom.offsetResetBtn.addEventListener('click', () => {
        this.subtitleEngine.resetOffset();
        this.dom.offsetValue.innerText = '0.0s';
      });
    }

    // Font size pills (S, M, L)
    if (this.dom.sizePills) {
      this.dom.sizePills.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.size === this.subtitleEngine.fontSize);
        btn.addEventListener('click', () => {
          this.dom.sizePills.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.subtitleEngine.setFontSize(btn.dataset.size);
        });
      });
    }

    // Vertical Position Slider (Move upward / downward)
    if (this.dom.subtitlePositionSlider && this.dom.subtitlePositionValue) {
      this.dom.subtitlePositionSlider.value = this.subtitleEngine.verticalPosition;
      this.dom.subtitlePositionValue.innerText = `${this.subtitleEngine.verticalPosition}%`;

      this.dom.subtitlePositionSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.subtitleEngine.setVerticalPosition(val);
        this.dom.subtitlePositionValue.innerText = `${val}%`;
      });
    }
  }

  selectLobbySubtitle(file) {
    this.pendingSubtitleFile = file;
    if (this.dom.lobbySubtitleName && this.dom.lobbySubtitlePill) {
      this.dom.lobbySubtitleName.innerText = file.name;
      this.dom.lobbySubtitlePill.style.display = 'flex';
      this.dom.chooseSubtitleBtn.style.display = 'none';
    }
    this.uiManager.showToast(`Subtitles "${file.name}" ready to sync!`, 'success');
  }

  removeLobbySubtitle() {
    this.pendingSubtitleFile = null;
    if (this.dom.lobbySubtitleInput) this.dom.lobbySubtitleInput.value = '';
    if (this.dom.lobbySubtitlePill) this.dom.lobbySubtitlePill.style.display = 'none';
    if (this.dom.chooseSubtitleBtn) this.dom.chooseSubtitleBtn.style.display = 'flex';
  }

  async uploadSubtitleFile(file) {
    try {
      const { vttText, name } = await this.subtitleEngine.loadSubtitles(file);
      if (this.dom.theaterSubtitleName && this.dom.theaterSubtitlePill) {
        this.dom.theaterSubtitleName.innerText = name;
        this.dom.theaterSubtitlePill.style.display = 'flex';
      }
      this.dom.ccBtn.classList.add('active');
      if (this.dom.subtitlesToggleSwitch) this.dom.subtitlesToggleSwitch.checked = true;

      this.uiManager.showToast(`Subtitles "${name}" loaded!`, 'success');

      // If Host, broadcast to all viewers
      if (this.isHost && this.syncEngine) {
        this.syncEngine.syncSubtitles(vttText, name);
      }
    } catch (err) {
      this.uiManager.showToast(`Could not load subtitles: ${err.message}`, 'error');
    }
  }

  /**
   * Generates a procedural animated demo video in case the user doesn't have a local video file handy!
   */
  loadDemoSynthwaveVideo() {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');

    // Generate Synthwave neon landscape
    let frame = 0;
    const draw = () => {
      frame++;
      // Dark cyber sky
      const grad = ctx.createLinearGradient(0, 0, 0, 720);
      grad.addColorStop(0, '#090a14');
      grad.addColorStop(0.5, '#2b1055');
      grad.addColorStop(1, '#7597de');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1280, 720);

      // Neon Sun
      ctx.save();
      ctx.shadowColor = '#f43f5e';
      ctx.shadowBlur = 40;
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(640, 360, 140, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Sun horizontal slice lines
      for (let y = 280; y < 490; y += 14) {
        ctx.fillStyle = '#090a14';
        ctx.fillRect(500, y, 280, 4);
      }

      // 3D Perspective Grid
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      const horizon = 420;
      for (let x = -600; x <= 1880; x += 80) {
        ctx.beginPath();
        ctx.moveTo(640, horizon);
        ctx.lineTo(x, 720);
        ctx.stroke();
      }

      const offset = (frame * 3) % 40;
      for (let y = horizon + offset; y < 720; y += 28) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(1280, y);
        ctx.stroke();
      }

      // Title overlay
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 38px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚡ CineSync Live Demo Trailer', 640, 140);
      ctx.font = '20px JetBrains Mono, monospace';
      ctx.fillStyle = '#a78bfa';
      ctx.fillText(`P2P WebRTC Synced Stream • Frame #${frame}`, 640, 190);

      requestAnimationFrame(draw);
    };
    draw();

    // Stream procedural video to main video element
    const stream = canvas.captureStream(30);

    // Add synthetic audio track
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const dest = audioCtx.createMediaStreamDestination();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    gain.gain.value = 0.05; // Soft ambient synth hum
    osc.frequency.value = 110; // A2 note
    osc.connect(gain);
    gain.connect(dest);
    osc.start();

    const combinedDemoStream = new MediaStream([
      ...stream.getVideoTracks(),
      ...dest.stream.getAudioTracks()
    ]);

    this.currentVideoFile = {
      name: 'Synthwave_Retro_Demo.mp4',
      isDemoStream: true,
      stream: combinedDemoStream
    };

    this.dom.selectedFileName.innerText = 'Synthwave_Retro_Demo.mp4 (Live Generated)';
    this.dom.selectedFileMeta.innerText = 'Procedural 720p 60fps • Ready to stream';
    this.dom.selectedFilePill.classList.add('active');

    this.uiManager.showToast('Demo Cyberpunk video ready! Click "Start Watch Party".', 'success');
  }

  setupReactionCanvas() {
    this.reactionEngine = new ReactionEngine(this.dom.reactionsCanvas);
  }

  // =========================================================================
  // HOST WORKFLOW
  // =========================================================================

  async handleStartHost() {
    const hostName = this.dom.hostNameInput.value.trim() || 'Alex (Host)';

    if (!this.currentVideoFile) {
      this.uiManager.showToast('Please select a video file or click "Load Demo Video" first!', 'warning');
      return;
    }

    this.isHost = true;
    this.dom.hostBtn.disabled = true;
    this.dom.hostBtn.innerText = 'Starting Room...';

    try {
      // 1. Mount video file to host video element
      if (this.currentVideoFile.isDemoStream) {
        this.dom.videoElement.srcObject = this.currentVideoFile.stream;
      } else {
        const objectUrl = URL.createObjectURL(this.currentVideoFile);
        this.dom.videoElement.src = objectUrl;
      }

      // Wait for video to have valid data before capturing stream
      if (!this.currentVideoFile.isDemoStream && this.dom.videoElement.readyState < 2) {
        await new Promise((resolve) => {
          const onReady = () => {
            this.dom.videoElement.removeEventListener('loadeddata', onReady);
            this.dom.videoElement.removeEventListener('canplay', onReady);
            resolve();
          };
          this.dom.videoElement.addEventListener('loadeddata', onReady);
          this.dom.videoElement.addEventListener('canplay', onReady);
          setTimeout(resolve, 1500); // Fallback timeout
        });
      }

      await this.dom.videoElement.play();

      // 2. Initialize Audio Engine (Independent local volume vs remote stream)
      if (!this.currentVideoFile.isDemoStream) {
        this.audioEngine.init(this.dom.videoElement);
        await this.audioEngine.resume();
        this.audioEngine.setLocalVolume(this.localVolume);
      }

      // 3. Capture stream for WebRTC peers
      let outboundStream = null;
      if (this.currentVideoFile.isDemoStream) {
        outboundStream = this.currentVideoFile.stream;
      } else {
        const capture = this.dom.videoElement.captureStream 
          ? this.dom.videoElement.captureStream(60) 
          : this.dom.videoElement.mozCaptureStream(60);

        const cleanAudioTrack = this.audioEngine.getStreamAudioTrack();
        const outboundTracks = [
          ...capture.getVideoTracks(),
          cleanAudioTrack || (capture.getAudioTracks()[0] || null)
        ].filter(Boolean);

        outboundStream = new MediaStream(outboundTracks);
      }

      // 4. Initialize Sync Engine in Host mode
      this.syncEngine = new SyncEngine({
        isHost: true,
        userName: hostName,
        onPeersUpdated: (peers) => this.updatePeersList(peers),
        onChatReceived: (chat) => this.renderChatBubble(chat),
        onReactionReceived: (reaction) => {
          this.reactionEngine.spawn(reaction.emoji, 3);
        },
        onClientActionRequest: (action, time, sender) => {
          this.executePlaybackAction(action, time, sender);
        },
        onStateSync: (event) => {
          if (event.type === 'HEARTBEAT_TICK' || event.type === 'REQUEST_LATEST_STATE') {
            const state = {
              type: 'SYNC_STATE',
              currentTime: this.dom.videoElement.currentTime,
              duration: this.dom.videoElement.duration || 0,
              isPlaying: !this.dom.videoElement.paused,
              title: this.currentVideoFile.name,
              allowViewerControls: this.allowViewerControls
            };

            if (event.targetConn) {
              event.targetConn.send(state);
            } else {
              this.syncEngine.broadcast(state);
            }
          }
        },
        onStatusChange: (status, info) => {
          if (status === 'open') {
            this.currentRoomId = info.id;
            this.uiManager.showToast(`Party Room Live! Code: ${info.id}`, 'success');
            if (this.dom.shareRoomCode) this.dom.shareRoomCode.innerText = info.id;
            if (this.dom.shareRoomLink) this.dom.shareRoomLink.innerText = this.getInviteLink();
          }
        }
      });

      await this.syncEngine.startHost(null, outboundStream);

      // Load and broadcast subtitles if selected in lobby
      if (this.pendingSubtitleFile) {
        try {
          const { vttText, name } = await this.subtitleEngine.loadSubtitles(this.pendingSubtitleFile);
          this.syncEngine.syncSubtitles(vttText, name);
          if (this.dom.theaterSubtitleName && this.dom.theaterSubtitlePill) {
            this.dom.theaterSubtitleName.innerText = name;
            this.dom.theaterSubtitlePill.style.display = 'flex';
          }
          this.dom.ccBtn.classList.add('active');
          if (this.dom.subtitlesToggleSwitch) this.dom.subtitlesToggleSwitch.checked = true;
        } catch (subErr) {
          console.warn('[Subtitles Load Error]', subErr);
        }
      }

      // 5. Switch to Theater View
      this.enterTheaterView(this.currentVideoFile.name, true);
      this.uiManager.startAmbientBacklight(this.dom.videoElement);

      // Confetti celebration
      if (window.confetti) {
        window.confetti({ particleCount: 80, spread: 60, origin: { y: 0.8 } });
      }

    } catch (err) {
      console.error('[Host Init Error]', err);
      this.uiManager.showToast(`Could not start party: ${err.message}`, 'error');
      this.dom.hostBtn.disabled = false;
      this.dom.hostBtn.innerText = 'Start Watch Party';
    }
  }

  // =========================================================================
  // CLIENT / VIEWER WORKFLOW
  // =========================================================================

  async handleStartJoin() {
    const clientName = this.dom.joinNameInput.value.trim() || 'Viewer';
    const targetRoomId = this.dom.roomIdInput.value.trim();

    if (!targetRoomId) {
      this.uiManager.showToast('Please enter a valid 6-character Room Code!', 'warning');
      this.dom.roomIdInput.focus();
      return;
    }

    this.isHost = false;
    this.dom.joinBtn.disabled = true;
    this.dom.joinBtn.innerText = 'Connecting to Host...';

    try {
      this.syncEngine = new SyncEngine({
        isHost: false,
        userName: clientName,
        roomId: targetRoomId,
        onStreamReceived: (remoteStream) => {
          this.dom.videoElement.srcObject = remoteStream;
          this.dom.videoElement.volume = this.localVolume;
          this.dom.videoElement.play().catch(() => {
            this.uiManager.showToast('Click anywhere on the video to enable audio playback!', 'info', 5000);
          });
          this.enterTheaterView('Live Stream from Host', false);
          this.uiManager.startAmbientBacklight(this.dom.videoElement);
        },
        onPeersUpdated: (peers) => this.updatePeersList(peers),
        onChatReceived: (chat) => this.renderChatBubble(chat),
        onReactionReceived: (reaction) => {
          this.reactionEngine.spawn(reaction.emoji, 3);
        },
        onSubtitlesSync: async (vttContent, fileName) => {
          try {
            await this.subtitleEngine.loadSubtitles(vttContent, fileName);
            if (this.dom.theaterSubtitleName && this.dom.theaterSubtitlePill) {
              this.dom.theaterSubtitleName.innerText = fileName;
              this.dom.theaterSubtitlePill.style.display = 'flex';
            }
            this.dom.ccBtn.classList.add('active');
            if (this.dom.subtitlesToggleSwitch) this.dom.subtitlesToggleSwitch.checked = true;
            this.uiManager.showToast(`Subtitles synced: ${fileName}`, 'info');
          } catch (e) {
            console.warn('[Subtitle Sync Error]', e);
          }
        },
        onStateSync: (data) => {
          if (data.title) this.dom.videoTitle.innerText = data.title;
          if (data.duration) this.videoDuration = data.duration;
          if (typeof data.allowViewerControls === 'boolean') {
            this.allowViewerControls = data.allowViewerControls;
          }
          if (data.currentTime !== undefined) {
            this.dom.timeCurrent.innerText = UIManager.formatTime(data.currentTime);
            if (this.videoDuration > 0) {
              const pct = (data.currentTime / this.videoDuration) * 100;
              this.dom.timelineProgress.style.width = `${pct}%`;
            }
          }
        },
        onActionExecuted: (data) => {
          this.uiManager.showToast(`${data.sender}: ${data.action.replace('_', ' ')}`, 'info', 2000);
          if (data.action === 'PLAY') this.uiManager.triggerCenterSplash('play');
          if (data.action === 'PAUSE') this.uiManager.triggerCenterSplash('pause');
          if (data.action === 'SKIP_FORWARD') this.uiManager.triggerCenterSplash('forward5');
          if (data.action === 'SKIP_BACKWARD') this.uiManager.triggerCenterSplash('backward5');
        },
        onStatusChange: (status, info) => {
          if (status === 'connected') {
            this.currentRoomId = targetRoomId;
            this.uiManager.showToast('Connected to Watch Party!', 'success');
          } else if (status === 'error') {
            this.uiManager.showToast(`Connection failed: ${info.error.message || info.error}`, 'error');
            this.dom.joinBtn.disabled = false;
            this.dom.joinBtn.innerText = 'Join Watch Party';
          } else if (status === 'notice') {
            this.uiManager.showToast(info.message, 'warning');
          }
        }
      });

      await this.syncEngine.startClient(targetRoomId);

    } catch (err) {
      console.error('[Join Init Error]', err);
      this.uiManager.showToast(`Join failed: ${err.message}`, 'error');
      this.dom.joinBtn.disabled = false;
      this.dom.joinBtn.innerText = 'Join Watch Party';
    }
  }

  // =========================================================================
  // THEATER & PLAYBACK LOGIC
  // =========================================================================

  enterTheaterView(title, isHost) {
    this.dom.viewLobby.style.display = 'none';
    this.dom.viewRoom.classList.add('active');

    // Reveal header room buttons
    if (this.dom.shareRoomBtn) this.dom.shareRoomBtn.style.display = 'inline-flex';
    if (this.dom.toggleDrawerBtn) this.dom.toggleDrawerBtn.style.display = 'grid';
    if (this.dom.viewerCountBadge) this.dom.viewerCountBadge.style.display = 'inline-flex';

    this.dom.videoTitle.innerText = title;
    this.dom.streamTypeBadge.innerText = isHost ? 'HOST STREAM' : 'WEBRTC LIVE';
    this.dom.roleBadge.innerText = isHost ? '🟢 LIVE (HOST)' : '🟢 WATCHING';
    this.dom.roleBadge.classList.add('badge-live');

    // Host Settings row visibility
    const hostSettingsRow = document.getElementById('hostOnlySettings');
    if (hostSettingsRow) {
      hostSettingsRow.style.display = isHost ? 'flex' : 'none';
    }

    this.resetIdleTimer();
  }

  /**
   * Executes play/pause/skip action and broadcasts
   */
  executePlaybackAction(action, time = 0, sender = 'Host') {
    const video = this.dom.videoElement;

    switch (action) {
      case 'PLAY':
        video.play();
        this.uiManager.triggerCenterSplash('play');
        break;
      case 'PAUSE':
        video.pause();
        this.uiManager.triggerCenterSplash('pause');
        break;
      case 'SKIP_FORWARD':
        video.currentTime = Math.min(video.duration || 999999, video.currentTime + 5);
        this.uiManager.triggerCenterSplash('forward5');
        break;
      case 'SKIP_BACKWARD':
        video.currentTime = Math.max(0, video.currentTime - 5);
        this.uiManager.triggerCenterSplash('backward5');
        break;
      case 'SEEK':
        video.currentTime = time;
        break;
    }

    if (this.isHost && this.syncEngine) {
      this.syncEngine.broadcast({
        type: 'ACTION_EXECUTED',
        action,
        time: video.currentTime,
        sender
      });
    }
  }

  togglePlayPause() {
    const isPlaying = !this.dom.videoElement.paused;
    const action = isPlaying ? 'PAUSE' : 'PLAY';

    if (this.isHost) {
      this.executePlaybackAction(action, this.dom.videoElement.currentTime, `${this.syncEngine.userName} (Host)`);
    } else {
      this.syncEngine.sendActionRequest(action, 0);
    }
  }

  skipSeconds(seconds) {
    const action = seconds > 0 ? 'SKIP_FORWARD' : 'SKIP_BACKWARD';
    if (this.isHost) {
      this.executePlaybackAction(action, 0, `${this.syncEngine.userName} (Host)`);
    } else {
      this.syncEngine.sendActionRequest(action, 0);
    }
  }

  handleTimelineClick(e) {
    if (!this.allowViewerControls && !this.isHost) {
      this.uiManager.showToast('Viewer seek is locked by host', 'warning');
      return;
    }

    const rect = this.dom.timelineWrapper.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * (this.videoDuration || this.dom.videoElement.duration || 0);

    if (this.isHost) {
      this.executePlaybackAction('SEEK', targetTime, `${this.syncEngine.userName} (Host)`);
    } else {
      this.syncEngine.sendActionRequest('SEEK', targetTime);
    }
  }

  handleTimelineHover(e) {
    const rect = this.dom.timelineWrapper.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const hoverTime = ratio * (this.videoDuration || this.dom.videoElement.duration || 0);

    this.dom.timelineTooltip.innerText = UIManager.formatTime(hoverTime);
    this.dom.timelineTooltip.style.left = `${e.clientX - rect.left}px`;
  }

  handleTimeUpdate() {
    const video = this.dom.videoElement;
    const cur = video.currentTime;
    const dur = this.videoDuration || video.duration || 0;

    this.dom.timeCurrent.innerText = UIManager.formatTime(cur);

    if (dur > 0) {
      const pct = (cur / dur) * 100;
      this.dom.timelineProgress.style.width = `${pct}%`;
    }
  }

  handleMetadataLoaded() {
    this.videoDuration = this.dom.videoElement.duration;
    this.dom.timeTotal.innerText = UIManager.formatTime(this.videoDuration);
  }

  updatePlayIcon(isPlaying) {
    if (isPlaying) {
      this.dom.playPauseIcon.innerHTML = `<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>`;
    } else {
      this.dom.playPauseIcon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"/>`;
    }
  }

  // =========================================================================
  // VOLUME HANDLING (HOST & CLIENT INDEPENDENCE)
  // =========================================================================

  setupVolume() {
    this.dom.volumeSlider.value = this.localVolume * 100;
    this.updateVolumeUI(this.localVolume);

    this.dom.volumeSlider.addEventListener('input', (e) => {
      const level = parseFloat(e.target.value) / 100;
      this.setVolume(level);
    });

    this.dom.volumeBtn.addEventListener('click', () => {
      this.toggleMute();
    });
  }

  setVolume(level) {
    this.localVolume = level;
    localStorage.setItem('cinesync_vol', level.toString());

    if (this.isHost) {
      // Subtitles Elements
      lobbySubtitleInput: document.getElementById('lobbySubtitleInput');
      chooseSubtitleBtn: document.getElementById('chooseSubtitleBtn');
      lobbySubtitlePill: document.getElementById('lobbySubtitlePill');
      lobbySubtitleName: document.getElementById('lobbySubtitleName');
      removeLobbySubtitleBtn: document.getElementById('removeLobbySubtitleBtn');
      
      ccBtn: document.getElementById('ccBtn');
      subtitlesMenu: document.getElementById('subtitlesMenu');
      subtitlesToggleSwitch: document.getElementById('subtitlesToggleSwitch');
      theaterSubtitleInput: document.getElementById('theaterSubtitleInput');
      uploadSubtitleTheaterBtn: document.getElementById('uploadSubtitleTheaterBtn');
      theaterSubtitlePill: document.getElementById('theaterSubtitlePill');
      theaterSubtitleName: document.getElementById('theaterSubtitleName');
      offsetMinusBtn: document.getElementById('offsetMinusBtn');
      offsetPlusBtn: document.getElementById('offsetPlusBtn');
      offsetResetBtn: document.getElementById('offsetResetBtn');
      offsetValue: document.getElementById('offsetValue');
      sizePills: document.querySelectorAll('.size-pill-btn');

      // Controls only local speaker output, WebRTC audio track remains untouched at 1.0!
      this.audioEngine.setLocalVolume(level);
    } else {
      // Client video element volume
      this.dom.videoElement.volume = level;
      this.dom.videoElement.muted = level === 0;
    }

    this.updateVolumeUI(level);
  }

  toggleMute() {
    if (this.isHost) {
      const isMuted = this.audioEngine.toggleLocalMute();
      this.updateVolumeUI(isMuted ? 0 : this.localVolume);
      this.uiManager.showToast(isMuted ? 'Host speaker muted' : 'Host speaker unmuted', 'info');
    } else {
      this.dom.videoElement.muted = !this.dom.videoElement.muted;
      this.updateVolumeUI(this.dom.videoElement.muted ? 0 : this.localVolume);
    }
  }

  updateVolumeUI(level) {
    let iconSvg = '';
    if (level === 0) {
      iconSvg = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>`;
    } else if (level < 0.5) {
      iconSvg = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>`;
    } else {
      iconSvg = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>`;
    }
    this.dom.volumeIcon.innerHTML = iconSvg;
  }

  // =========================================================================
  // SOCIAL & CHAT
  // =========================================================================

  triggerReaction(emoji) {
    this.reactionEngine.spawn(emoji, 4);
    if (this.syncEngine) {
      this.syncEngine.sendReaction(emoji);
    }
  }

  sendChatMessage() {
    const text = this.dom.chatInput.value.trim();
    if (!text || !this.syncEngine) return;

    this.syncEngine.sendChat(text);
    this.dom.chatInput.value = '';
    this.dom.chatInput.focus();
  }

  renderChatBubble(chat) {
    const { text, sender, color, type } = chat;
    const isOwn = sender === this.syncEngine?.userName || sender === `${this.syncEngine?.userName} (Host)`;

    const bubble = document.createElement('div');
    if (type === 'SYSTEM') {
      bubble.className = 'chat-bubble system';
      bubble.innerText = text;
    } else {
      bubble.className = `chat-bubble ${isOwn ? 'own' : ''}`;
      bubble.innerHTML = `
        <div class="chat-sender" style="color:${color || '#8B5CF6'}">
          <span>${sender}</span>
        </div>
        <div class="chat-text">${this.escapeHtml(text)}</div>
      `;
    }

    this.dom.chatMessages.appendChild(bubble);
    this.dom.chatMessages.scrollTop = this.dom.chatMessages.scrollHeight;
  }

  updatePeersList(peers) {
    this.dom.viewersList.innerHTML = '';
    this.dom.viewerCountBadge.innerText = `👥 ${peers.length}`;

    peers.forEach(peer => {
      const item = document.createElement('div');
      item.className = 'viewer-item';
      const initial = peer.name ? peer.name.charAt(0).toUpperCase() : '?';

      item.innerHTML = `
        <div class="viewer-info">
          <div class="viewer-avatar" style="background:${peer.color || '#8B5CF6'}">
            ${initial}
          </div>
          <span class="viewer-name">${this.escapeHtml(peer.name)}</span>
        </div>
        <span class="viewer-role-pill ${peer.isHost ? 'host' : 'guest'}">
          ${peer.isHost ? 'HOST' : 'VIEWER'}
        </span>
      `;
      this.dom.viewersList.appendChild(item);
    });
  }

  // =========================================================================
  // MODALS & HELPERS
  // =========================================================================

  openShareModal() {
    const link = this.getInviteLink();
    this.dom.shareRoomCode.innerText = this.currentRoomId || '---';
    this.dom.shareRoomLink.innerText = link;
    this.uiManager.renderQRCode(this.dom.qrContainer, link);
    this.dom.shareModal.classList.add('active');
  }

  closeShareModal() {
    this.dom.shareModal.classList.remove('active');
  }

  getInviteLink() {
    const base = window.location.origin + window.location.pathname;
    return `${base}?room=${this.currentRoomId}`;
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      this.dom.playerContainer.requestFullscreen().catch(err => {
        this.uiManager.showToast(`Fullscreen error: ${err.message}`, 'warning');
      });
    } else {
      document.exitFullscreen();
    }
  }

  async togglePiP() {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (this.dom.videoElement) {
        await this.dom.videoElement.requestPictureInPicture();
      }
    } catch (err) {
      this.uiManager.showToast('Picture-in-Picture not supported on this browser', 'warning');
    }
  }

  resetIdleTimer() {
    this.dom.playerOverlay.classList.remove('idle-hidden');
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (!this.dom.videoElement.paused) {
        this.dom.playerOverlay.classList.add('idle-hidden');
      }
    }, 3200);
  }

  handleKeyboard(e) {
    // Ignore keystrokes when typing in inputs
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

    switch (e.code) {
      case 'Space':
      case 'KeyK':
        e.preventDefault();
        this.togglePlayPause();
        break;
      case 'ArrowLeft':
      case 'KeyJ':
        e.preventDefault();
        this.skipSeconds(-5);
        break;
      case 'ArrowRight':
      case 'KeyL':
        e.preventDefault();
        this.skipSeconds(5);
        break;
      case 'KeyF':
        e.preventDefault();
        this.toggleFullscreen();
        break;
      case 'KeyM':
        e.preventDefault();
        this.toggleMute();
        break;
      case 'KeyC':
        e.preventDefault();
        this.dom.sideDrawer.classList.toggle('collapsed');
        break;
    }
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.innerText = str;
    return div.innerHTML;
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.cinesyncApp = new App();
});
