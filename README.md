# GuidePilot - 浏览器步骤图录制器

## 介绍

GuidePilot 是一个基于 Chrome 浏览器的扩展插件，用于记录用户在网页上的操作步骤。它通过智能截图和记录用户点击事件，自动生成专业的步骤指南文档。

## 功能特性

🌐 中文 | [English](docs/README-en.md)
📖 文档 | 💡 应用场景 | 🤝 贡献

## ✨ 功能特性

### 🎯 核心能力

**一键录制** - 点击开始，自动捕获所有交互操作
**智能截图** - 每次点击自动截取页面并标注目标区域
**双模式录制** - 自动模式快速录制 / 手动模式精确确认
**AI 文档生成** - 接入 OpenAI 兼容 API，自动生成专业步骤说明
**多格式导出** - 支持 Markdown、HTML、JSON 格式，打包为 ZIP 下载

### 🚀 技术亮点

- 🖱️ **智能元素识别** - 自动识别按钮、链接、表单等交互元素
- 🎨 **新拟态 UI** - 现代化的 Neumorphism 设计风格
- 📷 **高清截图标注** - Chrome 原生 API + Canvas 圆角高亮框
- 🔄 **跨页面持续录制** - 支持页面刷新后继续录制
- 🖼️ **全屏图片预览** - 点击缩略图查看高清截图

## � 应用场景

**SaaS 产品教程** - 快速生成用户操作指南，减少客服压力
**内部培训文档** - 录制 ERP、CRM、管理后台操作流程
**无障碍辅助** - 为视障用户生成详细的操作步骤说明
**QA 测试报告** - 记录 Bug 复现步骤，方便开发定位问题
**标准作业程序** - 企业 SOP 文档自动化生成

## 🚀 快速开始

### 安装扩展

1. 克隆本仓库到本地
   ```bash
   git clone https://github.com/ShuZhongQiang/step-capture-extension.git
   cd step-capture-extension
   ```

2. 打开 Chrome 浏览器，进入 `chrome://extensions/`

3. 开启右上角「**开发者模式**」

4. 点击「**加载已解压的扩展程序**」，选择项目根目录

5. 安装完成，工具栏会出现插件图标

### 基础使用

1. 点击工具栏图标，打开侧边栏面板
2. 点击「**开始录制**」按钮（橙色）
3. 在网页上进行操作，每次点击自动记录
4. 点击「**停止录制**」按钮（红色）结束
5. 选择导出格式，下载步骤文档

### 录制模式

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| 🟢 自动模式 | 点击后自动截图保存，无需确认 | 快速录制、熟悉流程 |
| 🟡 手动模式 | 高亮显示后弹出确认对话框 | 精确录制、筛选步骤 |

### AI 文档生成（可选）

1. 配置 OpenAI 兼容 API：
   ```javascript
   {
     enabled: true,
     provider: 'openai-compatible',
     endpoint: 'https://api.openai.com/v1/chat/completions',
     model: 'gpt-4.1-mini',
     apiKey: 'your-api-key',
     language: 'zh-CN'
   }
   ```

2. 录制完成后点击「**AI 生成**」按钮

3. 自动生成优化的步骤标题和说明文档

## 📦 导出格式

| 格式 | 用途 | 特点 |
|------|------|------|
| **Markdown** | 技术文档、GitHub README | 纯文本、易编辑、版本控制友好 |
| **HTML** | 浏览器查看、嵌入网站 | 富文本、样式美观、开箱即用 |
| **JSON** | 数据交换、二次开发 | 结构化数据、可编程处理 |

> 所有导出格式都会包含截图图片，自动打包为 ZIP 文件下载。

## 🔐 权限说明

| 权限 | 用途 |
|------|------|
| `activeTab` | 获取当前活动标签页信息 |
| `storage` | 存储录制数据和设置 |
| `scripting` | 向页面注入内容脚本 |
| `sidePanel` | 显示侧边栏界面 |
| `tabs` | 管理标签页 |
| `downloads` | 下载导出的文档 |
| `webNavigation` | 监听页面导航事件 |
| `host_permissions: <all_urls>` | 在所有网页上运行内容脚本 |

## ❓ 常见问题

**Q: 录制时页面性能会下降吗？**  
A: 会有轻微影响，主要来自高亮动画和截图操作。建议录制完成后及时停止。

**Q: 为什么有些点击没有被记录？**  
A: 以下情况可能不会记录：点击插件自身 UI、点击非交互元素、手动模式下选择取消。

