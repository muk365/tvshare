/**
 * CineSync - Floating Reactions Engine
 * Canvas-based animated emoji particle physics
 */

export class ReactionEngine {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.particles = [];
    this.animationFrame = null;
    this.isRunning = false;

    this.resize = this.resize.bind(this);
    this.loop = this.loop.bind(this);

    window.addEventListener('resize', this.resize);
    this.resize();
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  }

  /**
   * Spawns an emoji burst at a position or randomized across bottom right
   * @param {string} emoji
   * @param {number} [count=1]
   */
  spawn(emoji, count = 1) {
    if (!this.canvas) return;

    for (let i = 0; i < count; i++) {
      // Spawn around bottom-right quadrant of video with natural spread
      const startX = this.canvas.width * (0.65 + Math.random() * 0.28);
      const startY = this.canvas.height - 30;

      this.particles.push({
        emoji,
        x: startX,
        y: startY,
        vx: (Math.random() - 0.5) * 1.8,
        vy: -(2.8 + Math.random() * 3.2),
        size: 26 + Math.random() * 14,
        alpha: 1,
        rotation: (Math.random() - 0.5) * 0.4,
        rotationSpeed: (Math.random() - 0.5) * 0.05,
        swaySpeed: 0.04 + Math.random() * 0.03,
        swayOffset: Math.random() * Math.PI * 2,
        life: 0,
        maxLife: 100 + Math.random() * 40
      });
    }

    if (!this.isRunning) {
      this.isRunning = true;
      this.loop();
    }
  }

  loop() {
    if (!this.ctx || !this.canvas) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life++;

      // Sway motion
      p.x += p.vx + Math.sin(p.life * p.swaySpeed + p.swayOffset) * 0.9;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;

      // Fade out towards end of life
      if (p.life > p.maxLife * 0.65) {
        p.alpha = Math.max(0, 1 - (p.life - p.maxLife * 0.65) / (p.maxLife * 0.35));
      }

      this.ctx.save();
      this.ctx.globalAlpha = p.alpha;
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate(p.rotation);
      this.ctx.font = `${p.size}px 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(p.emoji, 0, 0);
      this.ctx.restore();

      if (p.life >= p.maxLife || p.alpha <= 0 || p.y < -50) {
        this.particles.splice(i, 1);
      }
    }

    if (this.particles.length > 0) {
      this.animationFrame = requestAnimationFrame(this.loop);
    } else {
      this.isRunning = false;
    }
  }

  destroy() {
    window.removeEventListener('resize', this.resize);
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.particles = [];
  }
}
