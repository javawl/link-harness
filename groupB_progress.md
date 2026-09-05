# 分组B 发布进度（批次343, leaseId=202, 剩余续跑用）

## 第二轮（续跑，2026-09-03下午，自12593起）
- 12593 anomalily.net — skipped"目标站已存在本站链接"（#comment-529791 已有链接，回写成功）
- 12596 jgo.podrb.pl — skipped（#comment-702 已有链接；回写ITEM_NOT_FOUND）
- 12599 travelboulder.com — submitted — #comment-5694047 待审（回写ITEM_NOT_FOUND）
- 12602 kannehmasons.com — skipped"评论区延迟加载探测后仍不存在"（过期活动页；回写ITEM_NOT_FOUND）
- 12605 7vallees.fr — skipped"目标站已存在本站链接"（#comment-50767；回写ITEM_NOT_FOUND）
- 12608 ndw.se — submitted — #comment-7212 待审（回写ITEM_NOT_FOUND）
- 12611 swampscottps.org — skipped"评论区延迟加载探测后仍不存在"（附件页；回写ITEM_NOT_FOUND）
- 12614 audio-technica.co.in — failed/manual_required — 404 页面已删除（已回写成功）

## 已完成（第一轮，13条）
- 12529 benzhiphop.com — live — #comment-920746（已回写 live）
- 12532 donateseva.com — failed/manual_required — GoDaddy 停放域名（已回写）
- 12535 free2.it — failed/manual_required — 评论已上线但表单无Website字段，无链接位（已回写）
- 12539 ncsota.org — failed/retryable — 评论POST 403 WAF（已回写）
- 12542 celahkotanews.com — live — #comment-99064（回写遇ITEM_NOT_FOUND，后端已由并行worker记录 live #comment-99063）
- 12545 aldridgeenterprisesllc.com — live — #comment-12285（后端已记录另一worker submitted #comment-12284）
- 12548 nepa.eesc.usp.br — 后端已被记录 skipped（本worker未处理）
- 12551 musicwatchinc.com — live — #comment-638945（回写ITEM_NOT_FOUND）
- 12554 katyaleonovich.com — failed/manual_required — wpsec CAPTCHA（回写ITEM_NOT_FOUND）
- 12557 sistemaregulatoriorrhh.usac.edu.gt — skipped — 已存在本站链接("Toby")（回写ITEM_NOT_FOUND）
- 12560 f-104.jp — skipped — 已存在本站链接("Toby")（已回写 skipped）
- 12563 eluxemagazine.com — live — #comment-582811（已回写 live）
- 12566 wjrfoundation.org — failed/retryable — Comment Submission Failure（已回写）
- 12569 872.cb8.myftpupload.com — failed/retryable — Comment Submission Failure（已回写）
- 12572 eventistrybyalecia.com — submitted — #comment-56788 待审（已回写 submitted）
- 12575 comunidadparquejacaranda.com — live — #comment-49419（回写ITEM_NOT_FOUND）
- 12578 propertymanagementmemphis.net — live — #comment-15911（回写ITEM_NOT_FOUND，页面已双评论）
- 12581 desiblitz.com — failed/manual_required — Cloudflare 挑战拦截 POST（回写ITEM_NOT_FOUND）
- 12584 manebaterias.com.br — submitted — ?unapproved=79792 待审（回写ITEM_NOT_FOUND）
- 12587 aspireonline.org — live — #comment-47414（回写ITEM_NOT_FOUND）
- 12590 store.harmonyofhardcore.nl — submitted — #comment-131415 待审（已回写 submitted）

统计（本worker实际处理21条）：live 9 / submitted 3 / skipped 2 / failed 7。

