// ==UserScript==
// @name         coofoUtils-download-ui
// @namespace    https://github.com/coofo/someScript
// @version      0.0.1
// @description  通用下载进度 UI：任务列表 / 子任务矩阵 / 打包状态 / 折叠胶囊。对外暴露 window.DownloadUI
// @author       coofo
// @downloadURL  https://github.com/coofo/someScript/raw/main/tampermonkey/coofoUtils-downloadUi.js
// @supportURL   https://github.com/coofo/someScript/issues
// @run-at       document-idle
// ==/UserScript==

/*
 * 说明
 * ----
 * 本文件只负责「展示」，不含任何下载逻辑。下载器通过 coofoUtils.downloadUI.store 写入状态，UI 据此渲染。
 * 首次 upsert 任务时自动挂载，空闲时对页面零影响。
 *
 * 存储策略：不读写任何持久化存储（无 GM_setValue、无 localStorage）。
 * 任务列表只存在于当前页面的内存中——只显示本页发起的任务，也只在本页执行；
 * 页面刷新/关闭即清空，不会与其它标签页共享或互相覆盖。
 *
 * 挂载点：window.coofoUtils.downloadUI（复用页面上已有的 coofoUtils 命名空间，不覆盖其它成员）
 *
 * 快速接入（@grant none，脚本与页面同上下文，直接读 window）：
 *   const ui = window.coofoUtils.downloadUI;
 *   const id = ui.store.upsert({ name: 'video.mp4', state: 'downloading',
 *                                chunks: [{ start: 0, end: 1023 }, { start: 1024, end: 2047 }] });
 *   ui.store.chunk(id, 0, { received: 512, status: 'active' });
 *   ui.store.patch(id, { etaMs: 125000 });
 *   ui.onAction(({ type, taskId }) => { ... });   // pause / resume / cancel / retry / remove
 */

