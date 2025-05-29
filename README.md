# BGM AniTier - 动画 Tier List 排行工具

一个简洁的网页工具，用于创建和管理您的个人动画 Tier List 排行榜。

## 如何使用

1.  下载本项目的所有文件。
2.  在您的网页浏览器中打开 `my-tier-list.html` 文件。
3.  开始整理您的动画排行！

### 在线使用

访问：[项目 GitHub Pages](https://dsgrou.dpdns.org/my-tier-list)

## 主要功能

-   从 Bangumi 搜索动画或按季度浏览。
-   通过拖拽对动画进行分级。
-   自定义 Tier 等级和外观。
-   添加个人评论。
-   将您的 Tier List 导出为图片或 JSON 数据。
-   **AI 总结报告（LLM 功能）**：利用 Google Gemini AI 分析您的动画偏好并生成个性化的“品味总结报告”。您可以选择不同的 AI 角色（如毒舌雌小鬼、可爱猫娘等）来获得不同风格的趣味点评。此功能需要您自行提供有效的 Gemini API Key。

## 效果截图

下面展示了工具的一些主要界面和功能：

![Tier List 主界面](截图/tierlist.png)
*Tier List 主界面，可以拖拽动画进行分级。*

![AI 动画总结报告](截图/LLM动画总结.png)
*AI 生成的个性化动画品味总结报告。*

![标签筛选功能](截图/tag.png)
*通过标签筛选和管理动画。*

![自定义主题](截图/主题.png)
*自定义工具的颜色主题。*

## 技术栈

-   HTML, CSS, JavaScript

## 主要依赖库

-   **SortableJS**: 用于实现拖拽排序功能。
-   **html2canvas**: 用于将 Tier List 导出为图片。
-   **Masonry**: 用于评论区的瀑布流布局。
-   **Font Awesome**: 提供图标。
-   **Marked**: 用于渲染 Markdown 格式的评论和说明。
-   **Highlight.js**: 用于代码高亮。
-   **@google/generative-ai**: 用于实现 AI 总结报告功能。

## 🙏 致谢

-   **动画数据来源**：[番组计划 (Bangumi)](https://bgm.tv/) - 感谢提供丰富的动画数据库
-   **搜索功能参考**：[anime-grid](https://github.com/itorr/anime-grid) - 动画生涯个人喜好表生成器
-   **图标资源**：[Font Awesome](https://fontawesome.com/) - 精美的图标库

## ⚖️ 使用声明

-   ✅ **个人使用**：完全免费，欢迎个人学习和使用
-   ❌ **商业用途**：禁止用于商业、盈利用途
-   📝 **开源协议**：本项目采用 MIT 协议开源
-   🔗 **数据来源**：动画信息来自番组计划，请遵守其使用条款
