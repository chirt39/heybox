# Ubuntu 公网 IP + Nginx 静态部署

本指南将 Vite 构建出的 `dist/` 交给 Ubuntu 上由 systemd 管理的 Nginx 托管。Nginx 服务在 SSH 退出后仍会运行；更新网站需要手动执行发布命令，Git 推送不会自动部署。

## 适用范围

- 适用于没有域名、通过服务器公网 IP 访问的简单 HTTP 站点。
- HTTP 不加密传输。不要在此站点提交密码、密钥或其他敏感信息；公网长期使用建议配置域名和 HTTPS。
- 直接用 IP + HTTP 不具备 HTTPS 安全上下文。依赖浏览器安全上下文的能力可能不可用。
- Vite `npm run dev` 是开发服务器，临时 Cloudflare Tunnel 是临时访问方式；两者都不用于生产托管。
- 本文假设有 Ubuntu 服务器的 sudo 权限，以及仓库中已检出的项目目录 `/opt/nightreign`。项目要求 Node.js 20.19+ 或 22.12+；先确认 `node --version` 和 `npm --version` 满足要求。

## 安装并构建

安装 Nginx 和 Git，启用 Nginx 开机启动并立即运行：

```sh
sudo apt update
sudo apt install -y nginx git rsync
sudo systemctl enable --now nginx
sudo systemctl status nginx --no-pager
```

将仓库检出到 `/opt/nightreign`（把占位符替换成仓库地址），然后安装锁文件指定的依赖并构建：

```sh
sudo mkdir -p /opt/nightreign
sudo chown "$USER":"$USER" /opt/nightreign
git clone <仓库地址> /opt/nightreign
cd /opt/nightreign
node --version
npm --version
npm ci
npm run build
```

如果仓库已检出到其他目录，将后续命令中的 `/opt/nightreign` 换成实际路径。`npm run build` 应生成 `/opt/nightreign/dist/`。

## 配置 Nginx

以下配置用于这台服务器专用的 Nginx 80 端口默认站点。先检查当前启用的站点；仅在确认这是专用站点且没有其他 80 端口默认站点时使用该配置：

```sh
ls -la /etc/nginx/sites-enabled/
sudo nginx -T 2>/dev/null | grep -n 'default_server'
```

若 `/etc/nginx/sites-enabled/default` 存在（包括符号链接），先将它移动到 `sites-available` 中的备份位置。命令会在备份路径已存在时停止，不覆盖旧备份：

```sh
if [ -e /etc/nginx/sites-enabled/default ] || [ -L /etc/nginx/sites-enabled/default ]; then
    if [ -e /etc/nginx/sites-available/default.enabled.backup ] || [ -L /etc/nginx/sites-available/default.enabled.backup ]; then
        echo "备份路径已存在，请先检查并手动选择另一个备份名。"
        exit 1
    fi
    sudo mv /etc/nginx/sites-enabled/default /etc/nginx/sites-available/default.enabled.backup
fi
```

这会保留原文件或符号链接，但暂时停用默认站点。若上一步创建了备份且要恢复，先停用本指南新增的站点，再将备份移回原位置：

```sh
sudo rm -f /etc/nginx/sites-enabled/nightreign
sudo mv /etc/nginx/sites-available/default.enabled.backup /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

如果检查发现其他站点仍占用 80 端口默认服务器，先由管理员合并配置，不要继续使用下面这份 `default_server` 配置。

创建静态站点目录并复制构建文件：

```sh
sudo install -d -o www-data -g www-data /var/www/nightreign/dist
sudo rsync -a --delete /opt/nightreign/dist/ /var/www/nightreign/dist/
```

确认配置路径尚未被占用，再写入最小站点配置：

```sh
if [ -e /etc/nginx/sites-available/nightreign ] || [ -L /etc/nginx/sites-available/nightreign ]; then
    echo "配置文件已存在，请先检查并备份后再继续。"
    exit 1
