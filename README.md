# 步骤图录制器插件 (Step Recorder)

一个类似于 ScribeHow/Tango 的浏览器步骤图录制插件，用于记录用户操作并生成详细的步骤指南。

## 功能特性

### 核心功能
- 📹 **录制控制**：开始/停止录制按钮，实时录制状态显示
- 🖱️ **点击记录**：自动捕获点击操作，智能识别交互元素
- 🔍 **元素信息**：获取元素选择器、文本内容、ARIA 标签等详细信息
- ✨ **高亮效果**：点击时显示橙色呼吸灯效果的高亮边框
- 📷 **自动截图**：每次点击自动截取当前页面并标注目标区域
- 📝 **步骤管理**：查看和管理已记录的步骤，支持删除单个步骤或清空全部
- 📤 **导出功能**：支持导出为 Markdown、HTML 和 JSON 格式，打包为 ZIP 下载

### 高级功能
- 🎯 **双模式录制**：
  - **自动模式**：点击后自动截图并保存，无需确认
  - **手动确认模式**：高亮显示后弹出确认对话框，可选择是否保存该步骤
- 🤖 **AI 增强**：支持接入 OpenAI 兼容 API，自动生成更专业的步骤说明和文档结构
- 🖼️ **图片预览**：点击步骤缩略图可在全屏预览查看高清截图
- 📊 **会话管理**：自动管理录制会话，支持跨页面刷新持续录制
- 🎨 **新拟态 UI**：现代化的新拟态（Neumorphism）设计风格，视觉体验优雅舒适

## 安装方法

### 方式一：开发者模式安装（推荐）
1. 克隆或下载本仓库到本地
   ```bash
   git clone <repository-url>
   cd Step_Proj_Solo
   ```
2. 打开 Chrome 浏览器，进入 `chrome://extensions/`
3. 开启右上角的「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择本仓库的根目录
6. 插件安装完成，会在浏览器工具栏显示图标

### 方式二：打包安装
1. 在 `chrome://extensions/` 页面点击「打包扩展程序」
2. 选择项目根目录
3. 生成 `.crx` 文件后拖入浏览器安装

## 使用方法

### 基础录制流程
1. 点击浏览器工具栏中的插件图标，打开侧边栏面板
2. 点击「开始录制」按钮（橙色按钮）
3. 在网页上进行点击操作，每次点击都会被记录并截图
4. 点击「停止录制」按钮（红色按钮）结束录制
5. 在步骤列表中查看已记录的步骤
6. 选择导出格式，点击相应按钮导出文档

### 录制模式切换
在侧边栏的「录制模式」区域选择：
- **自动模式**（默认）：适合快速录制，无需确认每个步骤
- **手动确认模式**：适合精确录制，每次点击后会弹出确认对话框

### AI 文档生成（可选配置）
1. 首次使用需要配置 AI API
2. 在浏览器控制台或插件配置中设置：
   ```javascript
   // 示例配置（实际配置方式请参考设置页面）
   {
     enabled: true,
     provider: 'openai-compatible',
     endpoint: 'https://api.openai.com/v1/chat/completions',
     model: 'gpt-4.1-mini',
     apiKey: 'your-api-key',
     language: 'zh-CN'
   }
   ```
3. 录制完成后点击「AI 生成」按钮，自动生成优化的文档

### 导出文档
- **Markdown**：适合技术文档、GitHub README 等
- **HTML**：适合直接浏览器查看或嵌入网站
- **JSON**：适合数据交换或二次处理

所有导出格式都会包含截图图片，自动打包为 ZIP 文件下载。

## 技术架构

### 技术栈
- **前端**：原生 HTML + CSS + JavaScript（ES5/ES6）
- **浏览器扩展**：Chrome Extension Manifest V3
- **存储方案**：Chrome Storage API
- **截图功能**：Chrome Tabs API + Canvas 标注
- **压缩工具**：JSZip
- **UI 风格**：新拟态（Neumorphism）设计

