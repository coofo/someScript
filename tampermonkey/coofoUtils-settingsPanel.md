# coofoUtils-settingsPanel

一个供油猴脚本引用的设置面板库。你把配置项 schema 传进去，它给你一个成品设置界面 —— 深浅色、抽屉动画、导入导出、可选悬浮按钮全部内置。

库只做 UI 和状态管理：**不读写任何持久化存储，也不注册任何全局入口**。配置存哪里由你通过 `storage` 适配器注入；面板怎么唤起（菜单项、快捷键、页面按钮、自动打开）由你自己决定，调 `panel.open()` 即可。

**这是库，不是可安装的用户脚本。** `gm-settings-panel.js` 没有 `==UserScript==` 头，它托管在 CDN 上，由你自己的油猴脚本用 `@require` 引入。

## 文件说明

| 文件 | 用途 |
| --- | --- |
| `gm-settings-panel.js` | **库本体**，直接传到 CDN 或打进包里 |
| `usage-example.user.js` | 引用方示例，展示一个真实脚本如何接入 |
| `demo.html` | 浏览器预览，`<script>` 引入即可看效果 |
| `README.md` | 本文档 |

## 引用方接入

三步。

**1. 脚本头部加 `@require`**

```js
// @require https://cdn.jsdelivr.net/gh/USER/REPO@v4.1.0/gm-settings-panel.js
```

**2. 决定存哪儿**

库不碰存储，所以持久化要你自己做。写一个三方法的适配器就行 —— 用 GM 存储、localStorage、IndexedDB 或自己的后端都可以：

```js
const NS = 'my-script.';

const store = {
  get(k, fallback) {
    const v = GM_getValue(NS + k, undefined);
    return v === undefined ? fallback : v;
  },
  set(k, v) { GM_setValue(NS + k, v); },
  del(k) { GM_deleteValue(NS + k); }
};
```

用 GM 存储的话在 header 声明权限：

```js
// @grant GM_getValue
// @grant GM_setValue
// @grant GM_deleteValue
```

但这是**你的脚本**要的权限，不是库要的。库自己没有 header，不申请任何权限，也不调用任何 `GM_*` 函数。

**3. 建面板**

```js
const panel = coofoUtils.settingsPanel.create({
  title: '脚本设置',
  storage: store,              // 注入上一步的适配器；不传则纯内存
  schema: [
    {
      tab: '基础',
      group: '常规',
      items: [
        { key: 'enabled', type: 'switch', label: '启用脚本', default: true },
        { key: 'delay',   type: 'range',  label: '请求间隔',
          min: 0, max: 3000, step: 100, unit: ' ms', default: 800 }
      ]
    }
  ]
});

panel.get('delay');   // 800
```

**4. 自己决定入口**

库不会替你注册菜单、也不会监听快捷键 —— 什么时候打开由你说了算：

```js
// 油猴菜单项
if (typeof GM_registerMenuCommand === 'function') {
  GM_registerMenuCommand('⚙ 打开设置', () => panel.toggle());
}

// 快捷键：库只提供纯函数判断，监听器归你
document.addEventListener('keydown', e => {
  if (coofoUtils.settingsPanel.matchesHotkey(e, 'alt+s')) {
    e.preventDefault();
    panel.toggle();
  }
}, true);

// 或者按页面条件直接开
if (location.pathname === '/settings') panel.open();
```

**唯一入口是 `window.coofoUtils.settingsPanel`。** 库不再向 `window` 抛 `SettingsPanel` / `GMSP` 这类裸全局变量，所有东西都收在一个命名空间下。`coofoUtils` 是共享的 —— 你自己的工具函数也可以挂在同一层，库只写 `settingsPanel` 这一个键，不会动其他键：

```js
coofoUtils.logger   = (...a) => console.log('[my-script]', ...a);
coofoUtils.settingsPanel.create({ ... });
```

## 入口

