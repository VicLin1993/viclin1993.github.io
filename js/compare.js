/**
 * 模块：js/compare.js
 * 左右双面板配置对比
 * 左 = 历史版本列表 + 版本选择 + 回滚
 * 右 = 当前版本
 * 差异行高亮
 */

function formatSimpleTime(timeInput) {
    if (!timeInput) return '未知时间';
    if (typeof timeInput === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timeInput.trim())) return timeInput.trim();
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
        const pad = (n) => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    } catch (e) { return String(timeInput); }
}

/* ---------- 缓存当前左侧历史列表 ---------- */
let leftHistoryList = [];   // 按 Nacos 返回顺序，第一条 = 最新历史版

/* ---------- NS 加载 ---------- */
async function ensureNsLoaded() {
    if (typeof rawNamespaceList !== 'undefined' && Array.isArray(rawNamespaceList) && rawNamespaceList.length > 0) {
        return rawNamespaceList;
    }
    const token = localStorage.getItem('nacos_access_token') || '';
    const cleanUrl = (localStorage.getItem('nacos_server_url') || '').replace(/\/+$/, '');
    try {
        const resp = await fetch(`${cleanUrl}/nacos/v1/console/namespaces?accessToken=${encodeURIComponent(token)}`);
        if (!resp.ok) return [];
        const data = await resp.json();
        let list = [];
        if (Array.isArray(data)) list = data;
        else if (data && Array.isArray(data.data)) list = data.data;
        if (typeof rawNamespaceList !== 'undefined') rawNamespaceList = list;
        else window.rawNamespaceList = list;
        if (typeof filteredNamespaceList !== 'undefined') filteredNamespaceList = [...list];
        else window.filteredNamespaceList = [...list];
        return list;
    } catch (e) { return []; }
}

function fillNsSelects() {
    const opts = [{ value: '', label: 'public (默认)' }];
    const list = (typeof rawNamespaceList !== 'undefined' && Array.isArray(rawNamespaceList)) ? rawNamespaceList : [];
    list.forEach(ns => {
        const rawId = ns.namespace || '';
        const showName = ns.namespaceShowName || rawId || 'public (默认)';
        const label = rawId ? `${showName} (${rawId})` : `${showName} (public)`;
        opts.push({ value: rawId, label });
    });
    ['leftNs', 'rightNs'].forEach(selId => {
        const sel = document.getElementById(selId);
        if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = '';
        opts.forEach(item => {
            const o = document.createElement('option');
            o.value = item.value;
            o.textContent = item.label;
            sel.appendChild(o);
        });
        if (prev !== '' && opts.some(o => o.value === prev)) sel.value = prev;
    });
}

/* ---------- diff ---------- */
function computeLineDiff(aText, bText) {
    const aLines = aText.split('\n'), bLines = bText.split('\n');
    const m = aLines.length, n = bLines.length;
    const aDiff = new Set(), bDiff = new Set();
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
            if (aLines[i] === bLines[j]) dp[i][j] = dp[i+1][j+1] + 1;
            else dp[i][j] = Math.max(dp[i+1][j], dp[i][j+1]);
        }
    }
    let i = 0, j = 0;
    while (i < m && j < n) {
        if (aLines[i] === bLines[j]) { i++; j++; }
        else if (dp[i+1][j] >= dp[i][j+1]) { aDiff.add(i); i++; }
        else { bDiff.add(j); j++; }
    }
    while (i < m) { aDiff.add(i); i++; }
    while (j < n) { bDiff.add(j); j++; }
    return { aDiff, bDiff };
}

function renderHighlight(el, text, diffSet, diffType) {
    if (!el) return;
    const lines = text.split('\n');
    let html = '';
    for (let idx = 0; idx < lines.length; idx++) {
        const isDiff = diffSet && diffSet.has(idx);
        const cls = isDiff ? `line diff-${diffType}` : 'line';
        html += `<span class="${cls}">${escapeHtml(lines[idx]) || ' '}</span>`;
    }
    el.innerHTML = html;
}

function refreshCompareDiff() {
    const lt = document.getElementById('leftText'),  rt = document.getElementById('rightText');
    const lh = document.getElementById('leftHighlight'), rh = document.getElementById('rightHighlight');
    if (!lt || !rt) return;
    const { aDiff, bDiff } = computeLineDiff(lt.value, rt.value);
    renderHighlight(lh, lt.value, aDiff, 'del');
    renderHighlight(rh, rt.value, bDiff, 'add');
}

function bindEditorScroll(taId, hlId) {
    const ta = document.getElementById(taId), hl = document.getElementById(hlId);
    if (!ta || !hl) return;
    ta.addEventListener('scroll', () => { hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; });
}