### 架构设计
```
┌─────────────────────────────────────────────────────┐
│                   Side Panel UI                      │
│  (sidepanel.html/js - 用户交互界面)                  │
└─────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────┐
│              Background Service Worker               │
│  (background.js - 核心业务逻辑和状态管理)             │
│  ├── Session Store (会话存储)                        │
│  ├── Asset Store (资源管理)                          │
│  ├── Recorder Service (录制服务)                     │
│  ├── Document Builder (文档构建)                     │
│  └── AI Service (AI 改写服务)                         │
└─────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────┐
│                 Content Scripts                      │
│  (content/*.js - 页面注入和事件捕获)                 │
│  ├── Runtime State (运行时状态)                      │
│  ├── Target Fingerprint (目标元素指纹)               │
│  ├── Page Context (页面上下文)                       │
│  ├── Screenshot Capture (截图捕获)                   │
│  ├── Manual Confirm (手动确认)                       │
│  └── Action Capture (动作捕获)                       │
└─────────────────────────────────────────────────────┘
```

### 消息通信
```
Side Panel ←→ Background ←→ Content Scripts
    │              │               │
    │              │               └── 页面事件监听
    │              └── 状态管理和存储
    └── UI 渲染和用户交互
```

## 目录结构

```
Step_Proj_Solo/
├── background/              # 后台服务模块
│   ├── ai-service.js        # AI 文档改写服务
│   ├── asset-store.js       # 资源（截图）存储管理
│   ├── document-builder.js  # 文档构建和渲染
│   ├── message-router.js    # 消息路由
│   ├── migration.js         # 数据迁移
│   ├── recorder-service.js  # 录制核心服务
│   └── session-store.js     # 会话存储管理
├── content/                 # 内容脚本模块
│   ├── action-capture.js    # 动作捕获逻辑
│   ├── manual-confirm.js    # 手动确认对话框
│   ├── page-context.js      # 页面上下文提取
│   ├── runtime-state.js     # 运行时状态管理
│   ├── screenshot-capture.js# 截图和标注
│   └── target-fingerprint.js# 目标元素指纹识别
├── sidepanel/               # 侧边栏界面模块
│   ├── export-controller.js # 导出控制器
│   ├── panel-client.js      # 面板客户端
│   ├── state-store.js       # 状态存储
│   └── step-list-view.js    # 步骤列表视图
├── shared/                  # 共享模块
│   ├── constants.js         # 常量定义
│   ├── message-types.js     # 消息类型定义
│   └── schemas.js           # 数据 Schema 定义
├── icons/                   # 图标资源
│   ├── steps.png            # 16x16 图标
│   ├── steps48.png          # 48x48 图标
│   ├── steps128.png         # 128x128 图标
│   └── delete.svg           # 删除图标
├── lib/                     # 第三方库
│   ├── html2canvas.min.js   # 截图库（历史遗留，当前未使用）
│   └── jszip.min.js         # ZIP 压缩库
├── background.js            # 后台入口
├── content.js               # 内容脚本入口
├── sidepanel.html           # 侧边栏界面
├── sidepanel.js             # 侧边栏逻辑
├── styles.css               # 全局样式
├── manifest.json            # 扩展配置
├── .gitignore               # Git 忽略文件
└── README.md                # 本文件
```

## 权限说明

插件需要以下权限：
- `activeTab`：获取当前活动标签页信息
- `storage`：存储录制数据和设置
- `scripting`：向页面注入内容脚本
- `sidePanel`：显示侧边栏界面
- `tabs`：管理标签页
- `downloads`：下载导出的文档
- `webNavigation`：监听页面导航事件
- `host_permissions: <all_urls>`：在所有网页上运行内容脚本

## 核心功能实现细节

### 1. 智能元素识别
- 自动识别按钮、链接等交互元素
- 支持 Card 类容器的智能判断
- 通过 CSS 类名、ID、Role 等多维度匹配
- 支持 `onclick`、`data-action` 等属性检测

### 2. 截图标注技术
- 使用 Chrome 原生截图 API（性能更优）
- Canvas 绘制圆角矩形高亮框
- 橙色主题 + 呼吸灯动画效果
- 支持 DPR 适配和高清截图

### 3. 元素定位策略
- 主选择器 + 备用选择器双重保障
- 记录元素在 iframe 中的路径
- 支持文本、ARIA 标签、Placeholder 等多种定位方式

