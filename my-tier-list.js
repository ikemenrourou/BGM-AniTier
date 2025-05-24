// 图片加载和交互效果
document.addEventListener('DOMContentLoaded', function () {
  // API和图片URL
  const LEGACY_APIURL = `https://lab.magiconch.com/api/bangumi/`; // 保留旧API以备参考或回退
  const BANGUMI_V0_API_BASE = 'https://api.bgm.tv'; // 新的官方API基础URL
  const USER_AGENT = 'ikemenrourou/BGM-AniTier/0.1.0 (https://github.com/ikemenrourou/BGM-AniTier)'; // 规范的User-Agent
  const BANGUMI_SUBJECT_URL = 'https://bgm.tv/subject/'; // Bangumi条目页面URL

  // 搜索状态变量
  let currentSearchKeyword = ''; // 当前搜索关键词
  let currentSearchOffset = 0; // 当前搜索偏移量
  let isLoadingMore = false; // 是否正在加载更多
  let hasMoreResults = true; // 是否还有更多结果
  let currentSearchTags = []; // 当前搜索标签
  let currentAnimeResults = []; // 当前搜索结果缓存

  // 自定义标题相关变量
  let customTitle = localStorage.getItem('anime-tier-list-title') || '我的动画 Tier List';
  const titleElement = document.getElementById('custom-title');
  const editTitleBtn = document.getElementById('edit-title-btn');

  // 显示保存的标题
  if (titleElement) {
    titleElement.textContent = customTitle;
    document.title = customTitle; // 更新页面标题
  }

  // 季度新番状态变量 - 从本地存储加载，如果没有则使用当前季度
  const savedSeasonalState = JSON.parse(localStorage.getItem('anime-seasonal-state') || '{}');
  let lastSelectedYear = savedSeasonalState.year || new Date().getFullYear();
  let lastSelectedMonth = savedSeasonalState.month || getCurrentSeason();
  let lastSelectedTab = savedSeasonalState.tab || 'bangumi';

  // 搜索结果缓存系统
  const SEARCH_CACHE_EXPIRY = 60 * 60 * 1000; // 缓存有效期：1小时（毫秒）
  const searchResultsCache = {
    // 关键词搜索缓存
    keywords: {},
    // 标签搜索缓存
    tags: {},
    // 清理过期缓存
    cleanExpired: function () {
      const now = Date.now();
      // 清理关键词缓存
      for (const key in this.keywords) {
        if (now - this.keywords[key].timestamp > SEARCH_CACHE_EXPIRY) {
          delete this.keywords[key];
        }
      }
      // 清理标签缓存
      for (const key in this.tags) {
        if (now - this.tags[key].timestamp > SEARCH_CACHE_EXPIRY) {
          delete this.tags[key];
        }
      }
    },
    // 缓存搜索结果
    cache: function (type, key, results, total) {
      const target = type === 'keyword' ? this.keywords : this.tags;
      if (!target[key]) {
        target[key] = {
          results: [],
          offsets: {},
          total: 0,
          timestamp: Date.now(),
        };
      }

      target[key].timestamp = Date.now(); // 更新时间戳
      target[key].total = total;

      // 记录当前偏移量的结果
      const offset = currentSearchOffset - results.length;
      target[key].offsets[offset] = results;

      // 合并所有结果
      target[key].results = [];
      for (const off in target[key].offsets) {
        target[key].results = [...target[key].results, ...target[key].offsets[off]];
      }
    },
    // 获取缓存的搜索结果
    get: function (type, key, offset, limit) {
      this.cleanExpired(); // 每次获取前清理过期缓存

      const target = type === 'keyword' ? this.keywords : this.tags;
      if (!target[key]) return null;

      // 如果有这个偏移量的缓存，直接返回
      if (target[key].offsets[offset]) {
        return {
          results: target[key].offsets[offset],
          total: target[key].total,
        };
      }

      // 否则检查是否可以从完整结果中切片
      if (offset + limit <= target[key].results.length) {
        return {
          results: target[key].results.slice(offset, offset + limit),
          total: target[key].total,
        };
      }

      return null; // 没有找到缓存
    },
  };

  // 获取当前季度对应的月份（1, 4, 7, 10）
  function getCurrentSeason() {
    const month = new Date().getMonth() + 1; // JavaScript月份从0开始
    if (month >= 1 && month <= 3) return 1;
    if (month >= 4 && month <= 6) return 4;
    if (month >= 7 && month <= 9) return 7;
    return 10;
  }

  // 保存季度新番状态
  function saveSeasonalState() {
    localStorage.setItem(
      'anime-seasonal-state',
      JSON.stringify({
        year: lastSelectedYear,
        month: lastSelectedMonth,
        tab: lastSelectedTab,
      }),
    );
  }

  // 旧的封面获取方式，可能会被新API返回的图片信息替代
  const LEGACY_ImageURL = `https://api.anitabi.cn/bgm/`;
  const getLegacyCoverURLById = id => `${LEGACY_ImageURL}anime/${id}/cover.jpg`;

  // 缓存系统
  const Caches = {};
  const get = async url => {
    if (Caches[url]) return Caches[url];
    document.documentElement.setAttribute('data-no-touch', true);
    const f = await fetch(url);
    const data = await f.json();
    Caches[url] = data;
    document.documentElement.setAttribute('data-no-touch', false);
    return data;
  };

  // 图片加载器
  const Images = {};
  const loadImage = (src, onOver) => {
    if (Images[src]) return onOver(Images[src]);
    const el = new Image();
    el.crossOrigin = 'Anonymous';
    el.src = src;
    el.onload = () => {
      onOver(el);
      Images[src] = el;
    };
  };

  // 获取动画详情 - 暴露给全局以便comments.js使用
  window.fetchAnimeDetail = async function (animeId) {
    try {
      // 显示加载状态
      const detailDialog = document.getElementById('anime-detail-dialog');
      const detailContent = detailDialog.querySelector('.anime-detail-content');
      detailContent.innerHTML = '<div class="loading">正在加载动画详情...</div>';

      // 显示对话框
      detailDialog.classList.add('active');

      // 构建API URL
      const apiUrl = `${BANGUMI_V0_API_BASE}/v0/subjects/${animeId}`;

      // 发送请求
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
        },
      });

      if (!response.ok) {
        throw new Error(`获取动画详情失败: ${response.status}`);
      }

      // 解析响应
      const animeData = await response.json();

      // 显示详情
      displayAnimeDetail(animeData);
    } catch (error) {
      console.error('获取动画详情出错:', error);
      const detailDialog = document.getElementById('anime-detail-dialog');
      const detailContent = detailDialog.querySelector('.anime-detail-content');
      detailContent.innerHTML = `
        <button class="export-dialog-close"><i class="fas fa-times"></i></button>
        <div class="error-message">
          <i class="fas fa-exclamation-circle"></i>
          <p>获取动画详情失败，请稍后重试。</p>
          <p class="error-details">${error.message}</p>
        </div>
      `;

      // 添加关闭按钮事件
      const closeBtn = detailContent.querySelector('.export-dialog-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', function () {
          detailDialog.classList.remove('active');
        });
      }
    }
  };

  // 显示动画详情
  function displayAnimeDetail(animeData) {
    // 获取对话框元素
    const detailDialog = document.getElementById('anime-detail-dialog');

    // 重置对话框内容
    detailDialog.querySelector('.anime-detail-content').innerHTML = `
      <button class="export-dialog-close"><i class="fas fa-times"></i></button>
      <div class="anime-detail-header">
        <div class="anime-detail-cover">
          <img id="detail-cover" src="${animeData.images?.medium || ''}" alt="${animeData.name || '封面'}" />
        </div>
        <div class="anime-detail-info">
          <h3 id="detail-title" class="anime-detail-title">${animeData.name || ''}</h3>
          <h4 id="detail-title-cn" class="anime-detail-title-cn">${animeData.name_cn || ''}</h4>
          <div class="anime-detail-meta">
            <div class="meta-item">
              <span class="meta-label"><i class="fas fa-calendar-alt"></i> 放送日期:</span>
              <span id="detail-air-date" class="meta-value">${animeData.date || '未知'}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label"><i class="fas fa-star"></i> 评分:</span>
              <span id="detail-rating" class="meta-value">${
                animeData.rating?.score ? animeData.rating.score.toFixed(1) : '暂无'
              }</span>
            </div>
            <div class="meta-item">
              <span class="meta-label"><i class="fas fa-list-ol"></i> 排名:</span>
              <span id="detail-rank" class="meta-value">${animeData.rating?.rank || '暂无'}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label"><i class="fas fa-film"></i> 集数:</span>
              <span id="detail-eps" class="meta-value">${animeData.total_episodes || '未知'}</span>
            </div>
          </div>
          <div class="anime-detail-tags" id="detail-tags">
            ${generateTagsHTML(animeData.tags)}
          </div>
        </div>
      </div>
      <div class="anime-detail-body">
        <div class="detail-section">
          <h4 class="detail-section-title"><i class="fas fa-info-circle"></i> 简介</h4>
          <div id="detail-summary" class="detail-section-content">${animeData.summary || '暂无简介'}</div>
        </div>
        <div class="detail-section">
          <h4 class="detail-section-title"><i class="fas fa-building"></i> 制作信息</h4>
          <div id="detail-infobox" class="detail-section-content">${generateInfoboxHTML(animeData.infobox)}</div>
        </div>
      </div>
      <div class="anime-detail-actions">
        <a id="detail-bgm-link" href="${BANGUMI_SUBJECT_URL}${
      animeData.id
    }" target="_blank" class="export-dialog-btn secondary">
          <i class="fas fa-external-link-alt"></i>
          <span>在Bangumi上查看</span>
        </a>
      </div>
    `;

    // 添加关闭按钮事件
    const closeBtn = detailDialog.querySelector('.export-dialog-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        detailDialog.classList.remove('active');
      });
    }
  }

  // 生成标签HTML
  function generateTagsHTML(tags) {
    if (!tags || tags.length === 0) return '';

    return tags
      .slice(0, 10)
      .map(tag => {
        return `<span class="detail-tag">${tag.name}</span>`;
      })
      .join('');
  }

  // 生成制作信息HTML
  function generateInfoboxHTML(infobox) {
    if (!infobox || infobox.length === 0) return '暂无制作信息';

    let tableHTML = '<table class="infobox-table">';

    infobox.forEach(item => {
      if (item.key && item.value) {
        tableHTML += `
          <tr>
            <td>${item.key}</td>
            <td>${Array.isArray(item.value) ? item.value.join(', ') : item.value}</td>
          </tr>
        `;
      }
    });

    tableHTML += '</table>';
    return tableHTML;
  }

  // 默认空数据结构 - 包含所有tier 1-10和.5分数
  const tiers = {
    10: [],
    9.5: [],
    9: [],
    8.5: [],
    8: [],
    7.5: [],
    7: [],
    6.5: [],
    6: [],
    5.5: [],
    5: [],
    4.5: [],
    4: [],
    3.5: [],
    3: [],
    2.5: [],
    2: [],
    1.5: [],
    1: [],
  };

  // 从本地存储加载数据
  function loadFromLocalStorage() {
    const savedTiers = localStorage.getItem('anime-tier-list-data');
    if (savedTiers) {
      const parsedTiers = JSON.parse(savedTiers);
      // 将保存的数据合并到tiers对象中
      Object.keys(parsedTiers).forEach(tier => {
        tiers[tier] = parsedTiers[tier];
      });
      console.log('从本地存储加载了数据');
    } else {
      console.log('本地存储中没有找到数据，使用默认空数据');
    }

    // 加载可见tier配置
    const visibleTiers = localStorage.getItem('anime-tier-list-visible-tiers');
    if (visibleTiers) {
      const parsedVisibleTiers = JSON.parse(visibleTiers);
      // 根据配置显示或隐藏tier行
      Object.keys(tiers).forEach(tier => {
        const tierRow = document.getElementById(`tier-${tier}`);
        if (tierRow) {
          if (parsedVisibleTiers.includes(parseFloat(tier))) {
            tierRow.style.display = 'flex';
          } else {
            tierRow.style.display = 'none';
          }
        }
      });
    }
  }

  // 保存数据到本地存储
  function saveToLocalStorage() {
    localStorage.setItem('anime-tier-list-data', JSON.stringify(tiers));
    console.log('数据已保存到本地存储');

    // 保存可见tier配置
    const visibleTiers = [];
    Object.keys(tiers).forEach(tier => {
      const tierRow = document.getElementById(`tier-${tier}`);
      if (tierRow && tierRow.style.display !== 'none') {
        visibleTiers.push(parseFloat(tier));
      }
    });
    localStorage.setItem('anime-tier-list-visible-tiers', JSON.stringify(visibleTiers));
  }

  // 加载本地存储的数据
  loadFromLocalStorage();

  // 初始化Tier行显示状态
  function initTierRows() {
    // 如果没有保存的配置，默认只显示整数分数的tier
    const visibleTiers = localStorage.getItem('anime-tier-list-visible-tiers');
    if (!visibleTiers) {
      // 默认显示10-1的整数tier，隐藏所有.5分数的tier
      Object.keys(tiers).forEach(tier => {
        const tierRow = document.getElementById(`tier-${tier}`);
        if (tierRow) {
          // 检查是否为整数
          if (Number.isInteger(parseFloat(tier))) {
            tierRow.style.display = 'flex';
          } else {
            tierRow.style.display = 'none';
          }
        }
      });
      // 保存初始配置
      saveToLocalStorage();
    }
  }

  // 初始化Tier行
  initTierRows();

  // 初始化设置菜单
  function initSettingsMenu() {
    const settingsBtn = document.getElementById('settings-menu-btn');
    const settingsPanel = document.getElementById('settings-menu-panel');
    const titleToggle = document.getElementById('title-display-toggle');
    const tierDropdownList = document.querySelector('.settings-menu-panel .tier-dropdown-list');

    // 导出与分享按钮
    const exportImageBtn = document.getElementById('export-image-btn');
    const exportJsonBtn = document.getElementById('export-json-btn');
    const importJsonBtn = document.getElementById('import-json-btn');
    const shareBtn = document.getElementById('share-link-btn');
    const importFileInput = document.getElementById('import-file-input');

    if (!settingsBtn || !settingsPanel || !titleToggle) {
      console.error('设置菜单元素未找到');
      return;
    }

    // 设置菜单开关
    settingsBtn.addEventListener('click', function (e) {
      e.stopPropagation(); // 阻止事件冒泡
      settingsBtn.classList.toggle('active');
      settingsPanel.classList.toggle('active');
    });

    // 点击外部关闭菜单
    document.addEventListener('click', function (e) {
      if (!settingsBtn.contains(e.target) && !settingsPanel.contains(e.target)) {
        settingsBtn.classList.remove('active');
        settingsPanel.classList.remove('active');
      }
    });

    // 标题显示开关 - 默认为显示文字
    // 如果本地存储中没有设置，则默认为显示标题
    const hideTitle = localStorage.getItem('hide-titles');
    titleToggle.checked = hideTitle === null ? true : hideTitle !== 'true';

    titleToggle.addEventListener('change', function () {
      const tierListContainer = document.querySelector('.tier-list-container');
      if (this.checked) {
        // 显示标题
        tierListContainer.classList.remove('hide-titles');
        localStorage.setItem('hide-titles', 'false');
      } else {
        // 隐藏标题
        tierListContainer.classList.add('hide-titles');
        localStorage.setItem('hide-titles', 'true');
      }
    });

    // 初始化标题显示状态 - 确保立即应用设置
    const tierListContainer = document.querySelector('.tier-list-container');
    if (hideTitle === null) {
      // 首次使用，默认显示标题
      tierListContainer.classList.remove('hide-titles');
      localStorage.setItem('hide-titles', 'false');
    } else if (hideTitle === 'true') {
      tierListContainer.classList.add('hide-titles');
    } else {
      tierListContainer.classList.remove('hide-titles');
    }

    // 确保开关状态与实际显示状态一致
    setTimeout(() => {
      const currentHideTitles = localStorage.getItem('hide-titles') === 'true';
      titleToggle.checked = !currentHideTitles;

      if (currentHideTitles) {
        tierListContainer.classList.add('hide-titles');
      } else {
        tierListContainer.classList.remove('hide-titles');
      }
    }, 100);

    // 初始化Tier管理下拉列表
    initTierDropdown(tierDropdownList);

    // 初始化导出与分享功能
    if (exportImageBtn) {
      exportImageBtn.addEventListener('click', exportAsImage);
    }

    if (exportJsonBtn) {
      exportJsonBtn.addEventListener('click', exportAsJson);
    }

    if (importJsonBtn) {
      importJsonBtn.addEventListener('click', function () {
        importFileInput.click();
      });
    }

    if (shareBtn) {
      shareBtn.addEventListener('click', generateShareLink);
    }

    if (importFileInput) {
      importFileInput.addEventListener('change', handleFileSelect);
    }

    // 初始化对话框关闭按钮
    document.querySelectorAll('.export-dialog-close').forEach(btn => {
      btn.addEventListener('click', function () {
        const dialog = this.closest('.export-dialog');
        if (dialog) {
          dialog.classList.remove('active');

          // 如果是图片导出对话框，重置状态
          if (dialog.id === 'export-image-dialog') {
            setTimeout(() => {
              document.getElementById('export-loading').style.display = 'flex';
              document.getElementById('export-preview').style.display = 'none';
            }, 300); // 等待对话框关闭动画完成
          }
        }
      });
    });

    // 初始化导入确认对话框按钮
    const cancelImportBtn = document.getElementById('cancel-import-btn');
    const confirmImportBtn = document.getElementById('confirm-import-btn');

    if (cancelImportBtn) {
      cancelImportBtn.addEventListener('click', function () {
        document.getElementById('import-confirm-dialog').classList.remove('active');
        importFileInput.value = ''; // 清空文件输入
      });
    }

    if (confirmImportBtn) {
      confirmImportBtn.addEventListener('click', importFromJson);
    }

    // 初始化复制链接按钮
    const copyLinkBtn = document.getElementById('copy-link-btn');
    if (copyLinkBtn) {
      copyLinkBtn.addEventListener('click', copyShareLink);
    }

    // 初始化下载图片按钮
    const downloadImageBtn = document.getElementById('download-image-btn');
    if (downloadImageBtn) {
      downloadImageBtn.addEventListener('click', downloadImage);
    }
  }

  // 初始化设置菜单
  initSettingsMenu();

  // 应用保存的样式设置
  document.addEventListener('DOMContentLoaded', function () {
    const styleButtons = document.querySelectorAll('.style-btn');
    const tierListContainer = document.querySelector('.tier-list-container');

    // 从本地存储加载样式设置
    const savedStyle = localStorage.getItem('anime-card-style') || '1';

    // 应用保存的样式
    applyCardStyle(savedStyle);

    // 设置对应按钮为激活状态
    styleButtons.forEach(btn => {
      if (btn.getAttribute('data-style') === savedStyle) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // 样式切换事件
    styleButtons.forEach(button => {
      button.addEventListener('click', function () {
        // 移除所有按钮的活跃状态
        styleButtons.forEach(btn => btn.classList.remove('active'));
        // 添加当前按钮的活跃状态
        this.classList.add('active');

        const styleOption = this.getAttribute('data-style');

        // 应用样式并保存设置
        applyCardStyle(styleOption);
        localStorage.setItem('anime-card-style', styleOption);
      });
    });

    // 应用卡片样式
    function applyCardStyle(styleOption) {
      // 首先移除所有样式类
      document.querySelectorAll('.card').forEach(card => {
        card.classList.remove('option-current', 'option-2', 'option-3', 'option-4');

        // 根据不同选项添加对应的样式类
        if (styleOption === '1') {
          // 默认样式 - 无文字
          tierListContainer.classList.add('hide-titles');
        } else if (styleOption === '2') {
          // 有文字样式
          tierListContainer.classList.remove('hide-titles');
          card.classList.add('option-current');
        } else if (styleOption === '3') {
          // 样式3效果 - 无背景纯文字
          tierListContainer.classList.remove('hide-titles');
          card.classList.add('option-3');
        }
      });
    }
  });

  // 更新年份选择器初始值 - 移至全局作用域
  function initYearSelector() {
    if (!searchPanel) return; // 确保 searchPanel 已创建
    const yearSelect = searchPanel.querySelector('.year-select');
    if (!yearSelect) return; // 确保年份选择器存在

    yearSelect.innerHTML = ''; // 清空现有选项

    // 从前年到今年+1年，提供多个年份选择
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 2;
    const endYear = currentYear + 1;

    for (let year = startYear; year <= endYear; year++) {
      const option = document.createElement('option');
      option.value = year;
      option.textContent = `${year}年`;
      yearSelect.appendChild(option);
    }

    // 设置选中的年份
    yearSelect.value = lastSelectedYear;

    // 移除旧的事件监听器，避免重复添加
    yearSelect.removeEventListener('change', yearSelectChangeHandler);

    // 添加变更事件
    yearSelect.addEventListener('change', yearSelectChangeHandler);
  }

  // 年份选择器变更处理函数
  function yearSelectChangeHandler() {
    lastSelectedYear = parseInt(this.value);
    // 保存当前状态
    saveSeasonalState();
    // 自动搜索选中的季度
    searchSeasonalAnime();
  }

  // 初始化月份按钮选择状态 - 移至全局作用域
  function initMonthButtons() {
    if (!searchPanel) return; // 确保 searchPanel 已创建
    const monthButtons = searchPanel.querySelectorAll('.month-btn');

    // 为每个月份按钮添加点击事件
    monthButtons.forEach(btn => {
      const month = parseInt(btn.getAttribute('data-month'));

      // 设置初始状态
      if (month === lastSelectedMonth) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }

      // 添加点击事件
      btn.addEventListener('click', function () {
        // 更新所有按钮状态
        monthButtons.forEach(b => b.classList.remove('active'));
        this.classList.add('active');

        // 更新选中的月份
        lastSelectedMonth = parseInt(this.getAttribute('data-month'));

        // 保存当前状态
        saveSeasonalState();

        // 自动搜索选中的季度
        searchSeasonalAnime();
      });
    });
  }

  // 季度新番搜索函数 - 移至全局作用域
  function searchSeasonalAnime() {
    // 确保搜索面板存在
    if (!searchPanel) return;

    const seasonalResults = searchPanel.querySelector('.seasonal-results');
    if (!seasonalResults) return;

    // 构建搜索标签，格式为"YYYY年MM月"
    const searchTag = `${lastSelectedYear}年${lastSelectedMonth}月`;

    // 显示加载状态
    seasonalResults.innerHTML = '<div class="loading">正在加载季度新番...</div>';

    // 保存当前状态
    saveSeasonalState();

    // 获取最后添加的动画ID用于位置记忆
    const lastAddedAnimeId = localStorage.getItem('last-added-anime-id');
    console.log('开始搜索季度新番，最后添加的动画ID:', lastAddedAnimeId);

    // 调用搜索函数，使用标签搜索
    searchAnimeForSeasonal(searchTag, lastAddedAnimeId);
  }

  // 季度新番专用搜索函数 - 移至全局作用域
  async function searchAnimeForSeasonal(tag, targetAnimeId = null) {
    // 确保搜索面板存在
    if (!searchPanel) return;

    const seasonalResults = searchPanel.querySelector('.seasonal-results');
    if (!seasonalResults) return;

    // 重置搜索状态
    currentSearchOffset = 0;
    hasMoreResults = true;
    currentAnimeResults = [];
    currentSearchTags = [tag]; // 使用标签搜索
    currentSearchKeyword = ''; // 标签搜索时关键词为空

    // 如果有目标动画ID，需要加载到包含该动画的位置
    let needToFindTarget = targetAnimeId !== null;
    console.log('需要查找目标动画:', needToFindTarget, '目标ID:', targetAnimeId);

    try {
      // 标记为正在加载
      isLoadingMore = true;

      // 分页参数
      const limit = 20; // 每页显示20条
      const offset = currentSearchOffset;

      // 检查是否有缓存数据可用
      const cachedData = searchResultsCache.get('tag', tag, offset, limit);

      if (cachedData) {
        console.log(`使用缓存的季度新番搜索结果: "${tag}" offset=${offset}`);

        // 更新搜索状态
        currentSearchOffset += cachedData.results.length;
        hasMoreResults = currentSearchOffset < cachedData.total;
        isLoadingMore = false;

        // 合并搜索结果到缓存
        currentAnimeResults = [...currentAnimeResults, ...cachedData.results];

        // 移除加载提示
        const loadingElement = seasonalResults.querySelector('.loading');
        if (loadingElement) loadingElement.remove();

        // 显示结果
        displaySeasonalResults(cachedData.results, targetAnimeId);
        return;
      }

      // 如果没有缓存，则从API获取
      // API URL
      const apiUrl = `${BANGUMI_V0_API_BASE}/v0/search/subjects?limit=${limit}&offset=${offset}`;

      // 准备过滤条件
      let filterForPayload = {
        type: [2], // 2 代表 "动画" 类型
        tag: currentSearchTags, // 使用标签过滤
      };

      const requestPayload = {
        keyword: '', // 标签搜索时关键词为空
        filter: filterForPayload,
        sort: 'match', // 默认排序
      };

      console.log('发送季度新番搜索请求:', JSON.stringify(requestPayload));

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
        },
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ description: '请求失败，且无法解析错误信息。' }));
        console.error('季度新番API请求失败:', response.status, errorData);
        seasonalResults.innerHTML = `<div class="error">加载失败：${
          errorData.description || response.statusText
        }</div>`;
        isLoadingMore = false;
        return;
      }

      const responseData = await response.json();
      const animes = responseData.data || []; // API v0 返回的数据在 data 字段中
      const total = responseData.total || 0; // 总结果数

      // 更新搜索状态
      currentSearchOffset += animes.length;
      hasMoreResults = currentSearchOffset < total;
      isLoadingMore = false;

      // 合并搜索结果到缓存
      currentAnimeResults = [...currentAnimeResults, ...animes];

      // 缓存搜索结果
      searchResultsCache.cache('tag', tag, animes, total);

      // 移除加载提示
      const loadingElement = seasonalResults.querySelector('.loading');
      if (loadingElement) loadingElement.remove();

      // 显示结果
      displaySeasonalResults(animes, targetAnimeId);
    } catch (error) {
      console.error('季度新番搜索发生错误:', error);

      let errorMessage = '发生错误，请稍后重试';

      // 检查是否是网络连接问题
      if (error.message.includes('Failed to fetch') || error.message.includes('ERR_PROXY_CONNECTION_FAILED')) {
        errorMessage = '网络连接失败，请检查网络连接或代理设置';
      } else if (error.message.includes('CORS')) {
        errorMessage = '跨域请求被阻止，请检查浏览器设置';
      } else if (error.message) {
        errorMessage = error.message;
      }

      seasonalResults.innerHTML = `
        <div class="error">
          <i class="fas fa-exclamation-triangle"></i>
          <p>${errorMessage}</p>
          <button class="retry-btn" onclick="searchSeasonalAnime()">重试</button>
        </div>
      `;
      isLoadingMore = false;
    }
  }

  // 季度新番结果显示函数 - 移至全局作用域
  function displaySeasonalResults(animes, targetAnimeId = null) {
    // 确保搜索面板存在
    if (!searchPanel) return;

    const seasonalResults = searchPanel.querySelector('.seasonal-results');
    if (!seasonalResults) return;

    if (animes.length === 0) {
      seasonalResults.innerHTML = '<div class="no-results">未找到该季度的新番，请尝试其他季度</div>';
      return;
    }

    // 检查当前结果中是否包含目标动画
    let targetFound = false;
    if (targetAnimeId) {
      targetFound = animes.some(anime => anime.id.toString() === targetAnimeId);
      console.log('在当前结果中查找目标动画:', targetAnimeId, '找到:', targetFound);
    }

    // 显示搜索结果
    const animeHTML = animes
      .map(anime => {
        const title = anime.name_cn || anime.name;
        const imageUrl =
          anime.images?.medium || anime.images?.grid || anime.images?.common || getLegacyCoverURLById(anime.id);
        return `<div class="anime-item" data-id="${anime.id}">
          <img src="${imageUrl}" crossorigin="anonymous" alt="${title}">
          <div class="anime-info">
            <h4>${title}</h4>
          </div>
        </div>`;
      })
      .join('');

    seasonalResults.innerHTML = animeHTML;

    // 如果还有更多结果，添加一个标记元素用于触发加载更多
    if (hasMoreResults) {
      const loaderTrigger = document.createElement('div');
      loaderTrigger.className = 'load-more-trigger seasonal-trigger';
      loaderTrigger.style.height = '1px';
      loaderTrigger.setAttribute('data-observer-attached', 'false');
      seasonalResults.appendChild(loaderTrigger);
    }

    // 添加点击事件到所有结果项
    seasonalResults.querySelectorAll('.anime-item').forEach(item => {
      item.addEventListener('click', function handleAnimeItemClick() {
        console.log('季度新番项目被点击');

        const animeId = this.getAttribute('data-id');
        // 从缓存的数据中查找完整的anime对象
        const selectedAnime = currentAnimeResults.find(a => a.id.toString() === animeId);
        if (!selectedAnime) {
          console.error('找不到选中的动画数据');
          return;
        }

        const animeTitle = selectedAnime.name_cn || selectedAnime.name;
        const animeCover =
          selectedAnime.images?.medium ||
          selectedAnime.images?.grid ||
          selectedAnime.images?.common ||
          getLegacyCoverURLById(selectedAnime.id);

        console.log('添加动画:', animeTitle);
        console.log('当前tier:', currentTier, '当前索引:', currentIndex);

        if (currentTier !== null && currentIndex !== null) {
          // 更新数据
          if (!tiers[currentTier]) tiers[currentTier] = [];

          // 确保数组长度足够
          while (tiers[currentTier].length <= currentIndex) {
            tiers[currentTier].push(null);
          }

          tiers[currentTier][currentIndex] = {
            img: animeCover,
            title: animeTitle,
            id: animeId,
            source: 'seasonal',
          };
          localStorage.setItem('last-add-source', 'seasonal'); // 记录添加来源

          // 保存最后添加的动画ID用于位置记忆
          localStorage.setItem('last-added-anime-id', animeId);
          console.log('保存最后添加的动画ID:', animeId);

          // 保存到本地存储
          saveToLocalStorage();

          // 重新渲染卡片
          renderTierCards();

          // 关闭面板
          searchPanel.classList.remove('active');
          setTimeout(() => {
            searchPanel.style.display = 'none';
          }, 300);
        } else {
          console.error('无法添加动画：currentTier或currentIndex为null');
        }
      });
    });

    // 设置无限滚动
    setupSeasonalInfiniteScroll();

    // 如果找到目标动画，滚动到该位置
    if (targetFound && targetAnimeId) {
      setTimeout(() => {
        scrollToTargetAnime(targetAnimeId);
      }, 100);
    } else if (targetAnimeId && hasMoreResults) {
      // 如果没找到目标动画但还有更多结果，继续加载
      console.log('目标动画未找到，继续加载更多结果');
      loadMoreSeasonalAnimeUntilFound(targetAnimeId);
    }
  }

  // 滚动到目标动画的函数
  function scrollToTargetAnime(targetAnimeId) {
    if (!searchPanel) return;

    const seasonalResults = searchPanel.querySelector('.seasonal-results');
    if (!seasonalResults) return;

    const targetElement = seasonalResults.querySelector(`[data-id="${targetAnimeId}"]`);
    if (targetElement) {
      console.log('找到目标动画元素，开始滚动');
      targetElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });

      // 高亮显示目标动画（可选）
      targetElement.style.border = '2px solid #ff6b6b';
      targetElement.style.borderRadius = '8px';
      setTimeout(() => {
        targetElement.style.border = '';
        targetElement.style.borderRadius = '';
      }, 3000);

      // 清除目标动画ID，避免下次重复滚动
      localStorage.removeItem('last-added-anime-id');
      console.log('已清除最后添加的动画ID');
    } else {
      console.log('未找到目标动画元素');
    }
  }

  // 继续加载直到找到目标动画的函数
  async function loadMoreSeasonalAnimeUntilFound(targetAnimeId) {
    if (!hasMoreResults || isLoadingMore) return;

    console.log('开始加载更多内容以查找目标动画:', targetAnimeId);

    // 加载更多内容
    await loadMoreSeasonalAnime();

    // 检查是否找到目标动画
    const targetFound = currentAnimeResults.some(anime => anime.id.toString() === targetAnimeId);

    if (targetFound) {
      console.log('在加载的内容中找到目标动画，开始滚动');
      setTimeout(() => {
        scrollToTargetAnime(targetAnimeId);
      }, 100);
    } else if (hasMoreResults) {
      // 如果还有更多结果且没找到，继续加载
      console.log('目标动画仍未找到，继续加载');
      setTimeout(() => {
        loadMoreSeasonalAnimeUntilFound(targetAnimeId);
      }, 500);
    } else {
      console.log('已加载所有内容，但未找到目标动画');
      // 清除目标动画ID
      localStorage.removeItem('last-added-anime-id');
    }
  }

  // 季度新番无限滚动函数 - 移至全局作用域
  function setupSeasonalInfiniteScroll() {
    // 确保搜索面板存在
    if (!searchPanel) return;

    const seasonalResults = searchPanel.querySelector('.seasonal-results');
    if (!seasonalResults) return;

    // 获取触发加载更多的元素
    const trigger = seasonalResults.querySelector('.seasonal-trigger[data-observer-attached="false"]');
    if (!trigger) return;

    // 标记为已添加观察器
    trigger.setAttribute('data-observer-attached', 'true');

    // 创建交叉观察器
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          // 当触发元素进入视图且不在加载中，加载更多
          if (entry.isIntersecting && !isLoadingMore && hasMoreResults) {
            // 加载更多季度新番
            loadMoreSeasonalAnime();
          }
        });
      },
      {
        root: seasonalResults, // 在结果容器内检测
        rootMargin: '100px', // 提前100px触发
        threshold: 0.1, // 当10%可见时触发
      },
    );

    // 开始观察触发元素
    observer.observe(trigger);
  }

  // 加载更多季度新番函数 - 移至全局作用域
  async function loadMoreSeasonalAnime() {
    // 确保搜索面板存在
    if (!searchPanel) return;

    const seasonalResults = searchPanel.querySelector('.seasonal-results');
    if (!seasonalResults) return;

    if (isLoadingMore || !hasMoreResults) return;

    try {
      // 追加加载状态
      const loadingElement = document.createElement('div');
      loadingElement.className = 'loading loading-more';
      loadingElement.textContent = '正在加载更多...';
      seasonalResults.appendChild(loadingElement);

      // 标记为正在加载
      isLoadingMore = true;

      // 分页参数
      const limit = 20; // 每页显示20条
      const offset = currentSearchOffset;
      const tag = currentSearchTags[0]; // 当前标签

      // 检查是否有缓存数据可用
      const cachedData = searchResultsCache.get('tag', tag, offset, limit);

      if (cachedData) {
        console.log(`使用缓存的加载更多季度新番结果: "${tag}" offset=${offset}`);

        // 更新搜索状态
        currentSearchOffset += cachedData.results.length;
        hasMoreResults = currentSearchOffset < cachedData.total;
        isLoadingMore = false;

        // 合并搜索结果到缓存
        currentAnimeResults = [...currentAnimeResults, ...cachedData.results];

        // 移除加载提示
        const loadingMore = seasonalResults.querySelector('.loading-more');
        if (loadingMore) loadingMore.remove();

        // 显示加载的更多结果
        displayMoreSeasonalResults(cachedData.results);
        return;
      }

      // 如果没有缓存，则从API获取
      // API URL
      const apiUrl = `${BANGUMI_V0_API_BASE}/v0/search/subjects?limit=${limit}&offset=${offset}`;

      // 准备过滤条件
      let filterForPayload = {
        type: [2], // 2 代表 "动画" 类型
        tag: currentSearchTags, // 使用标签过滤
      };

      const requestPayload = {
        keyword: '', // 标签搜索时关键词为空
        filter: filterForPayload,
        sort: 'match', // 默认排序
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
        },
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ description: '请求失败，且无法解析错误信息。' }));
        console.error('加载更多季度新番失败:', response.status, errorData);

        // 移除加载更多提示
        const loadingMore = seasonalResults.querySelector('.loading-more');
        if (loadingMore) loadingMore.remove();

        // 添加错误提示
        const errorElement = document.createElement('div');
        errorElement.className = 'error load-more-error';
        errorElement.textContent = `加载更多失败：${errorData.description || response.statusText}`;
        seasonalResults.appendChild(errorElement);

        isLoadingMore = false;
        return;
      }

      const responseData = await response.json();
      const animes = responseData.data || []; // API v0 返回的数据在 data 字段中
      const total = responseData.total || 0; // 总结果数

      // 更新搜索状态
      currentSearchOffset += animes.length;
      hasMoreResults = currentSearchOffset < total;
      isLoadingMore = false;

      // 合并搜索结果到缓存
      currentAnimeResults = [...currentAnimeResults, ...animes];

      // 缓存搜索结果
      searchResultsCache.cache('tag', tag, animes, total);

      // 显示加载的更多结果
      displayMoreSeasonalResults(animes);
    } catch (error) {
      console.error('加载更多季度新番出错', error);

      // 移除加载更多提示
      const loadingMore = seasonalResults.querySelector('.loading-more');
      if (loadingMore) loadingMore.remove();

      // 添加错误提示
      const errorElement = document.createElement('div');
      errorElement.className = 'error load-more-error';
      errorElement.textContent = '加载更多失败，请稍后再试';
      seasonalResults.appendChild(errorElement);

      isLoadingMore = false;
    }
  }

  // 显示更多季度新番结果函数 - 移至全局作用域
  function displayMoreSeasonalResults(animes) {
    // 确保搜索面板存在
    if (!searchPanel) return;

    const seasonalResults = searchPanel.querySelector('.seasonal-results');
    if (!seasonalResults) return;

    // 移除加载提示
    const loadingMore = seasonalResults.querySelector('.loading-more');
    if (loadingMore) loadingMore.remove();

    // 移除旧的触发器
    const oldTrigger = seasonalResults.querySelector('.seasonal-trigger');
    if (oldTrigger) oldTrigger.remove();

    // 添加新结果
    const animeHTML = animes
      .map(anime => {
        const title = anime.name_cn || anime.name;
        const imageUrl =
          anime.images?.medium || anime.images?.grid || anime.images?.common || getLegacyCoverURLById(anime.id);

        // 限制标题长度，超出则截断并添加省略号
        const maxTitleLength = 20; // 最大显示字符数
        const displayTitle = title.length > maxTitleLength ? title.substring(0, maxTitleLength) + '...' : title;

        return `<div class="anime-item" data-id="${anime.id}">
          <img src="${imageUrl}" crossorigin="anonymous" alt="${title}">
          <div class="anime-info">
            <h4 title="${title}">${displayTitle}</h4>
          </div>
        </div>`;
      })
      .join('');

    // 在现有结果后添加新结果
    seasonalResults.insertAdjacentHTML('beforeend', animeHTML);

    // 如果还有更多结果，添加一个新的触发器
    if (hasMoreResults) {
      const loaderTrigger = document.createElement('div');
      loaderTrigger.className = 'load-more-trigger seasonal-trigger';
      loaderTrigger.style.height = '1px';
      loaderTrigger.setAttribute('data-observer-attached', 'false');
      seasonalResults.appendChild(loaderTrigger);
    }

    // 移除所有现有的点击事件
    seasonalResults.querySelectorAll('.anime-item').forEach(item => {
      // 克隆节点以移除所有事件监听器
      const newItem = item.cloneNode(true);
      item.parentNode.replaceChild(newItem, item);
    });

    // 重新添加点击事件到所有结果项
    seasonalResults.querySelectorAll('.anime-item').forEach(item => {
      item.addEventListener('click', function handleAnimeItemClick() {
        console.log('加载更多后的季度新番项目被点击');

        const animeId = this.getAttribute('data-id');
        // 从缓存的数据中查找完整的anime对象
        const selectedAnime = currentAnimeResults.find(a => a.id.toString() === animeId);
        if (!selectedAnime) {
          console.error('找不到选中的动画数据');
          return;
        }

        const animeTitle = selectedAnime.name_cn || selectedAnime.name;
        const animeCover =
          selectedAnime.images?.medium ||
          selectedAnime.images?.grid ||
          selectedAnime.images?.common ||
          getLegacyCoverURLById(selectedAnime.id);

        console.log('添加动画:', animeTitle);
        console.log('当前tier:', currentTier, '当前索引:', currentIndex);

        if (currentTier !== null && currentIndex !== null) {
          // 更新数据
          if (!tiers[currentTier]) tiers[currentTier] = [];

          // 确保数组长度足够
          while (tiers[currentTier].length <= currentIndex) {
            tiers[currentTier].push(null);
          }

          tiers[currentTier][currentIndex] = {
            img: animeCover,
            title: animeTitle,
            id: animeId,
            source: 'seasonal',
          };
          localStorage.setItem('last-add-source', 'seasonal'); // 记录添加来源

          // 保存最后添加的动画ID用于位置记忆
          localStorage.setItem('last-added-anime-id', animeId);
          console.log('保存最后添加的动画ID:', animeId);

          // 保存到本地存储
          saveToLocalStorage();

          // 重新渲染卡片
          renderTierCards();

          // 关闭面板
          searchPanel.classList.remove('active');
          setTimeout(() => {
            searchPanel.style.display = 'none';
          }, 300);
        } else {
          console.error('无法添加动画：currentTier或currentIndex为null');
        }
      });
    });

    // 设置无限滚动
    setupSeasonalInfiniteScroll();
  }

  // 性能优化：使用DocumentFragment和防抖函数
  // 防抖函数：限制函数在一定时间内只执行一次
  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      const context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), wait);
    };
  }

  // 节流函数：限制函数在一定时间内最多执行一次
  function throttle(func, limit) {
    let inThrottle;
    return function (...args) {
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }

  // 优化的渲染函数 - 暴露给全局以便comments.js使用
  window.renderTierCards = (function () {
    // 闭包中保存上一次渲染的状态，用于比较变化
    let previousState = {};

    return function () {
      try {
        console.time('renderTierCards'); // 性能计时开始

        // 遍历所有tier
        for (const tier in tiers) {
          const tierRow = document.getElementById(`tier-${tier}`);
          if (!tierRow) continue;

          const cardsContainer = tierRow.querySelector('.tier-cards');

          // 检查这个tier是否有变化，如果没有变化则跳过渲染
          const currentTierState = JSON.stringify(tiers[tier]);
          if (previousState[tier] === currentTierState && cardsContainer.childNodes.length > 0) {
            continue; // 跳过这个tier的渲染
          }

          // 更新状态
          previousState[tier] = currentTierState;

          // 创建DocumentFragment，减少DOM操作
          const fragment = document.createDocumentFragment();

          // 清空现有内容
          cardsContainer.innerHTML = '';

          // 添加现有的卡片
          if (Array.isArray(tiers[tier])) {
            tiers[tier].forEach((anime, index) => {
              if (!anime || !anime.img) return;

              try {
                const card = document.createElement('div');
                card.className = 'card';
                card.style.backgroundImage = `url(${anime.img})`;
                card.setAttribute('title', anime.title || '');
                card.setAttribute('data-id', anime.id || '');
                card.setAttribute('data-index', index);
                card.setAttribute('draggable', 'true'); // 使卡片可拖动

                // 添加标题显示
                const titleElement = document.createElement('div');
                titleElement.className = 'card-title';
                titleElement.textContent = anime.title || '';
                card.appendChild(titleElement);

                // 添加点击事件，可编辑已有卡片
                card.addEventListener('click', function (e) {
                  // 检查是否按住Ctrl键点击（查看详情）
                  if (e.ctrlKey || e.metaKey) {
                    // 如果有动画ID，则查看详情
                    const animeId = this.getAttribute('data-id');
                    if (animeId && !isNaN(animeId)) {
                      fetchAnimeDetail(animeId);
                    } else {
                      alert('无法获取详情：此动画没有关联ID');
                    }
                  } else {
                    // 正常编辑模式
                    openSearchPanel(tier, index, this, true); // 传入true表示是编辑模式
                  }
                });

                // 设置卡片的data属性，用于评论功能
                if (anime) {
                  card.setAttribute('data-title', anime.title);
                  card.setAttribute('data-id', anime.id);
                  card.setAttribute('data-cover', anime.img);
                }

                // 添加右键菜单事件
                card.addEventListener('contextmenu', function (e) {
                  e.preventDefault(); // 阻止默认右键菜单
                  // 右键菜单由comments.js处理
                });

                fragment.appendChild(card);
              } catch (cardError) {
                console.error('创建卡片时出错:', cardError, anime);
              }
            });
          } else {
            console.warn(`Tier ${tier} 不是数组，无法渲染卡片`);
            tiers[tier] = []; // 修复数据结构
          }

          // 始终添加一个空卡片用于添加新内容
          const emptyCard = document.createElement('div');
          emptyCard.className = 'card';
          emptyCard.setAttribute('data-index', Array.isArray(tiers[tier]) ? tiers[tier].length : 0);

          // 添加点击事件，打开搜索面板
          emptyCard.addEventListener('click', function () {
            openSearchPanel(tier, Array.isArray(tiers[tier]) ? tiers[tier].length : 0, this, false);
          });

          fragment.appendChild(emptyCard);

          // 一次性添加所有卡片到容器
          cardsContainer.appendChild(fragment);
        }

        // 重新初始化拖拽功能
        enableDragAndDrop();

        console.timeEnd('renderTierCards'); // 性能计时结束
      } catch (error) {
        console.error('渲染卡片时发生错误:', error);
        // 尝试恢复到安全状态
        try {
          document.querySelectorAll('.tier-cards').forEach(container => {
            if (container.innerHTML === '') {
              const emptyCard = document.createElement('div');
              emptyCard.className = 'card';
              container.appendChild(emptyCard);
            }
          });
          enableDragAndDrop();
        } catch (recoveryError) {
          console.error('恢复失败:', recoveryError);
        }
      }
    };
  })();

  // 创建搜索面板
  let currentCard = null;
  let currentTier = null;
  let currentIndex = null;
  let isEditMode = false;

  function createSearchPanel() {
    const searchPanel = document.createElement('div');
    searchPanel.className = 'search-panel';
    searchPanel.innerHTML = `
      <div class="search-content">
        <h3 class="panel-title">添加动画</h3>
        <div class="panel-tabs">
          <button class="tab-btn active" data-tab="bangumi">Bangumi搜索</button>
          <button class="tab-btn" data-tab="seasonal">季度新番</button>
          <button class="tab-btn" data-tab="upload">上传图片</button>
        </div>

        <div class="tab-content active" data-tab="bangumi">
          <form class="search-form">
            <input type="text" placeholder="输入关键词搜索动画" class="search-input">
            <button type="submit" class="search-button">搜索</button>
          </form>
          <div class="search-results"></div>
        </div>

        <div class="tab-content" data-tab="seasonal">
          <div class="seasonal-container">
            <div class="seasonal-selectors">
              <div class="year-selector">
                <select class="year-select">
                  <!-- 年份选项将由JS动态生成 -->
                </select>
              </div>
              <div class="month-selector">
                <button class="month-btn" data-month="1">1月</button>
                <button class="month-btn" data-month="4">4月</button>
                <button class="month-btn" data-month="7">7月</button>
                <button class="month-btn" data-month="10">10月</button>
              </div>
            </div>
            <div class="seasonal-results"></div>
          </div>
        </div>

        <div class="tab-content" data-tab="upload">
          <div class="upload-container">
            <div class="upload-header">
              <h4>上传自定义图片</h4>
              <p class="upload-instruction">选择一张图片并添加标题，然后点击"确认添加"</p>
            </div>
            <div class="upload-content">
              <div class="upload-left">
                <div class="file-input-container">
                  <input type="file" id="image-upload" accept="image/*" class="file-input">
                  <label for="image-upload" class="file-label">
                    <i class="fas fa-upload"></i>
                    选择图片文件
                  </label>
                </div>
                <div class="title-input-container">
                  <label for="image-title" class="title-label">图片标题</label>
                  <input type="text" id="image-title" placeholder="请输入标题（可选）" class="title-input">
                </div>
              </div>
              <div class="upload-preview">
                <div class="preview-placeholder">
                  <i class="fas fa-image"></i>
                  <p>图片预览区</p>
                </div>
              </div>
            </div>
            <div class="upload-footer">
              <button class="upload-btn">
                <i class="fas fa-check"></i>
                确认添加
              </button>
            </div>
          </div>
        </div>

        <div class="search-footer">
          <button class="delete-btn" style="display: none;">删除动画</button>
          <button class="search-close">取消</button>
        </div>
      </div>
    `;
    document.body.appendChild(searchPanel);

    // 添加标签切换事件
    const tabBtns = searchPanel.querySelectorAll('.tab-btn');
    const tabContents = searchPanel.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', function () {
        const tab = this.getAttribute('data-tab');

        // 切换按钮样式
        tabBtns.forEach(b => b.classList.remove('active'));
        this.classList.add('active');

        // 切换内容
        tabContents.forEach(content => {
          if (content.getAttribute('data-tab') === tab) {
            content.classList.add('active');
          } else {
            content.classList.remove('active');
          }
        });

        // 保存最后选择的标签页 - 暂时禁用
        // localStorage.setItem('last-active-tab', tab);

        // 如果切换到季度新番标签页，自动加载结果
        if (tab === 'seasonal') {
          // 确保先初始化选择器，再加载数据
          setTimeout(() => {
            initYearSelector();
            initMonthButtons();
            // 自动加载季度新番
            searchSeasonalAnime();
          }, 50); // 短暂延迟，确保DOM元素已渲染
        }
      });
    });

    // 添加搜索事件
    const form = searchPanel.querySelector('.search-form');
    const input = searchPanel.querySelector('.search-input');
    const results = searchPanel.querySelector('.search-results');
    const closeBtn = searchPanel.querySelector('.search-close');
    const deleteBtn = searchPanel.querySelector('.delete-btn');
    const panelTitle = searchPanel.querySelector('.panel-title');

    // 季度新番相关元素
    const yearSelect = searchPanel.querySelector('.year-select');
    const monthBtns = searchPanel.querySelectorAll('.month-btn');
    const seasonalResults = searchPanel.querySelector('.seasonal-results');

    // 初始化年份选择器
    initYearSelector();

    // 初始化月份按钮
    initMonthButtons();

    // 上传图片事件
    const fileInput = searchPanel.querySelector('#image-upload');
    const titleInput = searchPanel.querySelector('.title-input');
    const uploadBtn = searchPanel.querySelector('.upload-btn');
    const previewContainer = searchPanel.querySelector('.upload-preview');

    let selectedFile = null;

    fileInput.addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (!file) return;

      selectedFile = file;

      // 显示预览
      const reader = new FileReader();
      reader.onload = function (event) {
        previewContainer.innerHTML = `
          <div class="preview-image-container">
            <img src="${event.target.result}" class="preview-image">
            <div class="image-info">
              <span class="file-name">${file.name}</span>
              <span class="file-size">${(file.size / 1024).toFixed(1)} KB</span>
            </div>
          </div>
        `;
      };
      reader.readAsDataURL(file);
    });

    uploadBtn.addEventListener('click', function () {
      if (!selectedFile) {
        alert('请先选择图片文件');
        return;
      }

      const title = titleInput.value.trim() || '自定义图片';

      // 读取图片为DataURL
      const reader = new FileReader();
      reader.onload = function (e) {
        const dataUrl = e.target.result;

        // 添加本地图片
        if (currentTier !== null && currentIndex !== null) {
          // 确保数组长度足够
          while (tiers[currentTier].length <= currentIndex) {
            tiers[currentTier].push(null);
          }

          tiers[currentTier][currentIndex] = {
            img: dataUrl,
            title: title,
            isLocal: true,
            source: 'upload',
          };
          localStorage.setItem('last-add-source', 'upload'); // 记录添加来源

          // 保存到本地存储
          saveToLocalStorage();

          // 重新渲染卡片
          renderTierCards();

          // 关闭面板
          searchPanel.classList.remove('active');
          setTimeout(() => {
            searchPanel.style.display = 'none';
          }, 300);
        }
      };
      reader.readAsDataURL(selectedFile);
    });

    // 删除按钮事件 - 添加确认对话框
    deleteBtn.addEventListener('click', function () {
      if (currentTier !== null && currentIndex !== null && isEditMode) {
        // 获取动画标题
        const animeTitle = tiers[currentTier][currentIndex]?.title || '此动画';

        // 创建确认对话框
        const confirmDialog = document.createElement('div');
        confirmDialog.className = 'confirm-dialog';
        confirmDialog.innerHTML = `
          <div class="confirm-content">
            <h4>确认删除</h4>
            <p>您确定要删除"${animeTitle}"吗？</p>
            <div class="confirm-buttons">
              <button class="confirm-cancel">取消</button>
              <button class="confirm-delete">删除</button>
            </div>
          </div>
        `;

        // 添加到搜索面板
        searchPanel.querySelector('.search-content').appendChild(confirmDialog);

        // 添加动画效果
        setTimeout(() => confirmDialog.classList.add('active'), 10);

        // 取消按钮事件
        confirmDialog.querySelector('.confirm-cancel').addEventListener('click', function () {
          confirmDialog.classList.remove('active');
          setTimeout(() => confirmDialog.remove(), 300);
        });

        // 确认删除按钮事件
        confirmDialog.querySelector('.confirm-delete').addEventListener('click', function () {
          // 从数组中删除
          tiers[currentTier].splice(currentIndex, 1);

          // 保存到本地存储
          saveToLocalStorage();

          // 重新渲染卡片
          renderTierCards();

          // 关闭确认对话框
          confirmDialog.classList.remove('active');
          setTimeout(() => confirmDialog.remove(), 300);

          // 关闭面板
          searchPanel.classList.remove('active');
          setTimeout(() => {
            searchPanel.style.display = 'none';
          }, 300);
        });
      }
    });

    // 搜索动画函数
    async function searchAnime(keyword, isNewSearch = true) {
      if (!keyword && isNewSearch) return;

      try {
        // 如果是新搜索，重置搜索状态
        if (isNewSearch) {
          // 显示加载状态
          results.innerHTML = '<div class="loading">正在搜索...</div>';
          currentSearchOffset = 0;
          hasMoreResults = true;
          currentAnimeResults = [];

          // 检查关键词是否是 "YYYY年MM月" 或 "YYYY年" 格式的标签
          const yearMonthMatch = keyword.match(/^(\d{4})年(\d{1,2})月$/);
          const yearOnlyMatch = keyword.match(/^(\d{4})年$/);

          if (yearMonthMatch || yearOnlyMatch) {
            // 如果匹配年份月份标签 或 纯年份标签
            console.log(`检测到年份/月份标签: "${keyword}", 使用tag filter.`);

            // 保存当前搜索标签，用于加载更多
            currentSearchTags = [keyword];
            // 标签搜索时，关键词为空
            currentSearchKeyword = '';
          } else {
            // 非标签搜索时清空标签，保存关键词
            currentSearchTags = [];
            currentSearchKeyword = keyword;
          }
        } else {
          // 追加加载状态
          const loadingElement = document.createElement('div');
          loadingElement.className = 'loading loading-more';
          loadingElement.textContent = '正在加载更多...';
          results.appendChild(loadingElement);
        }

        // 标记为正在加载
        isLoadingMore = true;

        // 分页参数
        const limit = 20; // 每页显示20条，符合API限制
        const offset = currentSearchOffset;

        // 检查是否有缓存数据可用
        const cacheType = currentSearchTags.length > 0 ? 'tag' : 'keyword';
        const cacheKey = currentSearchTags.length > 0 ? currentSearchTags[0] : currentSearchKeyword;
        const cachedData = searchResultsCache.get(cacheType, cacheKey, offset, limit);

        if (cachedData) {
          console.log(`使用缓存的搜索结果: ${cacheType} "${cacheKey}" offset=${offset}`);

          // 更新搜索状态
          currentSearchOffset += cachedData.results.length;
          hasMoreResults = currentSearchOffset < cachedData.total;
          isLoadingMore = false;

          // 合并搜索结果到缓存
          currentAnimeResults = [...currentAnimeResults, ...cachedData.results];

          // 移除加载提示
          const loadingElement = isNewSearch
            ? results.querySelector('.loading')
            : results.querySelector('.loading-more');
          if (loadingElement) loadingElement.remove();

          // 显示结果
          displaySearchResults(cachedData.results, isNewSearch);
          return;
        }

        // 如果没有缓存，则从API获取
        // API URL，分页参数放入URL查询字符串
        const apiUrl = `${BANGUMI_V0_API_BASE}/v0/search/subjects?limit=${limit}&offset=${offset}`;

        // 准备过滤条件
        let filterForPayload = {
          type: [2], // 2 代表 "动画" 类型
        };

        // 添加标签过滤条件（如果有）
        if (currentSearchTags.length > 0) {
          filterForPayload.tag = currentSearchTags;
        }

        const requestPayload = {
          keyword: currentSearchKeyword, // 使用保存的关键词
          filter: filterForPayload,
          sort: 'match', // 默认排序或选择其他如 "heat", "rank", "score"
        };

        console.log('发送的搜索请求:', JSON.stringify(requestPayload)); // 调试：打印请求体
        console.log('请求URL:', apiUrl, '偏移量:', offset, '标签:', currentSearchTags); // 调试：打印请求URL和标签

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': USER_AGENT,
          },
          body: JSON.stringify(requestPayload),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ description: '请求失败，且无法解析错误信息。' }));
          console.error('API请求失败:', response.status, errorData);

          if (isNewSearch) {
            results.innerHTML = `<div class="error">搜索出错：${errorData.description || response.statusText}</div>`;
          } else {
            // 移除加载更多提示
            const loadingMore = results.querySelector('.loading-more');
            if (loadingMore) loadingMore.remove();

            // 添加错误提示
            const errorElement = document.createElement('div');
            errorElement.className = 'error load-more-error';
            errorElement.textContent = `加载更多失败：${errorData.description || response.statusText}`;
            results.appendChild(errorElement);
          }
          isLoadingMore = false;
          return;
        }

        const responseData = await response.json();
        const animes = responseData.data || []; // API v0 返回的数据在 data 字段中
        const total = responseData.total || 0; // 总结果数

        // 更新搜索状态
        currentSearchOffset += animes.length;
        hasMoreResults = currentSearchOffset < total;
        isLoadingMore = false;

        // 合并搜索结果到缓存
        currentAnimeResults = [...currentAnimeResults, ...animes];

        // 缓存搜索结果
        searchResultsCache.cache(cacheType, cacheKey, animes, total);

        // 移除加载提示
        const loadingElement = isNewSearch ? results.querySelector('.loading') : results.querySelector('.loading-more');
        if (loadingElement) loadingElement.remove();

        // 显示结果
        displaySearchResults(animes, isNewSearch);
      } catch (error) {
        console.error('搜索出错', error);

        let errorMessage = '搜索出错，请稍后再试';

        // 检查是否是网络连接问题
        if (error.message.includes('Failed to fetch') || error.message.includes('ERR_PROXY_CONNECTION_FAILED')) {
          errorMessage = '网络连接失败，请检查网络连接或代理设置';
        } else if (error.message.includes('CORS')) {
          errorMessage = '跨域请求被阻止，请检查浏览器设置';
        } else if (error.message) {
          errorMessage = error.message;
        }

        if (isNewSearch) {
          results.innerHTML = `
            <div class="error">
              <i class="fas fa-exclamation-triangle"></i>
              <p>${errorMessage}</p>
              <button class="retry-btn" onclick="document.querySelector('.search-form').dispatchEvent(new Event('submit'))">重试</button>
            </div>
          `;
        } else {
          // 移除加载更多提示
          const loadingMore = results.querySelector('.loading-more');
          if (loadingMore) loadingMore.remove();

          // 添加错误提示
          const errorElement = document.createElement('div');
          errorElement.className = 'error load-more-error';
          errorElement.innerHTML = `
            <i class="fas fa-exclamation-triangle"></i>
            <p>${errorMessage}</p>
          `;
          results.appendChild(errorElement);
        }

        isLoadingMore = false;
      }
    }

    // 显示搜索结果的函数，从searchAnime中提取出来便于复用
    function displaySearchResults(animes, isNewSearch) {
      if (animes.length === 0 && isNewSearch) {
        results.innerHTML = '<div class="no-results">未找到结果，请尝试其他关键词或调整筛选条件</div>';
      } else {
        // 新搜索时替换内容，加载更多时追加内容
        const animeHTML = animes
          .map(anime => {
            // 优先使用API返回的图片，其次是name_cn
            const title = anime.name_cn || anime.name;
            // API v0 返回的 images 对象包含多种尺寸图片
            const imageUrl =
              anime.images?.medium || anime.images?.grid || anime.images?.common || getLegacyCoverURLById(anime.id);

            // 限制标题长度，超出则截断并添加省略号
            const maxTitleLength = 20; // 最大显示字符数
            const displayTitle = title.length > maxTitleLength ? title.substring(0, maxTitleLength) + '...' : title;

            return `<div class="anime-item" data-id="${anime.id}">
            <img src="${imageUrl}" crossorigin="anonymous" alt="${title}">
            <div class="anime-info">
              <h4 title="${title}">${displayTitle}</h4>
            </div>
          </div>`;
          })
          .join('');

        if (isNewSearch) {
          results.innerHTML = animeHTML;
        } else {
          // 在现有结果后添加新结果
          results.insertAdjacentHTML('beforeend', animeHTML);
        }

        // 如果还有更多结果，添加一个标记元素用于触发加载更多
        if (hasMoreResults) {
          const loaderTrigger = document.createElement('div');
          loaderTrigger.className = 'load-more-trigger';
          loaderTrigger.style.height = '1px';
          loaderTrigger.setAttribute('data-observer-attached', 'false');
          results.appendChild(loaderTrigger);
        }

        // 添加点击事件到所有结果项
        results.querySelectorAll('.anime-item:not([data-click-attached])').forEach(item => {
          item.setAttribute('data-click-attached', 'true');
          item.addEventListener('click', function () {
            const animeId = this.getAttribute('data-id');
            // 从缓存的数据中查找完整的anime对象
            const selectedAnime = currentAnimeResults.find(a => a.id.toString() === animeId);
            if (!selectedAnime) return;

            const animeTitle = selectedAnime.name_cn || selectedAnime.name;
            const animeCover =
              selectedAnime.images?.medium ||
              selectedAnime.images?.grid ||
              selectedAnime.images?.common ||
              getLegacyCoverURLById(selectedAnime.id);

            if (currentTier !== null && currentIndex !== null) {
              // 更新数据
              if (!tiers[currentTier]) tiers[currentTier] = [];

              // 确保数组长度足够
              while (tiers[currentTier].length <= currentIndex) {
                tiers[currentTier].push(null);
              }

              tiers[currentTier][currentIndex] = {
                img: animeCover,
                title: animeTitle,
                id: animeId,
                source: 'bangumi',
              };
              localStorage.setItem('last-add-source', 'bangumi'); // 记录添加来源

              // 保存最后添加的动画ID用于位置记忆
              localStorage.setItem('last-added-anime-id', animeId);
              console.log('保存最后添加的动画ID:', animeId);

              // 保存到本地存储
              saveToLocalStorage();

              // 重新渲染卡片
              renderTierCards();
            }

            // 关闭面板
            searchPanel.classList.remove('active');
            setTimeout(() => {
              searchPanel.style.display = 'none';
            }, 300);
          });
        });

        // 设置无限滚动观察器
        setupInfiniteScroll();
      }
    }

    // 设置无限滚动
    function setupInfiniteScroll() {
      // 获取触发加载更多的元素
      const trigger = results.querySelector('.load-more-trigger[data-observer-attached="false"]');
      if (!trigger) return;

      // 标记为已添加观察器
      trigger.setAttribute('data-observer-attached', 'true');

      // 创建交叉观察器
      const observer = new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            // 当触发元素进入视图且不在加载中，加载更多
            if (entry.isIntersecting && !isLoadingMore && hasMoreResults) {
              // 加载更多结果
              searchAnime(currentSearchKeyword, false);
            }
          });
        },
        {
          root: results, // 在结果容器内检测
          rootMargin: '100px', // 提前100px触发
          threshold: 0.1, // 当10%可见时触发
        },
      );

      // 开始观察触发元素
      observer.observe(trigger);
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const keyword = input.value.trim();
      if (!keyword) return;

      // 调用搜索函数，设置为新搜索
      searchAnime(keyword, true);
    });

    closeBtn.addEventListener('click', function () {
      searchPanel.classList.remove('active');
      setTimeout(() => {
        searchPanel.style.display = 'none';
      }, 300);
    });

    return searchPanel;
  }

  let searchPanel = null;

  // 将openSearchPanel函数暴露给全局，以便comments.js可以调用
  window.openSearchPanel = function (tier, index, card, editMode = false) {
    currentTier = tier;
    currentIndex = index;
    currentCard = card;
    isEditMode = editMode;

    if (!searchPanel) {
      searchPanel = createSearchPanel();
    }

    // 更新面板标题和删除按钮
    const panelTitle = searchPanel.querySelector('.panel-title');
    const deleteBtn = searchPanel.querySelector('.delete-btn');

    if (editMode) {
      panelTitle.textContent = '编辑动画';
      deleteBtn.style.display = 'block';

      // 如果是编辑模式，获取当前动画数据
      const currentAnime = tiers[tier][index];

      // 如果是上传的图片，预填充标题并显示图片预览
      if (currentAnime && currentAnime.source === 'upload') {
        const titleInput = searchPanel.querySelector('.title-input');
        titleInput.value = currentAnime.title || '';

        // 显示当前图片预览
        const previewContainer = searchPanel.querySelector('.upload-preview');
        previewContainer.innerHTML = `
          <div class="preview-image-container">
            <img src="${currentAnime.img}" class="preview-image">
            <div class="edit-title-overlay">
              <p>您可以编辑标题并点击"更新标题"按钮</p>
            </div>
          </div>
        `;

        // 添加更新标题按钮
        const uploadContainer = searchPanel.querySelector('.upload-container');

        // 移除之前可能存在的更新按钮
        const existingUpdateBtn = uploadContainer.querySelector('.update-title-btn');
        if (existingUpdateBtn) {
          existingUpdateBtn.remove();
        }

        // 创建新的更新按钮
        const updateTitleBtn = document.createElement('button');
        updateTitleBtn.className = 'update-title-btn';
        updateTitleBtn.textContent = '更新标题';

        // 获取左侧容器
        const uploadLeft = uploadContainer.querySelector('.upload-left');
        if (uploadLeft) {
          uploadLeft.insertBefore(updateTitleBtn, uploadLeft.querySelector('.upload-btn'));
        } else {
          // 兼容旧版布局
          uploadContainer.insertBefore(updateTitleBtn, uploadContainer.querySelector('.upload-btn'));
        }

        // 隐藏上传按钮和文件输入
        const uploadBtn = uploadContainer.querySelector('.upload-btn');
        const fileInputContainer = uploadContainer.querySelector('.file-input-container');
        uploadBtn.style.display = 'none';
        fileInputContainer.style.display = 'none';

        // 添加更新标题事件
        updateTitleBtn.addEventListener('click', function () {
          const newTitle = titleInput.value.trim() || '自定义图片';

          // 更新标题
          tiers[tier][index].title = newTitle;

          // 保存到本地存储
          saveToLocalStorage();

          // 重新渲染卡片
          renderTierCards();

          // 显示成功消息
          const successMsg = document.createElement('div');
          successMsg.className = 'success-message';
          successMsg.textContent = '标题已更新！';
          uploadContainer.appendChild(successMsg);

          // 3秒后移除成功消息
          setTimeout(() => {
            successMsg.remove();
          }, 3000);
        });

        // 自动切换到上传标签页
        const uploadTab = searchPanel.querySelector('.tab-btn[data-tab="upload"]');
        const tabBtns = searchPanel.querySelectorAll('.tab-btn');
        const tabContents = searchPanel.querySelectorAll('.tab-content');

        tabBtns.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));

        uploadTab.classList.add('active');
        searchPanel.querySelector('.tab-content[data-tab="upload"]').classList.add('active');
      }
    } else {
      panelTitle.textContent = '添加动画';
      deleteBtn.style.display = 'none';

      // 重置上传预览
      const previewContainer = searchPanel.querySelector('.upload-preview');
      previewContainer.innerHTML = '';

      // 移除更新标题按钮
      const updateTitleBtn = searchPanel.querySelector('.update-title-btn');
      if (updateTitleBtn) {
        updateTitleBtn.remove();
      }

      // 显示上传按钮和文件输入
      const uploadBtn = searchPanel.querySelector('.upload-btn');
      const fileInputContainer = searchPanel.querySelector('.file-input-container');
      if (uploadBtn) uploadBtn.style.display = 'block';
      if (fileInputContainer) fileInputContainer.style.display = 'block';
    }

    // 重置文件输入（如果不是编辑上传图片）
    if (!editMode || (editMode && tiers[tier][index]?.source !== 'upload')) {
      const fileInput = searchPanel.querySelector('#image-upload');
      const titleInput = searchPanel.querySelector('.title-input');
      fileInput.value = '';
      if (!editMode) titleInput.value = '';
    }

    // 重置搜索结果
    const results = searchPanel.querySelector('.search-results');
    results.innerHTML = '';

    // 重置季度新番结果
    const seasonalResults = searchPanel.querySelector('.seasonal-results');
    seasonalResults.innerHTML = '';

    // 重置搜索输入
    const input = searchPanel.querySelector('.search-input');
    input.value = '';

    // 重置搜索状态
    currentSearchOffset = 0;
    hasMoreResults = true;
    currentAnimeResults = [];
    currentSearchTags = [];

    // 使用保存的标签页或默认为'bangumi'
    const tabBtns = searchPanel.querySelectorAll('.tab-btn');
    const tabContents = searchPanel.querySelectorAll('.tab-content');

    // 检查上一次添加的来源，如果是季度新番，则默认打开季度新番页
    const lastAddSource = localStorage.getItem('last-add-source');
    if (lastAddSource === 'seasonal' && !isEditMode) {
      lastSelectedTab = 'seasonal';
    }

    tabBtns.forEach(btn => {
      if (btn.getAttribute('data-tab') === lastSelectedTab) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    tabContents.forEach(content => {
      if (content.getAttribute('data-tab') === lastSelectedTab) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });

    // 给标签切换按钮添加事件，记住选择
    tabBtns.forEach(btn => {
      btn.addEventListener('click', function () {
        const tab = this.getAttribute('data-tab');
        lastSelectedTab = tab;
        saveSeasonalState();
      });
    });

    // 如果是季度新番标签页，自动加载结果
    if (lastSelectedTab === 'seasonal') {
      // 确保DOM已完全加载
      setTimeout(() => {
        initYearSelector();
        initMonthButtons();
        // 自动加载季度新番
        searchSeasonalAnime();
      }, 50); // 短暂延迟，确保DOM元素已渲染
    }

    searchPanel.style.display = 'flex';
    setTimeout(() => {
      searchPanel.classList.add('active');
      // 如果是搜索页，则聚焦输入框
      if (lastSelectedTab === 'bangumi') {
        searchPanel.querySelector('.search-input').focus();
      }
    }, 10);
  };

  // SortableJS实例存储
  const sortableInstances = [];

  // 添加SortableJS拖拽功能
  function enableDragAndDrop() {
    console.log('初始化SortableJS拖拽功能');

    // 检查Sortable是否已加载
    if (typeof Sortable === 'undefined') {
      console.error('Sortable库未加载，跳过拖拽功能初始化');
      return;
    }

    // 销毁现有的Sortable实例
    sortableInstances.forEach(instance => {
      if (instance && typeof instance.destroy === 'function') {
        instance.destroy();
      }
    });

    // 清空实例数组
    sortableInstances.length = 0;

    // 为每个tier-cards容器创建Sortable实例
    document.querySelectorAll('.tier-cards').forEach(container => {
      const tierRow = container.closest('.tier-row');
      const tierId = tierRow.id.split('-')[1];

      // 创建Sortable实例
      const sortable = new Sortable(container, {
        animation: 150, // 动画持续时间（毫秒）
        easing: 'cubic-bezier(1, 0, 0, 1)', // 动画缓动函数
        delay: 50, // 延迟开始拖拽的时间（毫秒）
        delayOnTouchOnly: true, // 仅在触摸设备上应用延迟
        touchStartThreshold: 5, // 触摸移动多少像素才开始拖拽
        direction: 'horizontal', // 水平方向拖拽
        draggable: '.card[style]', // 只有有背景图的卡片可拖拽
        ghostClass: 'sortable-ghost', // 拖拽时原位置的样式
        chosenClass: 'sortable-chosen', // 被选中元素的样式
        dragClass: 'sortable-drag', // 拖拽中元素的样式
        forceFallback: true, // 强制使用回退（自定义拖拽样式）
        fallbackClass: 'sortable-fallback', // 回退时的样式
        fallbackOnBody: true, // 回退时将克隆元素附加到body
        scroll: true, // 允许滚动
        scrollSensitivity: 80, // 滚动敏感度
        scrollSpeed: 10, // 滚动速度
        bubbleScroll: true, // 允许冒泡滚动

        // 自定义占位符
        onChoose: function (evt) {
          // 添加全局拖拽状态
          document.body.classList.add('sortable-dragging');

          // 高亮当前行
          if (tierRow) {
            tierRow.classList.add('sortable-highlight');
          }
        },

        // 拖拽开始时
        onStart: function (evt) {
          console.log('开始拖拽', evt.oldIndex);

          // 添加活动状态到所有可放置的容器
          document.querySelectorAll('.tier-cards').forEach(el => {
            el.classList.add('sortable-container');
          });

          // 记录原始位置信息
          evt.from.dataset.originalTier = tierId;
          evt.from.dataset.originalIndex = evt.oldIndex;

          // 平滑滚动到视图中
          const rect = tierRow.getBoundingClientRect();
          if (rect.top < 0 || rect.bottom > window.innerHeight) {
            tierRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        },

        // 拖拽结束时
        onEnd: function (evt) {
          console.log('结束拖拽', evt.oldIndex, evt.newIndex);

          // 获取原始和目标tier
          const originalTier = evt.from.dataset.originalTier;
          const targetTier = evt.to.closest('.tier-row').id.split('-')[1];
          const originalIndex = parseInt(evt.from.dataset.originalIndex);
          const newIndex = evt.newIndex;

          // 处理数据更新 - 内部会调用cleanupDragState()清理拖拽状态
          handleSortableUpdate(originalTier, targetTier, originalIndex, newIndex, evt);

          // 额外保证：在短暂延迟后再次清理状态，确保所有动画完成后状态正确
          setTimeout(() => {
            cleanupDragState();
          }, 100);
        },

        // 添加到新列表时
        onAdd: function (evt) {
          console.log('添加到新列表', evt.newIndex);

          // 添加成功动画到目标行
          const targetRow = evt.to.closest('.tier-row');
          if (targetRow) {
            targetRow.classList.add('sortable-success');
            setTimeout(() => {
              targetRow.classList.remove('sortable-success');
            }, 500);
          }
        },

        // 在同一列表中更新时
        onUpdate: function (evt) {
          console.log('同列表内更新', evt.oldIndex, evt.newIndex);
        },

        // 排序时
        onSort: function (evt) {
          // 不再添加视觉效果到容器
          // 保留事件钩子以便将来可能的扩展
        },

        // 过滤器，防止空卡片被拖拽
        filter: '.card:not([style])',

        // 阻止空卡片被拖拽，但允许拖拽到空tier
        onMove: function (evt) {
          // 只检查被拖动的元素是否有style属性，不检查目标位置
          return evt.dragged.hasAttribute('style');
        },

        // 组，允许跨tier拖拽
        group: {
          name: 'tier-cards',
          pull: true,
          put: true,
        },
      });

      // 保存实例以便后续销毁
      sortableInstances.push(sortable);
    });
  }

  // 清理拖拽状态的辅助函数
  function cleanupDragState() {
    // 强制重置鼠标样式
    document.body.style.cursor = 'default';
    setTimeout(() => {
      document.body.style.cursor = 'auto';
    }, 50);

    // 移除全局拖拽状态
    document.body.classList.remove('sortable-dragging');

    // 移除所有容器的活动状态
    document.querySelectorAll('.tier-cards').forEach(el => {
      el.classList.remove('sortable-container');
      el.classList.remove('sortable-active');
      el.classList.remove('drag-over');
    });

    // 移除行高亮
    document.querySelectorAll('.tier-row').forEach(row => {
      row.classList.remove('sortable-highlight');
      row.classList.remove('sortable-success');
    });

    // 确保所有拖拽相关的类都被移除
    document.querySelectorAll('.card').forEach(el => {
      el.classList.remove('sortable-ghost');
      el.classList.remove('sortable-chosen');
      el.classList.remove('sortable-drag');
      el.classList.remove('dragging');
    });
  }

  // 处理SortableJS拖拽更新
  function handleSortableUpdate(originalTier, targetTier, originalIndex, newIndex, evt) {
    console.log(`从tier-${originalTier}[${originalIndex}]移动到tier-${targetTier}[${newIndex}]`);

    // 确保拖拽状态完全清除
    cleanupDragState();

    // 确保tiers对象中有这些tier
    if (!tiers[originalTier]) {
      console.error(`原始tier ${originalTier}不存在`);
      renderTierCards(); // 重新渲染以恢复状态
      return;
    }

    if (!tiers[targetTier]) {
      console.error(`目标tier ${targetTier}不存在`);
      renderTierCards(); // 重新渲染以恢复状态
      return;
    }

    try {
      // 获取被移动的项目
      const movedItem = tiers[originalTier][originalIndex];

      if (!movedItem) {
        console.error(`在tier ${originalTier}中找不到索引为${originalIndex}的项目`);
        renderTierCards(); // 重新渲染以恢复状态
        return;
      }

      // 从原始位置删除
      tiers[originalTier].splice(originalIndex, 1);

      // 添加到新位置
      if (originalTier === targetTier && newIndex > originalIndex) {
        // 如果在同一tier内向后移动，需要调整索引
        // 因为删除原始项目后，后面的项目索引会前移一位
        tiers[targetTier].splice(newIndex - 1, 0, movedItem);
      } else {
        // 跨tier移动或在同一tier内向前移动
        tiers[targetTier].splice(newIndex, 0, movedItem);
      }

      // 保存到本地存储
      saveToLocalStorage();

      // 如果是跨tier移动，完全重新渲染以确保数据一致性
      if (originalTier !== targetTier) {
        // 延迟渲染，让动画有时间完成
        setTimeout(() => {
          renderTierCards();
        }, 300);
      }

      console.log('拖拽更新成功');
    } catch (error) {
      console.error('处理拖拽更新时出错:', error);
      // 出错时重新渲染以恢复状态
      renderTierCards();
    }
  }

  // 以下是旧的拖拽代码，保留以备参考
  // 拖拽开始事件处理
  function handleDragStart(e) {
    if (e.target.classList.contains('card') && e.target.hasAttribute('style')) {
      // 设置拖拽图像为空，以便自定义拖拽外观
      const emptyImage = new Image();
      e.dataTransfer.setDragImage(emptyImage, 0, 0);

      // 设置拖拽效果
      e.dataTransfer.effectAllowed = 'move';

      // 保存拖拽卡片信息
      draggedCard = e.target;
      draggedTier = draggedCard.closest('.tier-row').id.split('-')[1];
      draggedIndex = parseInt(draggedCard.getAttribute('data-index'));

      // 添加拖拽样式类（使用setTimeout避免立即应用导致拖拽图像包含样式）
      setTimeout(() => {
        draggedCard.classList.add('dragging');

        // 添加拖拽状态到body，可用于全局样式调整
        document.body.classList.add('dragging-active');

        // 高亮显示所有可放置的tier区域
        document.querySelectorAll('.tier-cards').forEach(container => {
          container.classList.add('potential-drop-target');
        });
      }, 0);
    }
  }

  // 拖拽结束事件处理
  function handleDragEnd(e) {
    if (e.target.classList.contains('card')) {
      // 移除拖拽样式
      e.target.classList.remove('dragging');
      document.body.classList.remove('dragging-active');

      // 移除所有tier区域的高亮
      document.querySelectorAll('.tier-cards').forEach(container => {
        container.classList.remove('potential-drop-target');
        container.classList.remove('drag-over');
      });

      // 如果有拖拽顺序调整（同一个tier内），保存数据
      if (dropTarget && dropIndex !== null && draggedTier === dropTarget) {
        // 获取调整后的顺序并保存
        saveToLocalStorage();
      }

      // 添加放置完成的动画效果
      if (draggedCard) {
        draggedCard.classList.add('drop-animation');
        setTimeout(() => {
          if (draggedCard) {
            draggedCard.classList.remove('drop-animation');
          }
        }, 300);
      }

      // 重置拖拽状态
      draggedCard = null;
      draggedTier = null;
      draggedIndex = null;
      dropTarget = null;
      dropIndex = null;
    }
  }

  // 拖拽经过事件处理
  function handleDragOver(e) {
    e.preventDefault(); // 允许放置
    e.dataTransfer.dropEffect = 'move'; // 显示移动图标

    // 获取鼠标位置后的元素
    const afterElement = getDragAfterElement(this, e.clientY);

    // 添加视觉指示器，显示放置位置
    // 首先移除所有现有的指示器
    this.querySelectorAll('.drop-indicator').forEach(el => el.remove());

    // 创建新的指示器
    const indicator = document.createElement('div');
    indicator.className = 'drop-indicator';

    if (afterElement == null) {
      // 如果拖到最后，将卡片放在最后（空卡片之前）
      const emptyCard = this.querySelector('.card:not([style])');
      if (emptyCard) {
        this.insertBefore(draggedCard, emptyCard);
        // 在空卡片前添加指示器
        this.insertBefore(indicator, emptyCard);
      } else {
        this.appendChild(draggedCard);
        // 在容器末尾添加指示器
        this.appendChild(indicator);
      }
    } else {
      // 否则放在确定的位置前面
      this.insertBefore(draggedCard, afterElement);
      // 在目标元素前添加指示器
      this.insertBefore(indicator, afterElement);
    }

    // 平滑滚动到拖拽区域（如果需要）
    const tierRow = this.closest('.tier-row');
    if (tierRow) {
      const rect = tierRow.getBoundingClientRect();
      const isAboveViewport = rect.top < 0;
      const isBelowViewport = rect.bottom > window.innerHeight;

      if (isAboveViewport) {
        window.scrollBy({
          top: rect.top - 100,
          behavior: 'smooth',
        });
      } else if (isBelowViewport) {
        window.scrollBy({
          top: rect.bottom - window.innerHeight + 100,
          behavior: 'smooth',
        });
      }
    }
  }

  // 拖拽进入事件处理
  function handleDragEnter(e) {
    e.preventDefault();

    // 移除其他容器的高亮
    document.querySelectorAll('.tier-cards.drag-over').forEach(container => {
      if (container !== this) {
        container.classList.remove('drag-over');
      }
    });

    // 添加当前容器高亮
    this.classList.add('drag-over');

    // 添加视觉反馈
    const tierLabel = this.closest('.tier-row').querySelector('.tier-label');
    if (tierLabel) {
      tierLabel.classList.add('tier-highlight');
    }
  }

  // 拖拽离开事件处理
  function handleDragLeave(e) {
    // 检查是否真的离开了容器（而不是进入子元素）
    const rect = this.getBoundingClientRect();
    const isStillInside =
      e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;

    if (!isStillInside) {
      this.classList.remove('drag-over');

      // 移除视觉反馈
      const tierLabel = this.closest('.tier-row').querySelector('.tier-label');
      if (tierLabel) {
        tierLabel.classList.remove('tier-highlight');
      }

      // 移除所有放置指示器
      this.querySelectorAll('.drop-indicator').forEach(el => el.remove());
    }
  }

  // 拖拽放置事件处理
  function handleDrop(e) {
    e.preventDefault();

    // 移除所有视觉指示器
    this.classList.remove('drag-over');
    this.querySelectorAll('.drop-indicator').forEach(el => el.remove());

    // 移除tier标签高亮
    const tierLabel = this.closest('.tier-row').querySelector('.tier-label');
    if (tierLabel) {
      tierLabel.classList.remove('tier-highlight');
    }

    if (draggedCard && draggedCard.hasAttribute('style')) {
      // 获取目标tier
      const targetTier = this.closest('.tier-row').id.split('-')[1];
      dropTarget = targetTier;

      // 获取放置位置
      const cards = Array.from(this.querySelectorAll('.card[style]'));
      dropIndex = cards.indexOf(draggedCard);

      // 如果是在不同tier之间拖动
      if (targetTier !== draggedTier) {
        // 从原始位置删除项目
        const movedItem = tiers[draggedTier][draggedIndex];
        tiers[draggedTier].splice(draggedIndex, 1);

        // 添加到新位置
        if (!tiers[targetTier]) tiers[targetTier] = [];

        // 如果是新位置的末尾，直接添加
        if (dropIndex === -1 || dropIndex >= tiers[targetTier].length) {
          tiers[targetTier].push(movedItem);
        } else {
          // 否则在特定位置插入
          tiers[targetTier].splice(dropIndex, 0, movedItem);
        }

        // 保存数据
        saveToLocalStorage();

        // 添加放置成功的视觉反馈
        const targetRow = document.getElementById(`tier-${targetTier}`);
        if (targetRow) {
          targetRow.classList.add('drop-success');
          setTimeout(() => {
            targetRow.classList.remove('drop-success');
            // 重新渲染所有卡片
            renderTierCards();
          }, 300);
        } else {
          // 如果没有找到目标行，直接重新渲染
          renderTierCards();
        }

        console.log(`将作品从 tier-${draggedTier} 移动到 tier-${targetTier}`);
      } else {
        // 同一tier内的排序调整
        const movedItem = tiers[draggedTier][draggedIndex];

        // 从原始位置删除
        tiers[draggedTier].splice(draggedIndex, 1);

        // 添加到新位置
        tiers[draggedTier].splice(dropIndex, 0, movedItem);

        // 保存数据
        saveToLocalStorage();

        // 添加卡片放置成功的视觉反馈
        draggedCard.classList.add('sort-success');
        setTimeout(() => {
          draggedCard.classList.remove('sort-success');
        }, 300);

        // 注意：这里暂时不重新渲染，以保持平滑的拖拽体验
        // 在dragend事件中会保存最终顺序
      }
    }
  }

  // 自定义标题编辑功能
  if (editTitleBtn) {
    editTitleBtn.addEventListener('click', function () {
      const titleContainer = document.querySelector('.custom-title-container');
      const currentTitle = titleElement.textContent;

      // 创建输入框
      const inputElement = document.createElement('input');
      inputElement.type = 'text';
      inputElement.className = 'title-edit-input';
      inputElement.value = currentTitle;

      // 替换标题为输入框
      titleElement.style.display = 'none';
      editTitleBtn.style.display = 'none';
      titleContainer.insertBefore(inputElement, editTitleBtn);
      inputElement.focus();
      inputElement.select();

      // 处理输入框失焦和回车事件
      function saveTitle() {
        const newTitle = inputElement.value.trim() || '我的动画 Tier List';
        titleElement.textContent = newTitle;
        document.title = newTitle; // 更新页面标题

        // 保存到本地存储
        localStorage.setItem('anime-tier-list-title', newTitle);
        customTitle = newTitle;

        // 恢复显示
        titleElement.style.display = '';
        editTitleBtn.style.display = '';
        inputElement.remove();
      }

      inputElement.addEventListener('blur', saveTitle);
      inputElement.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveTitle();
        }
      });
    });
  }

  // 获取当前可见的tier
  function getVisibleTiers() {
    const visibleTiers = [];
    Object.keys(tiers).forEach(tier => {
      const tierRow = document.getElementById(`tier-${tier}`);
      if (tierRow && tierRow.style.display !== 'none') {
        visibleTiers.push(parseFloat(tier));
      }
    });
    return visibleTiers.sort((a, b) => b - a); // 从高到低排序
  }

  // 初始化Tier下拉菜单 - 使用分组和折叠功能
  function initTierDropdown(tierDropdownList) {
    if (!tierDropdownList) {
      console.error('Tier下拉列表元素未找到');
      return;
    }

    // 清空现有内容
    tierDropdownList.innerHTML = '';

    // 获取当前可见的tier
    const visibleTiers = getVisibleTiers();

    // 按照从高到低的顺序添加所有tier
    const allTiers = Object.keys(tiers)
      .map(t => parseFloat(t))
      .sort((a, b) => b - a);

    // 创建分组
    const tierGroups = [
      { name: '高分 (8-10分)', tiers: allTiers.filter(t => t >= 8) },
      { name: '中分 (5-7.5分)', tiers: allTiers.filter(t => t >= 5 && t < 8) },
      { name: '低分 (1-4.5分)', tiers: allTiers.filter(t => t < 5) },
    ];

    // 为每个分组创建折叠面板
    tierGroups.forEach(group => {
      // 创建分组标题
      const groupHeader = document.createElement('div');
      groupHeader.className = 'tier-group-header';
      groupHeader.innerHTML = `
        <span class="tier-group-name">${group.name}</span>
        <span class="tier-group-toggle"><i class="fas fa-chevron-right"></i></span>
      `;

      // 创建分组内容容器 - 默认折叠状态
      const groupContent = document.createElement('div');
      groupContent.className = 'tier-group-content collapsed';

      // 添加所有tier到分组
      group.tiers.forEach(tier => {
        const isVisible = visibleTiers.includes(tier);
        const isHalfTier = !Number.isInteger(tier);

        const tierItem = document.createElement('div');
        tierItem.className = 'tier-item';
        tierItem.innerHTML = `
          <input type="checkbox" class="tier-checkbox" id="tier-toggle-${tier}" data-tier="${tier}" ${
          isVisible ? 'checked' : ''
        }>
          <label for="tier-toggle-${tier}" class="tier-label-text">${tier}${isHalfTier ? ' (半分)' : ''}</label>
        `;

        // 添加点击事件
        const checkbox = tierItem.querySelector('.tier-checkbox');
        checkbox.addEventListener('change', function () {
          const tierValue = parseFloat(this.getAttribute('data-tier'));
          const tierRow = document.getElementById(`tier-${tierValue}`);

          if (tierRow) {
            if (this.checked) {
              // 显示tier
              tierRow.style.display = 'flex';
            } else {
              // 检查是否至少有一个tier是可见的
              const visibleTiers = getVisibleTiers();
              if (visibleTiers.length <= 1 && visibleTiers[0] === tierValue) {
                alert('至少需要保留一个Tier！');
                this.checked = true;
                return;
              }

              // 隐藏tier
              tierRow.style.display = 'none';
            }

            // 保存配置
            saveToLocalStorage();
          }
        });

        groupContent.appendChild(tierItem);
      });

      // 添加折叠功能
      groupHeader.addEventListener('click', function () {
        groupContent.classList.toggle('collapsed');
        const icon = this.querySelector('.tier-group-toggle i');
        if (icon) {
          if (groupContent.classList.contains('collapsed')) {
            // 折叠状态 - 显示向右箭头
            icon.className = 'fas fa-chevron-right';
          } else {
            // 展开状态 - 显示向下箭头
            icon.className = 'fas fa-chevron-down';
          }
        }
      });

      // 添加到主容器
      tierDropdownList.appendChild(groupHeader);
      tierDropdownList.appendChild(groupContent);
    });
  }

  // 初始渲染卡片（会自动启用拖拽功能）
  renderTierCards();

  // 添加全局点击事件监听器，确保拖拽状态可以被重置
  document.addEventListener('click', function (e) {
    // 如果body有sortable-dragging类，说明拖拽可能卡住了
    if (document.body.classList.contains('sortable-dragging')) {
      console.log('检测到可能的拖拽卡住状态，正在重置...');
      cleanupDragState();
    }
  });

  // ===== 导出与分享功能 =====

  // 导出为图片
  function exportAsImage() {
    // 关闭设置菜单
    document.getElementById('settings-menu-btn').classList.remove('active');
    document.getElementById('settings-menu-panel').classList.remove('active');

    // 显示加载状态
    const dialog = document.getElementById('export-image-dialog');
    dialog.classList.add('active');

    document.getElementById('export-loading').style.display = 'flex';
    document.getElementById('export-preview').style.display = 'none';

    const settingsBtn = document.getElementById('settings-menu-btn');
    settingsBtn.style.visibility = 'hidden';

    // 准备临时修改的SVG元素列表
    const originalSvgStyles = [];

    try {
      const exportContainer = document.createElement('div');
      exportContainer.className = 'export-container';

      const titleContainer = document.querySelector('.custom-title-container').cloneNode(true);
      const tierListContainer = document.querySelector('.tier-list-container').cloneNode(true);

      const editTitleBtn = titleContainer.querySelector('.edit-title-btn');
      if (editTitleBtn) {
        editTitleBtn.style.display = 'none';
      }
      const titleElement = titleContainer.querySelector('.custom-title');
      if (titleElement) {
        titleElement.style.width = '100%';
        titleElement.style.textAlign = 'center';
      }
      titleContainer.style.display = 'flex';
      titleContainer.style.justifyContent = 'center';
      titleContainer.style.width = '100%';
      titleContainer.style.marginBottom = '50px';

      exportContainer.appendChild(titleContainer);
      exportContainer.appendChild(tierListContainer);

      // 处理所有可见的tier行
      const clonedTierRows = tierListContainer.querySelectorAll('.tier-row');
      clonedTierRows.forEach(clonedRow => {
        const originalRowId = clonedRow.id;
        const originalRow = document.getElementById(originalRowId);
        if (originalRow && originalRow.style.display === 'none') {
          clonedRow.remove();
        } else if (originalRow) {
          // 对于可见的行，处理其SVG
          const originalSvg = originalRow.querySelector('.circular-chart .circle');
          const clonedSvgCircle = clonedRow.querySelector('.circular-chart .circle');

          if (originalSvg && clonedSvgCircle) {
            // 获取原始的stroke-dasharray属性值
            const strokeDasharray = originalSvg.getAttribute('stroke-dasharray');

            if (strokeDasharray) {
              // 存储原始内联样式以便恢复
              originalSvgStyles.push({
                element: originalSvg,
                originalStyle: originalSvg.style.cssText,
              });

              // 移除动画，确保静态显示
              clonedSvgCircle.style.animation = 'none';

              // 直接设置strokeDasharray为内联样式，确保html2canvas能正确捕获
              clonedSvgCircle.style.strokeDasharray = strokeDasharray;

              // 同样修改原始DOM，确保一致性
              originalSvg.style.animation = 'none';
              originalSvg.style.strokeDasharray = strokeDasharray;
            }
          }
        }
      });

      const computedStyle = window.getComputedStyle(document.body);
      exportContainer.style.background = computedStyle.background;
      exportContainer.style.backgroundImage = computedStyle.backgroundImage;
      exportContainer.style.backgroundSize = computedStyle.backgroundSize;
      exportContainer.style.backgroundPosition = computedStyle.backgroundPosition;
      exportContainer.style.width = 'auto';
      exportContainer.style.minWidth = '1000px';
      exportContainer.style.maxWidth = '1500px';
      exportContainer.style.margin = '0 auto';
      exportContainer.style.padding = '20px';
      exportContainer.style.boxSizing = 'border-box';

      const tierRowsInExport = exportContainer.querySelectorAll('.tier-row');
      tierRowsInExport.forEach(row => {
        row.style.display = 'flex';
        row.style.width = '100%';
        const labelContainer = row.querySelector('.tier-label-container');
        if (labelContainer) {
          labelContainer.style.display = 'flex';
          labelContainer.style.visibility = 'visible';
          labelContainer.style.opacity = '1';
          labelContainer.style.width = '65px';
          labelContainer.style.minWidth = '65px';
        }
      });

      exportContainer.style.position = 'absolute';
      exportContainer.style.left = '-9999px';
      document.body.appendChild(exportContainer);

      html2canvas(exportContainer, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
        allowTaint: true,
        scrollX: 0,
        scrollY: 0,
        windowWidth: exportContainer.scrollWidth,
        windowHeight: exportContainer.scrollHeight,
        onclone: function (clonedDoc) {
          // 确保克隆文档中的SVG元素也正确设置了样式
          const clonedCircles = clonedDoc.querySelectorAll('.circular-chart .circle');
          clonedCircles.forEach(circle => {
            const dashArray = circle.getAttribute('stroke-dasharray');
            if (dashArray) {
              circle.style.animation = 'none';
              circle.style.strokeDasharray = dashArray;
            }
          });
        },
      })
        .then(canvas => {
          const imageUrl = canvas.toDataURL('image/png');
          document.getElementById('export-loading').style.display = 'none';
          const preview = document.getElementById('export-preview');
          preview.style.display = 'block';
          preview.src = imageUrl;
          preview.dataset.imageData = imageUrl;
        })
        .catch(error => {
          console.error('导出图片失败:', error);
          alert('导出图片失败，请重试。');
          dialog.classList.remove('active');
        })
        .finally(() => {
          // 恢复原始SVG元素的样式
          originalSvgStyles.forEach(item => {
            item.element.style.cssText = item.originalStyle;
          });
          document.body.removeChild(exportContainer);
          settingsBtn.style.visibility = '';
        });
    } catch (error) {
      console.error('截图过程中出错:', error);
      alert('导出图片失败，请重试。');
      dialog.classList.remove('active');
      settingsBtn.style.visibility = '';
      // 确保即使出错也尝试恢复样式
      originalSvgStyles.forEach(item => {
        item.element.style.cssText = item.originalStyle;
      });
      const tempContainer = document.querySelector('.export-container');
      if (tempContainer) {
        document.body.removeChild(tempContainer);
      }
    }
  }

  // 下载图片
  function downloadImage() {
    const preview = document.getElementById('export-preview');
    const imageData = preview.dataset.imageData;

    if (!imageData) {
      alert('图片数据不可用，请重试。');
      return;
    }

    // 获取标题用于文件名
    const title = document.getElementById('custom-title').textContent.trim();
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_'); // 移除不安全的文件名字符
    const date = new Date().toISOString().slice(0, 10);

    // 创建下载链接
    const link = document.createElement('a');
    link.href = imageData;
    link.download = safeTitle ? `${safeTitle}-${date}.png` : `anime-tier-list-${date}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // 导出为JSON
  function exportAsJson() {
    // 获取评论数据
    let comments = [];
    try {
      const savedComments = localStorage.getItem('anime-tier-list-comments');
      if (savedComments) {
        comments = JSON.parse(savedComments);
      }
    } catch (error) {
      console.error('读取评论数据出错:', error);
      comments = [];
    }

    // 准备导出数据
    const exportData = {
      version: '1.2', // 更新版本号以表示包含评论数据
      title: document.getElementById('custom-title').textContent,
      tiers: tiers,
      comments: comments, // 添加评论数据
      date: new Date().toISOString(),
      settings: {
        hideTitles: localStorage.getItem('hide-titles') === 'true',
        visibleTiers: JSON.parse(localStorage.getItem('anime-tier-list-visible-tiers') || '[]'),
        backgroundSettings: {
          gradient: localStorage.getItem('selected-gradient') || 'gradient-deep-blue',
          particles: localStorage.getItem('particles-enabled') === 'true',
          glow: localStorage.getItem('glow-enabled') === 'true',
          blur: parseFloat(localStorage.getItem('blur-strength') || '5'),
          customBackground: localStorage.getItem('custom-background') || null,
        },
      },
    };

    // 转换为JSON字符串
    const jsonString = JSON.stringify(exportData, null, 2);

    // 创建Blob对象
    const blob = new Blob([jsonString], { type: 'application/json' });

    // 创建下载链接
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `anime-tier-list-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // 释放URL对象
    URL.revokeObjectURL(url);
  }

  // 处理文件选择
  function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 检查文件类型
    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      alert('请选择有效的JSON文件。');
      event.target.value = '';
      return;
    }

    // 显示确认对话框
    document.getElementById('import-confirm-dialog').classList.add('active');
  }

  // 从JSON导入
  function importFromJson() {
    const fileInput = document.getElementById('import-file-input');
    const file = fileInput.files[0];

    if (!file) {
      alert('请选择有效的JSON文件。');
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const importData = JSON.parse(e.target.result);

        // 验证数据格式
        if (!importData.tiers) {
          throw new Error('无效的数据格式');
        }

        // 导入数据
        Object.keys(tiers).forEach(tier => {
          if (importData.tiers[tier]) {
            tiers[tier] = importData.tiers[tier];
          } else {
            tiers[tier] = []; // 如果导入数据中没有该tier，则清空
          }
        });

        // 导入评论数据
        if (importData.comments && Array.isArray(importData.comments)) {
          localStorage.setItem('anime-tier-list-comments', JSON.stringify(importData.comments));
          console.log(`导入了 ${importData.comments.length} 条评论`);
        }

        // 导入标题
        if (importData.title) {
          document.getElementById('custom-title').textContent = importData.title;
          document.title = importData.title;
          localStorage.setItem('anime-tier-list-title', importData.title);
        }

        // 导入设置
        if (importData.settings) {
          // 显示标题设置
          if (importData.settings.hideTitles !== undefined) {
            localStorage.setItem('hide-titles', importData.settings.hideTitles.toString());
            const tierListContainer = document.querySelector('.tier-list-container');
            if (importData.settings.hideTitles) {
              tierListContainer.classList.add('hide-titles');
            } else {
              tierListContainer.classList.remove('hide-titles');
            }

            // 更新开关状态
            document.getElementById('title-display-toggle').checked = !importData.settings.hideTitles;
          }

          // 可见tier设置
          if (importData.settings.visibleTiers && Array.isArray(importData.settings.visibleTiers)) {
            localStorage.setItem('anime-tier-list-visible-tiers', JSON.stringify(importData.settings.visibleTiers));
            // 应用可见tier设置
            Object.keys(tiers).forEach(tier => {
              const tierRow = document.getElementById(`tier-${tier}`);
              if (tierRow) {
                if (importData.settings.visibleTiers.includes(parseFloat(tier))) {
                  tierRow.style.display = 'flex';
                } else {
                  tierRow.style.display = 'none';
                }
              }
            });
          }

          // 背景设置
          if (importData.settings.backgroundSettings) {
            const bg = importData.settings.backgroundSettings;

            // 渐变主题
            if (bg.gradient) {
              localStorage.setItem('selected-gradient', bg.gradient);
              if (window.applyGradientTheme) {
                window.applyGradientTheme(bg.gradient);
              }
            }

            // 特效设置
            if (bg.particles !== undefined) {
              localStorage.setItem('particles-enabled', bg.particles.toString());
            }
            if (bg.glow !== undefined) {
              localStorage.setItem('glow-enabled', bg.glow.toString());
            }
            if (bg.blur !== undefined) {
              localStorage.setItem('blur-strength', bg.blur.toString());
            }
            if (bg.customBackground) {
              localStorage.setItem('custom-background', bg.customBackground);
            }

            // 重新初始化背景设置
            if (window.initBackgroundSettings) {
              window.initBackgroundSettings();
            }
          }
        }

        // 保存到本地存储
        saveToLocalStorage();

        // 重新渲染卡片
        renderTierCards();

        // 如果存在评论功能，重新渲染评论
        if (window.renderComments) {
          setTimeout(() => {
            window.renderComments();
          }, 100);
        }

        // 关闭对话框
        document.getElementById('import-confirm-dialog').classList.remove('active');

        // 清空文件输入
        fileInput.value = '';

        const importedFeatures = [];
        if (importData.tiers) importedFeatures.push('Tier数据');
        if (importData.comments && importData.comments.length > 0)
          importedFeatures.push(`${importData.comments.length}条评论`);
        if (importData.settings) importedFeatures.push('设置配置');

        alert(`数据导入成功！\n导入内容：${importedFeatures.join('、')}`);
      } catch (error) {
        console.error('导入数据失败:', error);
        alert('导入数据失败，请确保文件格式正确。');
        document.getElementById('import-confirm-dialog').classList.remove('active');
      }
    };

    reader.readAsText(file);
  }

  // 生成分享链接
  function generateShareLink() {
    try {
      // 获取评论数据
      let comments = [];
      try {
        const savedComments = localStorage.getItem('anime-tier-list-comments');
        if (savedComments) {
          comments = JSON.parse(savedComments);
        }
      } catch (error) {
        console.error('读取评论数据出错:', error);
        comments = [];
      }

      // 准备完整的导出数据（与JSON导出保持一致）
      const exportData = {
        v: '1.2', // 版本号，与JSON导出保持一致
        t: document.getElementById('custom-title').textContent,
        d: tiers,
        c: comments, // 添加评论数据
        s: {
          // 添加核心设置
          h: localStorage.getItem('hide-titles') === 'true', // hideTitles简化
          vt: JSON.parse(localStorage.getItem('anime-tier-list-visible-tiers') || '[]'), // visibleTiers简化
          bg: {
            // 背景设置简化
            g: localStorage.getItem('selected-gradient') || 'gradient-deep-blue', // gradient
            p: localStorage.getItem('particles-enabled') === 'true', // particles
            gl: localStorage.getItem('glow-enabled') === 'true', // glow
            b: parseFloat(localStorage.getItem('blur-strength') || '5'), // blur
          },
        },
      };

      // 转换为JSON字符串（不格式化以减少大小）
      const jsonString = JSON.stringify(exportData);

      // 检查数据大小
      const dataSize = new Blob([jsonString]).size;
      console.log(`分享数据大小: ${dataSize} bytes`);

      // 使用Base64编码
      const encodedData = btoa(jsonString);

      // 检查URL长度（大多数浏览器支持2000+字符，我们设置1800为安全阈值）
      const baseUrl = `${window.location.origin}${window.location.pathname}?data=`;
      const fullUrl = baseUrl + encodedData;

      if (fullUrl.length > 1800) {
        // 如果URL太长，提供简化版本（不包含评论）
        const simplifiedData = {
          v: '1.2',
          t: exportData.t,
          d: exportData.d,
          s: exportData.s,
        };

        const simplifiedJson = JSON.stringify(simplifiedData);
        const simplifiedEncoded = btoa(simplifiedJson);
        const simplifiedUrl = baseUrl + simplifiedEncoded;

        if (simplifiedUrl.length > 1800) {
          // 如果还是太长，只包含核心数据
          const coreData = {
            v: '1',
            t: exportData.t,
            d: exportData.d,
          };
          const coreJson = JSON.stringify(coreData);
          const coreEncoded = btoa(coreJson);
          const coreUrl = baseUrl + coreEncoded;

          if (coreUrl.length > 1800) {
            alert('数据量过大，无法生成分享链接。建议使用JSON导出功能。');
            return;
          }

          // 显示警告并提供核心版本
          if (confirm('数据量较大，分享链接将不包含评论和设置。\n点击确定继续，或取消改用JSON导出。')) {
            showShareDialog(coreUrl, '基础版（仅包含Tier数据）');
          }
          return;
        }

        // 显示警告并提供简化版本
        if (confirm('数据量较大，分享链接将不包含评论数据。\n点击确定继续，或取消改用JSON导出。')) {
          showShareDialog(simplifiedUrl, '简化版（不含评论）');
        }
        return;
      }

      // 数据大小合适，显示完整版本
      showShareDialog(fullUrl, '完整版（含评论和设置）');
    } catch (error) {
      console.error('生成分享链接失败:', error);
      alert('生成分享链接失败，请稍后重试。');
    }
  }

  // 显示分享对话框的辅助函数
  function showShareDialog(shareUrl, version) {
    const dialog = document.getElementById('share-link-dialog');
    const input = document.getElementById('share-link-input');
    const dialogTitle = dialog.querySelector('.export-dialog h3');

    // 更新对话框标题显示版本信息
    if (dialogTitle) {
      dialogTitle.textContent = `分享链接 - ${version}`;
    }

    input.value = shareUrl;
    dialog.classList.add('active');

    // 添加URL长度信息
    const urlInfo = dialog.querySelector('.url-info') || document.createElement('p');
    if (!dialog.querySelector('.url-info')) {
      urlInfo.className = 'url-info';
      urlInfo.style.color = '#666';
      urlInfo.style.fontSize = '12px';
      urlInfo.style.margin = '5px 0';
      input.parentNode.insertBefore(urlInfo, input.nextSibling);
    }
    urlInfo.textContent = `链接长度: ${shareUrl.length} 字符`;
  }

  // 复制分享链接
  function copyShareLink() {
    const input = document.getElementById('share-link-input');
    input.select();
    document.execCommand('copy');

    // 显示复制成功提示
    const copyBtn = document.getElementById('copy-link-btn');
    const originalText = copyBtn.innerHTML;

    copyBtn.innerHTML = '<i class="fas fa-check"></i><span>已复制</span>';
    setTimeout(() => {
      copyBtn.innerHTML = originalText;
    }, 2000);
  }

  // 检查URL中是否有分享数据
  function checkForSharedData() {
    const urlParams = new URLSearchParams(window.location.search);
    const sharedData = urlParams.get('data');

    if (sharedData) {
      try {
        // 解码数据
        const jsonString = atob(sharedData);
        const importData = JSON.parse(jsonString);

        // 验证数据格式（支持新旧版本）
        if (!importData.d && !importData.tiers) {
          throw new Error('无效的数据格式');
        }

        // 支持新格式（简化字段名）和旧格式
        const tierData = importData.d || importData.tiers;
        const title = importData.t || importData.title;
        const comments = importData.c || importData.comments;
        const settings = importData.s || importData.settings;

        // 导入Tier数据
        Object.keys(tiers).forEach(tier => {
          if (tierData[tier]) {
            tiers[tier] = tierData[tier];
          } else {
            tiers[tier] = []; // 如果导入数据中没有该tier，则清空
          }
        });

        // 导入标题
        if (title) {
          document.getElementById('custom-title').textContent = title;
          document.title = title;
          localStorage.setItem('anime-tier-list-title', title);
        }

        // 导入评论数据
        if (comments && Array.isArray(comments)) {
          localStorage.setItem('anime-tier-list-comments', JSON.stringify(comments));
          console.log(`从分享链接导入了 ${comments.length} 条评论`);

          // 如果存在评论渲染函数，立即渲染评论
          if (window.renderComments) {
            setTimeout(() => {
              window.renderComments();
            }, 100);
          }
        }

        // 导入设置数据
        if (settings) {
          // 处理新格式（简化字段名）
          if (settings.h !== undefined) {
            localStorage.setItem('hide-titles', settings.h.toString());
            const tierListContainer = document.querySelector('.tier-list-container');
            if (settings.h) {
              tierListContainer.classList.add('hide-titles');
            } else {
              tierListContainer.classList.remove('hide-titles');
            }

            // 更新开关状态
            const titleToggle = document.getElementById('title-display-toggle');
            if (titleToggle) {
              titleToggle.checked = !settings.h;
            }
          }

          // 可见tier设置
          if (settings.vt && Array.isArray(settings.vt)) {
            localStorage.setItem('anime-tier-list-visible-tiers', JSON.stringify(settings.vt));
            // 应用可见tier设置
            Object.keys(tiers).forEach(tier => {
              const tierRow = document.getElementById(`tier-${tier}`);
              if (tierRow) {
                if (settings.vt.includes(parseFloat(tier))) {
                  tierRow.style.display = 'flex';
                } else {
                  tierRow.style.display = 'none';
                }
              }
            });
          }

          // 背景设置
          if (settings.bg) {
            const bg = settings.bg;

            // 渐变主题
            if (bg.g) {
              localStorage.setItem('selected-gradient', bg.g);
              if (window.applyGradientTheme) {
                window.applyGradientTheme(bg.g);
              }
            }

            // 特效设置
            if (bg.p !== undefined) {
              localStorage.setItem('particles-enabled', bg.p.toString());
            }
            if (bg.gl !== undefined) {
              localStorage.setItem('glow-enabled', bg.gl.toString());
            }
            if (bg.b !== undefined) {
              localStorage.setItem('blur-strength', bg.b.toString());
            }

            // 重新初始化背景设置
            if (window.initBackgroundSettings) {
              setTimeout(() => {
                window.initBackgroundSettings();
              }, 100);
            }
          }

          // 兼容旧格式的设置导入
          if (settings.hideTitles !== undefined) {
            localStorage.setItem('hide-titles', settings.hideTitles.toString());
            const tierListContainer = document.querySelector('.tier-list-container');
            if (settings.hideTitles) {
              tierListContainer.classList.add('hide-titles');
            } else {
              tierListContainer.classList.remove('hide-titles');
            }

            const titleToggle = document.getElementById('title-display-toggle');
            if (titleToggle) {
              titleToggle.checked = !settings.hideTitles;
            }
          }

          if (settings.visibleTiers && Array.isArray(settings.visibleTiers)) {
            localStorage.setItem('anime-tier-list-visible-tiers', JSON.stringify(settings.visibleTiers));
            Object.keys(tiers).forEach(tier => {
              const tierRow = document.getElementById(`tier-${tier}`);
              if (tierRow) {
                if (settings.visibleTiers.includes(parseFloat(tier))) {
                  tierRow.style.display = 'flex';
                } else {
                  tierRow.style.display = 'none';
                }
              }
            });
          }

          if (settings.backgroundSettings) {
            const bg = settings.backgroundSettings;
            if (bg.gradient) {
              localStorage.setItem('selected-gradient', bg.gradient);
              if (window.applyGradientTheme) {
                window.applyGradientTheme(bg.gradient);
              }
            }

            if (bg.particles !== undefined) {
              localStorage.setItem('particles-enabled', bg.particles.toString());
            }
            if (bg.glow !== undefined) {
              localStorage.setItem('glow-enabled', bg.glow.toString());
            }
            if (bg.blur !== undefined) {
              localStorage.setItem('blur-strength', bg.blur.toString());
            }

            if (window.initBackgroundSettings) {
              setTimeout(() => {
                window.initBackgroundSettings();
              }, 100);
            }
          }
        }

        // 保存到本地存储
        saveToLocalStorage();

        // 重新渲染卡片
        renderTierCards();

        // 清除URL参数（可选）
        window.history.replaceState({}, document.title, window.location.pathname);

        // 显示导入成功的消息
        const importedFeatures = [];
        if (tierData) importedFeatures.push('Tier数据');
        if (comments && comments.length > 0) importedFeatures.push(`${comments.length}条评论`);
        if (settings) importedFeatures.push('设置配置');

        // 创建一个更友好的通知
        const notification = document.createElement('div');
        notification.className = 'import-notification';
        notification.innerHTML = `
          <div class="notification-content">
            <i class="fas fa-check-circle"></i>
            <div class="notification-text">
              <h4>分享数据导入成功！</h4>
              <p>导入内容：${importedFeatures.join('、')}</p>
            </div>
            <button class="notification-close">&times;</button>
          </div>
        `;

        // 添加样式
        notification.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: linear-gradient(135deg, #4CAF50, #45a049);
          color: white;
          padding: 0;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          z-index: 10000;
          max-width: 400px;
          opacity: 0;
          transform: translateX(100%);
          transition: all 0.3s ease;
        `;

        const content = notification.querySelector('.notification-content');
        content.style.cssText = `
          display: flex;
          align-items: center;
          padding: 16px 20px;
          gap: 12px;
        `;

        const icon = notification.querySelector('i');
        icon.style.cssText = `
          font-size: 24px;
          color: #fff;
          flex-shrink: 0;
        `;

        const textDiv = notification.querySelector('.notification-text');
        textDiv.style.cssText = `
          flex: 1;
        `;

        const h4 = notification.querySelector('h4');
        h4.style.cssText = `
          margin: 0 0 4px 0;
          font-size: 16px;
          font-weight: 600;
        `;

        const p = notification.querySelector('p');
        p.style.cssText = `
          margin: 0;
          font-size: 14px;
          opacity: 0.9;
        `;

        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.style.cssText = `
          background: none;
          border: none;
          color: white;
          font-size: 20px;
          cursor: pointer;
          padding: 0;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: background-color 0.2s;
        `;

        closeBtn.addEventListener('mouseover', () => {
          closeBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
        });

        closeBtn.addEventListener('mouseout', () => {
          closeBtn.style.backgroundColor = 'transparent';
        });

        closeBtn.addEventListener('click', () => {
          notification.style.opacity = '0';
          notification.style.transform = 'translateX(100%)';
          setTimeout(() => {
            if (notification.parentNode) {
              document.body.removeChild(notification);
            }
          }, 300);
        });

        document.body.appendChild(notification);

        // 显示通知
        setTimeout(() => {
          notification.style.opacity = '1';
          notification.style.transform = 'translateX(0)';
        }, 100);

        // 5秒后自动关闭
        setTimeout(() => {
          if (notification.parentNode) {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
              if (notification.parentNode) {
                document.body.removeChild(notification);
              }
            }, 300);
          }
        }, 5000);

        console.log('已从分享链接加载数据');
      } catch (error) {
        console.error('加载分享数据失败:', error);

        // 显示错误通知
        const errorNotification = document.createElement('div');
        errorNotification.className = 'error-notification';
        errorNotification.innerHTML = `
          <div class="notification-content">
            <i class="fas fa-exclamation-triangle"></i>
            <div class="notification-text">
              <h4>分享数据导入失败</h4>
              <p>链接可能已损坏或格式不正确</p>
            </div>
            <button class="notification-close">&times;</button>
          </div>
        `;

        errorNotification.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: linear-gradient(135deg, #f44336, #d32f2f);
          color: white;
          padding: 0;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          z-index: 10000;
          max-width: 400px;
          opacity: 0;
          transform: translateX(100%);
          transition: all 0.3s ease;
        `;

        // 应用相同的样式
        const content = errorNotification.querySelector('.notification-content');
        content.style.cssText = `display: flex; align-items: center; padding: 16px 20px; gap: 12px;`;

        const icon = errorNotification.querySelector('i');
        icon.style.cssText = `font-size: 24px; color: #fff; flex-shrink: 0;`;

        const textDiv = errorNotification.querySelector('.notification-text');
        textDiv.style.cssText = `flex: 1;`;

        const h4 = errorNotification.querySelector('h4');
        h4.style.cssText = `margin: 0 0 4px 0; font-size: 16px; font-weight: 600;`;

        const p = errorNotification.querySelector('p');
        p.style.cssText = `margin: 0; font-size: 14px; opacity: 0.9;`;

        const closeBtn = errorNotification.querySelector('.notification-close');
        closeBtn.style.cssText = `background: none; border: none; color: white; font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: background-color 0.2s;`;

        closeBtn.addEventListener('click', () => {
          errorNotification.style.opacity = '0';
          errorNotification.style.transform = 'translateX(100%)';
          setTimeout(() => {
            if (errorNotification.parentNode) {
              document.body.removeChild(errorNotification);
            }
          }, 300);
        });

        document.body.appendChild(errorNotification);

        setTimeout(() => {
          errorNotification.style.opacity = '1';
          errorNotification.style.transform = 'translateX(0)';
        }, 100);

        setTimeout(() => {
          if (errorNotification.parentNode) {
            errorNotification.style.opacity = '0';
            errorNotification.style.transform = 'translateX(100%)';
            setTimeout(() => {
              if (errorNotification.parentNode) {
                document.body.removeChild(errorNotification);
              }
            }, 300);
          }
        }, 4000);
      }
    }
  }

  // Tag分析功能 (Tag Cloud)
  // 需要过滤的通用标签（几乎每部动画都有的标签） - 这个保留，因为Tag Cloud也需要
  const COMMON_TAGS_TO_FILTER_FOR_CLOUD = [
    // 基本标签
    '日本',
    'TV',
    'TVA',
    '动画',
    '日本动画',
    'anime',
    'animation',
    'アニメ',
    '未确定',

    // 明确指定的年份和季度标签
    '2025年',
    '2025春',
    '2020-2029',

    // 年份和季度标签的正则匹配
    /^\d{4}年\d{1,2}月$/, // 匹配"2025年7月"格式
    /^\d{4}$/, // 匹配纯年份，如"2025"
    /^(春|夏|秋|冬)番$/, // 匹配季度，如"春番"
    /^(January|February|March|April|May|June|July|August|September|October|November|December)$/, // 英文月份
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/, // 英文月份缩写
  ];

  // 收集所有已添加的动画ID - 这个保留，因为Tag Cloud也需要
  function collectAnimeIdsForCloud() {
    const animeIds = [];
    for (const tier in tiers) {
      if (Array.isArray(tiers[tier])) {
        tiers[tier].forEach(anime => {
          if (anime && anime.id && !isNaN(anime.id)) {
            animeIds.push(anime.id);
          }
        });
      }
    }
    return animeIds;
  }

  // 标签数据缓存 - 这个保留，因为Tag Cloud也需要
  const tagCloudDataCache = {
    data: null,
    timestamp: null,
    validityPeriod: 24 * 60 * 60 * 1000,
    saveToLocalStorage: function () {
      try {
        localStorage.setItem(
          'tagCloudDataCache', // 使用不同的键名以避免冲突
          JSON.stringify({
            data: this.data,
            timestamp: this.timestamp,
          }),
        );
        console.log('Tag Cloud数据已缓存到本地存储');
      } catch (error) {
        console.error('保存Tag Cloud数据到本地存储失败:', error);
      }
    },
    loadFromLocalStorage: function () {
      try {
        const cachedData = localStorage.getItem('tagCloudDataCache');
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          this.data = parsed.data;
          this.timestamp = parsed.timestamp;
          console.log('从本地存储加载了Tag Cloud数据');
          return true;
        }
      } catch (error) {
        console.error('从本地存储加载Tag Cloud数据失败:', error);
      }
      return false;
    },
    isValid: function () {
      if (!this.data || !this.timestamp) return false;
      const now = Date.now();
      const age = now - this.timestamp;
      return age < this.validityPeriod;
    },
    update: function (data) {
      this.data = data;
      this.timestamp = Date.now();
      this.saveToLocalStorage();
    },
    clear: function () {
      this.data = null;
      this.timestamp = null;
      localStorage.removeItem('tagCloudDataCache');
      console.log('Tag Cloud数据缓存已清除');
    },
  };

  // 设置标签云加载按钮 - 这个保留
  function setupTagCloudButton() {
    const loadButton = document.getElementById('load-tag-cloud-btn');
    if (!loadButton) return;

    loadButton.addEventListener('click', async function () {
      const mainTagCloudContainer = document.getElementById('main-tag-cloud-container');
      if (!mainTagCloudContainer) return;

      mainTagCloudContainer.innerHTML = `
        <div class="tag-cloud-loading">
          <i class="fas fa-spinner fa-spin"></i>
          <span>正在加载Tag分析...</span>
        </div>
      `;
      try {
        await initMainTagCloud();
      } catch (error) {
        console.error('加载Tag分析失败:', error);
        mainTagCloudContainer.innerHTML = `
          <div class="error-message">
            <i class="fas fa-exclamation-circle"></i>
            <p>加载Tag分析失败，请稍后重试。</p>
            <p class="error-details">${error.message}</p>
            <button id="retry-tag-cloud-btn" class="load-tag-cloud-btn">
              <i class="fas fa-redo"></i>
              <span>重试</span>
            </button>
          </div>
        `;
        const retryButton = document.getElementById('retry-tag-cloud-btn');
        if (retryButton) {
          retryButton.addEventListener('click', setupTagCloudButton); // 修正：应该是调用 setupTagCloudButton
        }
      }
    });
  }

  // 获取所有动画的标签 - 这个保留，但重命名以区分
  async function fetchAllAnimeTagsForCloud(animeIds, progressCallback) {
    if (tagCloudDataCache.loadFromLocalStorage() && tagCloudDataCache.isValid()) {
      console.log('使用缓存的Tag Cloud数据');
      if (typeof progressCallback === 'function') {
        progressCallback(animeIds.length, animeIds.length);
      }
      return tagCloudDataCache.data;
    }

    const tagData = [];
    const totalAnimes = animeIds.length;
    let processedCount = 0;

    const updateProgress = (current, total) => {
      if (typeof progressCallback === 'function') {
        progressCallback(current, total);
      }
    };

    await Promise.all(
      animeIds.map(async animeId => {
        try {
          const apiUrl = `${BANGUMI_V0_API_BASE}/v0/subjects/${animeId}`;
          const response = await fetch(apiUrl, {
            method: 'GET',
            headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
          });
          if (!response.ok) {
            console.warn(`获取动画 ${animeId} 的标签失败 (Tag Cloud): ${response.status}`);
            return;
          }
          const animeData = await response.json();
          if (animeData.tags && animeData.tags.length > 0) {
            tagData.push({
              id: animeId,
              title: animeData.name_cn || animeData.name,
              tags: animeData.tags,
            });
          }
        } catch (error) {
          console.error(`获取动画 ${animeId} 的标签时出错 (Tag Cloud):`, error);
        } finally {
          processedCount++;
          updateProgress(processedCount, totalAnimes);
        }
      }),
    );
    tagCloudDataCache.update(tagData);
    console.log('Tag Cloud数据已更新并缓存');
    return tagData;
  }

  // 处理标签数据，过滤和统计 - 这个保留，但重命名以区分
  function processTagDataForCloud(tagData) {
    const tagStats = {};
    tagData.forEach(anime => {
      anime.tags.forEach(tag => {
        if (shouldFilterTagForCloud(tag.name)) {
          // 使用新的过滤函数
          return;
        }
        if (!tagStats[tag.name]) {
          tagStats[tag.name] = { count: 1, animeIds: [anime.id] };
        } else {
          tagStats[tag.name].count++;
          if (!tagStats[tag.name].animeIds.includes(anime.id)) {
            tagStats[tag.name].animeIds.push(anime.id);
          }
        }
      });
    });
    return tagStats;
  }

  // 判断是否应该过滤掉某个标签 - 这个保留，但重命名以区分
  function shouldFilterTagForCloud(tagName) {
    for (const filter of COMMON_TAGS_TO_FILTER_FOR_CLOUD) {
      // 使用新的常量
      if (typeof filter === 'string') {
        if (tagName === filter) return true;
      } else if (filter instanceof RegExp) {
        if (filter.test(tagName)) return true;
      }
    }
    if (/\d{4}年/.test(tagName) || /\d{4}春|夏|秋|冬/.test(tagName) || /\d{4}-\d{4}/.test(tagName)) {
      return true;
    }
    return false;
  }

  // 初始化主页面标签云 - 这个保留
  async function initMainTagCloud() {
    const mainTagCloudContainer = document.getElementById('main-tag-cloud-container');
    if (!mainTagCloudContainer) return;

    try {
      // 收集所有已添加的动画ID
      const animeIds = collectAnimeIdsForCloud(); // 使用为Tag Cloud重命名的函数

      if (animeIds.length === 0) {
        mainTagCloudContainer.innerHTML =
          '<p class="no-tags-message">没有找到已添加的动画，请先添加一些动画后再查看Tag分析。</p>';
        return;
      }

      // 显示加载状态
      mainTagCloudContainer.innerHTML = `
        <div class="tag-cloud-loading">
          <i class="fas fa-spinner fa-spin"></i>
          <span>正在分析Tag数据... (0/${animeIds.length})</span>
        </div>
      `;

      // 获取所有动画的标签
      const tagData = await fetchAllAnimeTagsForCloud(animeIds, updateMainTagCloudProgress); // 使用为Tag Cloud重命名的函数

      // 过滤和统计标签
      const tagStats = processTagDataForCloud(tagData); // 使用为Tag Cloud重命名的函数

      // 将标签转换为数组并按出现次数排序
      const sortedTags = Object.entries(tagStats)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.count - a.count);

      // 过滤掉出现次数≤3的标签
      const filteredTags = sortedTags.filter(tag => tag.count > 3);

      // 更新主页面标签云
      updateMainTagCloud(filteredTags, tagData);
    } catch (error) {
      console.error('初始化主页面标签云失败:', error);
      mainTagCloudContainer.innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-circle"></i>
          <p>加载Tag分析失败，请稍后重试。</p>
          <p class="error-details">${error.message}</p>
        </div>
      `;
    }
  }

  // 更新主页面标签云进度
  function updateMainTagCloudProgress(current, total) {
    const mainTagCloudContainer = document.getElementById('main-tag-cloud-container');
    if (mainTagCloudContainer) {
      const loadingElement = mainTagCloudContainer.querySelector('.tag-cloud-loading');
      if (loadingElement) {
        loadingElement.innerHTML = `
          <i class="fas fa-spinner fa-spin"></i>
          <span>正在分析Tag数据... (${current}/${total})</span>
        `;
      }
    }
  }

  // 更新主页面标签云
  function updateMainTagCloud(filteredTags, tagData) {
    const mainTagCloudContainer = document.getElementById('main-tag-cloud-container');
    if (!mainTagCloudContainer) return;

    // 清空容器
    mainTagCloudContainer.innerHTML = '';

    // 如果没有标签，显示提示信息
    if (filteredTags.length === 0) {
      mainTagCloudContainer.innerHTML =
        '<p class="no-tags-message">没有找到出现次数>3的标签，所有标签出现次数都≤3。</p>';
      return;
    }

    // 计算标签大小（1-10的范围）
    const maxCount = filteredTags[0].count;
    const minCount = filteredTags[filteredTags.length - 1].count;

    // 创建标签云 - 确保只使用过滤后的标签
    filteredTags.forEach(tag => {
      // 跳过出现次数≤3的标签
      if (tag.count <= 3) return;

      // 计算标签大小（1-10的范围）
      let size;
      if (maxCount === minCount) {
        size = 5; // 如果所有标签出现次数相同，使用中等大小
      } else {
        size = Math.ceil(((tag.count - minCount) / (maxCount - minCount)) * 9) + 1;
      }

      // 创建标签元素
      const tagElement = document.createElement('span');
      tagElement.className = 'main-tag';
      tagElement.textContent = `${tag.name} (${tag.count})`;
      tagElement.setAttribute('data-size', size);
      tagElement.setAttribute('data-tag', tag.name);
      tagElement.setAttribute('title', `${tag.name}: 出现在 ${tag.count} 部动画中`);

      // 添加点击事件，显示包含该标签的动画
      tagElement.addEventListener('click', () => {
        alert(
          `包含"${tag.name}"标签的动画：\n${tag.animeIds
            .map(id => {
              const anime = tagData.find(a => a.id === id);
              return anime ? anime.title : `ID: ${id}`;
            })
            .join('\n')}`,
        );
      });

      // 添加到标签云
      mainTagCloudContainer.appendChild(tagElement);
    });
  }

  // 页面加载完成后检查分享数据并设置标签云按钮
  window.addEventListener('DOMContentLoaded', function () {
    checkForSharedData();

    // 设置标签云加载按钮
    setupTagCloudButton();
  });

  // 添加滚动时的视差效果（使用节流函数优化性能）
  window.addEventListener(
    'scroll',
    throttle(function () {
      const rows = document.querySelectorAll('.tier-row');
      const scrollY = window.scrollY;

      // 使用requestAnimationFrame优化动画性能
      requestAnimationFrame(() => {
        rows.forEach((row, index) => {
          // 视差滚动效果 - 每行有微小的不同移动速度
          const speed = 1 - index * 0.02;
          const yPos = -(scrollY * speed * 0.03);

          // 使用transform3d触发GPU加速
          row.style.transform = `translate3d(0, ${yPos}px, 0)`;

          // 滚动时增加毛玻璃效果
          const blurValue = Math.min(15 + scrollY * 0.01, 20);
          row.style.backdropFilter = `blur(${blurValue}px)`;
          row.style.webkitBackdropFilter = `blur(${blurValue}px)`;
        });
      });
    }, 16),
  ); // 约60fps的节流频率

  // 初始化评论区 Masonry 布局
  function initCommentMasonry() {
    const commentsContainer = document.querySelector('.comments-container');
    if (commentsContainer && typeof Masonry !== 'undefined' && typeof imagesLoaded !== 'undefined') {
      // 初始化 Masonry 实例，但不立即布局
      const masonryInstance = new Masonry(commentsContainer, {
        itemSelector: '.comment-card',
        columnWidth: 320, // 直接指定列宽，与 CSS 中的 .comment-card width 一致
        gutter: 25,
        percentPosition: true,
        fitWidth: true,
        initLayout: false, // 禁用初始布局，等待图片加载
      });

      // 使用 imagesLoaded 确保所有图片加载完毕后再进行布局
      imagesLoaded(commentsContainer, function () {
        console.log('评论区图片加载完成，执行 Masonry layout。');
        masonryInstance.layout(); // 手动触发布局

        // 有时，即使 imagesLoaded 完成，浏览器可能仍在进行微小的渲染调整。
        // 添加一个微小的延迟再次触发布局可能有助于解决边缘情况。
        setTimeout(function () {
          console.log('延迟后再次执行 Masonry layout。');
          masonryInstance.layout();
        }, 100);
      });

      // 监听窗口大小变化，重新布局
      window.addEventListener('resize', function () {
        if (masonryInstance) {
          masonryInstance.layout();
        }
      });
    } else if (typeof Masonry === 'undefined') {
      console.warn('Masonry库未加载，评论区瀑布流布局无法初始化。');
    } else if (typeof imagesLoaded === 'undefined') {
      console.warn('imagesLoaded库未加载，评论区瀑布流布局可能在图片加载完成前初始化。');
      // 作为备选方案，如果 imagesLoaded 未加载，仍然尝试初始化 Masonry
      if (commentsContainer && typeof Masonry !== 'undefined') {
        const masonryInstance = new Masonry(commentsContainer, {
          itemSelector: '.comment-card',
          columnWidth: 320,
          gutter: 25,
          percentPosition: true,
          fitWidth: true,
          initLayout: true,
        });
        window.addEventListener('resize', function () {
          if (masonryInstance) {
            masonryInstance.layout();
          }
        });
      }
    }
  }

  // 在 DOMContentLoaded 事件中调用 Masonry 初始化
  initCommentMasonry();

  // 初始化背景设置功能
  initBackgroundSettings();

  window.deleteAnimeFromTier = function (tierKey, itemIndex) {
    try {
      if (tiers[tierKey] && tiers[tierKey][itemIndex] !== undefined) {
        tiers[tierKey].splice(itemIndex, 1);
        saveToLocalStorage(); // Updates localStorage with the modified 'tiers' object
        renderTierCards(); // Re-renders cards using the updated 'tiers' object
        console.log(`Successfully deleted item from tier ${tierKey} at index ${itemIndex}`);
        return true;
      } else {
        console.error(`Item not found in tier ${tierKey} at index ${itemIndex} for deletion.`);
        return false;
      }
    } catch (error) {
      console.error(`Error deleting item from tier ${tierKey} at index ${itemIndex}:`, error);
      return false;
    }
  };

  // 初始化背景设置功能
  function initBackgroundSettings() {
    // 获取DOM元素
    const customBgToggle = document.getElementById('custom-bg-toggle');
    const bgUploadContainer = document.querySelector('.bg-upload-container');
    const bgFileInput = document.getElementById('bg-file-input');
    const bgPreview = document.querySelector('.bg-preview');
    const glassmorphismToggle = document.getElementById('glassmorphism-toggle');
    const blurStrengthSlider = document.getElementById('blur-strength');
    const blurValueDisplay = document.querySelector('.blur-value');
    const glassmorphismLayer = document.getElementById('glassmorphism-layer');

    // 确保毛玻璃层存在
    if (!glassmorphismLayer) {
      console.error('毛玻璃效果层元素未找到');
      const glassLayer = document.createElement('div');
      glassLayer.id = 'glassmorphism-layer';
      glassLayer.className = 'glassmorphism-layer';
      document.body.insertBefore(glassLayer, document.body.firstChild);
    }

    // 保存背景设置到本地存储
    const saveBackgroundSettings = () => {
      try {
        // 获取当前背景图片URL
        let bgImage = '';

        // 如果有自定义背景图片，从DOM中获取
        const computedStyle = getComputedStyle(document.documentElement);
        const customBgImage = computedStyle.getPropertyValue('--custom-bg-image').trim();

        if (customBgImage) {
          bgImage = customBgImage.replace(/url\(['"]?(.*?)['"]?\)/i, '$1');
        }

        // 如果背景图片为空但开关已打开，检查预览区域是否有图片
        if (!bgImage && customBgToggle.checked) {
          const previewImg = bgPreview.querySelector('img');
          if (previewImg && previewImg.src) {
            bgImage = previewImg.src;
          }
        }

        const settings = {
          customBgEnabled: customBgToggle.checked,
          glassmorphismEnabled: glassmorphismToggle.checked,
          blurStrength: parseInt(blurStrengthSlider.value) || 10,
          backgroundImage: bgImage,
        };

        localStorage.setItem('anime-tier-list-bg-settings', JSON.stringify(settings));
        console.log('背景设置已保存:', settings);
      } catch (error) {
        console.error('保存背景设置时出错:', error);
      }
    };

    // 从本地存储加载背景设置
    const loadBackgroundSettings = () => {
      try {
        const settingsStr = localStorage.getItem('anime-tier-list-bg-settings');
        console.log('加载的设置字符串:', settingsStr);

        if (!settingsStr) {
          // 设置默认值
          customBgToggle.checked = false;
          bgUploadContainer.style.display = 'none';
          glassmorphismToggle.checked = true;
          blurStrengthSlider.value = 10;
          blurValueDisplay.textContent = '10px';
          document.documentElement.style.setProperty('--blur-strength', '10px');

          // 确保毛玻璃层可见
          const glassLayer = document.getElementById('glassmorphism-layer');
          if (glassLayer) {
            glassLayer.style.display = 'block';
          }
          return;
        }

        const settings = JSON.parse(settingsStr);
        console.log('解析的设置:', settings);

        // 设置毛玻璃效果开关状态 - 先处理这个，因为它不依赖于背景图片
        if (settings.glassmorphismEnabled !== undefined) {
          glassmorphismToggle.checked = settings.glassmorphismEnabled;
          const glassLayer = document.getElementById('glassmorphism-layer');
          if (glassLayer) {
            glassLayer.style.display = settings.glassmorphismEnabled ? 'block' : 'none';
          }
        }

        // 设置模糊强度
        if (settings.blurStrength !== undefined) {
          const blurValue = settings.blurStrength || 10;
          blurStrengthSlider.value = blurValue;
          blurValueDisplay.textContent = `${blurValue}px`;
          document.documentElement.style.setProperty('--blur-strength', `${blurValue}px`);
        }

        // 加载背景图片 - 这个需要在设置自定义背景开关状态之前处理
        if (settings.backgroundImage) {
          // 先设置背景图片
          document.documentElement.style.setProperty('--custom-bg-image', `url(${settings.backgroundImage})`);

          // 更新预览
          const previewImg = document.createElement('img');
          previewImg.src = settings.backgroundImage;
          bgPreview.innerHTML = '';
          bgPreview.appendChild(previewImg);

          // 确保自定义背景类被添加
          document.body.classList.add('custom-background');

          // 如果开关状态是开启的，确保UI反映这一点
          if (settings.customBgEnabled) {
            customBgToggle.checked = true;
            bgUploadContainer.style.display = 'flex';
          }
        } else {
          // 如果没有背景图片，移除自定义背景类
          document.body.classList.remove('custom-background');
        }

        // 设置自定义背景开关状态 - 这需要在背景图片处理之后
        if (settings.customBgEnabled !== undefined) {
          customBgToggle.checked = settings.customBgEnabled;
          bgUploadContainer.style.display = settings.customBgEnabled ? 'flex' : 'none';

          // 如果开关是开启的但没有背景图片，这可能是一个错误状态
          // 在这种情况下，我们保持UI开启但不应用背景
          if (settings.customBgEnabled && !settings.backgroundImage) {
            console.warn('检测到不一致状态: 自定义背景开关开启但没有背景图片');
          } else if (settings.customBgEnabled) {
            // 确保自定义背景类被添加
            document.body.classList.add('custom-background');
          } else {
            // 如果开关是关闭的，移除自定义背景类
            document.body.classList.remove('custom-background');
          }
        }
      } catch (error) {
        console.error('加载背景设置时出错:', error);
        // 设置默认值
        customBgToggle.checked = false;
        bgUploadContainer.style.display = 'none';

        // 确保毛玻璃层可见
        const glassLayer = document.getElementById('glassmorphism-layer');
        if (glassLayer) {
          glassLayer.style.display = 'block';
        }

        // 设置默认模糊强度
        glassmorphismToggle.checked = true;
        blurStrengthSlider.value = 10;
        blurValueDisplay.textContent = '10px';
        document.documentElement.style.setProperty('--blur-strength', '10px');
      }
    };

    // 自定义背景开关事件 - 使用click事件而不是change
    if (customBgToggle) {
      customBgToggle.addEventListener('click', function () {
        console.log('自定义背景开关点击, 状态:', this.checked);
        bgUploadContainer.style.display = this.checked ? 'flex' : 'none';

        if (this.checked) {
          document.body.classList.add('custom-background');
        } else {
          document.body.classList.remove('custom-background');
        }

        saveBackgroundSettings();
      });
    }

    // 毛玻璃效果开关事件
    if (glassmorphismToggle) {
      glassmorphismToggle.addEventListener('click', function () {
        console.log('毛玻璃效果开关点击, 状态:', this.checked);
        const glassLayer = document.getElementById('glassmorphism-layer');
        if (glassLayer) {
          glassLayer.style.display = this.checked ? 'block' : 'none';
        }
        saveBackgroundSettings();
      });
    }

    // 模糊强度滑动条事件
    if (blurStrengthSlider) {
      blurStrengthSlider.addEventListener('input', function () {
        const value = this.value;
        blurValueDisplay.textContent = `${value}px`;
        document.documentElement.style.setProperty('--blur-strength', `${value}px`);
        saveBackgroundSettings();
      });
    }

    // 背景图片上传事件
    if (bgFileInput) {
      bgFileInput.addEventListener('change', function (e) {
        if (this.files && this.files[0]) {
          const file = this.files[0];
          const reader = new FileReader();

          reader.onload = function (e) {
            const imageDataUrl = e.target.result;

            // 设置背景图片
            document.documentElement.style.setProperty('--custom-bg-image', `url(${imageDataUrl})`);
            document.body.classList.add('custom-background');
            customBgToggle.checked = true;

            // 更新预览
            const previewImg = document.createElement('img');
            previewImg.src = imageDataUrl;
            bgPreview.innerHTML = '';
            bgPreview.appendChild(previewImg);

            // 保存设置
            saveBackgroundSettings();
          };

          reader.readAsDataURL(file);
        }
      });
    }

    // 加载保存的背景设置
    loadBackgroundSettings();

    console.log('背景设置功能已初始化');
  }
});