库对页面的唯一侵入是 `panel.open()` 时插入的那棵 shadow DOM。除此之外它不注册任何东西：

| 你可能想要 | 谁来做 |
| --- | --- |
| 油猴菜单项 | 你的脚本调 `GM_registerMenuCommand` |
| 快捷键 | 你的脚本挂 `keydown` + `coofoUtils.settingsPanel.matchesHotkey()` |
| 页面上的按钮 / 链接 | 你的脚本自己创建 |
| 打开后立即弹面板 | `create({ entry: { autoOpen: true } })` |
| 右下角悬浮按钮 | `create({ entry: { button: true } })` —— 见下节 |

**为什么连快捷键都不代管。** 全局 `keydown` 监听器会跟页面自身的快捷键打架，什么时候挂、什么时候摘、`capture` 还是 `bubble`，只有写脚本的人知道。库只提供 `matchesHotkey(event, 'alt+s')` 这个纯函数，判断逻辑统一，绑定时机交给你。好处是改键能立刻生效 —— 监听器里现读 `panel.get('hotkey')` 就行。

如果你是从 v2 升级上来的：`entry.menu` 和 `entry.hotkey` 已被移除，传了会 `console.warn` 提示，但不会再有任何效果。

如果你是从 v3 升级到 v4：唯一的破坏性变更是入口路径 —— `window.SettingsPanel` 和 `window.GMSP` 已移除，统一改为 `window.coofoUtils.settingsPanel`。全局替换一次即可，API 本身没动。

## 存储

库里有三种模式，由 `storage` 参数决定：

| `storage` | 行为 | 适用 |
| --- | --- | --- |
| 不传 / `null` | 纯内存，进程内有效，刷新即失 | 临时面板、多脚本隔离场景 |
| `'local'` | 用内置的 localStorage 适配器，`namespace` 作键前缀 | 普通网页、不需要跨站点同步 |
| 适配器对象 | 完全由你实现 `get` / `set` / `del` | 油猴 GM 存储、后端、IndexedDB |

适配器接口：

```js
{
  get(key, fallback) { /* 返回已存的值，没有则返回 fallback */ },
  set(key, value)    { /* 写入 */ },
  del(key)           { /* 删除，reset() 和清除配置时会调用 */ }
}
```

`get` 和 `set` 必须都是函数，只给 `get` 会被判定为无效适配器并回退到内存。

当前用的是哪种模式，看实例属性：

```js
panel.storage;   // 'memory' | 'local' | 'custom'
```

**写入有 150ms 合并防抖** —— 拖动滑块不会每个像素都调一次你的 `set`（GM 存储是同步 IO，拖起来会卡）。关闭面板或 `destroy()` 时会立即 flush，不会丢数据。

## 发布这个库

库文件是普通 JS，托管在哪都能被 `@require`：

**jsDelivr（推荐）** —— GitHub 仓库打 tag 后自动可用，自带 CDN 和多地加速：

```
https://cdn.jsdelivr.net/gh/USER/REPO@v4.1.0/gm-settings-panel.js
```

tag 可以省略换 `@latest`，但**引用方应锁版本**，否则你改库会悄悄影响所有下游脚本。

**GitHub Raw** —— 可用但没有缓存优化，国内访问不稳。

**GreasyFork** —— 发布成一个 `@grant none` 的空壳脚本，用它的 `update.greasyfork.org/scripts/ID/name.js` 地址做 `@require`。好处是版本管理和国内速度都不错，代价是多一层壳。

更新库时建议遵循语义化版本：破坏性改动升 major，加控件类型升 minor，修 bug 升 patch。