(function () {
    'use strict';

    // 统一挂在 window.coofoUtils 命名空间下；页面上若已有 coofoUtils（别的工具在用），复用同一个对象
    function nsOf(w) {
        const prev = w.coofoUtils;
        if (!prev || typeof prev !== 'object') w.coofoUtils = {};
        return w.coofoUtils;
    }

    const PAGE = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
    const pageNS = nsOf(PAGE);
    if (pageNS.downloadUI && pageNS.downloadUI.version) return;

    const VERSION = '0.0.1';
    const PANEL_W = 404;
    const DEFAULT_MINI = true;    // 面板首次出现时是否收起成胶囊：true = 收起，false = 直接展开

    // 操作按钮开关：改这里的默认值，或运行时调用 coofoUtils.downloadUI.config({ pause: false })
    // 单个任务也可以在 task.controls 里单独覆盖，如 { pause: false }；task.controls = false 表示整行只读
    const UI_CONFIG = {
        pause: true,
        resume: true,
        cancel: true,
        retry: true,
        remove: true
    };

    /* ------------------------------------------------------------------ 工具 */

    function uid(p) { return (p || 't') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

    function fmtEta(ms) {
        if (ms == null || !isFinite(ms) || ms <= 0) return '';
        const s = Math.round(ms / 1000);
        if (s < 60) return s + ' 秒';
        const m = Math.floor(s / 60);
        if (m < 60) { const rs = s % 60; return rs ? m + ' 分 ' + rs + ' 秒' : m + ' 分'; }
        const h = Math.floor(m / 60);
        const rm = m % 60;
        return rm ? h + ' 小时 ' + rm + ' 分' : h + ' 小时';
    }

    function extTag(name) {
        const m = /\.([a-z0-9]{1,4})$/i.exec(name || '');
        return m ? m[1].toUpperCase() : 'FILE';
    }

    /* ------------------------------------------------------------- 数据模型 */

    const STATE = {
        QUEUED: 'queued',
        DOWNLOADING: 'downloading',
        PAUSED: 'paused',
        PACKAGING: 'packaging',
        DONE: 'done',
        ERROR: 'error'
    };

    function normalizeChunk(c, i) {
        const start = typeof c.start === 'number' ? c.start : 0;
        const end = typeof c.end === 'number' ? c.end : start;
        const size = typeof c.size === 'number' ? c.size : Math.max(0, end - start + 1);
        let st = c.status || 'pending';
        if (st !== 'pending' && st !== 'active' && st !== 'done' && st !== 'error') st = 'pending';
        return {
            id: c.id == null ? i : c.id,
            start: start,
            end: end,
            size: size,
            received: Math.min(typeof c.received === 'number' ? c.received : 0, size),
            status: st
        };
    }

    function normalizeTask(t) {
        const now = Date.now();
        return {
            id: t.id || uid(),
            name: t.name || '未命名任务',
            state: STATE[t.state] ? t.state : (t.state || STATE.DOWNLOADING),
            chunks: (t.chunks || []).map(normalizeChunk),
            etaMs: t.etaMs == null ? null : t.etaMs,
            output: t.output || null,
            message: t.message || '',
            controls: t.controls === undefined ? undefined : t.controls,
            addedAt: t.addedAt || now,
            rev: 0
        };
    }

    // 某个操作按钮在当前配置下是否可用：任务级 controls 优先于全局 UI_CONFIG
    function actionAllowed(t, type) {
        if (!t) return UI_CONFIG[type] !== false;
        if (t.controls === false) return false;
        if (t.controls && typeof t.controls === 'object' && t.controls[type] === false) return false;
        return UI_CONFIG[type] !== false;
    }

    // 由子任务聚合出任务级指标；字节数只在内部计算，不参与展示
    function stats(t) {
        let size = 0, got = 0, done = 0, active = 0, pending = 0, err = 0;
        for (let i = 0; i < t.chunks.length; i++) {
            const c = t.chunks[i];
            size += c.size;
            got += c.received;
            if (c.status === 'done') done++;
            else if (c.status === 'active') active++;
            else if (c.status === 'error') err++;
            else pending++;
        }
        const pct = (t.state === STATE.DONE || t.state === STATE.PACKAGING) ? 100
            : (size > 0 ? clamp(got / size * 100, 0, 100) : 0);
        return {
            size: size, got: got, pct: pct,
            done: done, active: active, pending: pending, err: err,
            total: t.chunks.length
        };
    }

    function createStore() {
        let tasks = [];
        const byId = new Map();
        let subs = [];
        let muted = 0;

        function emit() {
            if (muted > 0) return;
            for (let i = 0; i < subs.length; i++) {
                try { subs[i](); } catch (e) { console.error('[coofoUtils.downloadUI] subscriber error', e); }
            }
        }

        function reindex() {
            byId.clear();
            for (let i = 0; i < tasks.length; i++) byId.set(tasks[i].id, tasks[i]);
        }

        // 批量装载任务（纯内存，不涉及任何存储）：传数组或 { tasks: [...] }
        function hydrate(raw) {
            const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.tasks) ? raw.tasks : null);
            if (!list) return false;
            tasks = list.map(normalizeTask);
            reindex();
            emit();
            return true;
        }

        const api = {
            upsert: function (input) {
                let t = byId.get(input && input.id);
                if (t) {
                    // 已存在则合并，便于下载器用同一对象反复 upsert
                    if (input.name != null) t.name = input.name;
                    if (input.state) t.state = input.state;
                    if (input.chunks) t.chunks = input.chunks.map(normalizeChunk);
                    if (input.etaMs !== undefined) t.etaMs = input.etaMs;
                    if (input.output !== undefined) t.output = input.output;
                    if (input.message !== undefined) t.message = input.message;
                    if (input.controls !== undefined) t.controls = input.controls == null ? undefined : input.controls;
                } else {
                    t = normalizeTask(input || {});
                    tasks.push(t);
                    byId.set(t.id, t);
                }
                emit();
                return t.id;
            },

            patch: function (id, patch) {
                const t = byId.get(id);
                if (!t || !patch) return;
                if (patch.name != null) t.name = patch.name;
                if (patch.state) t.state = patch.state;
                if (patch.etaMs !== undefined) t.etaMs = patch.etaMs;
                if (patch.output !== undefined) t.output = patch.output;
                if (patch.message !== undefined) t.message = patch.message;
                // controls: null 表示撤销任务级覆盖，回到全局 UI_CONFIG
                if (patch.controls !== undefined) t.controls = patch.controls == null ? undefined : patch.controls;
                if (patch.chunks) t.chunks = patch.chunks.map(normalizeChunk);
                emit();
            },

            chunk: function (taskId, chunkId, patch) {
                const t = byId.get(taskId);
                if (!t) return;
                let c = null;
                for (let i = 0; i < t.chunks.length; i++) {
                    if (t.chunks[i].id === chunkId || i === chunkId) { c = t.chunks[i]; break; }
                }
                if (!c) return;
                if (patch.received != null) c.received = clamp(patch.received, 0, c.size);
                if (patch.status) c.status = patch.status;
                emit();
            },

            // 批量写入只触发一次渲染，适合一个 tick 内更新上百个子任务
            tx: function (fn) {
                muted++;
                try { fn(api); } finally {
                    muted--;
                    if (muted === 0) emit();
                }
            },

            remove: function (id) {
                const t = byId.get(id);
                if (!t) return;
                tasks = tasks.filter(function (x) { return x !== t; });
                byId.delete(id);
                emit();
            },

            clearFinished: function () {
                tasks = tasks.filter(function (t) { return t.state !== STATE.DONE; });
                reindex();
                emit();
            },

            get: function (id) { return byId.get(id) || null; },
            list: function () { return tasks.slice(); },
            stats: stats,
            subscribe: function (fn) {
                subs.push(fn);
                fn();
                return function () { subs = subs.filter(function (x) { return x !== fn; }); };
            },
            hydrate: hydrate
        };

        // 不读任何存储：面板启动时永远是空列表，任务只存在于本页内存中
        return api;
    }

    /* ------------------------------------------------------------------ 视图 */

    const CSS = [
        '*{box-sizing:border-box;margin:0;padding:0}',
        '.wrap{position:relative;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;',
        '--bg:#fff;--fg:#1a1a1a;--muted:#6b6b6b;--faint:#9b9b9b;--line:rgba(0,0,0,.11);--soft:#f4f4f2;',
        '--blue:#378ADD;--blue-soft:#E6F1FB;--purple:#7F77DD;--purple-soft:#EEEDFE;',
        '--green:#639922;--green-soft:#EAF3DE;--red:#E24B4A;--red-soft:#FCEBEB;--gray:#B4B2A9;',
        'color:var(--fg);-webkit-font-smoothing:antialiased}',
        '@media (prefers-color-scheme:dark){.wrap{--bg:#1f1f1f;--fg:#ededed;--muted:#9d9d9d;--faint:#7a7a7a;',
        '--line:rgba(255,255,255,.13);--soft:#2b2b2b;--blue-soft:#1c2f45;--purple-soft:#28254a;',
        '--green-soft:#25301a;--red-soft:#3a1f1f}}',
        '.panel{width:404px;background:var(--bg);border:1px solid var(--line);border-radius:12px;overflow:hidden;',
        'box-shadow:0 8px 28px rgba(0,0,0,.16)}',
        '.hd{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-bottom:1px solid var(--line);cursor:grab;user-select:none;touch-action:none}',
        '.hd:active{cursor:grabbing}',
        '.hd .t{display:flex;align-items:center;gap:8px;font-weight:500}',
        '.hd .cnt{font-size:11px;color:var(--muted);background:var(--soft);border-radius:5px;padding:1px 6px;font-weight:400}',
        '.hd .ops{display:flex;gap:12px;color:var(--faint)}',
        '.hd .ops span{cursor:pointer;line-height:1;font-size:13px}',
        '.hd .ops span:hover{color:var(--fg)}',
        '.bar{height:4px;border-radius:2px;background:var(--soft);overflow:hidden;position:relative}',
        '.bar i{display:block;height:100%;border-radius:2px;width:0;transition:width .18s linear}',
        '.bar.indet i{width:38%;animation:swipe 1.15s linear infinite}',
        '@keyframes swipe{0%{transform:translateX(-110%)}100%{transform:translateX(300%)}}',
        '.list{max-height:min(62vh,560px);overflow:auto;overscroll-behavior:contain}',
        '.row{padding:12px 14px;border-bottom:1px solid var(--line);display:flex;gap:10px;align-items:flex-start;position:relative}',
        '.row:last-child{border-bottom:0}',
        '.row[data-state="error"]{background:var(--red-soft)}',
        '.row[data-state="done"]{opacity:.92}',
        '.badge{width:34px;height:34px;flex:none;border-radius:8px;background:var(--blue-soft);color:var(--blue);',
        'font-size:11px;font-weight:500;display:flex;align-items:center;justify-content:center;letter-spacing:.02em}',
        '.row[data-state="packaging"] .badge{background:var(--purple-soft);color:var(--purple)}',
        '.row[data-state="done"] .badge{background:var(--green-soft);color:var(--green)}',
        '.row[data-state="error"] .badge{background:#F7C1C1;color:#A32D2D}',
        '.main{flex:1;min-width:0}',
        '.l1{display:flex;justify-content:space-between;gap:8px;align-items:baseline}',
        '.nm{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.pc{font-weight:500;flex:none}',
        '.mt{font-size:12px;color:var(--muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.row[data-state="error"] .pc,.row[data-state="error"] .mt{color:#A32D2D}',
        '.tag{font-size:11px;border-radius:5px;padding:2px 6px;font-weight:400;flex:none}',
        '.tag[data-k="packaging"]{color:var(--purple);background:var(--purple-soft)}',
        // 操作区固定占位：无论当前状态有没有按钮，右侧都留同一块宽度，进度条 / 矩阵的右边界才不会跟着按钮伸缩
        '.acts{display:flex;flex-direction:column;gap:4px;align-items:flex-end;flex:none;min-width:44px}',
        '.btn{font:inherit;font-size:12px;color:var(--muted);background:transparent;border:1px solid var(--line);',
        'border-radius:6px;padding:3px 8px;cursor:pointer;line-height:1.35;white-space:nowrap}',
        '.btn:hover{color:var(--fg);border-color:var(--muted)}',
        '.acts .btn{width:100%}',
        '.row .acts{opacity:0;transition:opacity .12s}',
        '.row:hover .acts{opacity:1}',
        '@media (hover:none){.row .acts{opacity:1}}',
        '.mtx{margin-top:12px;display:none}',
        '.row[data-open="1"] .mtx{display:block}',
        '.lg{display:flex;flex-wrap:wrap;gap:10px;font-size:12px;color:var(--muted);margin-bottom:6px}',
        '.lg span{display:flex;align-items:center;gap:5px}',
        '.lg em{width:8px;height:8px;border-radius:2px;display:inline-block}',
        '.cells{display:grid;grid-template-columns:repeat(20,1fr);gap:3px;max-height:205px;overflow-y:auto;overscroll-behavior:contain;padding-right:2px}',
        '.cells::-webkit-scrollbar{width:6px}',
        '.cells::-webkit-scrollbar-thumb{background:var(--line);border-radius:3px}',
        '.cells i{display:block;aspect-ratio:1;border-radius:2px;background:var(--gray);opacity:.55}',
        '.cells i[data-s="done"]{background:var(--green);opacity:.85}',
        '.cells i[data-s="active"]{background:var(--blue);opacity:1}',
        '.cells i[data-s="pending"]{background:var(--gray);opacity:.45}',
        '.cells i[data-s="error"]{background:var(--red);opacity:1}',
        '.fw{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:12px;color:var(--red)}',
        '.fw .dot{width:6px;height:6px;border-radius:50%;background:var(--red);flex:none}',
        '.fw .btn{margin-left:auto;color:var(--fg)}',
        '.exp{position:absolute;left:14px;right:14px;bottom:-1px;height:0}',
        '.toggle{cursor:pointer}',
        '.cap{display:none;align-items:center;gap:10px;background:var(--bg);border:1px solid var(--line);',
        'border-radius:999px;padding:7px 14px 7px 7px;box-shadow:0 6px 20px rgba(0,0,0,.16);cursor:grab;user-select:none;touch-action:none;white-space:nowrap;flex:none}',
        '.wrap[data-drag="1"] .hd,.wrap[data-drag="1"] .cap{cursor:grabbing}',
        '.cap .ring{width:30px;height:30px;flex:none;display:block;transform:rotate(-90deg)}',
        '.cap .ring circle{fill:none;stroke-width:3}',
        '.cap .ring .bgc{stroke:var(--soft)}',
        '.cap .ring .fgc{stroke:var(--blue);stroke-linecap:round;transition:stroke-dashoffset .2s linear}',
        '.cap b{font-weight:500}',
        '.cap em{font-style:normal;font-size:12px;color:var(--muted)}',
        '.wrap[data-mini="1"] .panel{display:none}',
        '.wrap[data-mini="1"] .cap{display:flex}',
        '.toasts{position:absolute;right:0;bottom:100%;margin-bottom:8px;display:flex;flex-direction:column;gap:8px;align-items:flex-end;pointer-events:none}',
        '.toast{pointer-events:auto;display:flex;align-items:center;gap:10px;background:var(--bg);border:1px solid var(--line);',
        'border-radius:10px;padding:9px 12px;box-shadow:0 6px 20px rgba(0,0,0,.16);max-width:380px;animation:tin .16s ease-out}',
        '.toast .ico{width:26px;height:26px;border-radius:7px;flex:none;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:500}',
        '.toast[data-k="done"] .ico{background:var(--green-soft);color:var(--green)}',
        '.toast[data-k="error"] .ico{background:var(--red-soft);color:var(--red)}',
        '.toast .tx{font-size:12px;color:var(--muted);min-width:0}',
        '.toast .tx b{display:block;color:var(--fg);font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '@keyframes tin{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}'
    ].join('');

    const ACTIONS = {
        downloading: [['pause', '暂停'], ['cancel', '取消']],
        paused: [['resume', '继续'], ['cancel', '取消']],
        packaging: [['cancel', '取消']],
        error: [['retry', '重试'], ['remove', '删除']],
        queued: [['cancel', '取消']],
        done: [['remove', '删除']]
    };

    function createView(store) {
        let host = null, root = null, wrapEl = null, panel = null, listEl = null, capEl = null;
        let capNum = null, capSub = null, capRing = null, toastBox = null, cntEl = null;
        const rows = new Map();     // taskId -> { el, refs, last }
        const expanded = new Set();
        let actionHandlers = [];
        let mini = DEFAULT_MINI;       // 默认收起成胶囊；改成 false 或调 coofoUtils.downloadUI.expand() 可默认展开
        const pos = { x: null, y: null };
        let pinned = false;
        let raf = 0;
        let mounted = false;
        let suppressCapClick = false;   // 拖过胶囊后吞掉紧随其后的 click，避免拖动被当成展开

        // 面板状态（位置 / 折叠 / 展开项）只活在本次页面会话的内存里，不落任何存储
        function defaultPos() {
            return {
                x: Math.max(8, window.innerWidth - PANEL_W - 16),
                y: Math.max(8, window.innerHeight - 460)
            };
        }

        function mount() {
            if (mounted) return host;
            mounted = true;

            host = document.createElement('div');
            host.setAttribute('data-download-ui', '');
            root = host.attachShadow({ mode: 'open' });

            const style = document.createElement('style');
            style.textContent = CSS;
            root.appendChild(style);

            const wrap = document.createElement('div');
            wrap.className = 'wrap';
            wrapEl = wrap;
            wrap.innerHTML = [
                '<div class="panel">',
                '  <div class="hd">',
                '    <div class="t"><span>下载任务</span><span class="cnt">0</span></div>',
                '    <div class="ops"><span data-op="mini" title="收起">&#8211;</span></div>',
                '  </div>',
                '  <div class="list"></div>',
                '</div>',
                '<div class="cap" title="点击展开 · 拖动可移动">',
                '  <svg class="ring" viewBox="0 0 30 30"><circle class="bgc" cx="15" cy="15" r="12"></circle>',
                '  <circle class="fgc" cx="15" cy="15" r="12" stroke-dasharray="75.4" stroke-dashoffset="75.4"></circle></svg>',
                '  <b>0%</b><em></em>',
                '</div>',
                '<div class="toasts"></div>'
            ].join('');
            root.appendChild(wrap);

            panel = wrap.querySelector('.panel');
            listEl = wrap.querySelector('.list');
            cntEl = wrap.querySelector('.hd .cnt');
            capEl = wrap.querySelector('.cap');
            capNum = wrap.querySelector('.cap b');
            capSub = wrap.querySelector('.cap em');
            capRing = wrap.querySelector('.cap .fgc');
            toastBox = wrap.querySelector('.toasts');

            const p = (pos.x == null || pos.y == null) ? defaultPos() : pos;
            pos.x = clamp(p.x, 0, Math.max(0, window.innerWidth - 120));
            pos.y = clamp(p.y, 0, Math.max(0, window.innerHeight - 80));
            host.style.cssText = 'position:fixed;left:' + pos.x + 'px;top:' + pos.y + 'px;z-index:2147483647;display:none;width:max-content';

            applyMini();

            wrap.querySelector('[data-op="mini"]').addEventListener('click', function (e) {
                e.stopPropagation();
                setMini(true);
            });
            // 折叠胶囊同样可以拖动；没拖动才视为点击展开
            capEl.addEventListener('click', function () {
                if (suppressCapClick) { suppressCapClick = false; return; }
                setMini(false);
            });
            capEl.addEventListener('pointerdown', function (e) {
                suppressCapClick = false;      // 新手势开始，清掉上一次拖拽留下的抑制标记
                startDrag(e, true);
            });
            wrap.querySelector('.hd').addEventListener('pointerdown', startDrag);

            root.addEventListener('click', function (e) {
                const btn = e.target.closest ? e.target.closest('[data-act]') : null;
                if (!btn) return;
                e.stopPropagation();
                const act = btn.getAttribute('data-act');
                // 行内按钮自带 data-id；矩阵下方的「重试」是行级静态按钮，回退到所属行
                const row = btn.closest('.row');
                const id = btn.getAttribute('data-id') || (row ? row.getAttribute('data-id') : null);
                // 删除是纯展示层操作（从列表移除），同时把事件抛给下载器做清理
                if (act === 'remove' && id) store.remove(id);
                emitAction(act, id);
            });

            (document.body || document.documentElement).appendChild(host);
            window.addEventListener('resize', onResize);
            return host;
        }

        function onResize() {
            if (!host) return;
            pos.x = clamp(pos.x, 0, Math.max(0, window.innerWidth - 80));
            pos.y = clamp(pos.y, 0, Math.max(0, window.innerHeight - 60));
            host.style.left = pos.x + 'px';
            host.style.top = pos.y + 'px';
        }

        // 通用拖拽：标题栏与折叠胶囊共用。位移超过阈值才算拖拽，避免「点一下想展开」被当成拖动
        function startDrag(e, fromCap) {
            if (e.button != null && e.button !== 0) return;
            if (e.target.closest && e.target.closest('[data-op]')) return;
            const sx = e.clientX, sy = e.clientY, ox = pos.x, oy = pos.y;
            const THRESHOLD = 3;
            let moved = false;

            function move(ev) {
                const dx = ev.clientX - sx, dy = ev.clientY - sy;
                if (!moved) {
                    if (Math.abs(dx) + Math.abs(dy) < THRESHOLD) return;
                    moved = true;
                    if (wrapEl) wrapEl.setAttribute('data-drag', '1');
                }
                pos.x = clamp(ox + dx, 0, Math.max(0, window.innerWidth - 80));
                pos.y = clamp(oy + dy, 0, Math.max(0, window.innerHeight - 40));
                host.style.left = pos.x + 'px';
                host.style.top = pos.y + 'px';
            }
            function up() {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                window.removeEventListener('pointercancel', up);
                if (wrapEl) wrapEl.removeAttribute('data-drag');
                if (!moved) return;             // 没移动 = 点击，交给 click 处理
                pinned = true;                  // 手动拖过之后不再自动贴右下角（仅本次会话有效）
                if (fromCap) suppressCapClick = true;
            }
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
            window.addEventListener('pointercancel', up);
            e.preventDefault();
        }

        // 折叠/展开时把面板收回可视区（胶囊很小，可能被停在屏幕边缘）
        function keepInView() {
            if (!host) return;
            const w = host.offsetWidth || (mini ? 120 : PANEL_W);
            const h = host.offsetHeight || 0;
            pos.x = clamp(pos.x, 0, Math.max(0, window.innerWidth - w));
            pos.y = clamp(pos.y, 0, Math.max(0, window.innerHeight - h));
            host.style.left = pos.x + 'px';
            host.style.top = pos.y + 'px';
        }

        function setMini(v) {
            mini = !!v;
            applyMini();
            if (!mini) render();
            keepInView();   // 胶囊与面板尺寸差很多，切换后重新夹回可视区
        }
        function applyMini() {
            if (!wrapEl) return;
            wrapEl.setAttribute('data-mini', mini ? '1' : '0');
        }

        function emitAction(type, taskId) {
            const payload = { type: type, taskId: taskId };
            for (let i = 0; i < actionHandlers.length; i++) {
                try { actionHandlers[i](payload); } catch (e) { console.error('[coofoUtils.downloadUI] action handler error', e); }
            }
        }

        function metaText(t, s) {
            const eta = fmtEta(t.etaMs);
            switch (t.state) {
                case STATE.PACKAGING: return s.total + '/' + s.total + ' 已完成 · 正在打包';
                case STATE.DONE: return s.total + '/' + s.total + ' · 打包完成';
                case STATE.ERROR: return s.done + '/' + s.total + ' 已完成 · ' + s.err + ' 个失败';
                case STATE.PAUSED: return s.done + '/' + s.total + (eta ? ' · 剩余 ' + eta : ' · 已暂停');
                case STATE.QUEUED: return s.done + '/' + s.total + ' · 排队中';
                default: return s.done + '/' + s.total + (eta ? ' · 剩余 ' + eta : '');
            }
        }

        function buildMatrix(t, refs) {
            const box = refs.mtx.querySelector('.cells');
            const frag = document.createDocumentFragment();
            const n = t.chunks.length;
            const cells = new Array(n);
            const last = new Array(n);
            for (let i = 0; i < n; i++) {
                const cell = document.createElement('i');
                cell.setAttribute('data-s', t.chunks[i].status);
                frag.appendChild(cell);
                cells[i] = cell;
                last[i] = t.chunks[i].status;
            }
            box.textContent = '';
            box.appendChild(frag);
            refs.cells = cells;
            refs.lastStates = last;
            refs.cellCount = n;
        }

        function updateMatrix(t, refs, s) {
            if (!refs.cells || refs.cellCount !== t.chunks.length) buildMatrix(t, refs);
            const cells = refs.cells, last = refs.lastStates;
            for (let i = 0; i < cells.length; i++) {
                const st = t.chunks[i].status;
                if (last[i] !== st) {
                    cells[i].setAttribute('data-s', st);
                    last[i] = st;
                }
            }
            refs.lg.innerHTML = [
                '<span><em style="background:var(--green)"></em>已完成 ' + s.done + '</span>',
                '<span><em style="background:var(--blue)"></em>进行中 ' + s.active + '</span>',
                '<span><em style="background:var(--gray)"></em>待下载 ' + s.pending + '</span>',
                '<span><em style="background:var(--red)"></em>失败 ' + s.err + '</span>'
            ].join('');

            const failedIdx = [];
            for (let j = 0; j < t.chunks.length && failedIdx.length < 12; j++) {
                if (t.chunks[j].status === 'error') failedIdx.push(j + 1);
            }
            if (s.err === 0) {
                refs.fw.style.display = 'none';
            } else {
                refs.fw.style.display = 'flex';
                refs.fwLabel.textContent = failedIdx.join('、') + (s.err > failedIdx.length ? ' 等 ' + s.err + ' 个失败' : ' 失败');
                // 失败编号始终展示；只有「重试」按钮受 UI_CONFIG.retry / task.controls 控制
                const canRetry = actionAllowed(t, 'retry');
                if (refs.fwBtnShown !== canRetry) {
                    refs.fwBtn.style.display = canRetry ? '' : 'none';
                    refs.fwBtnShown = canRetry;
                }
            }
        }

        function createRow(t) {
            const el = document.createElement('div');
            el.className = 'row';
            el.setAttribute('data-id', t.id);
            el.innerHTML = [
                '<div class="badge"></div>',
                '<div class="main">',
                '  <div class="l1"><span class="nm"></span><span class="pc"></span></div>',
                '  <div class="mt"></div>',
                '  <div class="bar"><i></i></div>',
                '  <div class="mtx">',
                '    <div class="lg"></div>',
                '    <div class="cells"></div>',
                '    <div class="fw"><span class="dot"></span><span class="fwl"></span><button class="btn" data-act="retry">重试</button></div>',
                '  </div>',
                '</div>',
                '<div class="acts"></div>'
            ].join('');

            const refs = {
                badge: el.querySelector('.badge'),
                nm: el.querySelector('.nm'),
                pc: el.querySelector('.pc'),
                mt: el.querySelector('.mt'),
                bar: el.querySelector('.bar'),
                barFill: el.querySelector('.bar i'),
                acts: el.querySelector('.acts'),
                mtx: el.querySelector('.mtx'),
                lg: el.querySelector('.lg'),
                fw: el.querySelector('.fw'),
                fwLabel: el.querySelector('.fwl'),
                fwBtn: el.querySelector('.fw .btn'),
                fwBtnShown: null,
                cells: null, cellInfo: null, lastStates: null
            };

            el.querySelector('.l1').addEventListener('click', function () {
                if (expanded.has(t.id)) expanded.delete(t.id);
                else expanded.add(t.id);
                el.setAttribute('data-open', expanded.has(t.id) ? '1' : '0');
                render();
            });
            el.querySelector('.l1').style.cursor = 'pointer';

            return { el: el, refs: refs, last: {} };
        }

        function updateRow(row, t, s) {
            const el = row.el, refs = row.refs, last = row.last;
            const shownName = (t.state === STATE.DONE && t.output) ? t.output : t.name;

            if (last.state !== t.state) {
                el.setAttribute('data-state', t.state);
                last.state = t.state;
            }

            // 按钮随状态与开关配置共同变化，用 key 判断是否需要重建
            const acts = (ACTIONS[t.state] || []).filter(function (a) { return actionAllowed(t, a[0]); });
            const actsKey = acts.map(function (a) { return a[0]; }).join(',');
            if (last.actsKey !== actsKey) {
                refs.acts.innerHTML = acts.map(function (a) {
                    return '<button class="btn" data-act="' + a[0] + '" data-id="' + t.id + '">' + a[1] + '</button>';
                }).join('');
                last.actsKey = actsKey;
            }

            if (last.name !== shownName) {
                refs.nm.textContent = shownName;
                refs.nm.title = shownName;
                refs.badge.textContent = extTag(shownName);
                last.name = shownName;
            }

            const pctText = t.state === STATE.PACKAGING ? '' : Math.round(s.pct) + '%';
            if (last.pctTxt !== pctText) {
                refs.pc.textContent = pctText;
                last.pctTxt = pctText;
            }

            const tag = t.state === STATE.PACKAGING ? '<span class="tag" data-k="packaging">打包中</span>' : '';
            if (last.tag !== tag) {
                if (tag) {
                    if (!refs.pc.nextElementSibling || !refs.pc.nextElementSibling.classList.contains('tag')) {
                        refs.pc.insertAdjacentHTML('afterend', tag);
                    }
                } else if (refs.pc.nextElementSibling && refs.pc.nextElementSibling.classList.contains('tag')) {
                    refs.pc.nextElementSibling.remove();
                }
                last.tag = tag;
            }

            const meta = metaText(t, s);
            if (last.meta !== meta) {
                refs.mt.textContent = meta;
                last.meta = meta;
            }

            if (t.state === STATE.PACKAGING) {
                if (!refs.bar.classList.contains('indet')) refs.bar.classList.add('indet');
                refs.barFill.style.background = 'var(--purple)';
            } else {
                refs.bar.classList.remove('indet');
                const w = Math.round(s.pct) + '%';
                if (last.w !== w) {
                    refs.barFill.style.width = w;
                    last.w = w;
                }
                const color = t.state === STATE.DONE ? 'var(--green)'
                    : t.state === STATE.ERROR ? 'var(--red)'
                        : t.state === STATE.PAUSED ? 'var(--gray)'
                            : 'var(--blue)';
                if (last.color !== color) {
                    refs.barFill.style.background = color;
                    last.color = color;
                }
            }

            const open = expanded.has(t.id) ? '1' : '0';
            if (el.getAttribute('data-open') !== open) el.setAttribute('data-open', open);
            if (open === '1') updateMatrix(t, refs, s);
        }

        function summary(tasks) {
            let active = 0, pack = 0, done = 0, failed = 0, queued = 0, paused = 0;
            let totalSize = 0, totalGot = 0;
            for (let i = 0; i < tasks.length; i++) {
                const t = tasks[i], s = stats(t);
                totalSize += s.size; totalGot += s.got;
                if (t.state === STATE.PACKAGING) pack++;
                else if (t.state === STATE.DOWNLOADING) active++;
                else if (t.state === STATE.DONE) done++;
                else if (t.state === STATE.ERROR) failed++;
                else if (t.state === STATE.PAUSED) paused++;
                else queued++;
            }
            const pct = totalSize > 0 ? clamp(totalGot / totalSize * 100, 0, 100) : (done ? 100 : 0);
            return { active: active, pack: pack, done: done, failed: failed, paused: paused, queued: queued, pct: pct };
        }

        function render() {
            if (!mounted) return;
            const tasks = store.list();
            const sum = summary(tasks);

            if (tasks.length === 0) {
                rows.forEach(function (row) { row.el.remove(); });
                rows.clear();
                host.style.display = 'none';
                return;
            }
            host.style.display = '';

            cntEl.textContent = String(tasks.length);

            const run = sum.active + sum.pack;
            capNum.textContent = Math.round(sum.pct) + '%';
            const parts = [];
            if (sum.active) parts.push(sum.active + ' 下载中');
            if (sum.pack) parts.push(sum.pack + ' 打包');
            if (sum.paused) parts.push(sum.paused + ' 暂停');
            if (!parts.length && sum.done) parts.push(sum.done + ' 已完成');
            if (!parts.length && sum.failed) parts.push(sum.failed + ' 失败');
            capSub.textContent = parts.join(' · ');
            const C = 2 * Math.PI * 12;
            capRing.setAttribute('stroke-dasharray', C.toFixed(1));
            capRing.setAttribute('stroke-dashoffset', (C * (1 - sum.pct / 100)).toFixed(1));
            capRing.style.stroke = sum.failed && !run ? 'var(--red)' : 'var(--blue)';

            const seen = new Set();
            tasks.forEach(function (t, idx) {
                seen.add(t.id);
                let row = rows.get(t.id);
                if (!row) {
                    row = createRow(t);
                    rows.set(t.id, row);
                    const before = listEl.children[idx] || null;
                    listEl.insertBefore(row.el, before);
                    if (expanded.has(t.id)) row.el.setAttribute('data-open', '1');
                } else if (listEl.children[idx] !== row.el) {
                    listEl.insertBefore(row.el, listEl.children[idx] || null);
                }
                updateRow(row, t, stats(t));
                verifyToast(row, t);
            });

            rows.forEach(function (row, id) {
                if (!seen.has(id)) {
                    row.el.remove();
                    rows.delete(id);
                }
            });

            // 内容更新后再定位：胶囊宽度随文案变化，先定位会用到上一帧的尺寸
            anchor();
        }

        // 未手动拖拽时始终贴住右下角（面板高度随任务数、胶囊宽度随文案变化）
        function anchor() {
            if (!host || pinned) return;
            const w = host.offsetWidth || PANEL_W;
            const h = host.offsetHeight || 220;
            pos.x = Math.max(8, window.innerWidth - w - 16);
            pos.y = Math.max(8, window.innerHeight - h - 16);
            host.style.left = pos.x + 'px';
            host.style.top = pos.y + 'px';
        }

        function verifyToast(row, t) {
            const prev = row.last.was;
            row.last.was = t.state;
            if (prev == null) return;
            if (prev !== STATE.DONE && t.state === STATE.DONE) {
                toast('done', (t.output || t.name), '打包完成', t.id);
            } else if (prev !== STATE.ERROR && t.state === STATE.ERROR) {
                toast('error', t.name, '下载失败', t.id);
            }
        }

        function toast(kind, title, sub, taskId) {
            if (!toastBox) return;
            const el = document.createElement('div');
            el.className = 'toast';
            el.setAttribute('data-k', kind);
            el.innerHTML = '<div class="ico">' + (kind === 'done' ? 'ZIP' : '!') + '</div>' +
                '<div class="tx"><b></b>' + sub + '</div>';
            el.querySelector('b').textContent = title;
            toastBox.appendChild(el);
            setTimeout(function () {
                el.style.transition = 'opacity .2s';
                el.style.opacity = '0';
                setTimeout(function () { el.remove(); }, 220);
            }, 6000);
        }

        function scheduleRender() {
            if (raf) return;
            raf = requestAnimationFrame(function () {
                raf = 0;
                render();
            });
        }

        function destroy() {
            if (host) {
                window.removeEventListener('resize', onResize);
                host.remove();
            }
            mounted = false;
            rows.clear();
            host = root = null;
            wrapEl = panel = listEl = capEl = null;
            capNum = capSub = capRing = toastBox = cntEl = null;
        }

        return {
            mount: mount,
            render: render,
            scheduleRender: scheduleRender,
            setMini: setMini,
            isMini: function () { return mini; },
            destroy: destroy,
            onAction: function (fn) { actionHandlers.push(fn); return function () { actionHandlers = actionHandlers.filter(function (x) { return x !== fn; }); }; },
            refreshPanel: function () { applyMini(); render(); }
        };
    }

    /* ------------------------------------------------------------------ API */

    const store = createStore();
    const view = createView(store);

    const api = {
        version: VERSION,
        STATE: STATE,
        store: store,
        mount: function () { view.mount(); view.render(); return api; },
        expand: function () { view.mount(); view.setMini(false); return api; },
        collapse: function () { view.mount(); view.setMini(true); return api; },
        onAction: function (fn) { view.mount(); return view.onAction(fn); },
        destroy: function () { view.destroy(); },
        // 开关操作按钮：coofoUtils.downloadUI.config({ pause: false, cancel: false })
        // 不传参数则返回当前配置
        config: function (patch) {
            if (patch) {
                Object.keys(UI_CONFIG).forEach(function (k) {
                    if (Object.prototype.hasOwnProperty.call(patch, k)) UI_CONFIG[k] = !!patch[k];
                });
                view.mount();
                view.scheduleRender();
            }
            const out = {};
            Object.keys(UI_CONFIG).forEach(function (k) { out[k] = UI_CONFIG[k]; });
            return out;
        }
    };

    // store 有变化就重绘；首次调用同时完成挂载（空列表时窗口自动隐藏）
    store.subscribe(function () {
        view.mount();
        view.scheduleRender();
    });

    pageNS.downloadUI = api;
    if (PAGE !== window) nsOf(window).downloadUI = api;

    console.log('[coofoUtils.downloadUI] v' + VERSION + ' ready — 通过 coofoUtils.downloadUI.store 写入任务');
})();
