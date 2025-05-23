// 评论功能实现
document.addEventListener('DOMContentLoaded', function () {
  // 获取DOM元素
  const contextMenu = document.getElementById('context-menu');
  const addCommentOption = document.getElementById('add-comment-option');
  const commentDialog = document.getElementById('comment-dialog');
  const commentAnimeTitle = document.getElementById('comment-anime-title');
  const commentAnimeCover = document.getElementById('comment-anime-cover');
  const commentText = document.getElementById('comment-text');
  const saveCommentBtn = document.getElementById('save-comment-btn');
  const cancelCommentBtn = document.getElementById('cancel-comment-btn');
  const commentStyleOptions = document.querySelectorAll('.comment-style-option');
  const commentsContainer = document.querySelector('.comments-container');
  const addCommentButton = document.querySelector('.add-comment-button');

  // 当前选中的卡片和样式
  let currentCard = null;
  let selectedStyle = 'random'; // 默认使用随机样式

  // 评论数据存储
  let comments = [];

  // 从本地存储加载评论
  function loadComments() {
    try {
      const savedComments = localStorage.getItem('anime-tier-list-comments');
      if (savedComments) {
        console.log('从本地存储加载评论数据');
        comments = JSON.parse(savedComments);
        console.log('加载到的评论数量:', comments.length);
      } else {
        console.log('本地存储中没有评论数据，使用空数组');
        comments = [];
      }
    } catch (error) {
      console.error('加载评论数据出错:', error);
      // 出错时重置为空数组
      comments = [];
      // 清除可能损坏的数据
      localStorage.removeItem('anime-tier-list-comments');
    }

    // 始终调用 renderComments，即使没有从 localStorage 加载到评论
    renderComments();
  }

  // 保存评论到本地存储
  function saveComments() {
    try {
      localStorage.setItem('anime-tier-list-comments', JSON.stringify(comments));
      console.log('评论已保存到本地存储，总数:', comments.length);
    } catch (error) {
      console.error('保存评论失败:', error);
      alert('保存评论失败，请确保浏览器支持本地存储功能。');
    }
  }

  // 渲染评论列表
  function renderComments() {
    console.log('开始渲染评论，总数:', comments.length);

    if (!commentsContainer) {
      console.error('评论容器未找到，跳过渲染');
      return;
    }

    // 清空现有评论
    commentsContainer.innerHTML = '';

    if (comments.length === 0) {
      console.log('没有评论数据，显示空状态');
      commentsContainer.innerHTML = '<div class="no-comments"><p>还没有评论，右键点击动画卡片来添加评论吧！</p></div>';
      return;
    }

    // 渲染每个评论
    comments.forEach((comment, index) => {
      const commentCard = createCommentCard(comment, index);
      commentsContainer.appendChild(commentCard);
    });

    console.log('评论渲染完成');

    // 在评论渲染完成后初始化或重新初始化Masonry布局
    if (typeof initCommentMasonry === 'function') {
      initCommentMasonry();
    } else {
      console.error('initCommentMasonry function is not defined when trying to call it after rendering comments.');
    }
  }

  // 暴露渲染函数到全局作用域，以便其他脚本调用
  window.renderComments = renderComments;

  // 创建评论卡片
  function createCommentCard(comment, index) {
    const card = document.createElement('div');
    card.className = `comment-card card-type-${comment.style}`;
    card.setAttribute('data-comment-id', index);

    // 确保评论文本不为空
    const commentText = comment.text.trim() || '暂无评论内容';

    // 根据不同样式创建不同的HTML结构
    switch (comment.style) {
      case '1': // 右侧占满图片样式
        card.innerHTML = `
          <div class="comment-glass-content">
            <div class="comment-split-layout-right">
              <div class="comment-text-side">
                <h4 class="comment-anime-title">${comment.title}</h4>
                <div class="comment-text-container">
                  <p class="comment-text">${commentText}</p>
                </div>
              </div>
              <div class="comment-anime-cover-right">
                <img src="${comment.cover}" alt="${comment.title}" />
              </div>
            </div>
          </div>
          <div class="comment-actions">
            <button class="edit-comment-btn" title="编辑评论"><i class="fas fa-edit"></i></button>
            <button class="delete-comment-btn" title="删除评论"><i class="fas fa-trash-alt"></i></button>
          </div>
        `;
        break;
      case '2': // 大封面在上，标题和评论在下
        card.innerHTML = `
          <div class="comment-glass-content">
            <div class="comment-anime-cover-large">
              <img src="${comment.cover}" alt="${comment.title}" />
            </div>
            <h4 class="comment-anime-title centered">${comment.title}</h4>
            <div class="comment-text-container">
              <p class="comment-text">${commentText}</p>
            </div>
          </div>
          <div class="comment-actions">
            <button class="edit-comment-btn" title="编辑评论"><i class="fas fa-edit"></i></button>
            <button class="delete-comment-btn" title="删除评论"><i class="fas fa-trash-alt"></i></button>
          </div>
        `;
        break;
      case '3': // 封面作为背景，标题和评论在上面
        card.innerHTML = `
          <div class="comment-background-image">
            <img src="${comment.cover}" alt="${comment.title}" />
          </div>
          <div class="comment-overlay-content">
            <h4 class="comment-anime-title">${comment.title}</h4>
            <div class="comment-text-container transparent">
              <p class="comment-text">${commentText}</p>
            </div>
          </div>
          <div class="comment-actions">
            <button class="edit-comment-btn" title="编辑评论"><i class="fas fa-edit"></i></button>
            <button class="delete-comment-btn" title="删除评论"><i class="fas fa-trash-alt"></i></button>
          </div>
        `;
        break;
      case '4': // 圆角矩形封面
        card.innerHTML = `
          <div class="comment-glass-content">
            <div class="comment-header">
              <div class="comment-anime-cover-rounded">
                <img src="${comment.cover}" alt="${comment.title}" />
              </div>
              <div class="comment-header-content">
                <h4 class="comment-anime-title">${comment.title}</h4>
                <div class="comment-text-container">
                  <p class="comment-text">${commentText}</p>
                </div>
              </div>
            </div>
          </div>
          <div class="comment-actions">
            <button class="edit-comment-btn" title="编辑评论"><i class="fas fa-edit"></i></button>
            <button class="delete-comment-btn" title="删除评论"><i class="fas fa-trash-alt"></i></button>
          </div>
        `;
        break;
    }

    // 添加评论卡片的事件监听器
    setTimeout(() => {
      const editBtn = card.querySelector('.edit-comment-btn');
      const deleteBtn = card.querySelector('.delete-comment-btn');

      if (editBtn) {
        editBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          openEditCommentDialog(index);
        });
      }

      if (deleteBtn) {
        deleteBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (confirm('确定要删除这条评论吗？')) {
            console.log(`删除第 ${index + 1} 条评论:`, comments[index].title);
            console.log('删除前评论数组:', [...comments]); // 创建副本记录

            // 删除指定索引的评论
            comments.splice(index, 1);
            console.log('删除后评论数组:', comments);

            // 保存到本地存储并重新渲染
            saveComments();
            renderComments();
          }
        });
      }
    }, 0);

    return card;
  }

  // 打开编辑评论对话框
  function openEditCommentDialog(index) {
    const comment = comments[index];

    commentAnimeTitle.textContent = comment.title;
    commentAnimeCover.src = comment.cover;
    commentText.value = comment.text;

    // 设置选中的样式
    commentStyleOptions.forEach(option => {
      if (option.getAttribute('data-style') === comment.style) {
        option.classList.add('active');
      } else {
        option.classList.remove('active');
      }
    });

    selectedStyle = comment.style;

    // 显示对话框
    commentDialog.classList.add('active');

    // 更新保存按钮的点击事件 - 移除之前的事件监听器，防止重复绑定
    saveCommentBtn.onclick = null; // 先清除之前可能存在的事件处理函数

    // 使用一次性事件处理函数，确保只执行一次
    const saveEditHandler = function () {
      // 移除事件监听器，防止多次触发
      saveCommentBtn.removeEventListener('click', saveEditHandler);

      // 更新评论
      comments[index].text = commentText.value;
      comments[index].style = selectedStyle;

      // 保存并重新渲染
      saveComments();
      renderComments();

      // 关闭对话框
      commentDialog.classList.remove('active');
    };

    // 使用addEventListener而不是onclick，更容易管理
    saveCommentBtn.addEventListener('click', saveEditHandler);
  }

  // 显示右键菜单
  function showContextMenu(e, card) {
    e.preventDefault();

    // 保存当前卡片
    currentCard = card;

    // 获取动画ID和索引
    const animeId = card.getAttribute('data-id');
    const tier = card.closest('.tier-row').id.replace('tier-', '');
    const index = parseInt(card.getAttribute('data-index'));
    const hasId = animeId && !isNaN(animeId);

    // 设置菜单位置
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;

    // 获取菜单项
    const editOption = document.getElementById('edit-option');
    const detailOption = document.getElementById('detail-option');
    const deleteOption = document.getElementById('delete-option');

    // 设置详情选项的状态
    if (!hasId) {
      detailOption.classList.add('disabled');
    } else {
      detailOption.classList.remove('disabled');
    }

    // 添加菜单项点击事件
    editOption.onclick = function () {
      hideContextMenu();
      if (typeof window.openSearchPanel === 'function') {
        window.openSearchPanel(tier, index, card, true);
      } else {
        console.error('openSearchPanel函数未找到');
        alert('编辑功能暂时不可用，请刷新页面重试');
      }
    };

    detailOption.onclick = function () {
      if (hasId) {
        hideContextMenu();
        if (typeof window.fetchAnimeDetail === 'function') {
          window.fetchAnimeDetail(animeId);
        } else {
          console.error('fetchAnimeDetail函数未找到');
          alert('查看详情功能暂时不可用，请刷新页面重试');
        }
      }
    };

    deleteOption.onclick = function () {
      hideContextMenu();
      if (confirm(`确定要删除这个动画吗？`)) {
        if (typeof window.deleteAnimeFromTier === 'function') {
          window.deleteAnimeFromTier(tier, index);
        } else {
          console.error('deleteAnimeFromTier 函数未找到，将尝试旧的删除方法并刷新页面。');
          // Fallback to old method if the new function is not available
          const tiersData = JSON.parse(localStorage.getItem('anime-tier-list-data') || '{}');
          if (tiersData[tier] && tiersData[tier][index]) {
            tiersData[tier].splice(index, 1);
            localStorage.setItem('anime-tier-list-data', JSON.stringify(tiersData));
            location.reload(); // Refresh the page as a fallback
          }
        }
      }
    };

    // 显示菜单
    contextMenu.style.display = 'block';

    // 点击其他地方关闭菜单
    document.addEventListener('click', hideContextMenu);
  }

  // 隐藏右键菜单
  function hideContextMenu() {
    contextMenu.style.display = 'none';
    document.removeEventListener('click', hideContextMenu);
  }

  // 打开添加评论对话框
  function openAddCommentDialog() {
    // 获取卡片数据
    const animeTitle = currentCard.getAttribute('data-title') || '未知动画';
    const animeId = currentCard.getAttribute('data-id');
    let animeCover = '';

    // 获取封面图片
    if (currentCard.style.backgroundImage) {
      // 从背景图片中提取URL
      const bgImg = currentCard.style.backgroundImage;
      animeCover = bgImg.replace(/url\(['"]?(.*?)['"]?\)/i, '$1');
    } else {
      // 尝试从卡片的data属性获取
      animeCover = currentCard.getAttribute('data-cover');
    }

    // 如果没有找到封面，使用默认图片
    if (!animeCover) {
      animeCover = 'https://via.placeholder.com/150x225/333/fff?text=No+Image';
    }

    // 设置对话框内容
    commentAnimeTitle.textContent = animeTitle;
    commentAnimeCover.src = animeCover;
    commentText.value = '';

    // 重置样式选择，默认选中随机样式
    commentStyleOptions.forEach(option => {
      if (option.getAttribute('data-style') === 'random') {
        option.classList.add('active');
      } else {
        option.classList.remove('active');
      }
    });

    selectedStyle = 'random'; // 默认选择随机

    // 显示对话框
    commentDialog.classList.add('active');

    // 更新保存按钮的点击事件 - 移除之前的事件监听器，防止重复绑定
    saveCommentBtn.onclick = null; // 先清除之前可能存在的事件处理函数

    // 使用一次性事件处理函数，确保只执行一次
    const saveCommentHandler = function () {
      // 移除事件监听器，防止多次触发
      saveCommentBtn.removeEventListener('click', saveCommentHandler);

      let finalStyle = selectedStyle;
      if (selectedStyle === 'random') {
        // 如果是随机样式，则实际随机选择一个样式（1-4）
        finalStyle = Math.floor(Math.random() * 4 + 1).toString();
        console.log('保存时，随机选择的最终样式:', finalStyle);
      }

      // 创建新评论
      const newComment = {
        id: animeId,
        title: animeTitle,
        cover: animeCover,
        text: commentText.value,
        style: finalStyle, // 使用最终确定的样式
        date: new Date().toISOString(),
      };

      // 添加到评论数组
      console.log('添加新评论:', newComment);
      comments.push(newComment);
      console.log('当前评论总数:', comments.length);

      // 保存并重新渲染
      saveComments();
      renderComments();

      // 关闭对话框
      commentDialog.classList.remove('active');
    };

    // 使用addEventListener而不是onclick，更容易管理
    saveCommentBtn.addEventListener('click', saveCommentHandler);
  }

  // 初始化事件监听器
  function initEventListeners() {
    const commentDialog = document.getElementById('comment-dialog');
    const contextMenu = document.getElementById('context-menu');
    const addCommentOption = document.getElementById('add-comment-option');
    const cancelCommentBtn = document.getElementById('cancel-comment-btn');
    const addCommentButton = document.querySelector('.add-comment-button');

    if (!commentDialog) {
      console.error('#comment-dialog element not found. Cannot initialize comment event listeners.');
      return;
    }
    if (!contextMenu) {
      console.error('#context-menu element not found. Cannot initialize context menu event listeners.');
      // Depending on the importance, you might choose to return or continue.
      // For now, we'll let it try to attach other listeners if possible.
    }
    if (!addCommentOption) {
      console.error('#add-comment-option element not found.');
    }
    if (!cancelCommentBtn) {
      console.error('#cancel-comment-btn element not found.');
    }
    if (!addCommentButton) {
      console.error('.add-comment-button element not found. Cannot initialize its event listener.');
      // return; // 可以选择返回，或者让其他监听器继续初始化
    } else {
      // 添加评论按钮点击事件
      addCommentButton.addEventListener('click', function () {
        // 创建一个提示框，而不是使用alert
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.innerHTML = `
          <div class="notification-content">
            <i class="fas fa-info-circle"></i>
            <span>请右键点击动画卡片添加评论</span>
          </div>
        `;
        document.body.appendChild(notification);

        // 添加样式
        notification.style.position = 'fixed';
        notification.style.bottom = '100px';
        notification.style.right = '30px';
        notification.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        notification.style.color = 'white';
        notification.style.padding = '12px 20px';
        notification.style.borderRadius = '8px';
        notification.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.3)';
        notification.style.zIndex = '9999';
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(20px)';
        notification.style.transition = 'all 0.3s ease';

        // 通知内容样式
        const notificationContent = notification.querySelector('.notification-content');
        notificationContent.style.display = 'flex';
        notificationContent.style.alignItems = 'center';
        notificationContent.style.gap = '10px';

        // 图标样式
        const icon = notification.querySelector('i');
        icon.style.color = 'rgba(100, 100, 255, 0.9)';
        icon.style.fontSize = '18px';

        // 显示通知
        setTimeout(() => {
          notification.style.opacity = '1';
          notification.style.transform = 'translateY(0)';
        }, 10);

        // 3秒后自动关闭
        setTimeout(() => {
          notification.style.opacity = '0';
          notification.style.transform = 'translateY(20px)';

          // 动画完成后移除元素
          setTimeout(() => {
            document.body.removeChild(notification);
          }, 300);
        }, 3000);
      });
    }

    // 为所有卡片添加右键菜单 - 使用事件委托
    document.addEventListener('contextmenu', function (e) {
      // 检查点击的元素是否是卡片或其子元素
      const card = e.target.closest('.card');
      if (card) {
        showContextMenu(e, card);
      }
    });

    // 添加评论选项点击事件
    addCommentOption.addEventListener('click', function () {
      hideContextMenu();
      openAddCommentDialog();
    });

    // 取消按钮点击事件 - 增强版，确保清理事件监听器
    // 移除可能存在的旧事件监听器
    const oldCancelHandler = cancelCommentBtn._cancelHandler;
    if (oldCancelHandler) {
      cancelCommentBtn.removeEventListener('click', oldCancelHandler);
    }

    // 添加新的事件监听器
    const cancelHandler = function () {
      // 关闭对话框
      commentDialog.classList.remove('active');

      // 清除保存按钮的事件监听器，防止事件堆积
      if (saveCommentBtn) {
        saveCommentBtn.onclick = null;
        const newComment = saveCommentBtn.cloneNode(true);
        if (saveCommentBtn.parentNode) {
          saveCommentBtn.parentNode.replaceChild(newComment, saveCommentBtn);
        }
      }
    };

    // 保存引用以便将来移除
    cancelCommentBtn._cancelHandler = cancelHandler;
    cancelCommentBtn.addEventListener('click', cancelHandler);

    // 关闭按钮点击事件 - 增强版，确保清理事件监听器
    const commentDialogCloseButton = commentDialog.querySelector('.export-dialog-close');
    if (commentDialogCloseButton) {
      // 移除可能存在的旧事件监听器
      const oldCloseHandler = commentDialogCloseButton._closeHandler;
      if (oldCloseHandler) {
        commentDialogCloseButton.removeEventListener('click', oldCloseHandler);
      }

      // 添加新的事件监听器
      const closeHandler = function () {
        // 关闭对话框
        commentDialog.classList.remove('active');

        // 清除保存按钮的事件监听器，防止事件堆积
        if (saveCommentBtn) {
          saveCommentBtn.onclick = null;
          const newComment = saveCommentBtn.cloneNode(true);
          if (saveCommentBtn.parentNode) {
            saveCommentBtn.parentNode.replaceChild(newComment, saveCommentBtn);
          }
        }
      };

      // 保存引用以便将来移除
      commentDialogCloseButton._closeHandler = closeHandler;
      commentDialogCloseButton.addEventListener('click', closeHandler);
    } else {
      console.error('Comment dialog close button (.export-dialog-close) not found inside #comment-dialog');
    }

    // 样式选项点击事件
    commentStyleOptions.forEach(option => {
      option.addEventListener('click', function () {
        // 移除所有选项的活跃状态
        commentStyleOptions.forEach(opt => opt.classList.remove('active'));

        // 添加当前选项的活跃状态
        this.classList.add('active');

        // 获取选中的样式
        selectedStyle = this.getAttribute('data-style'); // 直接保存 'random' 或具体数字
        // 实际的随机选择推迟到保存评论时进行
        console.log('用户选择的样式:', selectedStyle);
      });
    });
  }

  // 初始化评论区 Masonry 布局
  function initCommentMasonry() {
    const commentsContainer = document.querySelector('.comments-container');
    if (commentsContainer && typeof Masonry !== 'undefined' && typeof imagesLoaded !== 'undefined') {
      console.log('初始化评论区 Masonry 布局...');

      // 计算合适的列宽和间距
      const containerWidth = commentsContainer.clientWidth;
      console.log('评论容器宽度:', containerWidth);

      // 目标：每行4个卡片，卡片宽度320px
      const cardWidth = 320;
      const minGutter = 10; // 最小间距，调整这里以减小垂直和水平间距

      // 计算实际可容纳的列数
      let columnCount = Math.floor((containerWidth + minGutter) / (cardWidth + minGutter));
      columnCount = Math.max(1, Math.min(4, columnCount)); // 限制列数在1-4之间

      // 计算实际间距（均匀分布剩余空间）
      const totalCardWidth = columnCount * cardWidth;
      const totalGutterSpace = containerWidth - totalCardWidth;
      const gutterSize = columnCount > 1 ? Math.max(minGutter, totalGutterSpace / (columnCount - 1)) : 0;

      console.log('计算得到的列数:', columnCount, '列宽:', cardWidth, '间距:', gutterSize);

      // 初始化 Masonry 实例，但不立即布局
      const masonryInstance = new Masonry(commentsContainer, {
        itemSelector: '.comment-card',
        columnWidth: cardWidth,
        gutter: 20, // 设置gutter值
        percentPosition: false, // 使用固定像素值而非百分比
        fitWidth: true, // 让Masonry容器居中
        horizontalOrder: true, // 保持水平顺序，避免大间隙
        initLayout: false, // 禁用初始布局，等待图片加载
      });

      // 使用 imagesLoaded 确保所有图片加载完毕后再进行布局
      imagesLoaded(commentsContainer, function () {
        console.log('评论区图片加载完成，执行 Masonry layout。');
        masonryInstance.layout(); // 手动触发布局

        // 确保在窗口大小变化时，gutter也能被正确应用
        // 移除旧的事件监听器
        window.removeEventListener('resize', window._masonryResizeHandler);
        // 创建新的事件处理函数并保存引用
        window._masonryResizeHandler = function () {
          console.log('窗口大小变化，重新初始化Masonry布局（应用固定gutter）');
          // 重新获取容器宽度并重新计算列数，但保持gutter固定
          const currentContainerWidth = commentsContainer.clientWidth;
          const currentCardWidth = 320; // 保持卡片宽度一致
          const fixedGutter = 20; // 保持固定的gutter
          let currentColumnCount = Math.floor((currentContainerWidth + fixedGutter) / (currentCardWidth + fixedGutter));
          currentColumnCount = Math.max(1, Math.min(4, currentColumnCount));

          masonryInstance.options.columnWidth = currentCardWidth;
          masonryInstance.options.gutter = fixedGutter;
          masonryInstance.layout();
        };

        // 使用防抖函数包装resize事件处理程序，避免频繁触发
        let resizeTimeout;
        window.addEventListener('resize', function () {
          clearTimeout(resizeTimeout);
          resizeTimeout = setTimeout(window._masonryResizeHandler, 200);
        });

        // 有时，即使 imagesLoaded 完成，浏览器可能仍在进行微小的渲染调整。
        // 添加一个微小的延迟再次触发布局可能有助于解决边缘情况。
        setTimeout(function () {
          console.log('延迟后再次执行 Masonry layout。');
          masonryInstance.layout();
        }, 100);
      });

      return masonryInstance;
    } else if (typeof Masonry === 'undefined') {
      console.warn('Masonry库未加载，评论区瀑布流布局无法初始化。');
    } else if (typeof imagesLoaded === 'undefined') {
      console.warn('imagesLoaded库未加载，评论区瀑布流布局可能在图片加载完成前初始化。');
      // 作为备选方案，如果 imagesLoaded 未加载，仍然尝试初始化 Masonry
      if (commentsContainer && typeof Masonry !== 'undefined') {
        // 计算合适的列宽和间距
        const containerWidth = commentsContainer.clientWidth;
        console.log('评论容器宽度(备用方案):', containerWidth);

        // 目标：每行4个卡片，卡片宽度320px
        const cardWidth = 320;
        const minGutter = 10; // 最小间距(备用方案)

        // 计算实际可容纳的列数
        let columnCount = Math.floor((containerWidth + minGutter) / (cardWidth + minGutter));
        columnCount = Math.max(1, Math.min(4, columnCount)); // 限制列数在1-4之间

        // 计算实际间距（均匀分布剩余空间）
        const totalCardWidth = columnCount * cardWidth;
        const totalGutterSpace = containerWidth - totalCardWidth;
        const gutterSize = columnCount > 1 ? Math.max(minGutter, totalGutterSpace / (columnCount - 1)) : 0;

        console.log('计算得到的列数(备用方案):', columnCount, '列宽:', cardWidth, '间距:', gutterSize);

        const masonryInstance = new Masonry(commentsContainer, {
          itemSelector: '.comment-card',
          columnWidth: cardWidth,
          gutter: 20, // 设置gutter值 (备用方案)
          percentPosition: false,
          fitWidth: true,
          horizontalOrder: true,
          initLayout: true,
        });

        // 监听窗口大小变化，重新布局
        window.removeEventListener('resize', window._masonryResizeHandler); // 移除旧的事件监听器

        // 创建新的事件处理函数并保存引用
        window._masonryResizeHandler = function () {
          console.log('窗口大小变化，重新初始化Masonry布局(备用方案，应用固定gutter)');
          const currentContainerWidth = commentsContainer.clientWidth;
          const currentCardWidth = 320;
          const fixedGutter = 20;
          let currentColumnCount = Math.floor((currentContainerWidth + fixedGutter) / (currentCardWidth + fixedGutter));
          currentColumnCount = Math.max(1, Math.min(4, currentColumnCount));

          masonryInstance.options.columnWidth = currentCardWidth;
          masonryInstance.options.gutter = fixedGutter;
          masonryInstance.layout();
        };

        // 使用防抖函数包装resize事件处理程序，避免频繁触发
        let resizeTimeout;
        window.addEventListener('resize', function () {
          clearTimeout(resizeTimeout);
          resizeTimeout = setTimeout(window._masonryResizeHandler, 200);
        });

        return masonryInstance;
      }
    }
    return null;
  }

  // 加载评论并初始化事件监听器
  loadComments();
  initEventListeners();

  // 页面加载完成后初始化Masonry布局
  // Masonry 初始化移至 renderComments 函数末尾，确保在评论卡片渲染后执行
  // setTimeout(function () {
  //   initCommentMasonry();
  // }, 500);
});