## create(config) 参数

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `schema` | Array | **必填** | 配置项定义 |
| `title` | string | `'设置'` | 面板标题 |
| `subtitle` | string | `''` | 标题下小字，适合放版本号 |
| `namespace` | string | `'sp:'` | 仅当 `storage: 'local'` 时作键前缀 |
| `storage` | object \| string | `null` | 存储适配器；不传为纯内存，`'local'` 用内置实现 |
| `width` | number | `400` | 抽屉宽度 px |
| `resettable` | boolean | `true` | 是否显示「恢复默认」 |
| `dismissible` | boolean | `true` | 是否允许点遮罩关闭 |
| `appearance` | function \| object | `null` | 主题/强调色映射 |
| `entry` | object | `{}` | `{ button, autoOpen }`，只管面板自身 UI，不含菜单/快捷键 |
| `actions` | object | `{}` | 自定义动作，可覆盖内置 |
| `onChange` | function | `null` | `(key, value, all) => {}`，值变更时触发 |
| `onClose` | function | `null` | `(reason, all) => {}`，面板关闭时触发，见「关闭事件」 |
| `labels` | object | `{reset, close}` | 底部按钮文案 |

`create()` 也接受直接传 schema 数组，等价于 `{ schema: 数组 }`。

`entry.autoOpen: true` 会在创建后立即打开；其余入口方式见上一节。

## 悬浮入口

`entry.button` 控制页面上那个圆形的打开按钮，**默认不显示** —— 只有你显式开启，库才会往页面里插东西。

```js
entry: {
  button: true          // 全默认：右下角、44px、sliders 图标
}
```

需要细调时传对象：

```js
entry: {
  button: {
    position: 'bottom-right',  // bottom-right | bottom-left | top-right | top-left（也接受 br/bl/tr/tl）
    offset: 24,                // 距屏幕边缘 px
    size: 44,                  // 直径 px
    icon: 'sliders',           // sliders | dots | gear | 自定义 SVG 字符串
    label: '打开设置',          // aria-label，给读屏用
    color: '#E24B4A'           // 可选，覆盖底色
  }
}
```

行为要点：

- `button: false` 或省略 → 不渲染按钮，面板保持懒构建，页面上零节点
- `button: true` 或对象 → 创建实例时就构建 DOM，按钮立刻可见
- 按钮和面板在同一个 shadow root 里，不受页面 CSS 影响；面板打开后会被遮罩盖住，点不到
- 支持键盘操作：Tab 聚焦，Enter / Space 触发
- 传入的 `icon` 若以 `<` 开头，会当作原始 SVG 直接插入（记得带 `viewBox`）

按钮用的是 `--fg` 前景色，不会跟随 `--accent` 变化。想让它跟强调色走，显式传 `color`。

## schema 结构

三层嵌套：`标签页 → 分组 → 配置项`。

```js
[
  {
    tab: '基础',      // 同名归到同一标签页
    group: '常规',    // 相邻同名自动合并成一个分组标题
    items: [ /* 配置项 */ ]
  }
]
```

只有一个标签页时标签栏自动隐藏，直接单列展示。

配置项通用字段：`key`（唯一标识兼存储键）、`type`、`label`、`desc`（可选灰色说明）、`default`、`doc`（可选折叠说明，见下一节）。

| type | 专属字段 | 用途 |
| --- | --- | --- |
| `switch` | 无 | 开关、布尔值 |
| `range` | `min` `max` `step` `unit` | 数值、阈值、间隔 |
| `select` | `options`（字符串数组） | 互斥选项 |
| `text` | `placeholder` | 短文本、快捷键、正则 |
| `textarea` | `rows` `placeholder` | 域名列表、选择器 |
| `action` | `buttons`（动作名数组） | 按钮 |
| `doc` | `md` `title` `collapsed` | 纯说明块，不参与取值 |

## 富文本说明

配置一旦复杂 —— 域名匹配规则、模板语法、正则写法 —— 一行 `desc` 说不清，全塞进面板又太吵。库里给了三档密度，按内容体量挑：

