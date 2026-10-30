# 下载进度悬浮窗（UI 层）

给下载型油猴脚本用的进度界面。**只做展示，不含下载逻辑**：你的下载器往 `coofoUtils.downloadUI.store` 里写状态，界面自己渲染。

| 文件 | 作用 |
|---|---|
| `download-ui.user.js` | UI 层本体，可直接装进油猴，对外暴露 `window.coofoUtils.downloadUI` |
| `preview.html` | 本地预览，双击打开就能看到 4 个模拟任务在跑 |
| `README.md` | 本文件 |

对应关系：**一个任务 = 若干个子任务**（代码里叫 `chunks`，界面文案不出现这个词），子任务全部完成后任务进入「打包中」，最终产出一个压缩包。

**存储策略：零存储。** 不读写 `GM_setValue`、不使用 `localStorage` / `sessionStorage`，任务列表只活在当前页面的内存里——只显示本页发起的任务，也只在本页执行，刷新即清空，标签页之间互不可见。

**代码风格**：声明一律使用 `const`（默认）/ `let`（需要重新赋值时），不使用 `var`；变量作用域显式收在块级，循环用 `let` 声明下标。语法基线是 ES2015（`Map` / `Set` / `const`），现代浏览器与油猴环境均支持。

**挂载点**：`window.coofoUtils.downloadUI`（v1.2.7 起）。脚本只往已有的 `coofoUtils` 命名空间里加 `downloadUI` 一个键，不会覆盖命名空间里的其它成员；`coofoUtils` 不存在时自动创建。早期版本的 `window.DownloadUI` 已不再输出。

---

## 一、接入方式

### 方式 A：作为依赖脚本安装（推荐）

1. 把 `download-ui.user.js` 装进油猴。它默认 `@match *://*/*`，但没有任务时不渲染任何东西（宿主节点 `display:none`），对页面零侵入。
2. 在你的下载脚本里取用：

```js
// 沙箱脚本取页面上的实例
const ui = (unsafeWindow.coofoUtils || {}).downloadUI || (window.coofoUtils || {}).downloadUI;
```

> 全局挂载点是 `window.coofoUtils.downloadUI`。`coofoUtils` 是共用命名空间：脚本只会写入 `downloadUI` 这一个键，页面上已有的其它成员（如 `coofoUtils.xxx`）原样保留、不会被覆盖。Tampermonkey 沙箱里两个脚本通过 `unsafeWindow` 互看；如果你自己的脚本是 `@grant none`，直接用 `window.coofoUtils.downloadUI` 即可。

### 方式 B：并进你的脚本

把 `download-ui.user.js` 的 IIFE 整体粘到脚本开头（去掉 `==UserScript==` 头注释）即可，之后同样用 `coofoUtils.downloadUI`。它不需要任何 `@grant` 权限，如果你的脚本有别的权限声明，直接并进去也不会冲突。

---

## 二、数据模型

```js
{
  id: 't_xxx',              // 唯一标识，缺省自动生成
  name: 'ubuntu.iso',       // 文件名；done 状态下若给了 output 则展示 output
  state: 'downloading',     // queued | downloading | paused | packaging | done | error
  etaMs: 125000,            // 剩余毫秒，由下载器算好传入；null 时不显示剩余时间
  output: 'ubuntu.zip',     // 打包产物名，仅 done 状态使用
  controls: { pause: false },// 可选：本任务禁用哪些按钮；false 表示整行只读，不给任何按钮
  chunks: [
    { start: 0, end: 65535, size: 65536, received: 32768, status: 'active' }
  ]
}
```

`chunks[].status`：`pending`（待下载）、`active`（下载中）、`done`、`error`。`size` 可省略，缺省按 `end - start + 1` 推算。

任务级进度**不单独存**，全部由子任务聚合：

- 百分比 = Σ`received` ÷ Σ`size`（字节数只在内部参与计算，界面不展示）
- `done` / `packaging` 状态强制 100%
- 失败的任务保留其余子任务成果，百分比停在已完成的位置
- 图例里的「已完成 / 进行中 / 待下载 / 失败」是子任务数量统计

状态流转由下载器驱动，UI 不擅自改状态：

```
queued → downloading → packaging → done
              ↑  ↓               ↘ error
            paused
```

---

## 三、API

下文统一用 `ui` 指代 `window.coofoUtils.downloadUI`（沙箱脚本里是 `unsafeWindow.coofoUtils.downloadUI`）。

