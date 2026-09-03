# 博客评论（category: 博客）

在相关博客文章下留评论形成外链：表单有 Website 字段时填填写者主页 URL，没有时把链接嵌进评论正文。

## 流程
1. 找到与目标网站主题相关的**近期文章**（从 sourceUrl 或站内最新列表挑，不碰多年前的旧文）。
2. 勘察评论表单（含下面的懒加载探测），**按形态选带链方式**：
   - 有 姓名/邮箱/网站(Website)/评论内容 → 邮箱用一次性邮箱；Website 字段填 anchors 里的 targetUrl；评论正文**不带链接**。
   - 只有评论正文一个输入框（Wix 类组件）→ 走下面的**正文嵌链**流程。
3. 评论内容必须**针对文章内容**写 2-3 句真实观点——泛泛的"好文章"大概率被当垃圾删掉，宁可跳过也不要水评。
4. 提交后看回显：立即可见 → 核验 live；显示"待审核" → submitted。

## 评论区勘察（懒加载兼容）

评论区组件普遍在正文之后异步挂载，首屏快照缺席≠不存在。**判"无评论区"前必须走完**以下序列，任何一步找到评论框即跳出：

1. `waitFor` 常见锚点（`#comments`、`#respond`、`#commentform`、`[id*='comment']`、`iframe`）或等 3-5 秒再 `snapshot`。
2. `press` End/PageDown 滚到页底再 `snapshot`——挂载常由视口接近触发。
3. 快照见「Load comments / Comments (N) / 展开评论」类按钮 → 先 `click` 再 `snapshot`。
4. aria 快照里的 **iframe 就是懒挂载评论区**（Disqus/Blogger/giscus），用 `frame()` 前缀进入，不要当装饰忽略。
5. 兜底 `navigate` 到 `URL#comments` 再 `snapshot`。

全走完仍无评论区 → 回写 `skipped`（skipReason 固定："评论区延迟加载探测后仍不存在"），禁止一句"静态页面"判死。

## 评论区识别信号

| 特征 | 信号 |
|---|---|
| WordPress | 表单 action 含 `wp-comments-post`、`commentform`、`comment_post_ID`、"allowed HTML tags" 提示 |
| Blogger/Blogspot | `iframe[src*='blogger.com']`、"Post a Comment"、Google 账号选择器 |
| Disqus | `#disqus_thread` 容器、`iframe[src*='disqus.com']` |
| Wix | "Write a comment..." 占位符、表情/GIF 工具栏、需会员登录 |
| 通用富文本 | 正文框带加粗/链接工具栏、`contenteditable` 区域 |

## 正文嵌链（无 Website 字段的评论区）

1. **按框型选输入方式**：真纯文本框（无工具栏、非 contenteditable）→ 直接写 `<a href="targetUrl">anchorText</a>`；**contenteditable 富文本框/带工具栏（Wix 博客评论框即此类）→ 禁止把 `<a>` 当文本输入，会被原样转义——先输完整观点句，选中锚文本片段，点工具栏链接按钮填 targetUrl**。两种方式都要求锚文本融进 2-3 句观点读得通、**一段评论只嵌 1 个链接**（多了像垃圾，与内容站剧本对称）。**裸链默认禁用**（Wix 已实证不转裸链），仅站内确有裸链自动转链先例时才用。
2. **平台先例表**——命中即按该平台的方式执行，无需逐站找证据：

   | 平台 | 覆盖面 | 方式 | 证据 |
   |---|---|---|---|
   | Wix 群组讨论帖 | 帖子 composer 正文 | `<a>` 直写 | splendorsinglesministry 讨论帖 `<a>` 渲染为可点链接 |
   | Wix 博客评论框 | contenteditable 评论框 | 工具栏链接按钮 | pullcommunityoutreach 直写 `<a>` 显示为字面文本；同站 v7cztusuh 的评论以可点链接呈现 |

   未知平台提交前需三证据居一：评论区已有上线评论带**可点击**链接（aria 快照 `role:link`，最强证据）/ 富文本工具栏有链接按钮 / 表单附近有 "HTML allowed" 类提示。一个都没有 → 回写 `skipped`（skipReason："评论区无 Website 字段且无正文链接先例，无途径携带目标链接"），**不发试探性评论**——一次最终提交的铁律下，发出去的无链评论就是纯水评。
3. 论坛式评论框（站内已有 BBCode 评论先例或表单旁有 BBCode 格式提示）→ 用 `[url=targetUrl]anchorText[/url]` 替代 HTML。
4. **核验口径比普通评论严**：aria 快照里该评论正文出现 `role:link` 且名称含 anchorText 才算链接真的嵌上了。回显若是被转义的 `<a href=…>` 纯文本（能看到 targetUrl 字符串但没渲染成链接）→ 链接未生效，回写 `failed + manual_required`（failureReason 注明平台与"正文 HTML 被转义，链接未生效"——转义即说明该平台不属于先例表，供修正表），**绝不自动重发第二条**。

## 边界
- 评论关闭/需登录（含 Wix "Log in to publish as a member"）/Disqus 之类第三方登录 → 走单条目循环第 5 步登录决策树；仍过不去 → manual_required 或 skipped（视情况）。
- 一个博客只评论一次；不要连续刷同一站点多篇文章。
