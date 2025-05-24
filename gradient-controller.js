// 渐变主题控制器
class GradientController {
  constructor() {
    this.currentTheme = 'deep-blue';
    this.isParticlesEnabled = false;
    this.isGlowEnabled = false;

    this.init();
  }

  init() {
    this.bindEvents();
    this.loadSettings();
  }

  bindEvents() {
    // 渐变主题选择器事件（支持新旧两种布局）
    document.querySelectorAll('.gradient-mini-preview').forEach(preview => {
      preview.addEventListener('click', e => {
        const theme = e.target.dataset.gradient;
        this.applyTheme(theme);
      });
    });

    // 特效开关事件
    const particlesToggle = document.getElementById('particles-effect-toggle');
    const glowToggle = document.getElementById('glow-effect-toggle');

    if (particlesToggle) {
      particlesToggle.addEventListener('change', e => {
        this.toggleParticles(e.target.checked);
      });
    }

    if (glowToggle) {
      glowToggle.addEventListener('change', e => {
        this.toggleGlow(e.target.checked);
      });
    }

    // 背景设置面板控制
    const backgroundBtn = document.getElementById('background-settings-btn');
    if (backgroundBtn) {
      backgroundBtn.addEventListener('click', () => {
        this.toggleBackgroundPanel();
      });
    }

    // 点击外部关闭背景面板
    document.addEventListener('click', e => {
      const panel = document.getElementById('background-settings-panel');
      const btn = document.getElementById('background-settings-btn');
      if (panel && !panel.contains(e.target) && !btn?.contains(e.target)) {
        panel.classList.remove('active');
      }
    });
  }

  // 应用主题
  applyTheme(themeName) {
    const body = document.body;

    // 移除所有渐变主题类
    const gradientClasses = [
      'gradient-background',
      'gradient-deep-blue',
      'gradient-aurora',
      'gradient-sakura',
      'gradient-neon',
      'gradient-ocean',
      'gradient-golden',
      'gradient-emerald',
      'gradient-cosmic',
      'gradient-lavender',
      'gradient-mystic',
      'gradient-steel',
      'gradient-mint',
      'gradient-volcano',
      'gradient-crystal',
      'gradient-spectrum',
      'gradient-shadow',
      'gradient-rose-gold',
      'gradient-nordic',
      'gradient-cyberpunk',
      'gradient-sunset',
    ];

    gradientClasses.forEach(className => {
      body.classList.remove(className);
    });

    // 如果选择深蓝主题，保持默认body样式，否则添加渐变类
    if (themeName !== 'deep-blue') {
      body.classList.add('gradient-background', `gradient-${themeName}`);
    }

    // 更新选择器状态
    document.querySelectorAll('.gradient-mini-preview').forEach(preview => {
      preview.classList.remove('active');
    });

    const activePreview = document.querySelector(`[data-gradient="${themeName}"]`);
    if (activePreview) {
      activePreview.classList.add('active');
    }

    this.currentTheme = themeName;
    this.saveSettings();

    // 添加切换动画效果
    this.addSwitchEffect();
  }

  // 切换粒子效果
  toggleParticles(enabled) {
    this.isParticlesEnabled = enabled;

    if (enabled) {
      this.createParticles();
    } else {
      this.removeParticles();
    }

    this.saveSettings();
  }

  // 创建粒子效果
  createParticles() {
    // 移除现有粒子
    this.removeParticles();

    const particlesContainer = document.createElement('div');
    particlesContainer.className = 'particles-effect';
    particlesContainer.id = 'particles-container';

    // 创建50个粒子
    for (let i = 0; i < 50; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';

      // 随机位置和延迟
      particle.style.left = Math.random() * 100 + '%';
      particle.style.animationDelay = Math.random() * 6 + 's';
      particle.style.animationDuration = Math.random() * 3 + 4 + 's';

      // 随机大小
      const size = Math.random() * 3 + 1;
      particle.style.width = size + 'px';
      particle.style.height = size + 'px';

      particlesContainer.appendChild(particle);
    }

    document.body.appendChild(particlesContainer);
  }

  // 移除粒子效果
  removeParticles() {
    const existing = document.getElementById('particles-container');
    if (existing) {
      existing.remove();
    }
  }

  // 切换光晕效果
  toggleGlow(enabled) {
    this.isGlowEnabled = enabled;

    if (enabled) {
      this.createGlow();
    } else {
      this.removeGlow();
    }

    this.saveSettings();
  }