/* ---------- datalist ---------- */
async function refreshCompareDatalists(nsId) {
    const groupList = document.getElementById('compareGroupList');
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
        const groupSet = new Set(), dataIdSet = new Set();
        items.forEach(it => { if (it.group) groupSet.add(it.group); if (it.dataId) dataIdSet.add(it.dataId); });
        groupList.innerHTML = ''; dataIdList.innerHTML = '';
        groupSet.forEach(g => { const o = document.createElement('option'); o.value = g; groupList.appendChild(o); });
        dataIdSet.forEach(d => { const o = document.createElement('option'); o.value = d; dataIdList.appendChild(o); });
    } catch (e) { console.error('刷新 datalist 失败:', e); }
}

/* ---------- 填充左侧版本下拉框 ---------- */
function fillLeftVersionSelect(historyItems) {
    const sel = document.getElementById('leftVersionSel');
    const cnt = document.getElementById('leftVersionCount');
    const btn = document.getElementById('btnRollback');
    if (!sel) return;

    sel.innerHTML = '';

    if (!historyItems || historyItems.length === 0) {
        const o = document.createElement('option');
        o.value = '';
        o.textContent = '（无历史版本）';
        sel.appendChild(o);
        if (cnt) cnt.innerText = '共 0 条';
        if (btn) btn.disabled = true;
        return;
    }

    historyItems.forEach((item, idx) => {
        const o = document.createElement('option');
        o.value = String(idx);
        const t = formatSimpleTime(item.lastModifiedTime || item.createdTime);
        const tag = idx === 0 ? '（最新历史版）' : `（第 ${idx + 1} 旧）`;
        o.textContent = `${t} ${tag}`;
        sel.appendChild(o);
    });
    sel.value = '0';
    if (cnt) cnt.innerText = `共 ${historyItems.length} 条`;
    if (btn) btn.disabled = false;
}

/* ---------- 加载左侧选中版本内容 ---------- */
function applyLeftVersionByIndex(idx) {
    const ta = document.getElementById('leftText');
    const meta = document.getElementById('leftMeta');
    if (!ta) return;
    const item = leftHistoryList[idx];
    if (!item) {
        ta.value = '';
        if (meta) meta.innerText = '';
        refreshCompareDiff();
        return;
    }
    ta.value = item.content || '';
    if (meta) meta.innerText = formatSimpleTime(item.lastModifiedTime || item.createdTime) + (idx === 0 ? ' · 最新历史版' : '');
    refreshCompareDiff();
}

/* ---------- 加载面板 ---------- */
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

    if (mode === 'current') {
        try {
            const url = `${cleanUrl}/nacos/v1/cs/configs?dataId=${encodeURIComponent(dataId)}&group=${encodeURIComponent(group)}&tenant=${encodeURIComponent(tenant)}&accessToken=${encodeURIComponent(token)}`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const content = await resp.text();
            ta.value = content || '';
            if (metaEl) metaEl.innerText = '当前版本';
        } catch (err) {
            ta.value = `[!] 加载失败: ${err.message}`;
            if (metaEl) metaEl.innerText = '加载失败';
        }
        refreshCompareDiff();
        return;
    }

    // 历史版本：拉完整列表填充下拉框
    try {
        const url = `${cleanUrl}/nacos/v1/cs/history?search=accurate&dataId=${encodeURIComponent(dataId)}&group=${encodeURIComponent(group)}&tenant=${encodeURIComponent(tenant)}&pageNo=1&pageSize=20&accessToken=${encodeURIComponent(token)}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        const items = data.pageItems || [];
        leftHistoryList = items;
        fillLeftVersionSelect(items);
        if (items.length > 0) {
            applyLeftVersionByIndex(0);
        } else {
            ta.value = '（没有历史版本）';
            if (metaEl) metaEl.innerText = '无历史记录';
            refreshCompareDiff();
        }
    } catch (err) {
        leftHistoryList = [];
        fillLeftVersionSelect([]);
        ta.value = `[!] 加载历史失败: ${err.message}`;
        if (metaEl) metaEl.innerText = '加载失败';
        refreshCompareDiff();
    }
}

/* ---------- 版本切换 ---------- */
function onLeftVersionChange() {
    const sel = document.getElementById('leftVersionSel');
    if (!sel) return;
    const idx = parseInt(sel.value, 10);
    if (isNaN(idx)) return;
    applyLeftVersionByIndex(idx);
}

/* ---------- 回滚到选中版本 ---------- */
async function rollbackLeftVersion() {
    const sel = document.getElementById('leftVersionSel');
    if (!sel) return;
    const idx = parseInt(sel.value, 10);
    const item = leftHistoryList[idx];
    if (!item) { alert('请先选择一个历史版本'); return; }

    const nsEl = document.getElementById('leftNs');
    const groupEl = document.getElementById('leftGroup');
    const dataIdEl = document.getElementById('leftDataId');
    const nsId = (nsEl ? nsEl.value : '').trim();
    const group = (groupEl ? groupEl.value : '').trim() || 'DEFAULT_GROUP';
    const dataId = (dataIdEl ? dataIdEl.value : '').trim();
    if (!dataId) { alert('请先填写 Data ID'); return; }

    const timeStr = formatSimpleTime(item.lastModifiedTime || item.createdTime);
    if (!confirm(`确定要回滚到【${timeStr}】这个版本吗？\n\n回滚后当前配置将被该版本内容覆盖。`)) return;

    const btn = document.getElementById('btnRollback');
    if (btn) { btn.disabled = true; btn.innerText = '回滚中...'; }

    const token = localStorage.getItem('nacos_access_token') || '';
    const cleanUrl = (localStorage.getItem('nacos_server_url') || '').replace(/\/+$/, '');
    const tenant = (nsId === 'public' || !nsId) ? '' : nsId;

    try {
        // Nacos 回滚接口：POST /nacos/v1/cs/history/configs
        const body = new URLSearchParams({
            id: item.id,
            dataId: dataId,
            group: group,
            tenant: tenant,
            accessToken: token
        });
        const resp = await fetch(`${cleanUrl}/nacos/v1/cs/history/configs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body
        });
        const resultText = (await resp.text()).trim();

        if (resp.ok && resultText.toLowerCase() === 'true') {
            alert('✓ 回滚成功，已刷新右侧当前版本');
            await loadPanel('right', 'current');
        } else {
            alert(`[!] 回滚失败: ${resultText || ('HTTP ' + resp.status)}`);
        }
    } catch (err) {
        alert(`[!] 回滚异常: ${err.message}`);
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = '回滚到此版本'; }
    }
}