| 你想表达 | 怎么写 | 面板里的样子 |
| --- | --- | --- |
| 一句话提示 | `desc: '关闭后恢复原始行为'` | 标签下方一行灰字，常驻 |
| 某个配置项怎么填 | `doc: '...'` | 该控件下方一条「用法说明」，点击展开 |
| 一整组配置的规则 | `{ type: 'doc', md: '...' }` | 占据整行的说明块，默认展开 |

```js
{
  tab: '高级',
  group: '匹配规则',
  items: [
    // 整组通用规则：放最前面，一次讲清
    { type: 'doc', title: '规则写法', md: [
      '**三处规则都按行解析**，命中任意一条即生效。',
      '',
      '| 写法 | 含义 |',
      '|---|---|',
      '| `example.com` | 精确匹配该域名 |',
      '| `*.foo.cn` | 该域名及全部子域 |'
    ].join('\n') },

    // 单个配置项的补充说明：折叠，不占常驻空间
    { key: 'exclude', type: 'textarea', label: '排除域名',
      desc: '每行一个，支持通配符',
      doc: '排除优先于包含，被排除的域名不会执行任何逻辑。\n\n```\nexample.com\n*.foo.cn\n```' }
  ]
}
```

### 说明里能写什么

不是完整 Markdown，只保留了说明文档真正用得上的几种：

| 写法 | 效果 |
| --- | --- |
| `## 小标题` | 段内标题（`#` 到 `####`，字号递减） |
| 空行 | 分段 |
| `- 项` / `1. 项` | 无序 / 有序列表 |
| `\| a \| b \|` 加一行 `\|---\|---\|` | 表格，首行为表头 |
| `> 文字` | 提示块，左侧强调色竖线 |
| 三个反引号围栏 | 代码块，内部不再解析 |
| `**粗体**` | 强调（字重 500 + 主文字色） |
| 单反引号 | 行内代码，等宽字体 |

### 窄面板里的表格

400px 抽屉装不下宽表格，库里分两种情况处理：

- **两列表**：正常折行，正好放得下，适合「写法 → 含义」这种对照
- **三列及以上**：单元格强制不折行，外层横向滚动，宁可划一下也不要把 `example.com` 拆成两行

表格仍然受宽度限制。超过 4 列建议拆成多个两列表，或者干脆放进 `entry.button: false` 之外的地方 —— 面板不是文档站。

### 折叠状态与安全

- `docOpen: true` 让某条说明默认展开；`docLabel: '怎么填'` 改展开条的文字
- `{ type: 'doc', collapsed: true }` 让整块也变成可折叠的
- `doc` 项不参与 `get()` / `getAll()`，也不写存储
- **文案先整体转义再解析结构**，所以里面写 `<div>` 只会显示成文字，不存在注入风险
- 反过来也意味着不支持任意 HTML：想放按钮、链接跳转，请走 `actions` 或 `desc`

## 动作按钮

```js
{ key: 'io', type: 'action', buttons: ['export', 'import'] }
{ key: 'clear', type: 'action', buttons: ['reset'] }
```

内置三个：`export`（导出 JSON 到剪贴板）、`import`（粘贴 JSON 导入）、`reset`（二次确认后清空）。单个 `danger` 样式的动作自动渲染成红框危险区，多个动作渲染成并排按钮行。

自定义动作：

```js
coofoUtils.settingsPanel.create({
  // ...
  actions: {
    clearCache: {
      label: '清除缓存',
      desc: '清空本地接口缓存',
      style: 'danger',
      buttonText: '清除',
      confirm: '确定清除？',
      run(panel) {
        localStorage.clear();
        panel.toast('已清除');
      }
    }
  }
});
```

`run` 收到面板实例，可以调 `panel.reset()`、`panel.toast()` 等。同名动作会覆盖内置实现。

## 外观映射

库内置深浅两套配色和 `--accent` 变量，但**不知道怎么从你的配置值推导出来** —— 所以用 `appearance` 对接：