### 4. 手动确认模式
- 全屏遮罩 + 毛玻璃效果
- 新拟态风格确认对话框
- 支持 ESC 键快速取消
- 确认后自动重放点击事件

### 5. AI 文档优化
- 支持 OpenAI 兼容 API
- 自动改写步骤标题和说明
- 生成文档摘要和章节结构
- 多语言支持（默认中文）

## 常见问题

### Q: 录制时页面性能会下降吗？
A: 会有轻微影响，主要来自高亮动画和截图操作。建议在录制完成后及时停止。

### Q: 为什么有些点击没有被记录？
A: 以下情况可能不会记录：
- 点击的是插件自身的 UI 元素
- 点击的是非交互元素（如纯文本）
- 在手动确认模式下选择了"取消"

### Q: 截图质量如何保证？
A: 插件使用 Chrome 原生截图 API，支持高清截图。截图质量取决于页面渲染质量和 DPR 设置。

### Q: AI 功能必须配置吗？
A: 不是必须的。AI 功能是可选的，未配置时会使用默认规则生成文档。

### Q: 支持 Firefox 或 Edge 吗？
A: 目前仅针对 Chrome 开发，但理论上基于 Chromium 的浏览器（如 Edge）可以直接使用。Firefox 需要适配部分 API。

### Q: 录制的数据存储在哪里？
A: 数据存储在 Chrome Storage 中，清除扩展程序数据或卸载扩展程序会删除所有录制数据。

### Q: 如何备份录制的步骤？
A: 使用导出功能将步骤导出为 JSON 格式，可以保留完整数据（包含截图）。

## 开发指南

### 本地开发
```bash
# 1. 克隆仓库
git clone <repository-url>
cd Step_Proj_Solo

# 2. 在 Chrome 中加载扩展
# 访问 chrome://extensions/ -> 开发者模式 -> 加载已解压的扩展程序

# 3. 修改代码后刷新扩展
# 在扩展管理页面点击刷新按钮
```

### 调试技巧
- **Background 调试**：在 `chrome://extensions/` 点击 "Service Worker" 链接
- **Content Scripts 调试**：打开目标页面的开发者工具
- **Side Panel 调试**：右键点击侧边栏 -> 检查

### 代码规范
- 使用 ES5/ES6 兼容语法（确保在 Service Worker 中运行）
- 遵循 JSHint 基本规范
- 使用 IIFE 避免全局污染
- 统一使用 2 空格缩进

## 版本历史

### v1.0.0 (当前版本)
- ✅ 基础录制功能
- ✅ 自动/手动双模式
- ✅ 截图标注
- ✅ 多格式导出
- ✅ AI 文档增强
- ✅ 新拟态 UI

## 未来计划

### 短期计划
- [ ] 支持输入操作记录（文本输入、选择等）
- [ ] 支持滚动操作记录
- [ ] 优化截图性能和质量
- [ ] 添加步骤编辑功能（修改文字、调整顺序）

### 中期计划
- [ ] 支持更多导出格式（PDF、Word）
- [ ] 实现步骤分享功能（云端存储）
- [ ] 支持批量操作（批量删除、批量导出）
- [ ] 添加快捷键支持

### 长期计划
- [ ] 支持跨浏览器同步
- [ ] 团队协作功能
- [ ] 模板市场
- [ ] 自动化流程录制

## 技术限制

- 截图功能在部分特殊页面（如 Chrome 内部页面）可能不可用
- 跨域 iframe 内容无法捕获
- 某些受保护的网站（如 Chrome 网上应用店）无法录制
- 录制过程中切换标签页可能导致上下文丢失

## 贡献指南

欢迎提交 Issue 和 Pull Request 帮助改进这个插件！

### 贡献方式
1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### 代码贡献要求
- 遵循现有代码风格
- 添加必要的注释
- 确保功能测试通过
- 更新相关文档

## 许可证

MIT License

## 联系方式

- 项目 Issues: [GitHub Issues](链接)
- 邮箱：[你的邮箱]

---

**感谢使用步骤图录制器！** 🎉
