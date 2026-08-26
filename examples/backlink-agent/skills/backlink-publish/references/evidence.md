# 什么算"已发布"

live 的唯一标准：**你亲自抓取的公开、非预览 URL 页面文本里能找到目标链接（或锚文本）**。

- 必须是 GET 可达的公开页（列表页、详情页、个人主页）。
- 预览链接（带 token/preview）不算；需要登录才能看的页面不算。
- 用 `browser navigate` 到该 URL 再 `snapshot` 核验；evidence 里记录你看到了什么。

## 反例（都不算 live）

- 提交按钮点击成功、表单清空、"谢谢提交"页 → 至多 submitted。
- 邮件里说"已收录"但公开页还没出现 → submitted，等下次批次复查。
- 服务器返回 200 但页面是 JS 渲染的空壳 → 先 waitFor 再 snapshot，仍空则 submitted。
