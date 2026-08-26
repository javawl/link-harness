# 状态模型与回写映射

## 细状态 → 回写

| 情形 | item_result 回写 |
|---|---|
| 公开页已核验含目标链接 | live + publicUrl/anchorText/targetUrl/evidence |
| 已提交、明确待审核/收录 | submitted |
| CAPTCHA、需人工登录、人工审核 | failed + manual_required |
| 网络/超时/后端瞬时错误 | failed + retryable |
| 提交了但拿不到回执（结果未知） | failed + manual_required（铁律：绝不重试） |
| 付费墙、站点停服、资格不符 | skipped + skipReason |

## 租约纪律

- 认领后每 1-2 个条目 `lease_heartbeat` 一次；租约被拒（LEASE_NOT_ACTIVE）立即停止，重新 claim。
- 并发冲突（LEASE_CONFLICT）按 Retry-After 等待，不硬抢。

## 证据写法（evidence）

一句话中文，含两个事实：核验方式 + 关键内容。例："公开列表页已抓取，包含锚文本'X'与目标链接"。
禁止把"按钮变灰/跳转成功/表单清空"当作 live 证据——那些都只是 submitted 级别。
