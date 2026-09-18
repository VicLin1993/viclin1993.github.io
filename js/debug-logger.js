/**
 * ========================================================
 * 临时调试日志控制台 (Debug Console)
 * 特性：固定悬浮底部、全页面通用、全自动捕获未处理报错与日志
 * 未来移除方法：直接在 index.html 中删除本脚本引用即可
 * ========================================================
 */
(function() {
    // 注入 CSS 样式
    const style = document.createElement('style');
    style.innerHTML = `
        #debug-console-panel {
            position: fixed;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 180px;
            background: #0d1117;
            border-top: 2px solid #30363d;
            box-shadow: 0 -4px 12px rgba(0,0,0,0.5);
            z-index: 999999;
            font-family: monospace;
            font-size: 12px;
            display: flex;
            flex-direction: column;
            transition: height 0.2s ease;
        }
        #debug-console-panel.minimized {
            height: 32px;
        }
        #debug-console-header {
            background: #161b22;
            color: #58a6ff;
            padding: 6px 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #30363d;
            user-select: none;
        }
        #debug-console-header .title {
            font-weight: bold;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        #debug-console-header .actions button {
            background: #21262d;
            color: #c9d1d9;
            border: 1px solid #30363d;
            padding: 2px 8px;
            margin-left: 6px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
        }
        #debug-console-header .actions button:hover {
            background: #30363d;
            color: #fff;
        }
        #debug-console-body {
            flex: 1;
            overflow-y: auto;
            padding: 8px 12px;
            color: #e6edf3;
            line-height: 1.4;
            white-space: pre-wrap;
            word-break: break-all;
        }
        .log-item { margin-bottom: 4px; border-bottom: 1px dashed #21262d; padding-bottom: 2px; }
        .log-item.error { color: #f85149; }
        .log-item.warn { color: #d29922; }
        .log-item.info { color: #58a6ff; }
        .log-time { color: #8b949e; margin-right: 8px; }
    `;
    document.head.appendChild(style);

    // 建立 HTML 结构
    const panel = document.createElement('div');
    panel.id = 'debug-console-panel';
    panel.innerHTML = `
        <div id="debug-console-header">
            <div class="title">
                <span>🐞 临时调试控制台 (Debug Logs)</span>
            </div>
            <div class="actions">
                <button onclick="window.copyDebugLogs()">复制日志</button>
                <button onclick="window.clearDebugLogs()">清空</button>
                <button id="debug-toggle-btn" onclick="window.toggleDebugConsole()">最小化</button>
            </div>
        </div>
        <div id="debug-console-body"></div>
    `;
    
    // 确保 DOM 加载后挂载
    if (document.body) {
        document.body.appendChild(panel);
    } else {
        window.addEventListener('DOMContentLoaded', () => document.body.appendChild(panel));
    }

    // 全局日志打印辅助
    window.appendDebugLog = function(msg, type = 'info') {
        const body = document.getElementById('debug-console-body');
        if (!body) return;

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}.${String(now.getMilliseconds()).padStart(3,'0')}`;

        const item = document.createElement('div');
        item.className = `log-item ${type}`;
        item.innerHTML = `<span class="log-time">[${timeStr}]</span>${escapeHtml(msg)}`;
        body.appendChild(item);

        // 自动滚动到底部
        body.scrollTop = body.scrollHeight;
    };

    window.clearDebugLogs = function() {
        const body = document.getElementById('debug-console-body');
        if (body) body.innerHTML = '';
    };

    window.toggleDebugConsole = function() {
        const p = document.getElementById('debug-console-panel');
        const btn = document.getElementById('debug-toggle-btn');
        if (p.classList.contains('minimized')) {
            p.classList.remove('minimized');
            btn.innerText = '最小化';
        } else {
            p.classList.add('minimized');
            btn.innerText = '展开';
        }
    };

    window.copyDebugLogs = function() {
        const body = document.getElementById('debug-console-body');
        if (!body) return;
        const text = body.innerText;
        navigator.clipboard.writeText(text).then(() => {
            alert('日志已成功复制到剪贴板！');
        }).catch(() => {
            alert('复制失败，请手动选中日志文本进行复制。');
        });
    };

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // 捕获未处理的 JS 异常 (例如函数未定义、语法错误等)
    window.addEventListener('error', function(e) {
        const msg = `[JS Error] ${e.message} at ${e.filename}:${e.lineno}:${e.colno}`;
        window.appendDebugLog(msg, 'error');
    });

    // 捕获异步 Promise Reject 报错 (例如 fetch 异常/接口报错)
    window.addEventListener('unhandledrejection', function(e) {
        const msg = `[Promise Error] Reason: ${e.reason ? (e.reason.message || JSON.stringify(e.reason)) : 'Unknown'}`;
        window.appendDebugLog(msg, 'error');
    });

    // 拦截 console.error
    const originalConsoleError = console.error;
    console.error = function(...args) {
        originalConsoleError.apply(console, args);
        window.appendDebugLog(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '), 'error');
    };

    // 初始提示
    setTimeout(() => {
        window.appendDebugLog('调试面板已启动，等待点击或抓取报错...', 'info');
    }, 500);
})();