```js
// 写入
ui.store.upsert(task)                  // 新增或按 id 合并，返回 taskId（首次调用即挂载界面）
ui.store.patch(id, { state, etaMs, output, name, message, chunks })
ui.store.chunk(taskId, chunkId, { received, status })   // chunkId 可传下标或 chunk.id
ui.store.tx(fn)                        // fn 收到一个 store 子集 { upsert, patch, chunk, remove }
                                       // 批量写入只触发一次渲染
// 删除
ui.store.remove(id)
ui.store.clearFinished()                // 清掉所有 done

// 读取
ui.store.get(id)
ui.store.list()                        // 任务数组（按加入顺序）
ui.store.stats(task)                   // { pct, done, active, pending, err, total, size, got }
ui.store.subscribe(fn)                 // 返回取消订阅函数；fn 在每次变化后被调用
ui.store.hydrate(tasks)                // 一次性覆盖式装载任务（纯内存，不读写存储）

// 交互
ui.onAction(fn)                        // 用户点击按钮：{ type, taskId }，返回取消订阅函数
ui.config({ pause: false })            // 改全局按钮开关，返回当前配置快照（不传参 = 只读取）
ui.expand() / ui.collapse()            // 展开面板 / 收成胶囊（默认就是收起态）
ui.mount() / ui.destroy()              // 手动挂载 / 卸载
ui.STATE                               // 状态常量
```

按钮 `type` 与出现时机：

| 任务状态 | 按钮 | 开关名 |
|---|---|---|
| `downloading` | 暂停、取消 | `pause`、`cancel` |
| `paused` | 继续、取消 | `resume`、`cancel` |
| `packaging` | 取消（此阶段不可暂停） | `cancel` |
| `error` | 重试、删除（删除同样是直接从列表移除 + 抛出 `remove`） | `retry`、`remove` |
| `done` | 删除（UI 直接从列表移除，同时抛出 `remove` 事件供你清理） | `remove` |
| `queued` | 取消 | `cancel` |

### UI_CONFIG：默认开关

脚本顶部（IIFE 内、工具函数之前）有一份唯一的全局配置，不配置时所有按钮都显示：

```js
// download-ui.user.js
const UI_CONFIG = {
  pause: true,    // 「暂停」，downloading 状态
  resume: true,   // 「继续」，paused 状态
  cancel: true,   // 「取消」，downloading / paused / packaging / queued
  retry: true,    // 「重试」，error 状态（行内一个 + 矩阵下方那个）
  remove: true    // 「删除」，done / error 状态
};
```

| 键 | 默认 | 对应按钮 | 出现的状态 |
|---|---|---|---|
| `pause` | `true` | 暂停 | `downloading` |
| `resume` | `true` | 继续 | `paused` |
| `cancel` | `true` | 取消 | `downloading`、`paused`、`packaging`、`queued` |
| `retry` | `true` | 重试 | `error` |
| `remove` | `true` | 删除 | `done`、`error` |

三种改法，任务级优先于全局：

```js
// 1. 直接改脚本顶部的默认值：适合"这个下载器天生不支持暂停/续传"
const UI_CONFIG = { pause: false, resume: false, cancel: true, retry: true, remove: true };

// 2. 运行时全局开关（推荐，可随时改）
ui.config({ pause: false, cancel: false });             // 只改传入的键，其余保持
ui.config();                                            // 不传参 = 读取当前配置

// 3. 单个任务覆盖
ui.store.patch(id, { controls: { pause: false } });     // 只禁这一个任务的暂停
ui.store.patch(id, { controls: false });                // 整行只读，一个按钮都不给
```

几点语义需要知道：

- `UI_CONFIG` 是 `const` 且只存在于脚本内部，**外部拿不到这个对象**。写 `ui.UI_CONFIG.pause = false` 不会生效，一律走 `ui.config({...})`
- `config()` 只认上表这 5 个键，多传的键会被忽略；值用 `!!` 归一化成布尔，`config({ pause: 0 })` 等同于关闭
- `config()` 返回的是当前配置的**副本**（快照），修改返回值不会影响内部状态
- 判定顺序：`task.controls`（对象按键、`false` 表示整行只读）→ `UI_CONFIG`。任一层为 `false`，该按钮就不渲染
- 被关掉的按钮**直接消失**，不置灰、不显示残缺边框；但右侧操作区（44px）**始终保留宽度**，所以进度条、矩阵、百分比的右边界在有无按钮时完全一致，不会因为按钮消失而突然拉宽
- 运行中改配置在当前帧生效，不会打断正在进行的任务

### 控制按钮开关（任务级）

键名与默认值见上一节的 `UI_CONFIG` 表。除了全局配置，还能按任务单独覆盖：

