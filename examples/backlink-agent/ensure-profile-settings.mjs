#!/usr/bin/env node
// 把 profile-settings.yml 的条目安装进目标 profile 的 cordis.patch.yml
// （网页设置页读写的持久层）。只追加 id 缺失的条目——已存在的条目属于
// 用户在设置页的编辑，绝不覆盖；要重新预置默认值，先在那边删掉该条目
// 再重跑本脚本。用法：
//   node examples/backlink-agent/ensure-profile-settings.mjs [profile名]
// profile 缺省为 web；无界面一次性运行前先对 headless 安装一次。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const sourcePath = join(here, 'profile-settings.yml')
const profile = process.argv[2] ?? 'web'
if (process.argv.length > 3 || profile.startsWith('-')) {
  console.error('用法: node ensure-profile-settings.mjs [profile名]（缺省 web）')
  process.exit(1)
}
const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const targetPath = join(home, 'profiles', profile, 'cordis.patch.yml')

// 与 profile 目录同源的模板头，新建文件时保留自述信息
const HEADER = `# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; \`!!js\` expressions allowed).
`

// 源文件按顶层列表项（列 0 的 “- ”）切块；条目间的注释跟随前一区块，
// YAML 注释位置不影响语义
function entryBlocks(text) {
  const lines = text.split('\n')
  const blocks = []
  let current = []
  for (const line of lines) {
    if (/^- /.test(line) && current.length > 0) {
      blocks.push(current.join('\n'))
      current = []
    }
    current.push(line)
  }
  if (current.some(line => line.trim().length > 0)) blocks.push(current.join('\n'))
  return blocks.map(block => block.replace(/^\n+/, '').trimEnd() + '\n')
    .filter(block => /^- id:/.test(block))
}

const blocks = entryBlocks(readFileSync(sourcePath, 'utf8'))
if (blocks.length === 0) {
  console.error(`ensure-profile-settings: ${sourcePath} 中没有可安装的条目`)
  process.exit(1)
}

const existing = existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : undefined
const missing = blocks.filter((block) => {
  const id = /^- id:\s*['"]?([\w.-]+)/.exec(block)?.[1]
  if (id === undefined) return false
  // 值锚定的存在性探测：目标文件里任何层级的同值 id: 行都算已安装
  // （三个目标 id 不与模型/子 agent 的 id 取值冲突）
  return !new RegExp(`^\\s*-?\\s*id:\\s*['"]?${id}['"]?\\s*$`, 'm').test(existing ?? '')
})
if (missing.length === 0) {
  console.log(`ensure-profile-settings: ${targetPath} 已包含全部条目，未改动。`)
  process.exit(0)
}

if (existing === undefined) {
  mkdirSync(dirname(targetPath), { recursive: true })
  writeFileSync(targetPath, HEADER + '\n' + missing.join('\n'))
} else {
  // 保持“文件恰好以一个换行结尾”的仓库规范
  const prefix = existing.endsWith('\n') ? existing : `${existing}\n`
  writeFileSync(targetPath, prefix + '\n' + missing.join('\n'))
}
const ids = missing.map(block => /^- id:\s*['"]?([\w.-]+)/.exec(block)?.[1]).join('、')
console.log(`ensure-profile-settings: 已安装 ${ids} → ${targetPath}`)
console.log('这些条目现在归网页设置页管理；修改默认值请先在设置页删除对应配置再重跑本脚本。')
