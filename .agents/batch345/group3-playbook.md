# 外链发布 Playbook — batch345（推广站 https://minutecryptic.today，锚文本 "minuteCryptic"，lease 203）

你负责 group3.json 中指定下标区间的条目，按下标顺序串行处理。条目格式：`index|itemId|sourceId|sourceUrl`。

## 每条流程
1. `browser navigate`（**必须带 `page:"<你的专属页名>"`**）到 sourceUrl。加载超时 8s 属正常——改用 `browser waitFor`（带 url 参数, selector `body` 或 `#respond,#commentform`，timeout 20-30s）驱动导航。
2. 表单探测：waitFor `#respond, #commentform`。超时再试 `[id*='comment'], iframe`；无则 skipped，理由固定："评论区延迟加载探测后仍不存在"（如 404 也用此措辞，evidence 写明 404）。**绝不凭首屏快照下结论。**
3. 查重：页面已存在 `a[href*='minutecryptic.today']` → skipped "目标站已存在本站链接，跳过重复发布"。
4. 填表（标准 WP 选择器优先）：`#author` 姓名、`#email` 用 g3puzzle7k2@screwdom.org（如被拒可自建邮箱）、`#url`=https://minutecryptic.today、`#comment` 填一句与文章主题自然相关的观点句，内嵌 `<a href="https://minutecryptic.today">minuteCryptic</a>`（纯文本框直写 HTML，一段只 1 个链接）。若 aria 快照显示字段无 id，用 `#respond input[type='text'] >> nth=0` 等。
5. 提交：click `#submit, #commentform [type='submit']`。
6. 核验：waitFor `a[href*='minutecryptic.today'], .comment-awaiting-moderation, #error-page`。
   - 见 role:link 名称含 minuteCryptic 且 URL 无 unapproved → **live**，publicUrl 用当前页 #comment-xxxx。
   - 见 `?unapproved=...moderation-hash` 或 awaiting 提示 → **submitted**。
   - 见 `#error-page` CAPTCHA/Turnstile/reCAPTCHA → **failed + manual_required**（人机验证墙时 browser bringToFront 保留标签页）。
   - 提交成功但公开页（重定向到 #comment-ID）20 秒内看不到锚链接 → **submitted**（诚实）。
   - 点击提交后结果完全未知 → 绝不重发，**failed + manual_required**。
   - 站点连不上/加载不出 → **failed + retryable**。
   - 富文本 contenteditable 带工具栏：先输文字→选中锚文本→点链接按钮填 URL；禁止直接把 <a> 打进 contenteditable。
7. 回写：`backlinks action=item_result, itemId, leaseId=203, status=..., publicUrl/anchorText/targetUrl/evidence`。evidence 注明"该项自获取"和标签。
8. 随后 `backlinks action=source_tags, sourceId=<条目sourceId>, tags=[观察到的标签]`：免徽章/要徽章/可复用/有盾/付费（幂等只加不删）。开放表单无验证码通常给 ["免徽章","可复用"]；有验证码给 ["有盾"]。**注意 sourceId 用条目自己的，别用错。**
9. 每条完成后往你自己的日志文件追加一行 `index|itemId|状态|备注`，并立即 `bash cat >> 方式追加，防止上下文丢失`。
10. 每 5-6 条做一次 `backlinks action=lease_heartbeat, leaseId=203`。

## 纪律
- 不认领批次、不 lease_release、不问用户。
- 人机验证（CAPTCHA/Turnstile/reCAPTCHA/仅 Google OAuth）→ failed+manual_required，不尝试破解。
- 要求注册登录但可邮箱自助注册 → 正常流程（mailbox_create 带 localPart+domain=screwdom.org，mail_wait 拿验证）。
- 结果未知绝不重试。
- 全程不要对大评论页做整页 snapshot；只用 waitFor 和带 selector 的局部 snapshot，控制上下文消耗。

## 输出
处理完你的区间后，报告：live/submitted/failed_retryable/failed_manual/skipped 数量 + failed/skipped 的 id 与原因。
