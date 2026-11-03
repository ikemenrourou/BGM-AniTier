# BGM AniTier v2.0 - 现代动画 Tier List 排行工具

基于 **React 19 + TypeScript + Vite + Tailwind CSS v4 + Express** 全面重构的个人动画分级与品味分析工具。

## 本地运行与数据备份

运行 `npm install`、`npm run dev`，然后打开 `http://localhost:3000`。首次启动会自动迁移旧浏览器存档，原始 localStorage 数据保留。

在 **设置 → 导出全量备份** 保存 JSON。新版备份包含小剧场台本、角色差分、配图、世界书、开场收尾和语速。导入前自动保留一个恢复点，可使用 **恢复到上次导入之前**。文件含 Token 和 API Key，请勿公开分享。

本地使用 IndexedDB 和 `.data/user-state.json` 保存；Cloudflare 线上版仅保存在浏览器。图片下载失败会保留外链并提示，外链仍需联网。完整检查结果与恢复说明见 [收尾检查](docs/final-audit-2026-11-02.md)。

提交前运行 `npm run lint`、`npx tsx --test src/lib/*.test.ts`、`npm run build`。

## Cloudflare 发布

线上项目为 `bgm-anitier2026`，地址为 `https://bgm-anitier2026.pages.dev/`。首次打开没有预置作品、短评、报告或台词；已有浏览器存档继续保留。

运行 `npm run build:cf` 生成 `dist-static/`。将这个目录复制到仓库外的独立发布文件夹，在该文件夹运行：

```powershell
wrangler pages deploy . --project-name bgm-anitier2026 --branch main
```

仅上传构建文件；不要从仓库根目录执行部署，以免 Wrangler 自动带上旧的 `functions/`。不要上传 `.data/`、`.env`、全量备份或 AI Studio 的个人媒体。CF 无需设置 BGM Token 或 AI Key，每个人在自己的页面里填写。AI 服务须支持浏览器跨域访问（CORS）。

应用的存档、榜单和 AI 请求仍在浏览器里处理。唯一的云端接口是随构建发布的 `cloudflare/pages/_worker.js`：`GET /api/public-comments/subjects/:id` 和 `/characters/:id` 只读取 Bangumi 公开吐槽，解决网页接口的跨域限制。它不转发 Token、Cookie 或用户输入，只短暂缓存公开评论，不保存用户存档。`_routes.json` 让其他页面仍由静态文件直接提供。

在报告或小剧场的 **Prompt 预览 → 刷新 Prompt** 重新拉取资料和吐槽。预览显示实际取得的条数，失败时保留已有作品。配角默认只包含姓名和 CV；已检查到评论超过 5 条的配角才补充介绍与评论。为限制请求量，每部作品最多检查 20 个角色，详细采样 10 个。季度新番会在向下滚动时继续翻页，网络失败时可重试。

本地与线上网址的浏览器存档独立；迁移时在本地导出全量备份，再到线上导入。备份含个人凭据，只供本人保存。线上没有服务器存档或跨设备同步，清理浏览器数据前先导出。

## ✨ 核心功能

- **多级评分系统**：支持 1–10 分标准档位，并可一键开启或单独定制 `0.5` 半分细分档位（`9.5`、`8.5` ... `1.5`）。
- **Bangumi API 集成**：支持按关键词实时搜索动画、按年份与季度（1月/4月/7月/10月）浏览新番，以及手动添加自定义番剧条目。
- **拖拽跨档排序**：直观的跨档位与同档位拖拽排序，自动去重并实时保存在本地存储中。
- **Tag 偏好分析**：自动汇总上榜动画的高频标签与平均给分，点击任意标签即可在看板中高亮对应动画。
- **多样式个人短评**：支持 4 种不同的短评卡片排版（右侧分栏封面、顶部大图卡片、沉浸背景覆盖、紧凑圆角小卡）。
- **AI 品味总结报告**：支持毒舌雌小鬼、元气猫娘、高性能亚托莉、派大星和大肥鱼（鲸鱼娘）等角色，使用自己的 API 服务生成深度锐评。
- **主题与数据管理**：默认使用深蓝雾光背景，可切换其他渐变或自定义图片，支持导出高清 PNG 与 JSON 全量备份。

## 🗂️ 项目目录结构

```text
├── server.ts                        # Express + Vite 全栈服务端（Bangumi 代理与 Gemini AI 接口）
├── src/
│   ├── types.ts                     # 核心 TypeScript 数据模型定义
│   ├── App.tsx                      # 顶层状态管理与页面容器
│   ├── lib/
│   │   ├── tierLogic.ts             # 纯逻辑函数（分级增删改、统计、标签聚合、AI Prompt 构建）
│   │   ├── tierLogic.test.ts        # 核心逻辑单元测试
│   │   ├── bangumiApi.ts            # Bangumi v0 API 客户端与内置精选番剧库
│   │   └── themes.ts                # 渐变主题配置
│   └── components/
│       ├── HeaderBar.tsx            # 顶部导航与工作区工具栏
│       ├── TierRow.tsx              # 单个分数档位行与动画卡片
│       ├── SearchModal.tsx          # 搜索 / 季度新番 / 自定义条目弹窗
│       ├── AnimeDetailModal.tsx     # 动画详情与评分调整弹窗
│       ├── TagAnalysisSection.tsx   # Tag 统计与筛选交互面板
│       ├── CommentsSection.tsx      # 4种样式的个人短评区与编辑弹窗
│       ├── TasteReportSection.tsx   # AI 角色品味总结报告（流式传输）
│       └── SettingsDrawer.tsx       # 设置、半分档开关、主题与 JSON 备份抽屉
```