## 关键发现
1. 并行冲突：另一 worker（评论署名 "Toby"）与本分组条目重叠，先我1~2秒发布并抢注结果 → 我方 item_result 报 ITEM_NOT_FOUND。凡遇 ITEM_NOT_FOUND 视为后端已有记录，勿重复提交；提交前用 curl 查重 playzipgame 可降低双发。
2. 租约：lease_heartbeat 有效（lease 202, 已于 15:16Z 续期一次）；建议每条前 heartbeat。
3. 表单变体：多数标准WP(#author/#email/#url/#comment/#submit)；Elementor变体用 input[name=author/email/url]；WPR变体 #wpr-comment-form；iubenda cookie 横幅需先 .iubenda-cs-accept-btn。
4. GoDaddy系(myftpupload)常报 "Comment Submission Failure"；Cloudflare 站 curl 403 但浏览器可过，POST 仍可能被 JS 挑战卡住。
5. 批量勘察脚本：recon_groupB.sh → recon_groupB.txt（206条：curl状态/表单有无/查重）；form0 的85条需浏览器进阶探测（waitFor #comments/#respond、press End、点 Load comments、frame() 内查、兜底 URL#comments），均不成立才 skipped"评论区延迟加载探测后仍不存在"。

## 剩余队列（续跑，全部 pending，按序）
12593 anomalily.net …（列表见 recon_groupB.txt 与 grep 分组命令 NR%3==2）
完整清单命令：
grep -o '"id":[0-9]*,"sourceId":[0-9]*,"sourceName":"[^"]*","sourceUrl":"[^"]*"' /var/folders/l_/lj2pfc2d6gz99_wgmtz4yvmw0000gn/T/dsh-spill-ZtFdg3/session-a26c4ebadf19/ecdc0d98db7d-backlinks.txt | head -800 | awk 'NR%3==2'
从 12593 起继续（跳过上表已处理条目）。

## 第二轮后状态
- 第二轮小计（8条）：live 0 / submitted 2 / skipped 5 / failed 1；累计两组 29 条。

## 第三轮（重启，独占区间 12736–12943）
- 12736 不存在于批次（批次id稀疏）；区间实际条目 12737–12941。
- 12737 naughtysquirrelfarms.com — submitted — #comment-14735 待审（age-gate 需先点Yes；回写成功）
- 12740 otecseminare.cl — submitted — #comment-7097 待审（回写成功）
- 12743 pottery.salks.com — failed/manual_required — sgcaptcha Robot Challenge（回写成功）
- 12746 przedszkole.duszniki.pl — live — #comment-177370（回写成功）
- 12749 restosdestock.com — live — #comment-326549（回写成功）
- 12752 smedi.com.tn — live — #comment-620931（回写成功）

### 下一待处理条目 id：12755（http://voroshilovskiysud.ru/sudebnyj-skandal-s-glavoj-kompanii/ ，recon form0 需浏览器探测）
其后按序：12758, 12761, 12764(form0), 12767, 12770(form0), 12773(len0超时), 12776(len0), 12779, 12782, 12786, 12789(form0), 12792, 12795(form0), 12798, … 直至 12941。

第三轮小计：live 3 / submitted 2 / failed 1。累计：36/206。
效率要点：recon_groupB.txt 的 form1+p z0 条目可直接浏览器发布；len0=连接失败；sgcaptcha/RobotChallenge=manual_required。

## 第四轮（重启后，区间[12736,12943]准确执行，自12736起）
- 12736 millionairematchcom.com — skipped"评论区延迟加载探测后仍不存在"（回写成功）
- 12738 networkcomputersystem.com — submitted — #comment-384049 待审（回写成功）
- 12739 odontologia.clinicabazzoni.com.br — failed/retryable — 页面持续超时无法加载（回写成功）
- 12741 paulsbirds.nl — failed/retryable — POST 403（回写成功）
- 12742 pavone.vn — failed/retryable — 站点错误码不可达（回写成功）
- 12744 processuae.ae — failed/retryable — 评论端点404（回写成功）
- 12745 pronursestat.com — failed/retryable — 502（回写成功）
- 12747 purposeformen.com — failed/retryable — 连接失败（回写成功）
- 12748 quepasoenvillavo.com.co — failed/retryable — https端404（回写成功）
- 12750 rockbrotherspodcast.com — failed/retryable — 评论端点404（回写成功）
- 12751 schafe-niederberg.de — submitted — 提交成功疑似待审（回写成功）
- 12753 snapaysolutions.com — failed/manual_required — 表单无Website字段且POST 403（回写成功）
- 12754 soleimx.com — failed/retryable — 表单在HTML存在但浏览器不可见（回写成功）
- 12755 voroshilovskiysud.ru — skipped"评论区延迟加载探测后仍不存在"（回写成功）
- 12756 vorthy.net — failed/manual_required — 404（回写成功）
- 12757 abitareimmobiliare.net — failed/retryable — POST 403（回写成功）
- 12758 amandine-duval-energeticienne.fr — live — #comment-3701（回写成功）

第四轮小计（17条）：live 1 / submitted 2 / skipped 2 / failed 12。累计：53/206。

### 下一待处理条目 id：12759（http://www.drpetereley.com/2018/08/14/equity-as-lifestyle/）
其后按序：12760, 12761, 12762, 12763, 12764(form0), 12765, 12766, 12767, 12768, 12769, 12770(form0), 12771, 12772, 12773(len0), 12774, 12775, 12776(len0), 12777, 12778, 12779, 12780, 12781, 12782, 12783, 12784, 12786, 12787, 12788, 12789(form0), 12790, 12791, 12792, 12795(form0), 12798, … 直至 12941。
完整区间清单见 groupB_range.txt（199条，剔除已完成6条后剩193）。

## 第五轮（自12759起）
- 12759 drpetereley.com — submitted — #comment-492 待审（回写成功）
- 12760 fabiogomesmakeup.com — submitted — #comment-165518 待审（回写成功）
- 12761 fotografidimatrimonioroma.it — live — #comment-644183（回写成功）
- 12762 graham-reilly.com — failed/manual_required — 404（回写成功）
- 12763 housewarescharity.org — submitted — #comment-143694 待审（回写成功）
- 12764 magistrautama.co.id — submitted — #comment-24084 待审（回写成功）

第五轮小计（6条）：live 1 / submitted 4 / failed 1。累计：59/206。

### 下一待处理条目 id：12765（http://www.outbacktrashservices.com/gallery-post-format/）
其后按序：12766, 12767, 12768, 12769, 12770(form0), 12771, 12772, 12773(len0), 12774, 12775, 12776(len0), 12777, 12778, 12779, 12780, 12781, 12782, 12783, 12784, 12786, 12787, 12788, 12789(form0), 12790, 12791, 12792, 12795(form0), 12798, … 直至 12941。
