# GuidePilot - Browser Step Recorder

A Chrome browser extension similar to ScribeHow/Tango that automatically records user actions and generates professional step-by-step guide documents.

🌐 [中文](README.md) | English
📖 Docs | 💡 Use Cases | 🤝 Contribute

## ✨ Features

### 🎯 Core Capabilities

**One-Click Recording** - Click start, automatically captures all interactions
**Smart Screenshots** - Auto-capture page and highlight target area on each click
**Dual Recording Modes** - Auto mode for quick recording / Manual mode for precise confirmation
**AI Document Generation** - Integrate OpenAI-compatible API to auto-generate professional step descriptions
**Multi-Format Export** - Support Markdown, HTML, JSON formats, packaged as ZIP download

### 🚀 Technical Highlights

- 🖱️ **Smart Element Recognition** - Auto-identify buttons, links, forms and other interactive elements
- 🎨 **Neumorphism UI** - Modern Neumorphism design style
- 📷 **HD Screenshot Annotation** - Chrome native API + Canvas rounded highlight box
- 🔄 **Cross-Page Persistent Recording** - Support continued recording after page refresh
- 🖼️ **Full-Screen Image Preview** - Click thumbnail to view HD screenshots

## 💡 Use Cases

**SaaS Product Tutorials** - Quickly generate user operation guides, reduce customer support pressure
**Internal Training Docs** - Record ERP, CRM, admin panel operation workflows
**Accessibility Support** - Generate detailed step instructions for visually impaired users
**QA Test Reports** - Record bug reproduction steps for easier developer debugging
**Standard Operating Procedures** - Automate enterprise SOP document generation

## 🚀 Quick Start

### Install Extension

1. Clone this repository to your local machine
   ```bash
   git clone https://github.com/ShuZhongQiang/step-capture-extension.git
   cd step-capture-extension
   ```

2. Open Chrome browser and navigate to `chrome://extensions/`

3. Enable **Developer mode** in the top right corner

4. Click **Load unpacked** and select the project root directory

5. Installation complete, the extension icon will appear in the toolbar

### Basic Usage

1. Click the extension icon in the toolbar to open the side panel
2. Click the **Start Recording** button (orange)
3. Perform actions on the webpage, each click is automatically recorded
4. Click the **Stop Recording** button (red) to finish
5. Select export format and download the step document

### Recording Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| 🟢 Auto Mode | Auto-capture screenshot and save without confirmation | Quick recording, familiar workflows |
| 🟡 Manual Mode | Highlight display with confirmation dialog | Precise recording, step filtering |

### AI Document Generation (Optional)

1. Configure OpenAI-compatible API:
   ```javascript
   {
     enabled: true,
     provider: 'openai-compatible',
     endpoint: 'https://api.openai.com/v1/chat/completions',
     model: 'gpt-4.1-mini',
     apiKey: 'your-api-key',
     language: 'en-US'
   }
   ```

2. After recording, click the **AI Generate** button

3. Automatically generate optimized step titles and documentation

## 📦 Export Formats

| Format | Use Case | Features |
|--------|----------|----------|
| **Markdown** | Technical docs, GitHub README | Plain text, easy to edit, version control friendly |
| **HTML** | Browser viewing, website embedding | Rich text, beautiful styling, ready to use |
| **JSON** | Data exchange, secondary development | Structured data, programmable processing |

> All export formats include screenshot images, automatically packaged as ZIP file download.

## ❓ FAQ

**Q: Will recording affect page performance?**  
A: There will be a slight impact, mainly from highlight animations and screenshot operations. It is recommended to stop recording promptly after completion.

**Q: Why are some clicks not recorded?**  
A: The following situations may not be recorded: clicking on the extension's own UI, clicking non-interactive elements (such as plain text), or selecting cancel in manual mode.

**Q: Is AI configuration required?**  
A: No, it's optional. When not configured, default rules will be used to generate documents.

**Q: Does it support Firefox or Edge?**  
A: Currently developed for Chrome only. Chromium-based browsers (such as Edge) can be used directly. Firefox requires adaptation of some APIs.

**Q: How to backup recorded steps?**  
A: Use the export function to export steps as JSON format, which preserves complete data (including screenshots).

## 🛠️ Development Guide

### Local Development

```bash
# 1. Clone repository
git clone https://github.com/ShuZhongQiang/step-capture-extension.git
cd step-capture-extension

# 2. Load extension in Chrome
# Visit chrome://extensions/ -> Developer mode -> Load unpacked

# 3. Refresh extension after code changes
# Click the refresh button on the extension management page
```

### Debugging Tips

- **Background Debugging**: Click the "Service Worker" link on `chrome://extensions/`
- **Content Scripts Debugging**: Open developer tools on the target page
- **Side Panel Debugging**: Right-click the side panel -> Inspect

### Code Standards

- Use ES5/ES6 compatible syntax (ensure it runs in Service Worker)
- Follow JSHint basic standards
- Use IIFE to avoid global pollution
- Use 2-space indentation consistently

## 📋 Version History

### v1.0.0 (Current)
- ✅ Basic recording functionality
- ✅ Auto/Manual dual modes
- ✅ Screenshot annotation
- ✅ Multi-format export
- ✅ AI document enhancement
- ✅ Neumorphism UI

## 🔮 Roadmap

### Short-term
- [ ] Support input operation recording (text input, selection, etc.)
- [ ] Support scroll operation recording
- [ ] Optimize screenshot performance and quality
- [ ] Add step editing functionality

### Mid-term
- [ ] Support more export formats (PDF, Word)
- [ ] Implement step sharing functionality (cloud storage)
- [ ] Support batch operations
- [ ] Add keyboard shortcut support

### Long-term
- [ ] Support cross-browser synchronization
- [ ] Team collaboration functionality
- [ ] Template marketplace
- [ ] Automated workflow recording

## ⚠️ Technical Limitations

- Screenshot functionality may not be available on some special pages (such as Chrome internal pages)
- Cross-origin iframe content cannot be captured
- Some protected websites (such as Chrome Web Store) cannot be recorded
- Switching tabs during recording may cause context loss

## 🤝 Contributing

Community contributions are welcome! Please read the following before submitting issues or PRs.

### How to Contribute
1. Fork this repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Contribution Requirements
- Follow existing code style
- Add necessary comments
- Ensure functionality tests pass
- Update related documentation

## ⚖️ License

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

## 📬 Contact

- **GitHub Issues**: [Report Issues](https://github.com/ShuZhongQiang/step-capture-extension/issues)
- **Email**: chenspace1998@gmail.com
- **Commercial License Inquiry**: Contact us via the above methods

---

⭐ **If you find GuidePilot useful, please give the project a star!**