```js
appearance: values => ({
  accent: { 蓝: '#378ADD', 绿: '#1D9E75' }[values.accent] || '#378ADD',
  dark: values.theme   // 支持 true/false、'dark'/'light'、'深色'/'浅色'、'跟随系统'/'auto'
})
```

每次配置变更后自动重算，不用手动调用。

不传 `appearance` 时，库只会把形如 `#`/`rgb`/`hsl` 的值当颜色用。**如果你用中文枚举做强调色，必须传 `appearance` 映射**，否则颜色不生效。

## 实例 API

| 方法 | 说明 |
| --- | --- |
| `get(key)` | 取单个值 |
| `getAll()` | 取全部值的浅拷贝 |
| `set(key, val)` | 写入并同步 UI |
| `setAll(obj, opts)` | **整体写入**，返回发生变化的键数组 |
| `reset()` | 恢复全部默认值（逐项触发 onChange） |
| `import(jsonString)` | 导入配置，返回 boolean |
| `onChange(fn)` | 追加值变更监听，返回取消订阅函数 |
| `onClose(fn)` | 追加关闭监听 `fn(reason, all)`，返回取消订阅函数 |
| `open()` / `close()` / `toggle()` | 打开 / 关闭 / 切换（关闭时立即落盘，并触发 `onClose`） |
| `refresh()` | 按当前 state 重刷所有控件 |
| `toast(msg)` | 底部提示，1.6 秒消失 |
| `destroy()` | 移除 DOM 与全部事件监听 |
| `element` | shadow root，未打开时为 `null` |
| `isOpen` | 是否打开 |
| `storage` | 当前存储类型：`'memory'` / `'local'` / `'custom'` |

### 批量读写

`getAll()` 拿快照，`setAll(obj)` 一次写回：

```js
const snapshot = panel.getAll();      // { enabled: true, delay: 800, theme: '深色' }

panel.setAll({ enabled: false, delay: 1200 });

panel.setAll(remoteConfig, { silent: true });    // 同步远端时不触发 onChange
panel.setAll(saved, { replace: true });          // 未提供的键回到默认值
```

返回**实际变化的键数组**，一项没变就是 `[]`。几个约定：

- 只处理 schema 里存在的键，多出来的键忽略，不会污染 `state`
- 值没变化的键不触发 `onChange`
- 所有变更合并成一次存储写入，不会逐键刷（拖动滑块那种高频场景同理）
- `opts.silent` 跳过 `onChange`；`opts.replace` 是整体替换语义，没传的键重置为默认值
- `import(json)` 就是 `setAll(JSON.parse(json))` 的包装，区别只在于入参是字符串、返回值是 boolean

写入时的类型收敛也统一在这里做，所以从 JSON、URL 参数、后端拉回来的值不用自己洗：

| 情况 | 处理 |
| --- | --- |
| `range` 超出 `min`/`max` | 夹到边界值 |
| `range` 收到非数字 | 回落到 `default` |
| `switch` 收到 `"false"` / `"0"` / `""` | 视为 `false`（其它字符串视为 `true`） |

## 关闭事件

底部「保存并关闭」不是一个需要你去监听的 DOM 按钮 —— 库提供了 `onClose`，`fn(reason, all)`：

| reason | 触发场景 |
| --- | --- |
| `'confirm'` | 点底部「保存并关闭」 |
| `'dismiss'` | 点头部 × / 按 Esc / 点遮罩 |
| `'api'` | 代码里调 `panel.close()` 或 `toggle()` 收起 |

```js
const panel = coofoUtils.settingsPanel.create({
  schema,
  onClose(reason, all) {
    if (reason !== 'confirm') return;   // 只有「我改完了」才重算
    applySettings(all);
  }
});

// 也可以后加监听，返回退订函数
const off = panel.onClose(r => console.log('closed:', r));
```

几条约定：

