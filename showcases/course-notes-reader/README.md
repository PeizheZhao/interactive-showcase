# Course Space：私人课程笔记阅读器

网站：https://peizhezhao.github.io/interactive-showcase/showcases/course-notes-reader/

GitHub Pages 只托管 HTML、CSS 和 JavaScript。登录后，浏览器通过 Google Drive API 读取指定目录的 Markdown 和图片；课程内容不会进入 Git 仓库。默认根目录是 `05_GPT_Space`，也可以配置其他课程资料目录。

## 第一次连接

1. 在 [Google Cloud Console](https://console.cloud.google.com/) 创建或选择项目，启用 **Google Drive API**。
2. 在 Google Auth Platform 配置应用信息和受众。个人使用可以保持 Testing，将自己的 Google 邮箱加入 Test users。
3. 创建 **Web application** OAuth Client，在 **Authorized JavaScript origins** 加入 `https://peizhezhao.github.io`。这里填域名，不填 `/interactive-showcase/` 路径。这个令牌模式不需要 redirect URI。
4. 配置只读 scope：`https://www.googleapis.com/auth/drive.readonly`。Google 可能显示未验证应用提示；仅对自己创建、自己控制的项目继续授权。该 scope 可读取账号有权访问的 Drive 文件，Google 并不将权限限制在所选文件夹。
5. 打开网站的「连接设置」，粘贴 **Client ID**，保存并连接。Client ID 是公开的应用标识；不要填写 client secret、API key 或访问令牌。

Client ID 保存在当前浏览器的设置中，不需要修改仓库。每次新页面会话需登录；访问令牌过期后重新连接。网站不会保存令牌、笔记正文或图片到 localStorage、IndexedDB 或服务端，也没有 Service Worker。配置、主题和字号会保存在 localStorage。断开连接会清除页面笔记和内存令牌；不会撤销 Google 账号对应用的授权，需要时可在 Google 账号安全设置移除应用。

## 目录与更新

根目录下按课程建立文件夹，课程内部可以任意嵌套章节。已有的课程根目录也可直接作为连接目标。选择课程后展开章节，点击 `.md` 阅读。右侧目录根据正文的二、三级标题生成；小屏幕用左上角菜单展开章节。

点击笔记会重新读取文件。连接有效且页面可见时，每 60 秒检查当前笔记及课程目录；手动「刷新」立即重新读取。新增课程若未出现在课程选择框，重新连接即可。更新 Drive 内容无需重建或部署 Pages。文件名搜索覆盖当前课程的子目录，不搜索正文。

相对链接和图片基于原 Markdown 文件目录解析，支持 `../`，不能越过配置的根目录。指向根目录内的 Drive 文件链接可在阅读器中打开。图片使用带授权的 API 下载后在浏览器内显示，断开或切换笔记时释放。PDF、课件等原始资料通过「查看原文件」在 Drive 打开。普通外部链接打开新标签页；外部图片不在阅读器中加载。

支持 `$...$`、`$$...$$`、`\(...\)`、`\[...\]`，公式在 Markdown 解析之前保护，避免表格中的竖线破坏公式。KaTeX 以 `throwOnError: true`、`trust: false` 渲染；非法或不支持的语法在正文明确标出，不静默忽略。原文 HTML 先经 DOMPurify 清洗，再插入可信的 KaTeX 排版，以保留上下标和分数必需的布局样式。KaTeX 不支持所有 LaTeX 宏；新笔记仍需检查渲染结果。

「打开本地 Markdown 文件夹」可立即阅读下载到电脑的整套笔记，无需 Google 配置。它保留课程结构、图片和相对链接；本地文件修改后需重新选择目录。

## 为什么使用这个方案

| 方案 | Drive 更新后重新部署 | 私人内容 | 适用场景 |
| --- | --- | --- | --- |
| **Pages + 浏览器 Google OAuth（本项目）** | 不需要 | 保持原 Drive 权限 | 自己阅读；接受首次 Client ID 设置和会话授权 |
| Pages + 私有后端（Cloudflare Worker / Cloud Run） | 前端不需要 | 由后端登录和访问控制保护 | 多人使用或需要更长登录会话；需要另行部署后端及安全维护 |
| 把 Markdown 同步到 Pages 仓库 | 每次内容更新触发构建 | 公开 Pages 通常公开正文 | 公开课程网站；不符合本次要求 |

不建议把私人笔记设为「知道链接的任何人」来绕过授权。GitHub Pages 本身是静态托管，不能安全保存服务账号密钥、client secret 或长期刷新令牌。若未来需要无 Google 弹窗、多用户权限管理，可以复用本阅读界面并增加私有后端。

## 开发与验证

在仓库根目录启动任意静态 HTTP 服务，访问此目录。依赖使用固定版本 CDN：marked 15.0.12、DOMPurify 3.2.7、KaTeX 0.16.22，Google Identity Services 使用官方脚本。联网失败时显示加载错误；字体有系统回退。

首次发布前已用当前三篇 Drive 笔记验证全部 **145 个公式**，并检查混合数学定界符、代码段、表格、非法公式、HTML 清洗、相对路径、Drive 分页和内存缓存。私人笔记测试文件留在仓库之外，没有提交。

官方参考：[Google OAuth token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model) · [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) · [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
