/**
 * ========================================================
 * 模块：js/compare.js
 * 职责：左右双面板配置对比，各行差异高亮
 * 左面板 = 上一版本（历史）
 * 右面板 = 当前版本
 * 左右各有自己的筛选区，点进来时两边自动填同配置
 * ========================================================
 */

function formatSimpleTime(timeInput) {
    if (!timeInput) return '未知时间';
    if (typeof timeInput === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timeInput.trim())) {
        return timeInput.trim();
    }
    try {
        let date;
        if (typeof timeInput === 'number' || (!isNaN(Number(timeInput)) && !String(timeInput).includes('-'))) {
            date = new Date(Number(timeInput));
        } else {
            let str = String(timeInput).replace('T', ' ');
            str = str.split('.')[0].split('+')[0].split('Z')[0].trim();
            date = new Date(str.replace(/-/g, '/'));
            if (isNaN(date.getTime())) return str;
        }
        const pad = (num) => String(num).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    } catch (e) {
        return String(timeInput);
    }
}

/* ---------- 行级 diff（LCS） ---------- */
function computeLineDiff(aText, bText) {
    const aLines = aText.split('\n');
    const bLines = bText.split('\n');
    const m = aLines.length, n = bLines.length;
    const aDiff = new Set(), bDiff = new Set();

    // 超大内容兜底：逐行对比
    if (m * n > 2000000) {
        const maxLen = Math.max(m, n);
        for (let i = 0; i < maxLen; i++) {
            if (aLines[i] !== bLines[i]) {
                if (i < m) aDiff.add(i);
                if (i < n) bDiff.add(i);
            }
        }
        return { aDiff, bDiff };
    }

    const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
    for (let i = m - 1; i >= 0; i--) {
        for (let j = n - 1; j >= 0; j--) {
            if (aLines[i] === bLines[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
            else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    let i = 0, j = 0;
    while (i < m && j < n) {
        if (aLines[i] === bLines[j]) { i++; j++; }
        else if (dp[i + 1][j] >= dp[i][j + 1]) { aDiff.add(i); i++; }
        else { bDiff.add(j); j++; }
    }
    while (i < m) { aDiff.add(i); i++; }
    while (j < n) { bDiff.add(j); j++; }
    return { aDiff, bDiff };
}

/* ---------- 高亮渲染 ---------- */
function renderHighlight(highlightEl, text, diffSet, diffType) {
    if (!highlightEl) return;
    const lines = text.split('\n');
    let html = '';
    for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx];
        const isDiff = diffSet && diffSet.has(idx);
        const cls = isDiff ? `line diff-${diffType}` : 'line';
        const content = escapeHtml(line);
        html += `<span class="${cls}">${content || ' '}</span>`;
    }
    highlightEl.innerHTML = html;
}

function refreshCompareDiff() {
    const leftTa  = document.getElementById('leftText');
    const rightTa = document.getElementById('rightText');
    const leftHl  = document.getElementById('leftHighlight');
    const rightHl = document.getElementById('rightHighlight');
    if (!leftTa || !rightTa) return;

    const leftText  = leftTa.value;
    const rightText = rightTa.value;
    const { aDiff, bDiff } = computeLineDiff(leftText, rightText);

    renderHighlight(leftHl,  leftText,  aDiff, 'del');
    renderHighlight(rightHl, rightText, bDiff, 'add');
}

/* ---------- 滚动同步 ---------- */
function bindEditorScroll(textareaId, highlightId) {
    const ta = document.getElementById(textareaId);
    const hl = document.getElementById(highlightId);
    if (!ta || !hl) return;
    ta.addEventListener('scroll', () => {
        hl.scrollTop  = ta.scrollTop;
        hl.scrollLeft = ta.scrollLeft;
    });
}

/* ---------- datalist 刷新 ---------- */
function refreshNamespaceDatalist() {
    const list = document.getElementById('compareNsList');
    if (!list) return;
    list.innerHTML = '';
    if (typeof rawNamespaceList === 'undefined' || !Array.isArray(rawNamespaceList)) return;
    rawNamespaceList.forEach(ns => {
        const rawId = ns.namespace || '';
        const id = rawId === '' ? 'public' : rawId;
        const opt = document.createElement('option');
        opt.value = id;
        const showName = ns.namespaceShowName || '';
        if (showName && showName !== id) opt.label = showName;
        list.appendChild(opt);
    });
}

async function refreshCompareDatalists(nsId) {
    const groupList  = document.getElementById('compareGroupList');
    const dataIdList = document.getElementById('compareDataIdList');
    if (!groupList || !dataIdList) return;

    const token = localStorage.getItem('nacos_access_token') || '';
    const cleanUrl = (localStorage.getItem('nacos_server_url') || '').replace(/\/+$/, '');
    const tenant = (nsId === 'public' || !nsId) ? '' : nsId;

    try {
        const url = `${cleanUrl}/nacos/v1/cs/configs?dataId=&group=&appName=&config_tags=&pageNo=1&pageSize=500&tenant=${encodeURIComponent(tenant)}&search=accurate&accessToken=${encodeURIComponent(token)}`;
        const resp = await fetch(url);
        const data = await resp.json();
        const items = data.pageItems || [];

        const groupSet = new Set();
        const dataIdSet = new Set();
        items.forEach(it => {
            if (it.group) groupSet.add(it.group);
            if (it.dataId) dataIdSet.add(it.dataId);
        });

        groupList.innerHTML = '';
        dataIdList.innerHTML = '';
        groupSet.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g;
            groupList.appendChild(opt);
        });
        dataIdSet.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d;
            dataIdList.appendChild(opt);
        });
    } catch (err) {
        console.error('刷新 datalist 失败:', err);
    }
}

