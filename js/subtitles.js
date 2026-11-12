/**
 * CineSync - Subtitles Engine
 * Supports .srt and .vtt subtitle uploading, parsing, conversion,
 * customizable large font sizes (S, M, L), and a vertical position slider.
 */

export class SubtitleEngine {
  constructor(videoElement, overlayContainer = null, overlayText = null) {
    this.video = videoElement;
    this.overlayContainer = overlayContainer;
    this.overlayText = overlayText;
    this.playerContainer = videoElement.closest('.player-container') || document.body;

    this.rawCues = []; // { start: number, end: number, text: string }
    this.cues = [];    // Cues with timeOffset applied
    this.currentTrack = null;
    this.currentVttText = '';
    this.currentFileName = '';
    this.isEnabled = true;
    this.timeOffset = 0; // In seconds
    this.fontSize = localStorage.getItem('cinesync_sub_size') || 'normal'; // 'small' | 'normal' | 'large'
    this.verticalPosition = parseInt(localStorage.getItem('cinesync_sub_bottom') || '12', 10); // In percent (5% - 75%)

    this.initOverlay();
    this.bindEvents();
  }

  initOverlay() {
    this.setFontSize(this.fontSize);
    this.setVerticalPosition(this.verticalPosition);
  }

  bindEvents() {
    // Listen to video time updates to render current subtitle cue
    const onUpdate = () => {
      if (this.video) {
        this.renderCurrentCue(this.video.currentTime);
      }
    };

    this.video.addEventListener('timeupdate', onUpdate);
    this.video.addEventListener('seeked', onUpdate);
    this.video.addEventListener('seeking', onUpdate);
  }

  /**
   * Converts SubRip (.srt) format to WebVTT (.vtt) format
   * @param {string} srtText
   * @returns {string} vttText
   */
  static srtToVtt(srtText) {
    // Normalize line breaks
    let vtt = srtText.replace(/\r\n|\r/g, '\n').trim();

    // Replace comma with dot in timestamps (00:01:20,500 --> 00:01:23,800)
    vtt = vtt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

    // Remove index numbers before timestamps
    vtt = vtt.replace(/^\d+\s*\n(?=\d{2}:\d{2}:\d{2})/gm, '');

    return `WEBVTT - CineSync Synchronized Subtitles\n\n${vtt}`;
  }

