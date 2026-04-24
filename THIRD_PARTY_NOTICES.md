# 第三方依赖许可声明

本项目使用了以下第三方库，特此声明其许可证信息：

## 核心依赖

### 1. JSZip

- **版本**: 3.10.1
- **描述**: 用于生成和读取 ZIP 文件的 JavaScript 库
- **许可证**: MIT 或 GPLv3（双重许可）
- **作者**: Stuart Knightley
- **项目主页**: https://stuartk.com/jszip
- **GitHub**: https://github.com/Stuk/jszip
- **许可证文件**: https://raw.github.com/Stuk/jszip/main/LICENSE.markdown

**许可证内容**:

```
JSZip is dual-licensed under the MIT license and the GPLv3.

You can use it under either license, at your choice.

MIT License:
Copyright (c) 2009-2016 Stuart Knightley <stuart@stuartk.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

GPLv3:
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
```

**依赖子项**: JSZip 使用了以下库：
- **pako**: MIT 许可证 (https://github.com/nodeca/pako/blob/main/LICENSE)

## 开发依赖

本项目在开发过程中可能使用了以下工具和服务：

### Chrome Extension APIs

- **提供者**: Google
- **许可证**: 专有（Chrome 扩展程序平台 API）
- **使用范围**: 仅用于 Chrome 扩展程序功能实现

### 构建工具

本项目使用原生 JavaScript 开发，未使用额外的构建工具。

## 许可证兼容性说明

### AGPL-3.0 与第三方库的兼容性

1. **JSZip (MIT/GPLv3)**:
   - MIT 许可证与 AGPL-3.0 兼容
   - GPLv3 与 AGPL-3.0 兼容（AGPL-3.0 第 13 条明确说明）
   - 本项目选择使用 JSZip 的 MIT 许可条款，以简化许可证兼容性

2. **pako (MIT)**:
   - MIT 许可证与 AGPL-3.0 兼容
   - 可以安全使用

### 使用建议

- 本项目整体采用 AGPL-3.0 许可证
- 第三方库的原始许可证条款仍然适用
- 分发本项目时，需要同时包含 AGPL-3.0 和第三方库的许可证文件

## 如何查看完整许可证文本

- **MIT License**: https://opensource.org/licenses/MIT
- **GPLv3**: https://www.gnu.org/licenses/gpl-3.0.html
- **AGPL-3.0**: https://www.gnu.org/licenses/agpl-3.0.html

## 声明

本文件仅用于声明第三方依赖的许可证信息，不构成法律建议。如需了解详细的许可证条款，请参阅各项目的官方许可证文件。

---

**最后更新**: 2026-04-24