/* ---------- 单个面板加载 ---------- */
async function loadPanel(side, mode) {
    const nsEl     = document.getElementById(side + 'Ns');
    const groupEl  = document.getElementById(side + 'Group');
    const dataIdEl = document.getElementById(side + 'DataId');
    const ta       = document.getElementById(side + 'Text');
    const metaEl   = document.getElementById(side + 'Meta');
    if (!nsEl || !dataIdEl || !ta) return;

    const nsId  = nsEl.value.trim();
    const group = groupEl.value.trim() || 'DEFAULT_GROUP';
    const dataId = dataIdEl.value.trim();

    if (!dataId) {
        ta.value = '';
        if (metaEl) metaEl.innerText = '未指定 Data ID';
        refreshCompareDiff();
        return;
    }

    ta.value = '加载中...';
    if (metaEl) metaEl.innerText = '';
    refreshCompareDiff();

    const token = localStorage.getItem('nacos_access_token') || '';
    const cleanUrl = (localStorage.getItem('nacos_server_url') || '').replace(/\/+$/, '');
    const tenant = (nsId === 'public' || !nsId) ? '' : nsId;

    try {
        if (mode === 'current') {
            const url = `${cleanUrl}/nacos/v1/cs/configs?dataId=${encodeURIComponent(dataId)}&group=${encodeURIComponent(group)}&tenant=${encodeURIComponent(tenant)}&accessToken=${encodeURIComponent(token)}`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const content = await resp.text();
            ta.value = content || '';
            if (metaEl) metaEl.innerText = '当前版本';
        } else {
            const url = `${cleanUrl}/nacos/v1/cs/history?search=accurate&dataId=${encodeURIComponent(dataId)}&group=${encodeURIComponent(group)}&tenant=${encodeURIComponent(tenant)}&pageNo=1&pageSize=1&accessToken=${encodeURIComponent(token)}`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();
            const items = data.pageItems || [];
            if (items.length === 0) {
                ta.value = '（没有历史版本）';
                if (metaEl) metaEl.innerText = '无历史记录';
            } else {
                ta.value = items[0].content || '';
                if (metaEl) metaEl.innerText = formatSimpleTime(items[0].lastModifiedTime || items[0].createdTime);
            }
        }
    } catch (err) {
        ta.value = `[!] 加载失败: ${err.message}`;
        if (metaEl) metaEl.innerText = '加载失败';
    }

    refreshCompareDiff();
}