fi
sudo tee /etc/nginx/sites-available/nightreign >/dev/null <<'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root /var/www/nightreign/dist;
    index index.html;

    # Browser security headers for this static HTTP site.
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;

    location / {
        try_files $uri $uri/ =404;
    }
}
EOF
```

确认启用路径尚未被占用，再启用站点、检查配置并重新加载 Nginx：

```sh
if [ -e /etc/nginx/sites-enabled/nightreign ] || [ -L /etc/nginx/sites-enabled/nightreign ]; then
    echo "启用路径已存在，请先检查并备份后再继续。"
    exit 1
fi
sudo ln -s /etc/nginx/sites-available/nightreign /etc/nginx/sites-enabled/nightreign
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

这些响应头用于限制浏览器行为：`X-Content-Type-Options: nosniff` 阻止浏览器将资源 MIME 类型嗅探成其他类型；`X-Frame-Options: DENY` 禁止本站页面被任何站点放进 frame/iframe，降低点击劫持风险；`Referrer-Policy: strict-origin-when-cross-origin` 在跨源请求时只发送来源，不暴露路径和查询参数；`Permissions-Policy` 关闭本站未使用的摄像头、麦克风、定位、支付和 USB 能力。`always` 让这些头也出现在错误响应中。此示例仅服务 HTTP，因此不加 HSTS；页面含有 inline CSS/JS，CSP 需另行评估以免阻断现有资源，故不在此配置中启用。

若服务器已有其他 Nginx 站点，不要删除默认配置或覆盖其他站点；应由管理员为该 IP/端口合并配置。确认云平台防火墙允许 TCP 80；若 Ubuntu UFW 已启用，也需允许 HTTP：

```sh
sudo ufw allow 80/tcp
```

## 验证访问

在服务器本机检查响应，再从自己的电脑或浏览器通过公网 IP 访问：

```sh
curl -I http://127.0.0.1/
curl -I http://<服务器公网IP>/
curl -sSI http://127.0.0.1/ | grep -Ei '^(HTTP/|X-Content-Type-Options:|X-Frame-Options:|Referrer-Policy:|Permissions-Policy:)'
```

第二条命令中的 `<服务器公网IP>` 替换为实际地址，不要将真实 IP 写入仓库。响应应为 `200 OK`，并且头部检查命令应列出配置的四个安全响应头。修改配置后先用 `sudo nginx -t` 检查语法，再重新加载 Nginx 并运行这些 `curl` 命令；本文仅提供配置示例，不会自动应用配置。Nginx 由 systemd 管理，关闭 SSH 连接不会停止站点；可用以下命令确认：

```sh
systemctl is-enabled nginx
systemctl is-active nginx
```

## 更新与回滚

每次更新需登录服务器手动拉取代码、构建并同步静态文件。同步前将当前版本复制到带时间戳的备份目录；已有备份不会被删除或覆盖：

```sh
cd /opt/nightreign
git pull --ff-only
npm ci
npm run build
backup="/var/www/nightreign/backups/dist-$(date +%Y%m%d-%H%M%S)"
sudo install -d -o root -g root -m 0755 /var/www/nightreign/backups
sudo mkdir "$backup"
sudo cp -a /var/www/nightreign/dist/. "$backup/"
printf '回滚目录：%s\n' "$backup"
sudo rsync -a --delete /opt/nightreign/dist/ /var/www/nightreign/dist/
```

验证站点后如需回滚，将 `<备份时间戳>` 换成上面打印的目录名：

```sh
sudo rsync -a --delete /var/www/nightreign/backups/dist-<备份时间戳>/ /var/www/nightreign/dist/
```

带时间戳的回滚目录会持续保留。确认已有其他有效备份后，再由管理员按保留策略清理旧目录。代码推送、构建和文件同步都不会由 Nginx 自动触发。

## 停止或移除

若这是专用服务器，可停止 Nginx；若设置了开机启动且希望重启后也保持停止，再禁用服务：

```sh
sudo systemctl stop nginx
sudo systemctl disable nginx
```

重新启动并设为开机启动：

```sh
sudo systemctl enable --now nginx
```

若 Nginx 还托管其他站点，不要停止整个服务。只移除此站点配置并重新加载：

```sh
sudo rm -f /etc/nginx/sites-enabled/nightreign
sudo nginx -t
sudo systemctl reload nginx
```
