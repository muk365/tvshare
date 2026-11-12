/**
 * CineSync - Web Audio API Engine
 * Guarantees that Host's volume control is 100% independent from the streamed audio!
 * Host can mute or lower speaker volume without affecting remote viewers' audio.
 */

export class AudioEngine {
  constructor() {
    this.audioCtx = null;
    this.source = null;
    this.hostGain = null;
    this.streamDestination = null;
    this.analyser = null;
    this.isInitialized = false;
    this.localVolume = 1.0;
    this.isMuted = false;
  }

  /**
   * Initializes the AudioContext on user interaction
   * @param {HTMLMediaElement} mediaElement
   */
  init(mediaElement) {
    if (this.isInitialized) return;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();

      // Create audio source node from the video element
      this.source = this.audioCtx.createMediaElementSource(mediaElement);

      // 1. Host local speaker route (controlled by localVolume)
      this.hostGain = this.audioCtx.createGain();
      this.hostGain.gain.setValueAtTime(this.localVolume, this.audioCtx.currentTime);

      // Analyser for optional visualizer effects
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 64;

      this.source.connect(this.hostGain);
      this.hostGain.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);

      // 2. Stream destination route: Stays at 1.0 full volume for WebRTC viewers!
      this.streamDestination = this.audioCtx.createMediaStreamDestination();
      this.source.connect(this.streamDestination);

      this.isInitialized = true;
      console.log('[AudioEngine] Successfully initialized isolated audio routes.');
    } catch (err) {
      console.warn('[AudioEngine] Web Audio routing warning (fallback will be used):', err);
      this.isInitialized = false;
    }
  }

  /**
   * Resumes AudioContext if suspended by browser autoplay policy
   */
  async resume() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
  }

  /**
   * Adjusts Host's local speaker volume (0.0 to 1.0)
   * Has ZERO effect on remote clients!
   * @param {number} level 0.0 to 1.0
   */
  setLocalVolume(level) {
    this.localVolume = Math.max(0, Math.min(1, level));
    if (this.audioCtx && this.hostGain && !this.isMuted) {
      this.hostGain.gain.setValueAtTime(this.localVolume, this.audioCtx.currentTime);
    }
  }

  /**
   * Toggles Host local mute
   * @param {boolean} [forceState]
   */
  toggleLocalMute(forceState) {
    this.isMuted = typeof forceState === 'boolean' ? forceState : !this.isMuted;
    if (this.audioCtx && this.hostGain) {
      const targetGain = this.isMuted ? 0 : this.localVolume;
      this.hostGain.gain.setValueAtTime(targetGain, this.audioCtx.currentTime);
    }
    return this.isMuted;
  }

  /**
   * Gets the isolated full-volume audio track to combine with WebRTC video stream
   * @returns {MediaStreamTrack|null}
   */
  getStreamAudioTrack() {
    if (this.streamDestination && this.streamDestination.stream) {
      const tracks = this.streamDestination.stream.getAudioTracks();
      if (tracks.length > 0) return tracks[0];
    }
    return null;
  }
}
