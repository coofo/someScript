// ==UserScript==
// @name         coofoUtils-settingsPanel
// @namespace    https://github.com/coofo/someScript
// @version      0.0.2
// @license      AGPL License
// @description  配置页面组件
// @author       coofo
// @updateURL    https://github.com/coofo/someScript/raw/main/tampermonkey/myrenta.user.js
// @downloadURL  https://github.com/coofo/someScript/raw/main/tampermonkey/myrenta.user.js
// @supportURL   https://github.com/coofo/someScript/issues
// ==/UserScript==
/**
 * gm-settings-panel.js — 油猴脚本设置面板库
 * v4.1.0 · MIT · 无外部依赖
 *
 * 这是一个纯 JS 库，不是可安装的用户脚本（没有 ==UserScript== 头）。
 * 其他油猴脚本通过 @require 引用它：
 *
 *   // @require https://cdn.jsdelivr.net/gh/USER/REPO@v4.1.0/gm-settings-panel.js
 *
 * 引用后唯一入口是 window.coofoUtils.settingsPanel：
 *
 *   const panel = coofoUtils.settingsPanel.create({
 *     schema: [...],
 *     storage: {                                  // 可选，不传则纯内存
 *       get: (k, d) => GM_getValue('cfg.' + k, d),
 *       set: (k, v) => GM_setValue('cfg.' + k, v),
 *       del: k => GM_deleteValue('cfg.' + k)
 *     }
 *   });
 *   panel.open();
 *
 * 库不再向 window 抛 SettingsPanel / GMSP 这类裸全局变量，只往 coofoUtils
 * 命名空间里挂一个 settingsPanel 键；已有的 coofoUtils 会被复用，不覆盖。
 *
 * 库只负责 UI 与状态：不读写任何持久化存储，也不注册任何全局入口
 * （不碰 GM_getValue / GM_setValue / GM_registerMenuCommand）。
 * 配置怎么存、面板怎么唤起，全部由引用方决定 —— 调 panel.open() 即可。
 *
 * 复杂的配置项可以在 item 上挂 doc: '...'（折叠说明），或用 { type: 'doc' }
 * 插入整块说明；支持段落 / 列表 / 表格 / 引用 / 代码块 / 粗体 / 行内代码，
 * 文案全程先转义再解析结构。
 *
 * 要做「用户改完了」这件事，用 onClose(reason, all) 而不是自己找按钮：
 *   reason = 'confirm' 点「保存并关闭」 | 'dismiss' × / Esc / 遮罩 | 'api' 代码调用
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
        return;
    }
    var lib = factory();

    /**
     * 统一挂到 coofoUtils 命名空间下：window.coofoUtils.settingsPanel
     *
     * 不向 window 直接抛裸变量，避免和其他脚本的同名全局冲突。
     * 已有的 coofoUtils 会被复用而不是覆盖 —— 多个脚本可以往同一个命名空间
     * 各挂各的键；只有它被非对象值（字符串/数字/布尔）占用时才跳过。
     */
    function mount(target) {
        if (!target) return;

        var ns;
        try { ns = target.coofoUtils; } catch (e) {
            console.warn('[coofoUtils.settingsPanel] 读取 window.coofoUtils 失败，已跳过挂载');
            return;
        }

        if (ns == null) {
            ns = {};
            try { target.coofoUtils = ns; } catch (e) { ns = null; }
            // 页面可能是 frozen / 被 defineProperty 锁死，赋值会静默失败
            if (!ns || target.coofoUtils !== ns) {
                console.warn('[coofoUtils.settingsPanel] 无法在 window 上创建 coofoUtils 命名空间，已跳过挂载');
                return;
            }
        } else if (typeof ns !== 'object' && typeof ns !== 'function') {
            console.warn('[coofoUtils.settingsPanel] window.coofoUtils 已被 ' +
                (typeof ns) + ' 占用，已跳过挂载');
            return;
        }

        try { ns.settingsPanel = lib; } catch (e) {}
        // 冻结 / 只读的命名空间在非严格模式下赋值会静默失败，这里回读确认
        if (ns.settingsPanel !== lib) {
            console.warn('[coofoUtils.settingsPanel] 挂载失败：window.coofoUtils 可能被冻结或只读');
        }
    }

    mount(root);
    // 同步到页面上下文，便于页面自身的 JS 或控制台调试
    if (typeof unsafeWindow !== 'undefined' && unsafeWindow !== root) mount(unsafeWindow);
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
    'use strict';

    var VERSION = '0.0.2';

    // ───────────────────────────────────────────────────────────
    // 样式：颜色全部走 CSS 变量，便于外部覆盖
    // ───────────────────────────────────────────────────────────
    var CSS = [
        ':host{all:initial}',
        '*{box-sizing:border-box;margin:0;padding:0}',
        '.root{--bg:#fff;--bg-2:#f6f7f9;--bg-3:#eceef2;--fg:#1a1a1a;--fg-2:#5f6470;--fg-3:#9aa0ac;',
        '--line:rgba(0,0,0,.1);--accent:#378ADD;--danger:#E24B4A;--danger-bg:#FCEBEB;--radius:14px;',
        'position:fixed;inset:0;z-index:2147483647;pointer-events:none;',
        'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}',
        '.root[data-theme="dark"]{--bg:#1c1c1e;--bg-2:#262628;--bg-3:#333336;--fg:#f2f2f4;',
        '--fg-2:#a8adb8;--fg-3:#71767f;--line:rgba(255,255,255,.12);--danger-bg:#3a1f1f}',

        '.mask{position:absolute;inset:0;background:rgba(0,0,0,.32);opacity:0;transition:opacity .2s;pointer-events:none}',
        '.panel{position:absolute;top:0;right:0;bottom:0;width:400px;max-width:100vw;background:var(--bg);color:var(--fg);',
        'display:flex;flex-direction:column;border-left:.5px solid var(--line);border-radius:var(--radius) 0 0 var(--radius);',
        'transform:translateX(102%);transition:transform .24s cubic-bezier(.32,.72,0,1);pointer-events:auto}',
        '.root.open .mask{opacity:1;pointer-events:auto}',
        '.root.open .panel{transform:translateX(0)}',

        '.head{padding:16px 18px 12px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}',
        '.title{font-size:15px;font-weight:500;letter-spacing:.01em}',
        '.sub{font-size:12px;color:var(--fg-3);margin-top:3px;line-height:1.4}',
        '.close{width:26px;height:26px;border-radius:7px;border:.5px solid var(--line);display:flex;align-items:center;',
        'justify-content:center;color:var(--fg-2);cursor:pointer;font-size:15px;line-height:1;flex:none;',
        'background:transparent;font-family:inherit}',
        '.close:hover{background:var(--bg-2);color:var(--fg)}',

        '.tabs{display:flex;gap:4px;padding:0 14px 8px;border-bottom:.5px solid var(--line)}',
        '.tab{padding:6px 11px;font-size:12px;border-radius:6px;cursor:pointer;color:var(--fg-2);user-select:none}',
        '.tab:hover{background:var(--bg-2)}',
        '.tab[data-on="1"]{background:var(--bg-3);color:var(--fg);font-weight:500}',

        '.body{flex:1;overflow-y:auto;padding:0 18px 12px;overscroll-behavior:contain}',
        '.body::-webkit-scrollbar{width:8px}',
        '.body::-webkit-scrollbar-thumb{background:var(--line);border-radius:4px}',

        '.group{font-size:11px;font-weight:500;color:var(--fg-3);letter-spacing:.05em;padding:18px 0 4px}',
        '.row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:10px 0}',
        '.txt{min-width:0}',
        '.lbl{font-size:13px;line-height:1.4}',
        '.dsc{font-size:12px;color:var(--fg-3);margin-top:2px;line-height:1.4}',

        '.sw{position:relative;width:38px;height:22px;border-radius:11px;background:var(--bg-3);cursor:pointer;',
        'flex:none;transition:background .18s}',
        '.sw::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;',
        'background:#fff;transition:transform .18s;box-shadow:0 1px 2px rgba(0,0,0,.22)}',
        '.sw[data-on="1"]{background:var(--accent)}',
        '.sw[data-on="1"]::after{transform:translateX(16px)}',

        '.block{padding:11px 0}',
        '.bhead{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px}',
        '.val{font-size:12px;color:var(--fg-2);font-variant-numeric:tabular-nums}',

        'input[type="range"]{width:100%;height:4px;-webkit-appearance:none;appearance:none;background:var(--bg-3);',
        'border-radius:2px;outline:none;cursor:pointer}',
        'input[type="range"]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;',
        'background:var(--bg);border:2px solid var(--accent);cursor:grab}',
        'input[type="range"]::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:var(--bg);',
        'border:2px solid var(--accent);cursor:grab}',

        'select,input[type="text"],textarea{font-family:inherit;font-size:12px;color:var(--fg);background:var(--bg-2);',
        'border:.5px solid var(--line);border-radius:7px;padding:6px 8px;outline:none;transition:border-color .15s}',
        'select{max-width:148px;cursor:pointer}',
        'input[type="text"]{width:108px;text-align:center}',
        'textarea{width:100%;resize:none;line-height:1.55}',
        'select:focus,input[type="text"]:focus,textarea:focus{border-color:var(--accent)}',

        '.field{padding:10px 0}',
        '.field .lbl{margin-bottom:6px}',

        // 条目容器：分隔线统一挂在这一层，方便在控件下方追加说明区
        '.item+.item{border-top:.5px solid var(--line)}',
        '.item-doc{border-top:none}',

        // 折叠说明
        '.help{margin:0 0 2px}',
        '.help-t{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--fg-2);cursor:pointer;',
        'padding:4px 0;user-select:none;outline:none;border-radius:4px}',
        '.help-t:hover{color:var(--fg)}',
        '.help-t:focus-visible{outline:1.5px solid var(--accent);outline-offset:2px}',
        '.help-t .caret{width:0;height:0;border-left:4px solid currentColor;border-top:3.5px solid transparent;',
        'border-bottom:3.5px solid transparent;transition:transform .15s;flex:none;transform-origin:1.5px 50%}',
        '.help[data-open="1"] .caret{transform:rotate(90deg)}',
        '.help-b{padding:2px 0 8px 10px;margin-left:2px;border-left:2px solid var(--bg-3)}',
        '.docblock{padding:12px 0 4px}',
        '.doc-title{font-size:12px;font-weight:500;margin-bottom:5px}',

        // 轻量 Markdown 排版
        '.md p{font-size:12px;line-height:1.65;color:var(--fg-2);margin:0 0 8px}',
        '.md>:last-child{margin-bottom:0}',
        '.md-h{font-weight:500;color:var(--fg);margin:9px 0 4px}',
        '.md-h1,.md-h2{font-size:13px}',
        '.md-h3,.md-h4{font-size:12px;color:var(--fg-2)}',
        '.md-h:first-child{margin-top:0}',
        '.md ul,.md ol{margin:0 0 8px;padding-left:16px}',
        '.md li{font-size:12px;line-height:1.6;color:var(--fg-2);margin-bottom:3px}',
        '.md li::marker{color:var(--fg-3)}',
        '.md strong{font-weight:500;color:var(--fg)}',
        '.md code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;background:var(--bg-3);',
        'padding:1px 4px;border-radius:4px;word-break:break-word}',
        '.md-pre{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;line-height:1.6;',
        'background:var(--bg-2);border:.5px solid var(--line);border-radius:7px;padding:8px 9px;',
        'overflow-x:auto;margin:0 0 8px;white-space:pre;color:var(--fg-2)}',
        '.md-pre code{background:none;padding:0;font-size:11px}',
        '.md-q{margin:0 0 8px;padding:6px 9px;border-left:2px solid var(--accent);background:var(--bg-2);',
        'border-radius:0 6px 6px 0;font-size:12px;line-height:1.6;color:var(--fg-2)}',
        '.md-tw{overflow-x:auto;margin:0 0 8px;border:.5px solid var(--line);border-radius:7px}',
        '.md table{border-collapse:collapse;width:100%;font-size:11.5px}',
        '.md th,.md td{text-align:left;padding:5px 8px;border-bottom:.5px solid var(--line);vertical-align:top;line-height:1.5}',
        '.md th{background:var(--bg-2);color:var(--fg-3);font-weight:500}',
        '.md tr:last-child td{border-bottom:none}',
        '.md td{color:var(--fg-2);word-break:break-word}',
        '.md-tw.md-wide table{width:auto;min-width:100%}',
        '.md-tw.md-wide th,.md-tw.md-wide td{white-space:nowrap}',
        '.md-tw.md-wide td{word-break:normal}',

        'button.btn{font-family:inherit;font-size:12px;color:var(--fg);background:transparent;border:.5px solid var(--line);',
        'border-radius:7px;padding:6px 10px;cursor:pointer;transition:background .12s}',
        'button.btn:hover{background:var(--bg-2)}',
        '.btns{display:flex;gap:8px}',
        '.btns button.btn{flex:1;padding:7px 0}',

        '.danger-box{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 11px;',
        'border:.5px solid rgba(226,75,74,.4);border-radius:8px;background:var(--danger-bg)}',
        '.danger-box .lbl{color:var(--danger);font-size:12px}',
        '.danger-box button.btn{color:var(--danger);border-color:rgba(226,75,74,.45)}',

        '.foot{padding:12px 18px;border-top:.5px solid var(--line);display:flex;gap:8px;background:var(--bg)}',
        '.foot button.btn{flex:1;padding:8px 0;font-size:13px}',
        'button.primary{flex:1;font-family:inherit;font-size:13px;cursor:pointer;background:var(--fg);color:var(--bg);',
        'border:.5px solid transparent;border-radius:7px;padding:8px 0}',
        'button.primary:hover{opacity:.88}',

        '.fab{position:fixed;display:flex;align-items:center;justify-content:center;border-radius:50%;',
        'background:var(--fg);color:var(--bg);cursor:pointer;pointer-events:auto;user-select:none;',
        'box-shadow:0 2px 10px rgba(0,0,0,.18);transition:transform .15s;z-index:1}',
        '.fab:hover{transform:scale(1.06)}',
        '.fab:active{transform:scale(.96)}',
        '.fab:focus-visible{outline:2px solid var(--accent);outline-offset:2px}',
        '.fab svg{display:block;width:45%;height:45%}',
        '.fab[data-pos="br"]{right:var(--fab-offset);bottom:var(--fab-offset)}',
        '.fab[data-pos="bl"]{left:var(--fab-offset);bottom:var(--fab-offset)}',
        '.fab[data-pos="tr"]{right:var(--fab-offset);top:var(--fab-offset)}',
        '.fab[data-pos="tl"]{left:var(--fab-offset);top:var(--fab-offset)}',

        '.toast{position:absolute;left:50%;bottom:74px;transform:translate(-50%,8px);background:var(--fg);color:var(--bg);',
        'font-size:12px;padding:7px 14px;border-radius:20px;opacity:0;transition:opacity .2s,transform .2s;',
        'pointer-events:none;white-space:nowrap}',
        '.toast.on{opacity:1;transform:translate(-50%,0)}'
    ].join('');

    // ───────────────────────────────────────────────────────────
    // 工具
    // ───────────────────────────────────────────────────────────
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    function isFn(v) { return typeof v === 'function'; }

    // ───────────────────────────────────────────────────────────
    // 轻量 Markdown
    // 只实现说明文档真正用得上的几种语法：段落、有序/无序列表、
    // 表格、引用、代码块、**粗体**、`行内代码`、# 小标题。
    // 全程先 esc 再做结构转换，所以文案里写 <div> 只会显示成文字。
    // ───────────────────────────────────────────────────────────
    function mdInline(s) {
        return esc(s)
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    }

    function mdTable(rows) {
        var head = rows[0] || [];
        var body = rows.slice(1);
        var cols = head.length;
        var html = '<div class="md-tw' + (cols >= 3 ? ' md-wide' : '') + '"><table><thead><tr>' +
            head.map(function (c) { return '<th>' + mdInline(c) + '</th>'; }).join('') +
            '</tr></thead>';
        if (body.length) {
            html += '<tbody>' + body.map(function (r) {
                var cells = '';
                for (var i = 0; i < cols; i++) cells += '<td>' + mdInline(r[i] == null ? '' : r[i]) + '</td>';
                return '<tr>' + cells + '</tr>';
            }).join('') + '</tbody>';
        }
        return html + '</table></div>';
    }

    function mdToHTML(src) {
        var lines = String(src == null ? '' : src).replace(/\r\n?/g, '\n').split('\n');
        var out = [];
        var para = [];
        var list = null;
        var table = null;

        function flushPara() {
            if (!para.length) return;
            out.push('<p>' + para.map(mdInline).join('<br>') + '</p>');
            para = [];
        }
        function flushList() {
            if (!list) return;
            out.push('<' + list.tag + '>' + list.items.map(function (t) {
                return '<li>' + mdInline(t) + '</li>';
            }).join('') + '</' + list.tag + '>');
            list = null;
        }
        function flushTable() {
            if (!table || !table.rows.length) { table = null; return; }
            out.push(mdTable(table.rows));
            table = null;
        }
        function flushAll() { flushPara(); flushList(); flushTable(); }

        var i = 0;
        while (i < lines.length) {
            var t = lines[i].trim();

            // 代码块：整段原样保留，不再解析内部语法
            if (t.indexOf('```') === 0) {
                flushAll();
                i++;
                var buf = [];
                while (i < lines.length && lines[i].trim().indexOf('```') !== 0) { buf.push(lines[i]); i++; }
                i++;
                out.push('<pre class="md-pre"><code>' + esc(buf.join('\n')) + '</code></pre>');
                continue;
            }

            if (!t) { flushAll(); i++; continue; }

            // 表格：以 | 开头的连续行，形如 | a | b |
            if (t.charAt(0) === '|') {
                flushPara(); flushList();
                table = table || { rows: [] };
                var cells = t.replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); });
                // |---|---| 这类对齐行不进表格
                if (!/^[\s:-]+$/.test(cells.join(''))) table.rows.push(cells);
                i++;
                continue;
            }
            flushTable();

            if (t.charAt(0) === '>') {
                flushPara(); flushList();
                out.push('<blockquote class="md-q">' + mdInline(t.replace(/^>\s?/, '')) + '</blockquote>');
                i++;
                continue;
            }

            var h = t.match(/^(#{1,4})\s+(.*)$/);
            if (h) {
                flushAll();
                out.push('<div class="md-h md-h' + h[1].length + '">' + mdInline(h[2]) + '</div>');
                i++;
                continue;
            }

            var ul = t.match(/^[-*+]\s+(.*)$/);
            if (ul) {
                flushPara();
                if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; }
                list.items.push(ul[1]);
                i++;
                continue;
            }

            var ol = t.match(/^\d+[.)]\s+(.*)$/);
            if (ol) {
                flushPara();
                if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] }; }
                list.items.push(ol[1]);
                i++;
                continue;
            }

            flushList();
            para.push(t);
            i++;
        }

        flushAll();
        return out.join('');
    }

    // ───────────────────────────────────────────────────────────
    // 存储适配器
    // ───────────────────────────────────────────────────────────
    // 默认存储：纯内存，进程内有效，刷新即失。
    // 持久化完全由调用方决定 —— 库不碰 GM_* 也不碰 localStorage。
    function memoryAdapter() {
        var mem = {};
        return {
            get: function (k, d) {
                return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : d;
            },
            set: function (k, v) { mem[k] = v; },
            del: function (k) { delete mem[k]; }
        };
    }

    // 便利适配器：需要 localStorage 时由调用方显式选用
    function localAdapter(ns) {
        return {
            get: function (k, d) {
                try {
                    var raw = localStorage.getItem(ns + k);
                    return raw === null ? d : JSON.parse(raw);
                } catch (e) { return d; }
            },
            set: function (k, v) {
                try { localStorage.setItem(ns + k, JSON.stringify(v)); } catch (e) {}
            },
            del: function (k) {
                try { localStorage.removeItem(ns + k); } catch (e) {}
            }
        };
    }

    function resolveStorage(opt, ns) {
        if (opt && isFn(opt.get) && isFn(opt.set)) return opt;
        if (opt === 'local') return localAdapter(ns || 'sp:');
        return memoryAdapter();
    }

    // ───────────────────────────────────────────────────────────
    // 快捷键匹配：'alt+s' / 'ctrl+shift+k'
    // 纯函数，不做任何绑定 —— 监听器由引用方自己挂
    // ───────────────────────────────────────────────────────────
    function parseHotkey(str) {
        if (!str) return null;
        var parts = String(str).toLowerCase().split('+');
        var key = parts.pop().trim();
        if (!key) return null;
        return {
            alt: parts.indexOf('alt') > -1,
            ctrl: parts.indexOf('ctrl') > -1 || parts.indexOf('control') > -1,
            shift: parts.indexOf('shift') > -1,
            meta: parts.indexOf('meta') > -1 || parts.indexOf('cmd') > -1,
            key: key
        };
    }

    function hotkeyMatch(e, hk) {
        if (!hk) return false;
        if (e.key.toLowerCase() !== hk.key) return false;
        if (hk.alt !== e.altKey) return false;
        if (hk.ctrl !== e.ctrlKey) return false;
        if (hk.shift !== e.shiftKey) return false;
        if (hk.meta !== e.metaKey) return false;
        return true;
    }

    /**
     * 供引用方使用的快捷键判断，例如：
     *   document.addEventListener('keydown', function (e) {
     *     if (coofoUtils.settingsPanel.matchesHotkey(e, 'alt+s')) { e.preventDefault(); panel.toggle(); }
     *   });
     * 库只提供判断，不注册任何监听器。
     */
    function matchesHotkey(e, str) {
        return hotkeyMatch(e, parseHotkey(str));
    }

    // ───────────────────────────────────────────────────────────
    // 内置动作：可被 config.actions 同名覆盖
    // ───────────────────────────────────────────────────────────
    function builtinActions() {
        return {
            export: {
                label: '导出配置',
                run: function (panel) {
                    var json = JSON.stringify(panel.getAll(), null, 2);
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(json).then(
                            function () { panel.toast('配置已复制到剪贴板'); },
                            function () { window.prompt('复制以下配置：', json); }
                        );
                    } else {
                        window.prompt('复制以下配置：', json);
                    }
                }
            },
            import: {
                label: '导入配置',
                run: function (panel) {
                    var raw = window.prompt('粘贴此前导出的配置 JSON：');
                    if (!raw) return;
                    var ok = panel.import(raw);
                    panel.toast(ok ? '导入成功' : 'JSON 格式有误');
                }
            },
            reset: {
                label: '清除全部配置',
                style: 'danger',
                confirm: '确定清除全部配置？此操作不可撤销。',
                run: function (panel) { panel.reset(); }
            }
        };
    }

    var uid = 0;

    // 悬浮入口图标预设，也支持直接传 SVG 字符串
    var ICONS = {
        sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
            '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="17" x2="20" y2="17"/>' +
            '<circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/></svg>',
        dots: '<svg viewBox="0 0 24 24" fill="currentColor">' +
            '<circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
        gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8.5" stroke-dasharray="3 3.4"/></svg>'
    };

    var POS_MAP = {
        'bottom-right': 'br', br: 'br',
        'bottom-left': 'bl', bl: 'bl',
        'top-right': 'tr', tr: 'tr',
        'top-left': 'tl', tl: 'tl'
    };

    // 悬浮入口配置归一化：false/undefined = 不显示，true = 全默认
    function normalizeButton(b) {
        if (!b) return null;
        if (b === true) b = {};
        if (typeof b !== 'object') return null;
        return {
            position: POS_MAP[b.position] || 'br',
            offset: (typeof b.offset === 'number') ? b.offset : 24,
            size: (typeof b.size === 'number') ? b.size : 44,
            icon: b.icon || 'sliders',
            label: b.label || '打开设置',
            color: b.color || null
        };
    }

    function iconHTML(icon) {
        if (!icon) return ICONS.sliders;
        if (typeof icon === 'string' && icon.charAt(0) === '<') return icon;
        return ICONS[icon] || ICONS.sliders;
    }

    // 环境信息：库不参与存储与入口决策，只报告运行在哪种上下文里
    function env() {
        return {
            sandboxed: (typeof unsafeWindow !== 'undefined'),
            version: VERSION
        };
    }

    // ───────────────────────────────────────────────────────────
    // 主工厂
    // ───────────────────────────────────────────────────────────
    function create(config) {
        // 允许直接传 schema 数组，等价于 { schema: [...] }
        if (Array.isArray(config)) config = { schema: config };
        config = config || {};

        if (!config.schema || !config.schema.length) {
            throw new Error('[coofoUtils.settingsPanel] 缺少 schema，至少需要一个配置项');
        }

        var id = ++uid;
        var cfg = {
            title: config.title || '设置',
            subtitle: config.subtitle || '',
            schema: config.schema,
            namespace: config.namespace || 'sp:',
            storage: config.storage || null,
            width: config.width || 400,
            resettable: config.resettable !== false,
            dismissible: config.dismissible !== false,
            appearance: config.appearance || null,
            entry: config.entry || {},
            actions: config.actions || {},
            onChange: config.onChange || null,
            onClose: config.onClose || null,
            labels: Object.assign({ reset: '恢复默认', close: '保存并关闭' }, config.labels || {})
        };

        // 悬浮入口：entry.button 为 false / 缺省时不显示
        cfg.button = normalizeButton(cfg.entry.button);

        // v3 起库不再注册任何入口，旧配置传了 menu / hotkey 时提示一次，避免静默失效
        if (cfg.entry.menu || cfg.entry.hotkey) {
            console.warn('[coofoUtils.settingsPanel] entry.menu / entry.hotkey 已在 v3.0.0 移除：' +
                '请在你自己的脚本里注册菜单与快捷键，再调用 panel.open()。');
        }

        var store = resolveStorage(cfg.storage, cfg.namespace);
        var storageKind = (cfg.storage && isFn(cfg.storage.get) && isFn(cfg.storage.set)) ? 'custom'
            : (cfg.storage === 'local' ? 'local' : 'memory');

        // 归一化 schema：相邻同 tab 同 group 合并
        var sections = [];
        cfg.schema.forEach(function (sec) {
            var tab = sec.tab || '';
            var group = sec.group || '';
            var last = sections[sections.length - 1];
            if (last && last.tab === tab && last.group === group) {
                last.items = last.items.concat(sec.items || []);
            } else {
                sections.push({ tab: tab, group: group, items: (sec.items || []).slice() });
            }
        });

        var tabs = [];
        sections.forEach(function (s) { if (tabs.indexOf(s.tab) < 0) tabs.push(s.tab); });
        var singleTab = tabs.length <= 1;

        var fields = [];
        sections.forEach(function (s) {
            s.items.forEach(function (it) {
                // action 是按钮、doc 是纯说明，都不参与取值
                if (it.type === 'action' || it.type === 'doc' || !it.key) return;
                fields.push(it);
            });
        });

        var defaults = {};
        fields.forEach(function (f) { defaults[f.key] = f.default; });

        var state = {};
        fields.forEach(function (f) {
            var v = store.get(f.key, f.default);
            state[f.key] = (f.type === 'range') ? Number(v) : v;
        });

        var fieldMap = {};
        fields.forEach(function (f) { fieldMap[f.key] = f; });

        var listeners = [];
        var closeListeners = [];
        if (isFn(cfg.onClose)) closeListeners.push(cfg.onClose);
        var actions = Object.assign(builtinActions(), cfg.actions);

        // ── DOM 构建 ──────────────────────────────────────────────
        var host = null;
        var shadow = null;
        var wrap = null;
        var root = null;

        function fieldValue(it) { return state[it.key]; }

        function rowShell(it, control) {
            return '<div class="row">' +
                '<div class="txt"><div class="lbl">' + esc(it.label) + '</div>' +
                (it.desc ? '<div class="dsc">' + esc(it.desc) + '</div>' : '') +
                '</div>' + control + '</div>';
        }

        // 折叠说明块：标题一行，展开后渲染富文本。默认收起，避免面板被文档撑长
        function helpBlock(title, md, open) {
            return '<div class="help" data-open="' + (open ? 1 : 0) + '">' +
                '<div class="help-t" role="button" tabindex="0" aria-expanded="' + (open ? 'true' : 'false') + '">' +
                '<span class="caret"></span>' + esc(title) + '</div>' +
                '<div class="help-b"' + (open ? '' : ' style="display:none"') + '>' +
                '<div class="md">' + mdToHTML(md) + '</div></div></div>';
        }

        // 独立说明块：整段占据一行，用于某一组配置的总说明
        function renderDoc(it) {
            var md = it.md || it.content || '';
            var title = it.title || it.label || '';
            if (it.collapsed) return '<div class="docblock">' + helpBlock(title || '说明', md, !!it.open) + '</div>';
            return '<div class="docblock">' +
                (title ? '<div class="doc-title">' + esc(title) + '</div>' : '') +
                '<div class="md">' + mdToHTML(md) + '</div></div>';
        }

        function renderItem(it) {
            var v = fieldValue(it);

            switch (it.type) {
                case 'switch':
                    return rowShell(it, '<div class="sw" data-key="' + esc(it.key) + '" data-on="' + (v ? 1 : 0) + '"></div>');

                case 'range':
                    return '<div class="block">' +
                        '<div class="bhead"><div class="lbl">' + esc(it.label) + '</div>' +
                        '<div class="val"><span data-out="' + esc(it.key) + '">' + esc(v) + '</span>' + esc(it.unit || '') + '</div></div>' +
                        '<input type="range" data-key="' + esc(it.key) + '" min="' + it.min + '" max="' + it.max +
                        '" step="' + (it.step || 1) + '" value="' + esc(v) + '"></div>';

                case 'select':
                    return rowShell(it, '<select data-key="' + esc(it.key) + '">' +
                        (it.options || []).map(function (o) {
                            return '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>';
                        }).join('') + '</select>');

                case 'text':
                    return rowShell(it, '<input type="text" data-key="' + esc(it.key) + '" value="' + esc(v) +
                        '" placeholder="' + esc(it.placeholder || '') + '">');

                case 'textarea':
                    return '<div class="field">' +
                        '<div class="lbl">' + esc(it.label) + '</div>' +
                        '<textarea data-key="' + esc(it.key) + '" rows="' + (it.rows || 2) +
                        '" placeholder="' + esc(it.placeholder || '') + '">' + esc(v) + '</textarea></div>';

                case 'action':
                    return renderActions(it);

                case 'doc':
                    return renderDoc(it);

                default:
                    return '';
            }
        }

        function renderActions(it) {
            var keys = it.buttons || (it.action ? [it.action] : []);
            var defs = keys.map(function (k) { return Object.assign({ key: k }, actions[k] || {}); })
                .filter(function (a) { return a.label; });

            if (!defs.length) return '';

            if (defs.length === 1 && defs[0].style === 'danger') {
                var d = defs[0];
                return '<div class="field"><div class="danger-box">' +
                    '<div><div class="lbl">' + esc(d.label) + '</div>' +
                    (d.desc || it.desc ? '<div class="dsc">' + esc(d.desc || it.desc) + '</div>' : '') +
                    '</div><button class="btn" data-btn="' + esc(d.key) + '">' + esc(d.buttonText || '执行') + '</button></div></div>';
            }

            return '<div class="field"><div class="btns">' +
                defs.map(function (d) {
                    return '<button class="btn" data-btn="' + esc(d.key) + '">' + esc(d.label) + '</button>';
                }).join('') + '</div></div>';
        }

        function renderTabPane(tab) {
            return sections.filter(function (s) { return s.tab === tab; }).map(function (sec) {
                return (sec.group ? '<div class="group">' + esc(sec.group) + '</div>' : '') +
                    sec.items.map(function (it) {
                        var inner = renderItem(it);
                        if (!inner) return '';
                        var isDoc = it.type === 'doc';
                        return '<div class="item' + (isDoc ? ' item-doc' : '') + '"' +
                            (it.key ? ' data-item="' + esc(it.key) + '"' : '') + '>' + inner +
                            // 任意配置项都可以挂一段折叠说明：item.doc
                            (it.doc ? helpBlock(it.docLabel || '用法说明', it.doc, !!it.docOpen) : '') +
                            '</div>';
                    }).join('');
            }).join('');
        }

        function build() {
            host = document.createElement('div');
            // 多脚本共存时 id 可能撞车，加随机串区分
            host.id = 'gmsp-host-' + id + '-' + Math.random().toString(36).slice(2, 7);
            shadow = host.attachShadow({ mode: 'open' });

            shadow.innerHTML = '<style>' + CSS + '</style>' +
                '<div class="root">' +
                (cfg.button ? '<div class="fab" data-pos="' + cfg.button.position + '" role="button" tabindex="0"' +
                    ' aria-label="' + esc(cfg.button.label) + '"' +
                    ' style="width:' + cfg.button.size + 'px;height:' + cfg.button.size + 'px' +
                    (cfg.button.color ? ';background:' + esc(cfg.button.color) + ';color:#fff' : '') + '">' +
                    iconHTML(cfg.button.icon) + '</div>' : '') +
                '<div class="mask"></div>' +
                '<div class="panel" role="dialog" aria-label="' + esc(cfg.title) + '">' +
                '<div class="head"><div><div class="title">' + esc(cfg.title) + '</div>' +
                (cfg.subtitle ? '<div class="sub">' + esc(cfg.subtitle) + '</div>' : '') +
                '</div><button class="close" aria-label="关闭">×</button></div>' +
                (singleTab ? '' : '<div class="tabs">' + tabs.map(function (t, i) {
                    return '<div class="tab" data-tab="' + esc(t) + '" data-on="' + (i === 0 ? 1 : 0) + '">' + esc(t) + '</div>';
                }).join('') + '</div>') +
                '<div class="body">' + tabs.map(function (t, i) {
                    return '<div class="pane" data-pane="' + esc(t) + '"' + (i === 0 ? '' : ' style="display:none"') + '>' +
                        renderTabPane(t) + '</div>';
                }).join('') + '</div>' +
                '<div class="foot">' +
                (cfg.resettable ? '<button class="btn" data-btn="__defaults">' + esc(cfg.labels.reset) + '</button>' : '') +
                '<button class="primary" data-btn="__close">' + esc(cfg.labels.close) + '</button>' +
                '</div>' +
                '<div class="toast"></div></div>';

            wrap = shadow.querySelector('.root');
            root = shadow;

            var panelEl = shadow.querySelector('.panel');
            panelEl.style.width = cfg.width + 'px';
            if (cfg.button) wrap.style.setProperty('--fab-offset', cfg.button.offset + 'px');

            document.documentElement.appendChild(host);
            bind();
            applyAppearance();
        }

        // ── 外观 ──────────────────────────────────────────────────
        function applyAppearance() {
            // DOM 还是懒构建的：面板没打开过就没有 wrap，此时改值只更新 state 即可，
            // 首次 build() 会用当前 state 重新套一遍外观。
            if (!wrap) return;

            var ap = {};
            if (isFn(cfg.appearance)) ap = cfg.appearance(state) || {};
            else if (cfg.appearance) ap = cfg.appearance;
            else {
                // 未提供 appearance 时，仅当值本身是颜色才用作强调色（避免 '蓝' 这种枚举被当成 CSS 值）
                if (typeof state.accent === 'string' && /^(#|rgb|hsl)/.test(state.accent)) ap.accent = state.accent;
                ap.dark = state.theme;
            }

            if (ap.accent) wrap.style.setProperty('--accent', ap.accent);

            var dark;
            if (ap.dark === '自动' || ap.dark === '跟随系统' || ap.dark === 'auto') {
                dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            } else if (typeof ap.dark === 'string') {
                dark = ap.dark === '深色' || ap.dark === 'dark';
            } else {
                dark = !!ap.dark;
            }
            wrap.setAttribute('data-theme', dark ? 'dark' : 'light');
        }

        // ── toast ─────────────────────────────────────────────────
        var toastTimer = null;
        function toast(msg) {
            if (!shadow) return;
            var el = shadow.querySelector('.toast');
            if (!el) return;
            el.textContent = msg;
            el.classList.add('on');
            clearTimeout(toastTimer);
            toastTimer = setTimeout(function () { el.classList.remove('on'); }, 1600);
        }

        // ── 状态同步 ──────────────────────────────────────────────
        function emit(key, val) {
            var snapshot = Object.assign({}, state);
            if (isFn(cfg.onChange)) {
                try { cfg.onChange(key, val, snapshot); } catch (e) { console.error('[coofoUtils.settingsPanel] onChange 出错:', e); }
            }
            listeners.forEach(function (fn) {
                try { fn(key, val, snapshot); } catch (e) {}
            });
        }

        /**
         * 面板关闭通知。reason 区分关闭来源：
         *   'confirm' 点「保存并关闭」—— 用户主动确认完成
         *   'dismiss' 点 × / Esc / 点遮罩 —— 随手收起
         *   'api'     代码里调 panel.close() / toggle()
         * 只有「从打开到关闭」才触发；重复 close() 不会重复通知。
         */
        function emitClose(reason) {
            if (!closeListeners.length) return;
            var snapshot = Object.assign({}, state);
            closeListeners.slice().forEach(function (fn) {
                try { fn(reason, snapshot); } catch (e) {
                    console.error('[coofoUtils.settingsPanel] onClose 出错:', e);
                }
            });
        }

        var pending = {};
        var saveTimer = null;

        function flush() {
            clearTimeout(saveTimer);
            Object.keys(pending).forEach(function (k) { store.set(k, pending[k]); });
            pending = {};
        }

        function coerce(key, val) {
            var f = fieldMap[key];
            if (!f) return val;

            if (f.type === 'range') {
                var n = Number(val);
                if (isNaN(n)) return Number(f.default) || 0;
                if (typeof f.min === 'number' && n < f.min) n = f.min;
                if (typeof f.max === 'number' && n > f.max) n = f.max;
                return n;
            }

            if (f.type === 'switch') {
                // 允许配置来自 JSON / URL 参数 / 手写文本，"false" "0" "" 都当假
                if (typeof val === 'string') return val !== '' && val !== 'false' && val !== '0';
                return !!val;
            }

            return val;
        }

        function setValue(key, val, silent) {
            val = coerce(key, val);
            state[key] = val;
            // 拖动滑块时避免高频写存储：攒 150ms 合并一次
            pending[key] = val;
            clearTimeout(saveTimer);
            saveTimer = setTimeout(flush, 150);
            applyAppearance();
            if (!silent) emit(key, val);
        }

        function syncField(key) {
            if (!shadow) return;
            var el = shadow.querySelector('[data-key="' + key + '"]');
            var v = state[key];
            if (el) {
                if (el.classList.contains('sw')) el.dataset.on = v ? 1 : 0;
                else el.value = v;
            }
            var out = shadow.querySelector('[data-out="' + key + '"]');
            if (out) out.textContent = v;
        }

        function refresh() {
            fields.forEach(function (f) { syncField(f.key); });
            applyAppearance();
        }

        // ── 事件 ──────────────────────────────────────────────────
        var textTimer = null;

        function bind() {
            shadow.addEventListener('click', function (e) {
                if (e.target.closest('.fab')) { open(); return; }

                var tab = e.target.closest('.tab');
                if (tab) {
                    shadow.querySelectorAll('.tab').forEach(function (t) { t.dataset.on = '0'; });
                    tab.dataset.on = '1';
                    shadow.querySelectorAll('.pane').forEach(function (p) {
                        p.style.display = p.dataset.pane === tab.dataset.tab ? '' : 'none';
                    });
                    return;
                }

                var sw = e.target.closest('.sw');
                if (sw) {
                    var swKey = sw.dataset.key;
                    var on = sw.dataset.on === '1';
                    setValue(swKey, !on);
                    syncField(swKey);
                    return;
                }

                if (e.target.closest('.close')) { close('dismiss'); return; }

                var ht = e.target.closest('.help-t');
                if (ht) {
                    var box = ht.parentElement;
                    var openNow = box.dataset.open === '1';
                    box.dataset.open = openNow ? '0' : '1';
                    ht.setAttribute('aria-expanded', openNow ? 'false' : 'true');
                    var hb = box.querySelector('.help-b');
                    if (hb) hb.style.display = openNow ? 'none' : '';
                    return;
                }

                if (cfg.dismissible && e.target.classList.contains('mask')) { close('dismiss'); return; }

                var btn = e.target.closest('[data-btn]');
                if (!btn) return;
                var key = btn.dataset.btn;

                if (key === '__close') { close('confirm'); return; }
                if (key === '__defaults') {
                    Object.keys(defaults).forEach(function (k) { setValue(k, defaults[k]); });
                    refresh();
                    toast('已恢复默认值');
                    return;
                }

                var act = actions[key];
                if (!act || !isFn(act.run)) return;
                if (act.confirm && !window.confirm(act.confirm)) return;
                act.run(api);
            });

            shadow.addEventListener('keydown', function (e) {
                var t = e.target;
                if (e.key !== 'Enter' && e.key !== ' ') return;
                if (t.classList && t.classList.contains('fab')) {
                    e.preventDefault();
                    open();
                } else if (t.classList && t.classList.contains('help-t')) {
                    e.preventDefault();
                    t.click();
                }
            });

            shadow.addEventListener('input', function (e) {
                var el = e.target;
                var key = el.dataset.key;
                if (!key) return;

                if (el.type === 'range') {
                    setValue(key, Number(el.value));
                    syncField(key);
                } else if (el.tagName === 'TEXTAREA' || el.type === 'text') {
                    clearTimeout(textTimer);
                    textTimer = setTimeout(function () { setValue(key, el.value); }, 300);
                }
            });

            shadow.addEventListener('change', function (e) {
                var el = e.target;
                var key = el.dataset.key;
                if (!key) return;
                if (el.tagName === 'SELECT') {
                    setValue(key, el.value);
                } else if (el.type === 'text' || el.tagName === 'TEXTAREA') {
                    setValue(key, el.value);
                }
            });
        }

        // ── 开关 ──────────────────────────────────────────────────
        function onKeydown(e) {
            if (e.key === 'Escape') close('dismiss');
        }

        function open() {
            if (!host) build();
            wrap.classList.add('open');
            document.addEventListener('keydown', onKeydown);
        }

        function close(reason) {
            if (!wrap) { flush(); return; }
            var wasOpen = wrap.classList.contains('open');
            // 关面板就把攒着的写入落盘，避免「改完立刻 Esc」丢最后一次修改
            flush();
            wrap.classList.remove('open');
            document.removeEventListener('keydown', onKeydown);
            if (wasOpen) emitClose(reason || 'api');
        }

        function toggle() {
            if (!wrap || !wrap.classList.contains('open')) open();
            else close();
        }

        function destroy() {
            flush();
            document.removeEventListener('keydown', onKeydown);
            if (host && host.parentNode) host.parentNode.removeChild(host);
            host = shadow = wrap = null;
        }

        // ── 实例 API ──────────────────────────────────────────────
        var api = {
            id: id,
            version: VERSION,
            storage: storageKind,

            get: function (key) { return state[key]; },
            getAll: function () { return Object.assign({}, state); },

            /**
             * 整体写入：一份完整配置对象一次应用进来。
             * - 只处理 schema 里存在的键，多余的键忽略
             * - 值没变化的键不触发 onChange
             * - 所有变更合并成一次存储写入，不会逐键刷
             * opts.silent  不触发 onChange
             * opts.replace 未提供的键恢复默认值（整体替换语义）
             * 返回实际发生变化的键数组
             */
            setAll: function (obj, opts) {
                opts = opts || {};
                if (!obj || typeof obj !== 'object') return [];

                var changed = [];
                Object.keys(fieldMap).forEach(function (k) {
                    var has = Object.prototype.hasOwnProperty.call(obj, k);
                    if (!has && !opts.replace) return;
                    var next = has ? coerce(k, obj[k]) : defaults[k];
                    if (state[k] === next) return;
                    state[k] = next;
                    pending[k] = next;
                    changed.push(k);
                });

                if (!changed.length) return changed;

                clearTimeout(saveTimer);
                saveTimer = setTimeout(flush, 150);
                refresh();
                if (!opts.silent) {
                    changed.forEach(function (k) { emit(k, state[k]); });
                }
                return changed;
            },

            set: function (key, val) { setValue(key, val); syncField(key); },
            reset: function () {
                pending = {};
                clearTimeout(saveTimer);
                Object.keys(defaults).forEach(function (k) {
                    store.del(k);
                    state[k] = defaults[k];
                });
                refresh();
                Object.keys(defaults).forEach(function (k) { emit(k, defaults[k]); });
            },
            import: function (raw) {
                var obj;
                try { obj = JSON.parse(raw); } catch (e) { return false; }
                if (!obj || typeof obj !== 'object') return false;
                api.setAll(obj);
                return true;
            },

            onChange: function (fn) {
                if (!isFn(fn)) return function () {};
                listeners.push(fn);
                return function () {
                    var i = listeners.indexOf(fn);
                    if (i > -1) listeners.splice(i, 1);
                };
            },

            // 关闭监听：fn(reason, all)，reason 见 emitClose 注释
            onClose: function (fn) {
                if (!isFn(fn)) return function () {};
                closeListeners.push(fn);
                return function () {
                    var i = closeListeners.indexOf(fn);
                    if (i > -1) closeListeners.splice(i, 1);
                };
            },

            open: open,
            close: close,
            toggle: toggle,
            refresh: refresh,
            toast: toast,
            destroy: destroy,

            get element() { return shadow; },
            get isOpen() { return !!(wrap && wrap.classList.contains('open')); }
        };

        // ── 入口 ──────────────────────────────────────────────────
        // 库不注册任何全局入口（无 GM 菜单、无 document 级快捷键监听）。
        // 唤起面板由引用方调用 api.open() / toggle() 完成；
        // 唯一可能提前建 DOM 的情况是开了悬浮按钮，那是面板自身的一部分 UI。
        if (cfg.entry.autoOpen) open();
        else if (cfg.button) {
            // 有悬浮入口就得先把 DOM 建出来，否则按钮不可见（其余情况保持懒构建）
            if (document.documentElement) build();
            else document.addEventListener('DOMContentLoaded', function () { if (!host) build(); }, { once: true });
        }

        return api;
    }

    return {
        create: create,
        version: VERSION,
        env: env,
        matchesHotkey: matchesHotkey,
        adapters: { memory: memoryAdapter, local: localAdapter }
    };
});
