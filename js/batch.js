/* ==================================================
   第三页：批量搜索 + 替换（独立模块）
   ================================================== */
let batchResults = [];

function batchEscape(str) {
    if (!str) return '';
    return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

async function batchSearch() {
    const nsFilter = (document.getElementById('batchNs')?.value || '').trim();
    const groupFilter = (document.getElementById('batchGroup')?.value || '').trim().toLowerCase();
    const dataIdFilter = (document.getElementById('batchDataId')?.value || '').trim().toLowerCase();
    const keyword = (document.getElementById('batchKeyword')?.value || '').trim();
    if (!keyword) { alert('请填查找内容'); return; }

    const sm = document.getElementById('batchStatusMsg');
    const tb = document.getElementById('batchTableBody');
    const cnt = document.getElementById('batchTotalCount');
    const cc = document.getElementById('batchCheckedCount');
    const ca = document.getElementById('batchCheckAll');

    if (sm) sm.style.display = 'none';
    if (tb) tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#00f0ff;">搜索中...</td></tr>';
    if (cnt) cnt.innerText = '0';
    if (cc) cc.innerText = '0';
    if (ca) ca.checked = false;

    const token = localStorage.getItem('nacos_access_token') || '';
    const base = (localStorage.getItem('nacos_server_url') || '').replace(/\/+$/, '');

    /* 决定要搜的 ns 列表 */
    let nsList = [];
    if (nsFilter && nsFilter !== 'public') nsList = [nsFilter];
    else if (nsFilter === 'public') nsList = [''];
    else {
        let nsArr = [];
        try { nsArr = rawNamespaceList || []; } catch (e) {}
        if (!Array.isArray(nsArr) || nsArr.length === 0) {
            try {
                const r = await fetch(`${base}/nacos/v1/console/namespaces?accessToken=${encodeURIComponent(token)}`);
                const d = await r.json();
                nsArr = Array.isArray(d) ? d : (d && Array.isArray(d.data) ? d.data : []);
                try { rawNamespaceList = nsArr; } catch (e) { window.rawNamespaceList = nsArr; }
            } catch (e) {}
        }
        nsList = [''];
        (nsArr || []).forEach(ns => { if (ns.namespace) nsList.push(ns.namespace); });
    }

    /* 拉所有 ns 的配置元数据 */
    const all = [];
    for (const ns of nsList) {
        const tenant = ns === '' ? '' : ns;
        try {
            const u = `${base}/nacos/v1/cs/configs?dataId=&group=&search=accurate&pageNo=1&pageSize=500&tenant=${encodeURIComponent(tenant)}&accessToken=${encodeURIComponent(token)}`;
            const r = await fetch(u);
            if (!r.ok) continue;
            const d = await r.json();
            (d.pageItems || []).forEach(it => all.push({ ...it, _ns: ns, _nsLabel: ns === '' ? 'public (默认)' : ns }));
        } catch (e) {}
    }

    /* 元数据预过滤 */
    const cands = all.filter(it => {
        const a = (it.dataId || '').toLowerCase();
        const b = (it.group || '').toLowerCase();
        if (groupFilter && !b.includes(groupFilter)) return false;
        if (dataIdFilter && !a.includes(dataIdFilter)) return false;
        return true;
    });

    /* 逐条拉 content 检查关键词 */
    batchResults = [];
    let done = 0, idx = 0;
    const showP = () => {
        if (sm) {
            sm.style.display = 'block';
            sm.style.background = 'rgba(88,166,255,0.1)';
            sm.style.borderColor = '#58a6ff';
            sm.style.color = '#58a6ff';
            sm.innerText = `扫描中... ${done} / ${cands.length}`;
        }
    };
    const worker = async () => {
        while (idx < cands.length) {
            const i = idx++;
            const it = cands[i];
            try {
                const u = `${base}/nacos/v1/cs/configs?dataId=${encodeURIComponent(it.dataId)}&group=${encodeURIComponent(it.group)}&tenant=${encodeURIComponent(it._ns)}&accessToken=${encodeURIComponent(token)}`;
                const r = await fetch(u);
                const c = await r.text();
                if (c && c.includes(keyword)) {
                    batchResults.push({
                        ns: it._ns, nsLabel: it._nsLabel,
                        group: it.group, dataId: it.dataId,
                        content: c, matchCount: c.split(keyword).length - 1, checked: false
                    });
                }
            } catch (e) {}
            done++;
            if (done % 5 === 0 || done === cands.length) showP();
        }
    };
    showP();
    await Promise.all([worker(), worker(), worker(), worker(), worker()]);
    if (sm) sm.style.display = 'none';

    renderBatchTable(batchResults);
}

function renderBatchTable(list) {
    const tb = document.getElementById('batchTableBody');
    if (!tb) return;
    tb.innerHTML = '';
    const cnt = document.getElementById('batchTotalCount');
    if (cnt) cnt.innerText = list ? list.length : 0;
    if (!list || list.length === 0) {
        tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#8b949e;padding:30px;">没有匹配到任何配置</td></tr>';
        batchUpdateCheckedCount();
        return;
    }
    list.forEach((item, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="checkbox" class="batch-row-check" data-idx="${i}" ${item.checked ? 'checked' : ''}></td>
            <td><span style="background:rgba(88,166,255,0.12);padding:2px 8px;border-radius:3px;color:#58a6ff;font-size:12px;">${batchEscape(item.nsLabel)}</span></td>
            <td style="color:#00ff88;font-weight:bold;">${batchEscape(item.dataId)}</td>
            <td><span style="background:rgba(0,240,255,0.1);padding:2px 8px;border-radius:3px;color:#00f0ff;">${batchEscape(item.group)}</span></td>
            <td style="color:#f85149;font-weight:bold;">${item.matchCount} 处</td>
        `;
        const cb = tr.querySelector('.batch-row-check');
        cb.onchange = () => { item.checked = cb.checked; batchUpdateCheckedCount(); };
        tb.appendChild(tr);
    });
    batchUpdateCheckedCount();
}

function batchUpdateCheckedCount() {
    const n = batchResults.filter(x => x.checked).length;
    const el = document.getElementById('batchCheckedCount');
    if (el) el.innerText = n;
    const ca = document.getElementById('batchCheckAll');
    if (ca) ca.checked = batchResults.length > 0 && n === batchResults.length;
}

function batchToggleAll(checked) {
    batchResults.forEach(x => x.checked = !!checked);
    document.querySelectorAll('.batch-row-check').forEach(cb => cb.checked = !!checked);
    batchUpdateCheckedCount();
}

function batchReset() {
    ['batchNs','batchGroup','batchDataId','batchKeyword','batchReplaceWith'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    batchResults = [];
    const tb = document.getElementById('batchTableBody');
    if (tb) tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#8b949e;padding:30px;">填入关键词后点搜索</td></tr>';
    const c = document.getElementById('batchTotalCount'); if (c) c.innerText = '0';
    const cc = document.getElementById('batchCheckedCount'); if (cc) cc.innerText = '0';
    const ca = document.getElementById('batchCheckAll'); if (ca) ca.checked = false;
    const sm = document.getElementById('batchStatusMsg'); if (sm) sm.style.display = 'none';
}

async function batchReplaceSelected() {
    const keyword = (document.getElementById('batchKeyword')?.value || '').trim();
    const replaceWith = (document.getElementById('batchReplaceWith')?.value ?? '');
    if (!keyword) { alert('请填查找内容'); return; }
    const targets = batchResults.filter(x => x.checked);
    if (targets.length === 0) { alert('请先勾选要替换的配置'); return; }

    let totalHits = 0;
    targets.forEach(t => totalHits += t.matchCount);
    const confirmMsg = `将 ${targets.length} 个配置里的\n\n  "${keyword}"\n\n替换成\n\n  "${replaceWith}"\n\n共 ${totalHits} 处。\n\n只替换匹配部分，前后文保留。\n\n确认执行？`;
    if (!confirm(confirmMsg)) return;

    const sm = document.getElementById('batchStatusMsg');
    if (sm) {
        sm.style.display = 'block';
        sm.style.background = 'rgba(88,166,255,0.1)';
        sm.style.borderColor = '#58a6ff';
        sm.style.color = '#58a6ff';
        sm.innerText = '替换中...';
    }

    const token = localStorage.getItem('nacos_access_token') || '';
    const base = (localStorage.getItem('nacos_server_url') || '').replace(/\/+$/, '');
    let ok = 0, fail = 0;
    const errs = [];

    for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        if (sm) sm.innerText = `替换中... ${i + 1} / ${targets.length}  ${t.dataId}`;
        try {
            const newC = t.content.split(keyword).join(replaceWith);
            if (newC === t.content) { ok++; continue; }
            const body = new URLSearchParams({ dataId: t.dataId, group: t.group, tenant: t.ns, content: newC, accessToken: token });
            const r = await fetch(`${base}/nacos/v1/cs/configs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body
            });
            const txt = (await r.text()).trim();
            if (r.ok && txt.toLowerCase() === 'true') {
                ok++;
                t.content = newC;
                t.matchCount = 0;
                t.checked = false;
            } else {
                fail++;
                errs.push(`${t.dataId}: ${txt || 'HTTP ' + r.status}`);
            }
        } catch (e) {
            fail++;
            errs.push(`${t.dataId}: ${e.message}`);
        }
        if (i < targets.length - 1) await new Promise(r => setTimeout(r, 150));
    }

    if (sm) sm.style.display = 'none';
    let msg = `替换完成\n\n成功: ${ok}\n失败: ${fail}`;
    if (errs.length) msg += '\n\n失败明细:\n' + errs.slice(0, 10).join('\n');
    alert(msg);

    batchResults = batchResults.filter(x => x.matchCount > 0);
    renderBatchTable(batchResults);
}