```js
ui.store.patch(id, { controls: { pause: false, retry: false } });  // 只禁这个任务的暂停与重试
ui.store.upsert({ id, name, controls: { cancel: false }, chunks }); // 建任务时直接带上
ui.store.patch(id, { controls: false });                            // 整行只读
ui.store.patch(id, { controls: null });                             // 撤销覆盖，回到全局配置
```

`controls` 是对象时按类型逐项判断，是 `false` 时整行只读，不传（或 `undefined`）表示本次不修改，传 `null` 才是清除已有覆盖、回到 `UI_CONFIG`。被关掉的按钮不会出现在行里（不是置灰），一个都不允许时该行只剩一条进度条；但右侧 44px 的操作区始终占位，因此不会出现“这行没按钮、进度条就比别人长一截”的情况。

`retry` 是唯一出现在两处的按钮：error 行右侧的操作按钮，以及展开后矩阵下方失败列表末尾的那个。两者共用同一开关；关闭后失败子任务的编号**仍然显示**（`5、6 失败`），只是没有重试入口。

界面只发事件，动作由你实现：

```js
ui.onAction(({ type, taskId }) => {
  const job = controller.get(taskId);
  switch (type) {
    case 'pause':  job.pause(); break;           // 停掉该任务的连接，保留 received
    case 'resume': job.resume(); break;          // 从 start + received 续传
    case 'cancel': job.cancel(); ui.store.remove(taskId); break;
    case 'retry':  job.retryFailedChunks(); break;// 只补拉 error 的子任务
    case 'remove': job.cleanup(); break;          // 行已从列表移除，这里做文件/状态清理
  }
});
```

`remove` 出现在两处：已完成的行（删掉成品记录）和失败的行（放弃这个任务）。两种情况下 UI 都先把行从列表移除，再抛出 `remove` 事件，所以你的 `cleanup()` 里既能删成品文件，也能删残留的子任务临时文件。

---

## 四、接到真实下载流程

```js
const ui = unsafeWindow.coofoUtils.downloadUI;
const CONCURRENCY = 6;

async function run(url, name, size, chunkCount) {
  const partSize = Math.ceil(size / chunkCount);
  const chunks = Array.from({ length: chunkCount }, (_, i) => ({
    start: i * partSize,
    end: Math.min(size - 1, (i + 1) * partSize - 1),
    status: 'pending',
    received: 0
  }));
  const id = ui.store.upsert({ name, state: 'downloading', chunks });

  const started = Date.now();
  let pulled = 0;
  const queue = chunks.slice();
  const buffers = new Array(chunks.length);

  async function worker() {
    while (queue.length) {
      const c = queue.shift();
      const i = chunks.indexOf(c);
      ui.store.chunk(id, i, { status: 'active' });

      const res = await fetch(url, { headers: { Range: `bytes=${c.start}-${c.end}` } });
      const reader = res.body.getReader();
      const buf = new Uint8Array(c.end - c.start + 1);
      let off = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf.set(value, off);
        off += value.length;
        ui.store.chunk(id, i, { received: off });
        pulled += value.length;
        if (pulled > 0) {
          const speed = pulled / (Date.now() - started);
          ui.store.patch(id, { etaMs: (size - pulled) / speed });
        }
      }

      buffers[i] = buf;
      ui.store.chunk(id, i, { status: 'done', received: c.size });
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // 子任务全部落盘 → 进入打包
  ui.store.patch(id, { state: 'packaging', etaMs: null });
  const blob = await zipAll(buffers, name);   // 你的打包实现
  ui.store.patch(id, { state: 'done', output: name.replace(/\.[^.]+$/, '') + '.zip' });
}
```

几个要点：

- `fetch` + `Range` 是子任务粒度的断点续传基础：暂停时保留 `received`，恢复时把请求范围改成 `start + received` 到 `end`
- 某个子任务失败只标红那一格，重试只补拉它，不要整任务重来
- 一个 tick 内会更新多个子任务，用 `ui.store.tx()` 包起来，避免重复渲染
- 打包阶段 `state: 'packaging'`，UI 走不确定进度条，只允许取消；打包完成后才切 `done` 并给出 `output`
- 剩余时间完全由你传的 `etaMs` 决定，UI 不做速度估算，也不展示速度

---

## 五、界面行为

**信息层级**（刻意做过减法）

- 任务行：类型徽标、文件名、`已完成数/总数`、剩余时间、一条进度条、百分比
- 面板不展示全局汇总进度，多条任务的总体情况由折叠胶囊上的百分比承担
- 不显示下载速度、不显示文件体积与已下载体积，文案里也不出现「分片」这类术语
- 四种状态用颜色区分：下载中蓝、打包中紫、已完成绿、失败红（失败行整行浅红底）

