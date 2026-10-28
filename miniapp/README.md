# 渡夜图鉴 · 小黑盒工坊小程序

本目录是小黑盒客户端内运行的独立 Vite 构建目标。网站的页面源码仍位于仓库根目录 `src/`，资料、图标和旧控制器仍位于根目录 `public/`。`scripts/prepare.mjs` 在每次开发启动和构建前从这两处生成本目录的临时资源，因此两端使用同一份内容来源。生成目录和 `dist/` 不入库。

## 本地构建

环境要求：Node.js 22.20 或更新版本。进入本目录运行：

```powershell
npm install
npm run hb-sdk -- doctor
npm run build
```

正式 SDK 调试台还需要小黑盒 CLI 登录和项目绑定：

```powershell
npm run hb-sdk -- login
npm run hb-sdk -- remote bind <开放平台小程序 ID>
npm run dev
```

页面只能通过 `hb-sdk dev` 提供的 Browser Mock 或真实小黑盒客户端验收；普通浏览器直接打开 Vite 地址会被小程序 Runtime Gate 拦截。文件选择能力只在支持它的真实客户端上验收。

小于等于 8 MiB 的 `.sl2` 可以在小程序中直接选择并解析。较大的本机存档可在本机切片后导入，不需要网站解析：在仓库根目录运行 `node miniapp/scripts/split-save.mjs "存档文件路径"`，脚本会在原文件旁创建 `.parts` 文件夹，把原始字节按每片 7 MiB 切成 `.part` 文件，文件名会标明序号与总片数（例如 `NR0000.sl2.001-of-002.part`）。小程序中选择“导入存档分片”，一次多选该文件夹内同一组的全部分片；手机端需先将 `.parts` 文件夹复制到手机可访问的位置。小程序会校验文件名、序号、总片数和大小，在当前设备内顺序拼回并调用原有只读解析器。拼接总大小上限为 64 MiB。普通本机导入只读原存档、不覆盖、不上传；本地 JSON 导入仍可用于已有的精简数据迁移。小程序没有存档写回功能。

“从 Steam 云存档导入”需先由用户在 Steam 页面授权 `read_cloud`，然后由 FastAPI 按游戏 AppID `2622380` 列出云文件。选择后，后端以 2 MiB 分段从 Steam 读取并临时转发到小程序；小程序在当前设备拼接完整字节并调用原解析器，单个文件上限 64 MiB。Steam 密码不经过小程序或项目后端；OAuth 令牌、签名下载地址和传输中的存档只保存在后端进程内存，会话最多 10 分钟，响应不缓存，代码不写入磁盘、数据库或应用日志。此入口只读，不提供修改或写回云存档。授权期间存档会经过项目后端，这是与本机文件导入不同的隐私边界。

## 后端

AI 和匿名反馈都使用项目 FastAPI 服务。生产构建前把公开 HTTPS API 域名写入 `VITE_NIGHTREIGN_API_BASE`，例如 `https://api.example.com`；此变量只包含域名，不包含密钥。未设置时本地开发经 Vite 的 `/api` 代理访问 `http://127.0.0.1:8000`，生产构建中的反馈入口会明确提示服务尚未配置。

DeepSeek 和百炼密钥只放在后端环境变量中。上线前须为 API 域名取得小程序 `network` 平台批准，并在对应 Android、iOS、Windows 客户端完成验收。

启用 Steam 云存档还需要向 Valve 申请 Steam OAuth Client ID，并请求 `read_cloud` 权限，范围限定到游戏 AppID `2622380`。后端设置 `STEAM_OAUTH_CLIENT_ID` 和 `STEAM_OAUTH_REDIRECT_URI`；回调地址必须是 API 域名下的 `https://<API 域名>/api/steam/oauth/callback`，并与提交给 Valve 的地址完全一致。小程序 API 域名用 `VITE_NIGHTREIGN_API_BASE` 设置，API 跨域时还要把小程序来源加入 `FRONTEND_ORIGINS`。Steam OAuth 账号登录密码不会交给本项目；不需要 Steam Web API key 或 OAuth client secret。Valve 是否核发该 Client ID 由 Valve 审核决定。手机调试不能把 `127.0.0.1` 用作回调域名，因为手机上的地址会指向手机本身。OAuth 会话暂存在单个 FastAPI 进程的内存，部署时使用单 worker；服务重启后，用户重新登录即可。

## 目前不能提审的事项

- 官方模板图标和封面仍是占位图，待替换为用户提供的正式素材。
- 已把本地项目绑定用户给出的开放平台小程序 ID，并关联开放平台搜索结果中的《艾尔登法环 黑夜君临》游戏 appid `2622380`；正式 API 域名和网络批准未完成。
- 大于 8 MiB 的 `.sl2` 已支持通过本地分片多选和端内拼接导入；Android、iOS、Windows 上的原生多选限制与完整解析流程仍待实机验收。
- Steam OAuth 云存档代码已接入；取得 Valve 的 `read_cloud` Client ID、部署 HTTPS API 并完成小程序网络域名审批后，才能进行真实授权与云文件验收。
- 匿名反馈的服务端接口由项目反馈专项实现；合入并验证前不能把前端表单视作已交付。
- CLI 登录账号仍需完成开发者平台主体绑定，之后再验证部署与审核权限。

`main` 的每次更新都会由 GitHub Actions 从同一提交构建网站和小程序，并保存两份构建产物。发布负责人随后按同一 Git SHA 分别完成 Sites 发布及小黑盒部署、审核、上架，并记录两端版本。小黑盒审核期间不会自动出现在客户端。
