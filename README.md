# API生图工作站

一个基于 React、Vite、TypeScript 的纯静态前端生图控制台。

## 架构特点

- 用户自己填写 `API Key`
- 用户自己填写 `API Base URL`
- 用户自己填写 `Model`
- 不需要用户系统
- 不需要数据库
- 不需要服务端存储
- 所有请求都由浏览器直接发送到用户配置的 API

## 配置保存

配置会保存到浏览器 `localStorage`：

- `Provider 名称`
- `API Base URL`
- `API Key`
- `Model`
- 自定义请求路径

支持导入和导出 `config.json`，方便在不同浏览器或设备之间迁移。

## API 封装

统一封装在：

[`src/services/api.ts`](./src/services/api.ts)

当前默认支持：

- OpenAI 兼容图片接口
- 自定义接口路径

## 本地运行

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

构建产物输出到：

```text
dist/
```

## Cloudflare Pages

部署步骤见：

[`DEPLOY_TO_CLOUDFLARE.md`](./DEPLOY_TO_CLOUDFLARE.md)

## 上传到 GitHub 前

这个目录已经整理成适合直接上传仓库的状态：

- `node_modules/` 不提交
- `dist/` 不提交
- `.DS_Store` 不提交
- 所有 API 配置只保存在浏览器 `localStorage`

你只需要把当前项目目录作为一个新仓库上传即可。

## 注意

这是纯静态前端方案，所以供应商 API 必须允许浏览器直接访问。如果目标 API 没有开放 CORS，浏览器会拦截请求，这种情况只能由 API 供应商放开跨域，或由用户自己部署代理。