**Q: AI 功能必须配置吗？**  
A: 不是必须的。AI 功能是可选的，未配置时会使用默认规则生成文档。

**Q: 支持 Firefox 或 Edge 吗？**  
A: 目前仅针对 Chrome 开发，基于 Chromium 的浏览器（如 Edge）可直接使用。Firefox 需要适配部分 API。

**Q: 如何备份录制的步骤？**  
A: 使用导出功能将步骤导出为 JSON 格式，可保留完整数据（包含截图）。

## 🛠️ 开发指南

### 本地开发

```bash
# 1. 克隆仓库
git clone https://github.com/ShuZhongQiang/step-capture-extension.git
cd step-capture-extension

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

## 📋 版本历史

### v1.0.0 (当前版本)
- ✅ 基础录制功能
- ✅ 自动/手动双模式
- ✅ 截图标注
- ✅ 多格式导出
- ✅ AI 文档增强
- ✅ 新拟态 UI

## 🔮 未来计划

### 短期
- [ ] 支持输入操作记录（文本输入、选择等）
- [ ] 支持滚动操作记录
- [ ] 优化截图性能和质量
- [ ] 添加步骤编辑功能

### 中期
- [ ] 支持更多导出格式（PDF、Word）
- [ ] 实现步骤分享功能（云端存储）
- [ ] 支持批量操作
- [ ] 添加快捷键支持

### 长期
- [ ] 支持跨浏览器同步
- [ ] 团队协作功能
- [ ] 模板市场
- [ ] 自动化流程录制

## ⚠️ 技术限制

- 截图功能在部分特殊页面（如 Chrome 内部页面）可能不可用
- 跨域 iframe 内容无法捕获
- 某些受保护的网站（如 Chrome 网上应用店）无法录制
- 录制过程中切换标签页可能导致上下文丢失

## 🤝 贡献

欢迎社区贡献！提交 issue 或 PR 之前，请先阅读以下内容。

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

## ⚖️ 许可证

本项目采用双许可证模式：

### AGPL-3.0 开源许可证

本项目的核心代码默认采用 [AGPL-3.0](LICENSE) 许可证发布。AGPL-3.0 是一个强 copyleft 许可证，适用于开源和商业用途，但要求：

- 如果您修改了软件并在网络上提供服务，必须向用户提供修改后的源代码
- 任何衍生作品也必须采用 AGPL-3.0 许可证
- 分发时必须提供完整的源代码

**适用于**：开源项目、学习研究、遵守 AGPL 条款的商业应用

### 商业许可证

如果您无法满足 AGPL-3.0 的要求，需要购买商业许可证。商业许可适用于以下场景：

- **私有部署**：无需公开源代码
- **团队协作功能**：多用户协作和团队管理
- **高级模板**：访问专有的高级模板
- **企业工作流**：集成到企业专有系统
- **SaaS 服务**：作为服务提供且无需开源
- **闭源分发**：作为闭源产品分发

详情请参阅 [商业许可条款](COMMERCIAL_LICENSE.md)。

### 第三方依赖

本项目使用了第三方库，其许可证信息请参阅 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## License

This project uses a dual-licensing model:

### AGPL-3.0 Open Source License

The core code is released under the [AGPL-3.0](LICENSE) license by default. AGPL-3.0 is a strong copyleft license suitable for open source and commercial use, but requires:

- If you modify the software and provide network access, you must provide the modified source code to users
- Any derivative works must also be licensed under AGPL-3.0
- Complete source code must be provided when distributing

**Applicable to**: Open source projects, research and learning, commercial applications that comply with AGPL terms

### Commercial License

If you cannot comply with AGPL-3.0 requirements, you need to purchase a commercial license. Commercial licensing applies to:

- **Private deployment**: No need to open source your code
- **Team collaboration**: Multi-user collaboration and team management
- **Advanced templates**: Access to proprietary premium templates
- **Enterprise workflows**: Integration into proprietary enterprise systems
- **SaaS services**: Provide as a service without open sourcing
- **Closed-source distribution**: Distribute as a closed-source product

For details, see [Commercial License Terms](COMMERCIAL_LICENSE.md).

### Third-Party Dependencies

This project uses third-party libraries. For license information, see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## 📬 联系方式

- **GitHub Issues**: [问题反馈](https://github.com/ShuZhongQiang/step-capture-extension/issues)
- **Email**: chenspace1998@gmail.com
- **商业许可咨询**: 请通过上述方式联系我们

---

⭐ **如果觉得 GuidePilot 有用，请给项目点个星！**