- **只在「打开 → 关闭」时通知一次**，重复 `close()` 不会重复触发；`destroy()` 不算关闭，不触发
- **先落盘再通知**：回调执行时适配器里已是最新值，`all` 也是最新快照
- **回调抛错不影响关闭**，错误打到 console，后面的监听继续执行
- 代码里想模拟「用户确认」，传参即可：`panel.close('confirm')`；不传默认 `'api'`

**为什么要区分 reason。** 这个按钮叫「保存并关闭」，但库是即时保存的 —— 点它和按 Esc 在存储上没有任何区别，区别只在意图：`'confirm'` 是「我改完了」，`'dismiss'` 是「先收起，回头再看」。做「改完重算页面 / 重新请求数据」这类一次性动作时，只认 `'confirm'` 才对；否则用户随手按个 Esc 也会触发一次重算。

**和 `onChange` 怎么选。** `onChange` 是逐次变更（拖滑块每个刻度都会来一次），适合做实时预览；`onClose` 是一次性的完成信号，适合做「确认后重跑整个流程」。两个都注册也不冲突。

静态成员（挂在 `coofoUtils.settingsPanel` 上）：

| 成员 | 说明 |
| --- | --- |
| `version` | 库版本号 |
| `create(config \| schema)` | 创建实例，可直接传 schema 数组 |
| `matchesHotkey(event, 'alt+s')` | 快捷键判断，纯函数，支持 `alt` / `ctrl` / `shift` / `meta` |
| `env()` | `{ sandboxed, version }`，排查沙箱问题用 |
| `adapters.memory()` / `adapters.local(ns)` | 内置适配器，也可以拿出来自己用 |

`onChange` 支持多监听：

```js
const off = panel.onChange((key, val, all) => { /* ... */ });
off();
```

## 多个脚本共用这个库

每个脚本在各自的沙箱里加载库，拿到的是**独立实例**，彼此的 state、DOM 完全隔离 —— 这是设计使然，不会被互相影响。

存储更是天然隔离：每个脚本注入自己的适配器，键前缀自己定，库不参与。想让两个脚本读写同一份配置，让它们的适配器指向同一个命名空间即可（比如都用 `GM_getValue('cfg.' + key)`）。

**命名空间是共享的，键不是。** `coofoUtils` 这个名字在页面上下文里只有一份（各脚本都往 `unsafeWindow.coofoUtils` 上挂），但 `settingsPanel` 这个键会被后加载的那份库覆盖 —— 版本号相同就无所谓；不同版本共存时，页面 JS 调到的可能是较旧或较新的那份。各脚本内部拿自己的沙箱 `window.coofoUtils.settingsPanel`，互不影响。

想彻底避开这个：给不同版本的库换命名空间（比如 `coofoUtils.settingsPanelV4`），或者干脆内联。

## 设计说明

**右侧抽屉而非居中弹窗。** 油猴脚本服务于页面操作，居中模态框会把整页压暗、挡住内容，用户调完参数还得回想刚才页面上是什么样。抽屉只占 400px，左侧原文照常可见。

**Shadow DOM 隔离。** 面板挂在独立 shadow root 里，宿主页面再野蛮的 CSS（`* { margin: 0 }`、全局 `input` 样式、`!important`）都污染不到它。这是油猴脚本最常踩的坑。

**即时保存，没有独立「保存」按钮。** 每次变更立刻落盘，底部「保存并关闭」只是「关闭」的语义包装。用户随手改完直接 Esc 也不会丢配置。

**存储外置。** 库不引用任何存储 API，连 `localStorage` 都要显式选。好处是宿主脚本不用为库的权限买单，也不需要适配各种 UserScript 管理器的差异（Tampermonkey / Violentmonkey / Userscripts 的 GM_* 签名并不完全一致）。

**入口外置。** 库不注册菜单、不挂全局快捷键，只提供 `open()` / `toggle()` 和 `matchesHotkey()` 判断函数。全局副作用越少，接入方越不用担心自己的键位、页面事件被库抢先处理。

