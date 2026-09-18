function _esc(text) {
    if (!text) return '';
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function formatSimpleTime(t) {
    if (!t) return '';
    if (typeof t === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(t.trim())) return t.trim();
    try {
        let d;
        if (typeof t === 'number' || (!isNaN(Number(t)) && !String(t).includes('-'))) { d = new Date(Number(t)); }
        else {
            let s = String(t).replace('T', ' '); s = s.split('.')[0].split('+')[0].split('Z')[0].trim();
            d = new Date(s.replace(/-/g, '/'));
            if (isNaN(d.getTime())) return s;
        }
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    } catch (e) { return String(t); }
}
function _diff(aText, bText) {
    const aL = aText.split('\n'), bL = bText.split('\n');
    const m = aL.length, n = bL.length;
    const aD = new Set(), bD = new Set();
    if (m * n > 2000000) {
        const L = Math.max(m, n);
        for (let i = 0; i < L; i++) if (aL[i] !== bL[i]) { if (i < m) aD.add(i); if (i < n) bD.add(i); }
        return { aDiff: aD, bDiff: bD };
    }
    const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
    for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) {
        if (aL[i] === bL[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
        else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
    let i = 0, j = 0;
    while (i < m && j < n) {
        if (aL[i] === bL[j]) { i++; j++; }
        else if (dp[i + 1][j] >= dp[i][j + 1]) { aD.add(i); i++; }
        else { bD.add(j); j++; }
    }
    while (i < m) { aD.add(i); i++; }
    while (j < n) { bD.add(j); j++; }
    return { aDiff: aD, bDiff: bD };
}
function _renderHl(hl, text, diffSet, type) {
    if (!hl) return;
    const lines = text.split('\n');
    let html = '';
    for (let k = 0; k < lines.length; k++) {
        const cls = (diffSet && diffSet.has(k)) ? `line diff-${type}` : 'line';
        html += `<span class="${cls}">${_esc(lines[k]) || ' '}</span>`;
    }
    hl.innerHTML = html;
}
function _bindScroll(taId, hlId) {
    const ta = document.getElementById(taId), hl = document.getElementById(hlId);
    if (!ta || !hl) return;
    ta.addEventListener('scroll', () => { hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; });
}
async function _ensureNsLoaded() {
    if (typeof rawNamespaceList !== 'undefined' && Array.isArray(rawNamespaceList) && rawNamespaceList.length > 0) return rawNamespaceList;
    const token = localStorage.getItem('nacos_access_token') || '';
    const base = (localStorage.getItem('nacos_server_url') || '').replace(/\/+$/, '');
    try {
        const r = await fetch(`${base}/nacos/v1/console/namespaces?accessToken=${encodeURIComponent(token)}`);
        if (!r.ok) return [];
        const d = await r.json();
        const list = Array.isArray(d) ? d : (d && Array.isArray(d.data) ? d.data : []);
        if (typeof rawNamespaceList !== 'undefined') rawNamespaceList = list; else window.rawNamespaceList = list;
        if (typeof filteredNamespaceList !== 'undefined') filteredNamespaceList = [...list]; else window.filteredNamespaceList = [...list];
        return list;
    } catch (e) { return []; }
}
function _fillNsDatalist() {
    const dl = document.getElementById('compareNsList');
    if (!dl) return;
    const list = (typeof rawNamespaceList !== 'undefined' && Array.isArray(rawNamespaceList)) ? rawNamespaceList : [];
    dl.innerHTML = '';
    const o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'public (默认)';
    dl.appendChild(o0);
    list.forEach(ns => {
        const rawId = ns.namespace || '';
        if (!rawId) return;
        const o = document.createElement('option');
        o.value = rawId;
        o.textContent = ns.namespaceShowName || rawId;
        dl.appendChild(o);
    });
}
async function _refreshDatalists(nsId) {
    const gL = document.getElementById('compareGroupList');
    const dL = document.getElementById('compareDataIdList');
    if (!gL || !dL) return;
    const token = localStorage.getItem('nacos_access_token') || '';
    const base = (localStorage.getItem('nacos_server_url') || '').replace(/\/+$/, '');
    const tenant = (nsId === 'public' || !nsId) ? '' : nsId;
    try {
        const url = `${base}/nacos/v1/cs/configs?dataId=&group=&appName=&config_tags=&pageNo=1&pageSize=500&tenant=${encodeURIComponent(tenant)}&search=accurate&accessToken=${encodeURIComponent(token)}`;
        const r = await fetch(url);
        const d = await r.json();
        const items = d.pageItems || [];
        const gSet = new Set(), dSet = new Set();
        items.forEach(it => { if (it.group) gSet.add(it.group); if (it.dataId) dSet.add(it.dataId); });
        gL.innerHTML = ''; dL.innerHTML = '';
        gSet.forEach(g => { const o = document.createElement('option'); o.value = g; gL.appendChild(o); });
        dSet.forEach(x => { const o = document.createElement('option'); o.value = x; dL.appendChild(o); });
    } catch (e) { console.error('datalist 刷新失败:', e); }
}

let cvHistoryList = [];
let cvCtx = { ns: '', group: '', dataId: '' };
function cvRefreshDiff() {
    const lt = document.getElementById('cvLeftText');
    const rt = document.getElementById('cvRightText');
    if (!lt || !rt) return;
    const { aDiff, bDiff } = _diff(lt.value, rt.value);
    _renderHl(document.getElementById('cvLeftHighlight'), lt.value, aDiff, 'del');
    _renderHl(document.getElementById('cvRightHighlight'), rt.value, bDiff, 'add');
}
async function cvOpen(dataId, group, nsId) {
    cvCtx = { ns: nsId || (typeof activeNamespaceId !== 'undefined' ? activeNamespaceId : ''), group: group || 'DEFAULT_GROUP', dataId: dataId || '' };
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    const v = document.getElementById('view-compare');
    if (v) v.classList.add('active');
    const ctx = document.getElementById('cvContext');
    if (ctx) ctx.innerText = `${cvCtx.dataId} (${cvCtx.group})`;
    await Promise.all([cvLoadHistory(), cvLoadCurrent()]);
}
async function cvLoadHistory() {
    const sel = document.getElementById('cvLeftVersionSel');
    const cnt = document.getElementById('cvLeftVersionCount');
    const btn = document.getElementById('cvBtnRollback');
    const ta = document.getElementById('cvLeftText');
    const meta = document.getElementById('cvLeftMeta');
    if (!ta) return;
    ta.value = '加载中...'; if (meta) meta.innerText = '';
    cvRefreshDiff();
    const token = localStorage.getItem('nacos_access_token') || '';
    const base = (localStorage.getItem('nacos_server_url') || '').replace(/\/+$/, '');
    const tenant = (cvCtx.ns === 'public' || !cvCtx.ns) ? '' : cvCtx.ns;
    try {
        const url = `${base}/nacos/v1/cs/history?search=accurate&dataId=${encodeURIComponent(cvCtx.dataId)}&group=${encodeURIComponent(cvCtx.group)}&tenant=${encodeURIComponent(tenant)}&pageNo=1&pageSize=30&accessToken=${encodeURIComponent(token)}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        const items = d.pageItems || [];
        cvHistoryList = items;
        if (sel) {
            sel.innerHTML = '';
            if (items.length === 0) {
                const o = document.createElement('option'); o.value = ''; o.textContent = '（无历史版本）'; sel.appendChild(o);
            } else {
                items.forEach((it, idx) => {
                    const o = document.createElement('option');
                    o.value = String(idx);
                    o.textContent = formatSimpleTime(it.lastModifiedTime || it.createdTime) + (idx === 0 ? '（最新历史版）' : `（第 ${idx+1} 旧）`);
                    sel.appendChild(o);
                });
                sel.value = '0';
            }
        }
        if (cnt) cnt.innerText = `共 ${items.length} 条`;
        if (btn) btn.disabled = items.length === 0;
        if (items.length > 0) await cvLoadVersionAt(0);
        else { ta.value = '（没有历史版本）'; if (meta) meta.innerText = '无历史记录'; cvRefreshDiff(); }
    } catch (e) {
        ta.value = `[!] 加载历史失败: ${e.message}`; if (meta) meta.innerText = '加载失败';
        if (btn) btn.disabled = true;
        cvRefreshDiff();
    }
}
async function cvLoadVersionAt(idx) {
    const ta = document.getElementById('cvLeftText');
    const meta = document.getElementById('cvLeftMeta');
    if (!ta) return;
    const item = cvHistoryList[idx];
    if (!item) return;
    ta.value = '加载中...';
    if (meta) meta.innerText = formatSimpleTime(item.lastModifiedTime || item.createdTime) + (idx === 0 ? ' · 最新历史版' : '');
    const token = localStorage.getItem('nacos_access_token') || '';
    const base = (localStorage.getItem('nacos_server_url') || '').replace(/\/+$/, '');
    const tenant = (cvCtx.ns === 'public' || !cvCtx.ns) ? '' : cvCtx.ns;
    try {
        const url = `${base}/nacos/v1/cs/history?nid=${encodeURIComponent(item.id)}&dataId=${encodeURIComponent(cvCtx.dataId)}&group=${encodeURIComponent(cvCtx.group)}&tenant=${encodeURIComponent(tenant)}&accessToken=${encodeURIComponent(token)}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        ta.value = d.content || '';
    } catch (e) { ta.value = `[!] 获取历史内容失败: ${e.message}`; }
    cvRefreshDiff();
}
async function cvOnVersionChange() {
    const sel = document.getElementById('cvLeftVersionSel');
    if (!sel) return;
    const idx = parseInt(sel.value, 10);
    if (isNaN(idx)) return;
    await cvLoadVersionAt(idx);
}
async function cvLoadCurrent() {
    const ta = document.getElementById('cvRightText');
    const meta = document.getElementById('cvRightMeta');
    if (!ta) return;
    ta.value = '加载中...'; if (meta) meta.innerText = '';
    cvRefreshDiff();
    const token = localStorage.getItem('nacos_access_token') || '';
    const base = (localStorage.getItem('nacos_server_url') || '').replace(/\/+$/, '');
    const tenant = (cvCtx.ns === 'public' || !cvCtx.ns) ? '' : cvCtx.ns;
    try {
        const url = `${base}/nacos/v1/cs/configs?dataId=${encodeURIComponent(cvCtx.dataId)}&group=${encodeURIComponent(cvCtx.group)}&tenant=${encodeURIComponent(tenant)}&accessToken=${encodeURIComponent(token)}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        ta.value = await r.text();
        if (meta) meta.innerText = '当前版本';
    } catch (e) { ta.value = `[!] 加载失败: ${e.message}`; if (meta) meta.innerText = '加载失败'; }
    cvRefreshDiff();
}
async function cvRollback() {
    const sel = document.getElementById('cvLeftVersionSel');
    if (!sel) return;
    const idx = parseInt(sel.value, 10);
    const item = cvHistoryList[idx];
    if (!item) { alert('请先选择历史版本'); return; }
    const ts = formatSimpleTime(item.lastModifiedTime || item.createdTime);
    if (!confirm(`确定回滚到【${ts}】这个版本吗？`)) return;
    const btn = document.getElementById('cvBtnRollback');
    if (btn) { btn.disabled = true; btn.innerText = '回滚中...'; }
    const token = localStorage.getItem('nacos_access_token') || '';
    const base = (localStorage.getItem('nacos_server_url') || '').replace(/\/+$/, '');
    const tenant = (cvCtx.ns === 'public' || !cvCtx.ns) ? '' : cvCtx.ns;
    try {
        const dUrl = `${base}/nacos/v1/cs/history?nid=${encodeURIComponent(item.id)}&dataId=${encodeURIComponent(cvCtx.dataId)}&group=${encodeURIComponent(cvCtx.group)}&tenant=${encodeURIComponent(tenant)}&accessToken=${encodeURIComponent(token)}`;
        const dr = await fetch(dUrl);
        if (!dr.ok) throw new Error('读取历史失败: HTTP ' + dr.status);
        const dd = await dr.json();
        const content = dd.content || '';
        const body = new URLSearchParams({ dataId: cvCtx.dataId, group: cvCtx.group, tenant, content, accessToken: token });
        const pr = await fetch(`${base}/nacos/v1/cs/configs`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
        const txt = (await pr.text()).trim();
        if (pr.ok && txt.toLowerCase() === 'true') {
            alert('✓ 回滚成功');
            await Promise.all([cvLoadHistory(), cvLoadCurrent()]);
        } else alert('[!] 回滚失败: ' + (txt || 'HTTP ' + pr.status));
    } catch (e) { alert('[!] 回滚异常: ' + e.message); }
    finally { if (btn) { btn.disabled = false; btn.innerText = '回滚到此版本'; } }
}

function qRefreshDiff() {
    const lt = document.getElementById('qLeftText');
    const rt = document.getElementById('qRightText');
    if (!lt || !rt) return;
    const { aDiff, bDiff } = _diff(lt.value, rt.value);
    _renderHl(document.getElementById('qLeftHighlight'), lt.value, aDiff, 'del');
    _renderHl(document.getElementById('qRightHighlight'), rt.value, bDiff, 'add');
}
async function qInit() {
    await _ensureNsLoaded();
    _fillNsDatalist();
    // 左 NS 变化 -> 同步到右侧
    const lNs = document.getElementById('qLeftNs');
    const rNs = document.getElementById('qRightNs');
    if (lNs && rNs && !lNs._synced) {
        lNs._synced = true;
        const sync = () => { rNs.value = lNs.value; };
        lNs.addEventListener('input', sync);
        lNs.addEventListener('change', sync);
    }
}
async function qLoadPanel(side) {
    const pre = side === 'left' ? 'qLeft' : 'qRight';
    const nsEl = document.getElementById(pre + 'Ns');
    const gEl  = document.getElementById(pre + 'Group');
    const dEl  = document.getElementById(pre + 'DataId');
    const ta   = document.getElementById(pre + 'Text');
    const meta = document.getElementById(pre + 'Meta');
    if (!ta) return;
    const ns = nsEl ? nsEl.value.trim() : '';
    const group = (gEl ? gEl.value.trim() : '') || 'DEFAULT_GROUP';
    const dataId = dEl ? dEl.value.trim() : '';
    if (!dataId) { alert('请填写 Data ID'); return; }
    ta.value = '加载中...'; if (meta) meta.innerText = '';
    qRefreshDiff();
    const token = localStorage.getItem('nacos_access_token') || '';
    const base = (localStorage.getItem('nacos_server_url') || '').replace(/\/+$/, '');
    const tenant = (ns === 'public' || !ns) ? '' : ns;
    try {
        const url = `${base}/nacos/v1/cs/configs?dataId=${encodeURIComponent(dataId)}&group=${encodeURIComponent(group)}&tenant=${encodeURIComponent(tenant)}&accessToken=${encodeURIComponent(token)}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        ta.value = await r.text();
        if (meta) meta.innerText = `${dataId} @ ${group}`;
    } catch (e) { ta.value = `[!] 加载失败: ${e.message}`; if (meta) meta.innerText = '加载失败'; }
    qRefreshDiff();
    _refreshDatalists(ns).catch(() => {});
}
async function qSaveRight() {
    const nsEl = document.getElementById('qRightNs');
    const gEl  = document.getElementById('qRightGroup');
    const dEl  = document.getElementById('qRightDataId');
    const ta   = document.getElementById('qRightText');
    if (!ta) return;
    const ns = nsEl ? nsEl.value.trim() : '';
    const group = (gEl ? gEl.value.trim() : '') || 'DEFAULT_GROUP';
    const dataId = dEl ? dEl.value.trim() : '';
    if (!dataId) { alert('请填写右侧 Data ID'); return; }
    if (!confirm(`确定保存右侧内容到 ${dataId} @ ${group}？`)) return;
    const token = localStorage.getItem('nacos_access_token') || '';
    const base = (localStorage.getItem('nacos_server_url') || '').replace(/\/+$/, '');
    const tenant = (ns === 'public' || !ns) ? '' : ns;
    try {
        const body = new URLSearchParams({ dataId, group, tenant, content: ta.value, accessToken: token });
        const r = await fetch(`${base}/nacos/v1/cs/configs`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
        const txt = (await r.text()).trim();
        if (r.ok && txt.toLowerCase() === 'true') alert('✓ 保存成功');
        else alert('[!] 保存失败: ' + (txt || 'HTTP ' + r.status));
    } catch (e) { alert('[!] 保存异常: ' + e.message); }
}

async function openCompareView(dataId, group, nsId) { return cvOpen(dataId, group, nsId); }
function compareToQueryTab(p1, p2) {
    let dataId = '', group = 'DEFAULT_GROUP';
    if (typeof p1 === 'object' && p1 !== null) { dataId = p1.dataId || ''; group = p1.group || 'DEFAULT_GROUP'; }
    else { dataId = p1 || ''; group = p2 || 'DEFAULT_GROUP'; }
    return cvOpen(dataId, group, (typeof activeNamespaceId !== 'undefined' ? activeNamespaceId : ''));
}
function openCompareModal(p1, p2) { return compareToQueryTab(p1, p2); }

function initCompareModule() {
    _bindScroll('cvLeftText', 'cvLeftHighlight');
    _bindScroll('cvRightText', 'cvRightHighlight');
    _bindScroll('qLeftText', 'qLeftHighlight');
    _bindScroll('qRightText', 'qRightHighlight');
    const vSel = document.getElementById('cvLeftVersionSel');
    if (vSel) vSel.addEventListener('change', cvOnVersionChange);
    ['cvLeftText', 'cvRightText'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => { clearTimeout(el._t); el._t = setTimeout(cvRefreshDiff, 200); });
    });
    ['qLeftText', 'qRightText'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => { clearTimeout(el._t); el._t = setTimeout(qRefreshDiff, 200); });
    });
    ['qLeftDataId', 'qRightDataId'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') qLoadPanel(id.startsWith('qLeft') ? 'left' : 'right'); });
    });
    ['qLeftNs', 'qRightNs'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => { _refreshDatalists(el.value).catch(() => {}); });
    });
    qInit().catch(() => {});
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCompareModule);
else initCompareModule();