  // 创建光晕效果
  createGlow() {
    this.removeGlow();

    const glowContainer = document.createElement('div');
    glowContainer.className = 'glow-effect';
    glowContainer.id = 'glow-container';

    // 创建3个光晕球
    const colors = ['#ff6b6b', '#4ecdc4', '#a8e6cf'];

    for (let i = 0; i < 3; i++) {
      const orb = document.createElement('div');
      orb.className = 'glow-orb';

      // 随机位置和大小
      orb.style.left = Math.random() * 80 + 10 + '%';
      orb.style.top = Math.random() * 80 + 10 + '%';
      orb.style.width = Math.random() * 200 + 100 + 'px';
      orb.style.height = orb.style.width;
      orb.style.backgroundColor = colors[i];
      orb.style.animationDelay = i * 2.5 + 's';

      glowContainer.appendChild(orb);
    }

    document.body.appendChild(glowContainer);
  }

  // 移除光晕效果
  removeGlow() {
    const existing = document.getElementById('glow-container');
    if (existing) {
      existing.remove();
    }
  }

  // 应用预设主题
  applyPreset(presetName) {
    switch (presetName) {
      case 'anime-night':
        this.applyTheme('aurora');
        this.toggleParticles(true);
        this.toggleGlow(true);
        break;

      case 'cyberpunk-city':
        this.applyTheme('neon');
        this.toggleParticles(true);
        this.toggleGlow(false);
        break;

      case 'peaceful-nature':
        this.applyTheme('emerald');
        this.toggleParticles(false);
        this.toggleGlow(true);
        break;

      case 'minimal-focus':
        this.applyTheme('shadow');
        this.toggleParticles(false);
        this.toggleGlow(false);
        break;
    }

    // 更新界面控件状态
    this.updateControlsState();
  }

  // 随机主题
  randomTheme() {
    const themes = [
      'deep-blue',
      'aurora',
      'sakura',
      'neon',
      'ocean',
      'golden',
      'emerald',
      'cosmic',
      'lavender',
      'mystic',
      'steel',
      'mint',
      'volcano',
      'crystal',
      'spectrum',
      'shadow',
      'rose-gold',
      'nordic',
      'cyberpunk',
      'sunset',
    ];

    const randomTheme = themes[Math.floor(Math.random() * themes.length)];
    const randomParticles = Math.random() > 0.5;
    const randomGlow = Math.random() > 0.5;

    this.applyTheme(randomTheme);
    this.toggleParticles(randomParticles);
    this.toggleGlow(randomGlow);

    this.updateControlsState();
  }

  // 更新控件状态
  updateControlsState() {
    const particlesToggle = document.getElementById('particles-effect-toggle');
    const glowToggle = document.getElementById('glow-effect-toggle');

    if (particlesToggle) {
      particlesToggle.checked = this.isParticlesEnabled;
    }

    if (glowToggle) {
      glowToggle.checked = this.isGlowEnabled;
    }
  }

  // 添加切换效果
  addSwitchEffect() {
    const body = document.body;
    body.style.transition = 'background 0.8s cubic-bezier(0.4, 0, 0.2, 1)';

    // 添加短暂的闪光效果
    const flash = document.createElement('div');
    flash.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
      z-index: 9999;
      pointer-events: none;
      opacity: 0;
      animation: flash 0.5s ease-out;
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes flash {
        0% { opacity: 0; }
        50% { opacity: 1; }
        100% { opacity: 0; }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(flash);

    setTimeout(() => {
      flash.remove();
      style.remove();
    }, 500);
  }

  // 保存设置
  saveSettings() {
    const settings = {
      currentTheme: this.currentTheme,
      isParticlesEnabled: this.isParticlesEnabled,
      isGlowEnabled: this.isGlowEnabled,
    };

    localStorage.setItem('gradientSettings', JSON.stringify(settings));
  }

  // 加载设置
  loadSettings() {
    const saved = localStorage.getItem('gradientSettings');

    if (saved) {
      try {
        const settings = JSON.parse(saved);

        this.currentTheme = settings.currentTheme || 'deep-blue';
        this.isParticlesEnabled = settings.isParticlesEnabled || false;
        this.isGlowEnabled = settings.isGlowEnabled || false;

        // 应用设置
        this.applyTheme(this.currentTheme);
        this.toggleParticles(this.isParticlesEnabled);
        this.toggleGlow(this.isGlowEnabled);
        this.updateControlsState();
      } catch (e) {
        console.error('渐变设置加载失败:', e);
        // 如果加载失败，确保设置默认主题
        this.applyTheme('deep-blue');
      }
    } else {
      // 如果没有保存的设置，应用默认主题
      this.applyTheme('deep-blue');
    }
  }

  // 切换背景设置面板
  toggleBackgroundPanel() {
    const panel = document.getElementById('background-settings-panel');
    if (panel) {
      panel.classList.toggle('active');
    }
  }
}

// 创建全局实例
window.gradientController = new GradientController();

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  // 确保控制器正确初始化
  if (window.gradientController) {
    console.log('渐变主题控制器已启动');
  }
});
