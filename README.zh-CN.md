# Pinote

[English](./README.md) | [简体中文](./README.zh-CN.md)

[![Tauri](https://img.shields.io/badge/Tauri-2-24c8db?logo=tauri&logoColor=white)](https://github.com/tauri-apps/tauri)
[![Release](https://img.shields.io/github/v/release/ImFeH2/pinote?display_name=tag&sort=semver)](https://github.com/ImFeH2/pinote/releases/latest)
[![CI](https://github.com/ImFeH2/pinote/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ImFeH2/pinote/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/ImFeH2/pinote)](./LICENSE)
[![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-24292f)](#安装)

Pinote 是一款轻量的桌面悬浮 Markdown 便签应用。它可以始终停留在工作区附近，用来随手记录便签、待办事项、代码片段和想法，而不必打断当前工作。

![Pinote 截图](./preview/pinote-screenshot.png)

## 安装

前往 [GitHub Releases](https://github.com/ImFeH2/pinote/releases/latest) 下载最新版本。

| 平台 | 推荐安装包 |
| --- | --- |
| Windows | WinGet 或 `.msi` 安装程序 |
| macOS | 根据处理器选择 Apple 芯片或 Intel 版本的 `.dmg` |
| Linux | `.AppImage`、`.deb` 或 `.rpm` |

Windows 用户可以使用以下命令安装：

```powershell
winget install ImFeH2.Pinote
```

Pinote 会在启动时自动检查应用更新。

## 功能

- **Markdown 便签**：在轻量的所见即所得窗口中编辑 Markdown，可同时打开多个便签。
- **文件同步**：检测文件被外部程序修改，并在安全时重新加载。
- **窗口状态**：每个便签可以单独设置置顶、只读、透明度和可见状态。
- **窗口快捷操作**：恢复隐藏便签、显示所有隐藏便签，或切换当前便签的显示状态。
- **自定义操作**：在设置中修改快捷键、滚轮修饰键和窗口拖动按键。
- **会话恢复**：恢复便签的位置、大小、可见状态、置顶、透明度、滚动位置、只读状态和上次显示的便签集合。
- **历史记录搜索**：按文件路径或内容查找并重新打开以前的便签。
- **外观设置**：调整主题、文字排版、页面间距、透明度、任务栏显示方式和玻璃效果。
- **桌面集成**：支持托盘操作、开机启动，以及通过命令行打开 `.md` 和 `.markdown` 文件。
- **应用更新**：Pinote 会在启动时检查新版本。

## 键盘快捷键

| 默认快捷键 | 操作 |
| --- | --- |
| `Alt+S` | 恢复隐藏便签 |
| `Alt+Shift+H` | 显示所有隐藏便签 |
| `Alt+D` | 显示或隐藏便签 |
| `Alt+C` | 新建便签 |
| `Alt+A` | 切换置顶 |
| `Alt+R` | 切换只读 |
| `Ctrl+Shift+D` | 切换深色模式 |
| `Esc` | 隐藏便签 |
| `Ctrl+Shift+W` | 关闭便签 |

所有快捷键都可以在设置窗口中修改。

## 鼠标操作

| 默认操作 | 功能 |
| --- | --- |
| `Alt + 滚轮` | 围绕鼠标指针调整窗口大小 |
| 单击鼠标中键 | 切换置顶 |
| 按住鼠标中键拖动 | 移动窗口，默认操作，可在设置中修改 |
| 单击鼠标右键 | 打开常用操作菜单 |

`Alt + 滚轮` 的修饰键可以在设置中改为 `Ctrl`、`Shift` 或 `Meta`。窗口拖动按键可以改为鼠标中键或右键。

## 命令行

```bash
pinote /path/to/note.md
pinote ./daily.markdown
```

每个文件路径会在独立的便签窗口中打开。再次使用同一路径运行命令时，会聚焦已经打开的窗口。

## 开发

```bash
pnpm install          # 安装依赖
pnpm tauri dev        # 以开发模式运行
pnpm tauri build      # 构建正式版本
```