**分片矩阵**

- 展开任务后进入矩阵：固定 20 列，**一格 = 一个子任务**，无论 6 个还是 6000 个都不合并格子
- 格子颜色：已完成绿、下载中蓝、待下载灰、失败红；密度变化本身就是进度可视化
- 数量多时不由面板变高，而是矩阵区域内部滚动（`max-height: 205px`）
- 失败的子任务在矩阵下方单独列出编号并提供「重试」，最多列 12 个，其余以「等 N 个失败」概括；`retry` 开关关闭时只保留编号

**其他**

- **默认形态是收起的胶囊**：第一个任务写入时才出现，右下角一个小胶囊（环形进度 + 百分比 + 状态计数），点它展开成 404px 宽的面板，面板上的 `–` 再收回去
- 想改成默认展开：脚本顶部 `const DEFAULT_MINI = true` 改成 `false`，或在启动时调一次 `ui.expand()`
- 胶囊宽度按内容自适应（`width: max-content`），文案变长也不会换行或挤成两行；贴在屏幕右边缘时会按实际宽度重新计算左边距
- 拖动：标题栏和胶囊都可以拖，位移超过 3px 才判定为拖动（没动就是点击，胶囊照常展开）；拖过之后不再自动贴回右下角，本次会话内固定在你放的位置
- 折叠与展开时面板会重新夹回可视区——把胶囊拖到屏幕右边缘再展开，面板会向左收进屏内，不会有一半跑到屏幕外
- 位置 / 折叠状态 / 已展开的任务都只存在内存里，刷新后回到默认的右下角、收起态
- 刷新或关闭页面即清空任务列表，不存在"重载后接上上次进度"的语义，也就不会有假下载状态
- 完成与失败会弹轻量 toast（6 秒消失），只做提示，不带操作按钮；已完成任务在行内用「删除」清出列表
- 无任务时整个宿主节点隐藏，卸载干净

**渲染性能**

- 所有写入合并到一次 `requestAnimationFrame` 里重绘，一秒内写多少次都只排一次版
- 任务行复用 DOM，只更新变化的文本 / 宽度 / 颜色，不整块重建
- 矩阵按状态差分更新，只有状态变化的格子才会被写属性；首次构建用 `DocumentFragment` 一次性插入
- 矩阵懒构建：任务没展开时不生成任何格子

---

## 六、多页面 / 存储

**不做任何持久化，也不做跨页同步。** 每个页面各自持有一份独立的任务列表，互相看不见，也不会互相覆盖——因为根本没有共享的落点：

| 数据 | 存放位置 | 生命周期 |
|---|---|---|
| 任务列表 | 当前页面的 JS 内存 | 页面刷新 / 关闭即销毁 |
| 面板位置 / 折叠 / 展开项 | 当前页面的 JS 内存 | 同上，刷新回默认 |
| 操作按钮开关 | 脚本内的 `UI_CONFIG` | 随脚本实例，刷新回默认 |

这样做的取舍：

- **好处**：多开标签页各下一份文件，界面之间绝不串台；不会出现"A 页的进度被 B 页覆盖"或"本页显示了别页的任务、按钮点了没反应"这类问题；脚本也不需要任何油猴权限
- **代价**：刷新页面后任务列表是空的，历史记录不保留。如果你要"下载历史"，应该在**下载器一侧**持久化（比如把你自己的任务对象存 `GM_setValue`），需要时用 `ui.store.hydrate(tasks)` 灌回界面——`hydrate` 是纯内存操作，不碰存储，灌什么显示什么，状态不做任何改写

```js
// 想让某些任务在刷新后仍然显示，由你的下载器负责读取并恢复
const saved = JSON.parse(await getSavedTasks());   // 你自己决定存哪
ui.store.hydrate(saved);                            // 只装载，不写回
```

为什么不做跨页汇总：别的页面的任务在本页没有对应的下载器实例，按钮点了也执行不了。真需要「一个页面看全部」，属于另一套设计（只读汇总 + 命令转发通道），当前版本没做。

---

## 七、已知限制

- 打包阶段只有「进行中 / 完成」两态，没有打包百分比（zip 写入进度难以量化）
- 刷新页面后任务列表清空，也不保留下载历史（如需保留，由下载器侧持久化 + `hydrate` 恢复）
- 面板位置与折叠状态不做记忆，每次打开页面都回默认位置、默认收起
- 任务列表顺序是加入顺序，不提供手动排序 / 分组
- 子任务数量极大时（万级）矩阵滚动可行，但首次构建会有一次可感知的停顿
