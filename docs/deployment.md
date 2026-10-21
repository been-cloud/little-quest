# 手机版账号与 AI 服务部署

## 推荐方案

使用一台腾讯云轻量应用服务器（中国香港地域）加一个域名，安装 Node.js 22、Caddy。香港地域可以先部署验证；若改用中国内地服务器，需要按所在地要求办理 ICP 备案。Caddy 把 `https://你的域名` 转发到本机 Node 服务的 `127.0.0.1:8788`。安装包里只保存这个 HTTPS 地址，DeepSeek Key 和 QQ SMTP 授权码都只存在服务器 `.env`。

当前阶段已让这台电脑运行服务端。电脑关机、休眠或手机离开同一网络时，AI、邮箱登录和同步不可用。因此正式面向其他用户发布前仍需要稳定的服务器和域名。

## 先用当前电脑

运行 `powershell -NoProfile -ExecutionPolicy Bypass -File E:\ideasoftware\scripts\start-local-server.ps1`。脚本从当前 Wi-Fi 自动获取内网 IP，在该 IP 的 8788 端口启动 Node 服务，并强制账号登录后才能调用 AI。当前地址是 `http://192.168.43.163:8788`，换网络后以脚本显示的新地址为准。把手机和电脑连到同一 Wi-Fi，在手机浏览器打开 `http://电脑IP:8788/api/status`；出现 JSON 即连通。若手机无法访问，检查 Wi-Fi 是否开启了设备隔离以及 Windows 防火墙是否允许 Node.js 入站。不要为了测试直接关闭整个防火墙。

本机签名包 `release/little-quest-v0.1.2-local-server.apk` 已预填当前地址；手机浏览器可打开 `http://电脑IP:8788/install.apk` 直接下载。换网络时在「注册 / 登录 → 同步服务器设置」修改。局域网 HTTP 无加密，使用个人 Wi-Fi 或手机热点更合适。若要在不同网络下长期使用，请按下方说明部署 HTTPS 地址，或者后续设置稳定的隧道。

## 服务器配置

若手机热点下仍无法打开状态页，可在电脑上双击 `enable-phone-access.cmd` 并确认 Windows 管理员弹窗。它会运行 `scripts/allow-local-server-firewall.ps1`，只允许专用网络局域网设备访问当前 Node 程序的 TCP 8788 端口。普通权限无法创建 Windows 防火墙规则；不要关闭整个防火墙。

1. 在服务器上克隆项目，运行 `npm ci` 和 `npm run build`。
2. 复制 `.env.example` 为 `.env`，填写 `DEEPSEEK_API_KEY`、`QQ_SMTP_USER`、`QQ_SMTP_AUTH_CODE`；设置 `HOST=127.0.0.1`、`PORT=8788`、`NODE_ENV=production`、`AUTH_REQUIRED=true`、`ACCOUNT_DB_PATH=/var/lib/little-quest/accounts.json`。`.env` 的权限设为仅服务账号可读。
3. 为服务账号创建 `/var/lib/little-quest` 并授予写权限；不要运行多个服务进程共用同一个 `accounts.json`。
4. 运行 `node server/index.mjs`，确认本机 `http://127.0.0.1:8788/api/status` 正常，再交给 systemd 保持运行。
5. 把域名解析到服务器，在 Caddyfile 中配置：

   ```caddyfile
   api.example.com {
       reverse_proxy 127.0.0.1:8788
   }
   ```

6. 开放 80、443 端口，确认 `https://api.example.com/api/status` 可访问；在手机 APP 的「注册 / 登录 → 同步服务器设置」填入 `https://api.example.com`。
7. 每日备份 `/var/lib/little-quest/accounts.json` 和 `.env` 到受保护的异地位置。账号文件存储的是密码哈希、会话摘要和用户数据快照；不要公开下载。

参考：[腾讯云轻量应用服务器备案说明](https://cloud.tencent.com/document/product/1207/45756)、[Caddy HTTPS 指南](https://caddyserver.com/docs/quick-starts/https)。

## Android / 鸿蒙 4 安装包

现有 Capacitor 工程生成 APK，适用于 Android 和能运行 Android 应用的鸿蒙 4 及更早版本。鸿蒙 5 及以后需要另做原生 HAP。已生成正式签名包 `release/little-quest-v0.1.2-android-harmony4.apk`。把 APK 传到手机并打开安装；系统提示时允许从当前来源安装。正式包的签名证书与密码只保存在本机 `android/signing/`、`android/signing.properties`（均被 Git 忽略）；**请把这两个位置离线备份并妥善保管**。以后更新必须复用同一证书，否则用户无法覆盖安装。开发测试包可运行 `npm run android:sync` 后在 `android` 目录运行 `gradlew assembleDebug`。

手机安装后若未填写服务器地址，日程和角色仍可在本机体验，但邮箱注册、云端同步和 AI 需要服务器。APK 和 GitHub Release 中不得包含 `.env`、签名密钥、账号数据库或 SMTP 授权码。
