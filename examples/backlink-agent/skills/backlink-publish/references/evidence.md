# 什么算"已发布"

live 的唯一标准：**你亲自抓取的公开、非预览 URL 页面上，目标链接以可点击链接出现（aria 快照 `role:link`，名称含锚文本或指向 targetUrl）**。

- 必须是 GET 可达的公开页（列表页、详情页、个人主页）。
- 预览链接（带 token/preview）不算；需要登录才能看的页面不算。
- 用 `browser navigate` 到该 URL 再 `snapshot` 核验；evidence 里记录你看到了什么。
- 查重（"目标站已存在本站链接"）同口径：只认可点链接，裸文本 URL 不算——自己被转义的旧评论不是已发布，不能挡住重发。

## 反例（都不算 live）

- 目标 URL 以裸字符串出现——包括被转义显示的 `<a href=…>` 文本——不算链接嵌上；正文嵌链被转义 → `failed + manual_required`，绝不重发。
- 提交按钮点击成功、表单清空、"谢谢提交"页 → 至多 submitted。
- 邮件里说"已收录"但公开页还没出现 → submitted，等下次批次复查。
- 服务器返回 200 但页面是 JS 渲染的空壳 → 先 waitFor 再 snapshot，仍空则 submitted。
