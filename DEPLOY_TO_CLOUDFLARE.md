# DEPLOY TO CLOUDFLARE PAGES

第一步：

```bash
npm install
```

第二步：

```bash
npm run build
```

第三步：

将项目上传到 GitHub。

第四步：

打开 Cloudflare Dashboard。

进入：

```text
Pages
Create Project
Connect GitHub
```

第五步：

选择你的仓库，然后填写：

```text
Build Command: npm run build
Output Directory: dist
Node Version: 20
```

第六步：

点击：

```text
Deploy
```

部署成功后会获得：

```text
https://xxxxx.pages.dev
```

## 说明

- 这是纯静态前端方案，不使用 Cloudflare Workers。
- API Key、API Base URL、Model、Provider 名称都只保存在用户浏览器的 `localStorage`。
- 所有 API 请求都由浏览器直接发送到用户填写的 API 地址。
- 如果供应商没有开放浏览器跨域访问，页面会遇到 CORS 限制；这不是 Cloudflare Pages 的问题，而是目标 API 是否允许浏览器直连的问题。