/* ---------- 从配置列表进来 ---------- */
async function openCompareView(dataId, group, nsId) {
    try {
        let targetDataId = '';
        let targetGroup = 'DEFAULT_GROUP';
        let targetNs = nsId || (typeof activeNamespaceId !== 'undefined' ? activeNamespaceId : '');

        if (typeof dataId === 'object' && dataId !== null) {
            targetDataId = dataId.dataId || dataId.id || '';
            targetGroup = dataId.group || 'DEFAULT_GROUP';
        } else {
            targetDataId = dataId || '';
            targetGroup = group || 'DEFAULT_GROUP';
        }

        if (window.appendDebugLog) {
            window.appendDebugLog(`[对比打开] ns=${targetNs}, group=${targetGroup}, dataId=${targetDataId}`, 'info');
        }

        // 切到对比视图（不动左侧导航）
        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        const cmp = document.getElementById('view-compare');
        if (cmp) cmp.classList.add('active');

        // 左右两侧都先填成同一份配置
        ['left', 'right'].forEach(side => {
            const nsEl     = document.getElementById(side + 'Ns');
            const groupEl  = document.getElementById(side + 'Group');
            const dataIdEl = document.getElementById(side + 'DataId');
            if (nsEl)     nsEl.value     = targetNs;
            if (groupEl)  groupEl.value  = targetGroup;
            if (dataIdEl) dataIdEl.value = targetDataId;
        });

        refreshNamespaceDatalist();
        refreshCompareDatalists(targetNs).catch(e => console.error(e));

        if (targetDataId) {
            // 左边拉历史，右边拉当前，并行
            await Promise.all([
                loadPanel('left',  'history'),
                loadPanel('right', 'current')
            ]);
        }
    } catch (err) {
        console.error('openCompareView 异常:', err);
        if (window.appendDebugLog) {
            window.appendDebugLog(`[对比异常] ${err.message}`, 'error');
        }
    }
}

/* ---------- 兼容旧调用名 ---------- */
function compareToQueryTab(p1, p2) {
    let dataId = '';
    let group = 'DEFAULT_GROUP';
    if (typeof p1 === 'object' && p1 !== null) {
        dataId = p1.dataId || '';
        group = p1.group || 'DEFAULT_GROUP';
    } else {
        dataId = p1 || '';
        group = p2 || 'DEFAULT_GROUP';
    }
    openCompareView(dataId, group, (typeof activeNamespaceId !== 'undefined' ? activeNamespaceId : ''));
}
function openCompareModal(p1, p2) {
    compareToQueryTab(p1, p2);
}

/* ---------- 初始化 ---------- */
function initCompareView() {
    bindEditorScroll('leftText',  'leftHighlight');
    bindEditorScroll('rightText', 'rightHighlight');

    let timer = null;
    const debouncedDiff = () => {
        clearTimeout(timer);
        timer = setTimeout(refreshCompareDiff, 200);
    };
    const leftTa  = document.getElementById('leftText');
    const rightTa = document.getElementById('rightText');
    if (leftTa)  leftTa.addEventListener('input',  debouncedDiff);
    if (rightTa) rightTa.addEventListener('input', debouncedDiff);

    // 回车加载
    [
        { id: 'leftDataId',  side: 'left',  mode: 'history' },
        { id: 'rightDataId', side: 'right', mode: 'current' }
    ].forEach(({ id, side, mode }) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', e => {
            if (e.key === 'Enter') loadPanel(side, mode);
        });
    });
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initCompareView);
} else {
    initCompareView();
}