**只占一个命名空间键。** 库往 `window.coofoUtils` 上写 `settingsPanel` 一个键，不往 `window` 顶层抛 `SettingsPanel` / `GMSP` 这类裸变量。一个页面常常装十几个脚本，顶层变量名撞车的概率远高于想象（`GMSP` 这种四字母缩写尤其危险）；收进命名空间后，冲突面从「全局」缩到「单个键」，而且已有 `coofoUtils` 时是**复用而不是覆盖**。

**懒构建。** 不调用 `open()` 就不往页面插任何节点，创建实例只有 schema 解析的几十毫秒开销。

**写存储做了 150ms 合并防抖。** 拖动滑块不会每个像素写一次适配器的 `set`（GM 存储是同步 IO，拖起来会卡）。关闭面板或 `destroy()` 时立即 flush，不丢数据。

**标签页控制面板长度。** 配置超过 8 个就该分页，单列长滚动在 400px 宽的抽屉里体验很差。

**说明不常驻。** 复杂配置的用法默认折叠在「用法说明」里，面板长度只跟配置数量相关，不跟文档字数相关。需要一眼看到的才写进 `desc`，剩下的按需展开。

## 常见改造

**移动端底部抽屉：**

```css
.panel {
  top: auto; bottom: 0; left: 0; right: 0;
  width: 100% !important; height: 78vh;
  border-radius: var(--radius) var(--radius) 0 0;
  border-left: none;
  border-top: .5px solid var(--line);
  transform: translateY(102%);
}
.root.open .panel { transform: translateY(0); }
```

**换一套配色：** 覆盖 `.root` 上的 CSS 变量，或整体替换库里的 `CSS` 常量。

**加新控件类型：** 在 `renderItem()` 的 `switch` 里加 `case` 返回带 `data-key` 的 HTML，再到 `bind()` 的 `input`/`change` 里处理取值，最后在 `coerce()` 补类型转换。三处都改就完整了。

## 常见问题

**面板不出现。** 确认 `panel.open()` 被调用（库不会自动插 DOM，除非开了 `entry.button`）。

**菜单项没出现。** 菜单是**你的脚本**注册的，库不管。检查 `@grant GM_registerMenuCommand` 有没有写、`GM_registerMenuCommand(...)` 有没有被执行到。

**快捷键没反应。** 同样由你的脚本挂监听：确认 `coofoUtils.settingsPanel.matchesHotkey(e, 'alt+s')` 的参数是事件对象和字符串，且监听器没被别处 `stopPropagation` 掉（必要时用 capture 阶段）。

**`coofoUtils` 是 `undefined`。** 库没加载成功（`@require` 404），或你在库执行之前就读了它。`@require` 保证先于脚本主体执行，所以正常不会出现；用 `@require` + `@grant none` 时，注意 `@require` 会在页面上下文里执行，写入的是页面的 `window`。

**想知道用户什么时候改完了。** 用 `onClose`，`reason === 'confirm'` 就是点了「保存并关闭」。不要自己去 `panel.element.querySelector('[data-btn="__close"]').addEventListener` —— `element` 在首次 `open()` 之前是 `null`，而且 `destroy()` 后再 `open()` 会换一批新节点，挂上去的监听就失效了。

**改了配置刷新就丢。** 没传 `storage`，用的是纯内存模式。看看 `panel.storage` 是不是 `'memory'`，传个适配器就好。

**两个脚本的配置互相覆盖。** 适配器的键前缀撞了，各脚本用自己的命名空间。

**颜色不生效。** 强调色是中文枚举但没传 `appearance`。

**深色模式失效。** 「跟随系统」依赖 `matchMedia`，部分旧版油猴沙箱拿不到会退回浅色。

**`@require` 更新了代码但没生效。** CDN 或油猴有缓存，改 URL 版本号。