  /**
   * Parses WebVTT text into an array of cue objects
   * @param {string} vttText
   * @returns {Array<{ start: number, end: number, text: string }>}
   */
  static parseVtt(vttText) {
    const blocks = vttText.split(/\n\s*\n/);
    const cues = [];

    const parseTime = (ts) => {
      const parts = ts.trim().split(':');
      let h = 0, m = 0, s = 0;
      if (parts.length === 3) {
        h = parseFloat(parts[0]);
        m = parseFloat(parts[1]);
        s = parseFloat(parts[2]);
      } else if (parts.length === 2) {
        m = parseFloat(parts[0]);
        s = parseFloat(parts[1]);
      }
      return h * 3600 + m * 60 + s;
    };

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('-->')) {
          const [startStr, endStr] = lines[i].split('-->').map(s => s.trim().split(' ')[0]);
          const text = lines.slice(i + 1).join('\n').trim();
          if (text) {
            cues.push({
              start: parseTime(startStr),
              end: parseTime(endStr),
              text
            });
          }
          break;
        }
      }
    }

    return cues;
  }

  /**
   * Loads a subtitle File or raw text and initializes both the custom overlay and native track
   * @param {File|Blob|string} source
   * @param {string} [name='Subtitles']
   * @returns {Promise<{ vttText: string, name: string }>}
   */
  async loadSubtitles(source, name = 'Subtitles') {
    let text = '';
    let fileName = name;

    if (source instanceof File || source instanceof Blob) {
      fileName = source.name || name;
      text = await source.text();
    } else if (typeof source === 'string') {
      text = source;
    }

    // Convert SRT to VTT if needed
    let vttText = text;
    if (fileName.toLowerCase().endsWith('.srt') || !text.startsWith('WEBVTT')) {
      vttText = SubtitleEngine.srtToVtt(text);
    }

    this.currentVttText = vttText;
    this.currentFileName = fileName;

    // Parse cues
    this.rawCues = SubtitleEngine.parseVtt(vttText);
    this.recalculateCues();

    // Mount native track (kept hidden so custom overlay handles the visual presentation)
    this.mountNativeTrack(vttText, fileName);

    // Render immediately if video has a position
    if (this.video) {
      this.renderCurrentCue(this.video.currentTime);
    }

    return { vttText: this.currentVttText, name: fileName };
  }

  recalculateCues() {
    this.cues = this.rawCues.map(c => ({
      start: Math.max(0, c.start + this.timeOffset),
      end: Math.max(0, c.end + this.timeOffset),
      text: c.text
    }));
  }

  mountNativeTrack(vttContent, label = 'Subtitles') {
    const existingTracks = this.video.querySelectorAll('track');
    existingTracks.forEach((t) => t.remove());

    const blob = new Blob([vttContent], { type: 'text/vtt;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);

    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = label;
    track.srclang = 'en';
    track.default = true;
    track.src = blobUrl;

    this.video.appendChild(track);
    this.currentTrack = track;

    // Keep native track hidden to avoid duplicate browser overlay
    if (track.track) {
      track.track.mode = 'hidden';
    }
  }

  /**
   * Renders the active subtitle cue onto the custom overlay
   * @param {number} currentTime
   */
  renderCurrentCue(currentTime) {
    if (!this.overlayContainer || !this.overlayText) return;

    if (!this.isEnabled || this.cues.length === 0) {
      this.overlayContainer.style.display = 'none';
      return;
    }

    // Find cue matching current time
    const activeCue = this.cues.find(c => currentTime >= c.start && currentTime <= c.end);

    if (activeCue) {
      this.overlayText.innerText = activeCue.text;
      this.overlayContainer.style.display = 'block';
    } else {
      this.overlayContainer.style.display = 'none';
    }
  }

  /**
   * Toggles subtitle visibility
   * @param {boolean} [forcedState]
   * @returns {boolean}
   */
  toggle(forcedState) {
    this.isEnabled = typeof forcedState === 'boolean' ? forcedState : !this.isEnabled;

    if (!this.isEnabled && this.overlayContainer) {
      this.overlayContainer.style.display = 'none';
    } else if (this.video) {
      this.renderCurrentCue(this.video.currentTime);
    }

    return this.isEnabled;
  }

  /**
   * Adjusts subtitle timing offset (+/- seconds)
   * @param {number} deltaSeconds e.g. +0.5 or -0.5
   */
  adjustOffset(deltaSeconds) {
    this.timeOffset += deltaSeconds;
    this.recalculateCues();
    if (this.video) {
      this.renderCurrentCue(this.video.currentTime);
    }
    return this.timeOffset;
  }

  resetOffset() {
    this.timeOffset = 0;
    this.recalculateCues();
    if (this.video) {
      this.renderCurrentCue(this.video.currentTime);
    }
    return 0;
  }

  /**
   * Sets the font size tier ('small', 'normal', 'large')
   * @param {'small'|'normal'|'large'} size
   */
  setFontSize(size) {
    this.fontSize = size;
    localStorage.setItem('cinesync_sub_size', size);

    if (this.playerContainer) {
      this.playerContainer.classList.remove('subtitles-small', 'subtitles-normal', 'subtitles-large');
      this.playerContainer.classList.add(`subtitles-${size}`);
    }
  }

  /**
   * Moves the subtitle position upward/downward (5% to 75% from bottom)
   * @param {number} percent
   */
  setVerticalPosition(percent) {
    this.verticalPosition = Math.max(5, Math.min(80, percent));
    localStorage.setItem('cinesync_sub_bottom', this.verticalPosition.toString());

    if (this.playerContainer) {
      this.playerContainer.style.setProperty('--subtitle-bottom', `${this.verticalPosition}%`);
    }
    if (this.overlayContainer) {
      this.overlayContainer.style.bottom = `${this.verticalPosition}%`;
    }
  }
}