/* ---------- 从配置列表进来 ---------- */
async function openCompareView(dataId, group, nsId) {
    try {
        let targetDataId = '', targetGroup = 'DEFAULT_GROUP';
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

        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        const cmp = document.getElementById('view-compare');
        if (cmp) cmp.classList.add('active');

        await ensureNsLoaded();
        fillNsSelects();

        const nsValue = (targetNs === 'public' || !targetNs) ? '' : targetNs;
        ['left', 'right'].forEach(side => {
            const nsEl = document.getElementById(side + 'Ns');
            const groupEl = document.getElementById(side + 'Group');
            const dataIdEl = document.getElementById(side + 'DataId');
            if (nsEl) nsEl.value = nsValue;
            if (groupEl) groupEl.value = targetGroup;
            if (dataIdEl) dataIdEl.value = targetDataId;
        });

        refreshCompareDatalists(nsValue).catch(e => console.error(e));

        if (targetDataId) {
            await Promise.all([
                loadPanel('left', 'history'),
                loadPanel('right', 'current')
            ]);
        }
    } catch (err) {
        console.error('openCompareView 异常:', err);
        if (window.appendDebugLog) window.appendDebugLog(`[对比异常] ${err.message}`, 'error');
    }
}

/* ---------- 兼容旧调用名 ---------- */
function compareToQueryTab(p1, p2) {
    let dataId = '', group = 'DEFAULT_GROUP';
    if (typeof p1 === 'object' && p1 !== null) {
        dataId = p1.dataId || '';
        group = p1.group || 'DEFAULT_GROUP';
    } else { dataId = p1 || ''; group = p2 || 'DEFAULT_GROUP'; }
    openCompareView(dataId, group, (typeof activeNamespaceId !== 'undefined' ? activeNamespaceId : ''));
}
function openCompareModal(p1, p2) { compareToQueryTab(p1, p2); }

/* ---------- 初始化 ---------- */
function initCompareView() {
    bindEditorScroll('leftText', 'leftHighlight');
    bindEditorScroll('rightText', 'rightHighlight');

    let timer = null;
    const debouncedDiff = () => { clearTimeout(timer); timer = setTimeout(refreshCompareDiff, 200); };
    const lt = document.getElementById('leftText');
    const rt = document.getElementById('rightText');
    if (lt) lt.addEventListener('input', debouncedDiff);
    if (rt) rt.addEventListener('input', debouncedDiff);

    // 版本切换
    const verSel = document.getElementById('leftVersionSel');
    if (verSel) verSel.addEventListener('change', onLeftVersionChange);

    // 回车加载
    [
        { id: 'leftDataId',  side: 'left',  mode: 'history' },
        { id: 'rightDataId', side: 'right', mode: 'current' }
    ].forEach(({ id, side, mode }) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') loadPanel(side, mode); });
    });

    // NS 切换时刷新候选
    ['leftNs', 'rightNs'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => {
            refreshCompareDatalists(el.value).catch(e => console.error(e));
        });
    });
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initCompareView);
} else {
    initCompareView();
}
