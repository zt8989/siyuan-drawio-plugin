# E2E 探路 SOP（playwright-cli 前置步骤）

任何 `e2e/` 用例在固化前，必须按本 SOP 在真实思源环境中走通一遍。
前置：`pnpm dev` 后台运行，`pnpm make-link` 已做过一次。

## 0. 启动带 CDP 的思源并连接

```bash
/Applications/SiYuan.app/Contents/MacOS/SiYuan --workspace=/Users/zhouteng/siyuanTest --remote-debugging-port=9222
curl -s -m 5 http://127.0.0.1:9222/json/version  # 有输出即就绪
playwright-cli attach --cdp=http://127.0.0.1:9222
```

- 9222 被占用（如 Chrome）时：先 `lsof -i :9222` 确认归属再处理，不要误杀；或改用其他端口 + `CDP_URL` 环境变量覆盖（e2e 支持）。
- 主实例在跑时不要杀，用 `--workspace` 指向测试 workspace 另起实例。

## 1. 新建 drawio 页签

```bash
playwright-cli -s=default --raw eval "window.drawioPlugin ? (window.drawioPlugin.openNewCustomTab(), 'opening') : 'no-plugin'"
```

## 2. 新建绘图（创建流程）

按顺序点过三关，每步都先确认元素可见：

1. `.geDialog` 出现 → 点 `创建新绘图`（`.geBigButton` hasText）。
2. 点 `[title="空白框图"]`，再补一次 `dblclick`（单击有时只选中不确认）。
3. 等 `.geDialog` 消失且 `.geDiagramContainer` 可见，编辑器即就绪。

## 3. 定位可见 iframe（关键）

页签可能有多个（隐藏的旧页签仍在 DOM 里），**不要用 `:last-of-type`**，
一律选可见的：

```js
const f = [...document.querySelectorAll('iframe.siyuan-drawio-plugin__custom-tab')]
    .find(x => x.offsetParent !== null);
```

## 4. AI 聊天路径

1. 点 `[title="生成"]` 工具栏按钮打开聊天窗（后端下拉应显示 workspace 配置的模型）。
2. 填 `textarea[placeholder*="描述"]`，回车发送（`keyCode: 13` 的 keydown）。
3. 响应气泡定位：**不要用文档最后一个 `.geSidebar`**（侧栏复用该类，几百个命中）。
   按用户气泡（`style` 含 `40%` + prompt 文本）找其后的兄弟 `.geSidebar`。
4. 流式观测钩子（iframe window 上的 CustomEvent）：
   `drawio-ai-stream-thinking`（`detail.preview`）、`drawio-ai-stream-done`。

## 4b. 模板生成路径（与聊天窗并列的第二条路）

新建绘图模板对话框里的"生成"：先点 `.geTemplate[title="生成"]` 项，
描述输入框（`textarea[placeholder*="描述"]`）才会可见；填入后点"确定"，
结果挂为 `title=<描述>` 的模板项；选中它再点"创建"落图。
注意该按钮上游打的是 draw.io hosted 接口（自托管必 Unauthorized），
本仓库已用 client 补丁改道到自带模型，探路时断言无 Unauthorized。

## 5. 坑位清单（已踩过）

- iframe 里**没有** `editorUi` / `App.editorUi` 全局量，走真实 UI，不要依赖 JS 内省
 （`Editor`、`DRAWIO_CONFIG` 这两个只读检查可以用）。
- **不要覆盖** `window.siyuan.config.ai` 注入假 provider：会污染整个会话
  （模型下拉名都会变），且磁盘 key 是加密的、解密后的 key 不要打印/落盘。
  mock 需求一律用 `page.route('**/chat/completions')` 拦截，workspace 真配置保留。
- `route.fetch()` 默认 30s 等完整 body，**长流抓包必超时**且会连带搞挂页面请求；
  录真实流用脚本直调（同款 system prompt 取自 `Editor.aiGlobals.create`），见 `e2e/fixtures/`。
- `eval` 里的 `[...]` 会被 zsh 当 glob 吃掉，复杂脚本一律写文件走 `run-code --filename=`。
- 内存配置被改乱时，重载思源页面即从内核恢复（磁盘配置为准）。
- mock SSE 的 JSON 必须合法：`extractDelta` 会静默丢弃坏块，现象是"有思考、无正文、终态空泡"。
  手写 mock（如把 `}}]}` 写成 `}}}]}'`）先用 node 逐行 `JSON.parse` 校验，见 `e2e/ai-generate.test.ts` 固化前的校验做法。

## 6. 固化

跑通后写入 `e2e/`（`pnpm e2e`），真实流 fixture 放 `e2e/fixtures/`，
断言至少覆盖：请求 `stream:true`、思考事件、终态出图且无思考残留。
禁止跳过本 SOP 直接手写用例。
