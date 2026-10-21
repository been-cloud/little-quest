# 小小任务 Little Quest

一个可运行的移动端 App 原型：像给朋友发消息一样描述计划，角色整理任务、等待确认、按约定时间提醒；还包括邮箱注册登录、账号数据同步、角色素材蒸馏、像素头像、番茄钟、奖励与冒险手账。

手机安装与服务端部署见 [部署指南](docs/deployment.md)。鸿蒙 4 及更早版本可使用 Android APK；鸿蒙 5 及以后需要单独的原生 HAP。

## 现在需要的软件

| 软件 | 用途 | 当前电脑状态 |
| --- | --- | --- |
| [Node.js](https://nodejs.org/en/download)（含 npm） | 运行项目和安装依赖 | 已安装 Node.js 22.10.0、npm 11.17.0 |
| [Google Chrome](https://www.google.com/chrome/) 或 Microsoft Edge | 查看与安装网页 App | 已检测到 Chrome 和 Edge |
| [Visual Studio Code](https://code.visualstudio.com/download) | 编辑代码，可选 | 可以使用你习惯的编辑器 |
| [Git for Windows](https://git-scm.com/downloads/win) | 版本管理，可选 | 已安装 |

**浏览器运行无须安装 Flutter 或 Android Studio。** 仓库已包含 Capacitor Android 工程；构建 APK 需要 Android SDK 命令行工具或 [Android Studio](https://developer.android.com/studio)。目前无需 Flutter SDK，因为现有代码采用 React/Vite + Capacitor。iOS 原生打包需要 macOS 电脑上的 [Xcode](https://developer.apple.com/xcode/)。

## 启动

在 PowerShell 中运行：

```powershell
cd E:\ideasoftware
npm install
npm run dev
```

打开终端中 Vite 显示的地址，通常是 `http://localhost:5173`。手机和电脑在同一个局域网时，可用终端显示的 Network 地址在手机浏览器中打开。局域网 HTTP 地址可以体验页面，但安装到主屏幕和浏览器通知通常需要 HTTPS 或 localhost 安全上下文。生产构建运行 `npm run build`，然后运行 `npm run dev:api` 并打开 `http://localhost:8788`。本机 8787 端口有无法停止的旧演示服务，本项目现使用 8788 端口。

## DeepSeek AI 与角色蒸馏

没有 API Key 时，蒸馏器提供**演示模式**：从素材中提取部分关键词和对白，供你体验完整交互；这不等同于模型对角色的深度还原。要启用 DeepSeek：

1. 在 [DeepSeek 开放平台](https://platform.deepseek.com/)创建 API Key。
2. 把 `.env.example` 复制为 `.env`，在其中填写 `DEEPSEEK_API_KEY=你的密钥`。
3. 重新启动 `npm run dev`。此工作区已配置本机 `.env`，不要覆盖或提交它。

密钥只由本地 API 服务读取，不会写进网页代码。AI 蒸馏时会发送角色文字素材；TXT 文件最多 20 MB，字数可以超过 60 万。服务端从整份文本中按角色名分布选取最多 60 万字，分为最多 12 段分析并合并。蒸馏器会把角色身份、经历、关系等保存为带原文引句的背景记忆；聊天时按当前问题找相关记忆，让角色用自己的口吻回答。结果页可校正背景梗概和每条记忆。AI 对话与规划会发送当前消息、相关的较早聊天、最近几条对话与近期任务摘要。上传的图片仅在设备本地转为像素头像，不会随对话请求上传。请不要把 `.env` 上传到公开仓库。开发 API 默认只监听 `127.0.0.1`。

邮箱注册会把 6 位验证码发送到用户邮箱。服务端需配置 `QQ_SMTP_USER` 和 `QQ_SMTP_AUTH_CODE`；不要使用 QQ 邮箱登录密码。密码在服务端以加盐 scrypt 哈希保存，登录令牌以摘要形式保存。账号、角色、聊天、任务和奖励快照保存在 `server/data/accounts.json`，此文件已被 Git 忽略。客户端离线保留本机副本；云端更新使用版本号检测冲突。公开部署时必须启用登录保护并配置 HTTPS。

长 TXT 支持 UTF-8 和 GB18030。角色名用于定位文本片段；如果文中使用昵称或别称，可以补在「性格与背景」里，或修改 TXT 后重试。角色卡只能依据分析过的片段，不能保证覆盖整部作品。生成卡片和对白请在启用前核对。

旧版创建的角色卡没有背景记忆。进入「角色」，点击「补全当前角色的记忆」，重新上传原 TXT 并蒸馏；同名角色更新会合并旧记忆、保留头像和聊天记录。原 TXT 不会永久存储在服务端，因此需要重新选取文件。登录后角色卡与聊天会同步到账号；未登录时只存在当前设备。

手机原生包在未设置服务器时使用设备内的演示规划。要启用 AI、邮箱登录与跨设备同步，需要部署 `server` 到可访问的 HTTPS 地址，并在手机「注册 / 登录 → 同步服务器设置」填写地址；也可在构建前设置 `VITE_API_BASE_URL`。公开部署请按[部署指南](docs/deployment.md)开启登录保护、HTTPS、数据备份和限流。

## Android App

修改 Web 页面后，可同步进 Android 工程：

```powershell
cd E:\ideasoftware
npm run android:sync
npm run android:open
```

本机已生成可安装的签名包 `release/little-quest-v0.1.0-local-server.apk`，默认连接当前电脑的 `http://10.118.83.126:8788`。[GitHub Release 的通用 APK](https://github.com/been-cloud/little-quest/releases/download/v0.1.0/little-quest-v0.1.0-android-harmony4.apk) 不预填服务器地址，适合其他设备下载。把 APK 传到手机后打开安装；系统提示时允许从当前来源安装。换 Wi-Fi 后，在应用的「注册 / 登录 → 同步服务器设置」修改电脑内网地址。原生版使用手机系统的本地通知安排提醒，应用关闭后仍可由系统发出。实际到达时间受设备通知权限与系统调度影响；当前设置为近似时间提醒。

电脑端现在通过 `scripts/start-local-server.ps1` 启动。重启电脑后，在 PowerShell 中运行 `powershell -NoProfile -ExecutionPolicy Bypass -File E:\ideasoftware\scripts\start-local-server.ps1`，脚本会自动显示当前地址；手机与电脑需连同一个 Wi-Fi。电脑关机或休眠期间，AI、邮箱登录和同步不可用，本机日程仍可查看。局域网 HTTP 没有加密，只在可信的个人 Wi-Fi 或手机热点下登录；之后改用 HTTPS 服务地址即可迁移。

## 已实现的功能与当前边界

- 直接用随口中文和角色说任务、时间；角色生成可修改的计划草案，确认后才写入日程。
- 可以按当前角色卡闲聊和提问；普通聊天直接按角色口吻回复，并调用角色背景记忆，只有明确提出任务时才生成计划草案。
- 对话中可提出简单时间修改，也可直接编辑计划中的任务、开始和提醒时间。
- 任务创建、完成、删除、分类、时间和星币奖励；数据保存在当前设备。
- 15/25/45 分钟番茄钟、专注记录、冒险手账。
- 角色素材输入、角色卡生成、背景记忆与证据摘录、台词试演与编辑、启用角色。
- 长 TXT 上传、分段角色分析、进度与来源覆盖信息。
- 图片像素化头像。当前采用 48×48 调色板量化，属于像素化转换，不是 AI 重绘。
- 提醒到点后也会写进角色对话；浏览器版打开页面时提醒。Android 原生工程已接入本地通知，但仍需安装 Android Studio 后在真机验证。
- 构建版具有基础离线缓存；AI 功能需要网络。

邮箱账号支持跨设备恢复应用快照。当前采用单进程文件数据库和本机离线副本，公开运营前仍需部署持久服务器，并根据访问量迁移到托管数据库。

## 界面参考

村庄场景、木框导航、羊皮纸任务卡和 RPG 对话框参考了 [stardewOS](https://github.com/FernandoBade/stardewOS)、[RPGUI](https://github.com/RonenNess/RPGUI) 与 [Pixelact UI](https://github.com/pixelact-ui/pixelact-ui) 的界面思路。项目没有复制这些仓库的代码、图片或《星露谷物语》原版素材；`public/village-scene.png` 是为本项目生成的原创场景图，主题样式在 `src/rpg-ui.css` 中。

## 项目文件

```text
src/App.tsx       页面与交互
src/styles.css    像素风界面
src/data.ts       本地数据与示例角色
src/pixel.ts      上传图片像素化
src/game-theme.css 原创农场 RPG 主题样式
src/api.ts        前端 API 调用
src/Companion.tsx 对话与计划确认
src/reminders.ts  手机本地通知与浏览器提醒权限
server/index.mjs  本地 API 与静态服务
server/logic.mjs  蒸馏、对话规划、角色对白、模型请求
server/longText.mjs 长 TXT 分段分析
android/          Capacitor Android 工程
.env.example      模型服务配置样例
```

## 检查

```powershell
npm run build
npm test
node scripts/lore-smoke.mjs  # 需要本地 DeepSeek API 服务已启动
```
