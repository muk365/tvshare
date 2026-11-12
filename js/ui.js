/**
 * CineSync - UI Helper Module
 * Toasts, ambient cinema backlight, center splash animations, QR codes, and tooltips
 */

export class UIManager {
  constructor() {
    this.toastContainer = document.getElementById('toastContainer');
    this.ambientCanvas = document.getElementById('ambientCanvas');
    this.ambientCtx = this.ambientCanvas ? this.ambientCanvas.getContext('2d', { willReadFrequently: true }) : null;
    this.centerSplash = document.getElementById('centerSplash');
    this.centerSplashIcon = document.getElementById('centerSplashIcon');
    this.splashTimeout = null;
    this.ambientInterval = null;
  }

  /**
   * Shows a modern floating toast notification
   * @param {string} message
   * @param {'info'|'success'|'warning'|'error'} [type='info']
   * @param {number} [duration=3500]
   */
  showToast(message, type = 'info', duration = 3500) {
    if (!this.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`;
    } else if (type === 'warning' || type === 'error') {
      iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    } else {
      iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    toast.innerHTML = `${iconSvg}<span>${message}</span>`;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 260);
    }, duration);
  }

  /**
   * Pulses an animated feedback badge in the center of the video screen (Play, Pause, +/-5s)
   * @param {'play'|'pause'|'forward5'|'backward5'} action
   */
  triggerCenterSplash(action) {
    if (!this.centerSplash || !this.centerSplashIcon) return;

    if (this.splashTimeout) {
      clearTimeout(this.splashTimeout);
    }

    let svgHtml = '';
    if (action === 'play') {
      svgHtml = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    } else if (action === 'pause') {
      svgHtml = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`;
    } else if (action === 'forward5') {
      svgHtml = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 14l5-5-5-5"/><path d="M6 14l5-5-5-5"/><text x="12" y="22" font-size="7" font-weight="bold" fill="currentColor" text-anchor="middle" stroke="none">+5s</text></svg>`;
    } else if (action === 'backward5') {
      svgHtml = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 14l-5-5 5-5"/><path d="M18 14l-5-5 5-5"/><text x="12" y="22" font-size="7" font-weight="bold" fill="currentColor" text-anchor="middle" stroke="none">-5s</text></svg>`;
    }

    this.centerSplashIcon.innerHTML = svgHtml;
    this.centerSplash.classList.add('active');

    this.splashTimeout = setTimeout(() => {
      this.centerSplash.classList.remove('active');
    }, 450);
  }

  /**
   * Starts ambient back-lighting sampling from the video to create cinema backlight
   * @param {HTMLVideoElement} videoElement
   */
  startAmbientBacklight(videoElement) {
    if (!this.ambientCanvas || !this.ambientCtx || !videoElement) return;

    this.ambientCanvas.width = 64;
    this.ambientCanvas.height = 36;

    if (this.ambientInterval) clearInterval(this.ambientInterval);

    this.ambientInterval = setInterval(() => {
      if (videoElement.paused || videoElement.ended || videoElement.readyState < 2) return;
      try {
        this.ambientCtx.drawImage(videoElement, 0, 0, 64, 36);
      } catch {
        // In case of any cross-origin capture protection
      }
    }, 120);
  }

  stopAmbientBacklight() {
    if (this.ambientInterval) {
      clearInterval(this.ambientInterval);
      this.ambientInterval = null;
    }
  }

  /**
   * Generates a QR Code in a container element
   * @param {HTMLElement} container
   * @param {string} text
   */
  renderQRCode(container, text) {
    if (!container) return;
    container.innerHTML = '';

    if (window.QRCode) {
      new window.QRCode(container, {
        text: text,
        width: 180,
        height: 180,
        colorDark: '#08090d',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.M
      });
    } else {
      // Fallback message
      container.innerHTML = `<p style="color:#000;font-size:0.8rem;word-break:break-all;">${text}</p>`;
    }
  }

  /**
   * Copies text to clipboard and flashes confirmation on target element
   * @param {string} text
   * @param {HTMLElement} [buttonElement]
   * @param {string} [originalText]
   */
  async copyToClipboard(text, buttonElement = null, originalText = '') {
    try {
      await navigator.clipboard.writeText(text);
      this.showToast('Invite link copied to clipboard! 📋', 'success');

      if (buttonElement) {
        buttonElement.innerText = 'Copied! ✓';
        buttonElement.style.background = 'rgba(16, 185, 129, 0.25)';
        buttonElement.style.borderColor = 'rgba(16, 185, 129, 0.5)';
        buttonElement.style.color = '#34d399';

        setTimeout(() => {
          buttonElement.innerText = originalText || 'Copy Link';
          buttonElement.style.background = '';
          buttonElement.style.borderColor = '';
          buttonElement.style.color = '';
        }, 2200);
      }
    } catch {
      this.showToast('Please copy the link manually', 'warning');
    }
  }

  /**
   * Formats seconds into HH:MM:SS or MM:SS
   * @param {number} totalSeconds
   * @returns {string}
   */
  static formatTime(totalSeconds) {
    if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    const pad = (n) => String(n).padStart(2, '0');

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  }
}
