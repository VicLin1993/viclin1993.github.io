/**
 * ========================================================
 * 模块：js/compare.js
 * 职责：独立多版本自由对比 (版本 1 vs 版本 2/3/4/5...)，
 *       包含 Namespace 下拉选择、自动带入参数联动、变动时间标注
 * ========================================================
 */

let historyListCache = []; // 当前选定配置的历史记录列表缓存
let historyDetailMap = {}; // 缓存各 nid 对应的文本内容

// 初始化对比视窗的 Namespace 下拉选单
function initCompareNsDropdown() {
    const nsSelect = document.getElementById('compareNsSelect');
    if (!nsSelect) return;
    
    nsSelect.innerHTML = '';
    rawNamespaceList.forEach(item => {
        const option = document.createElement('option');
        option.value = item.namespace;
        option.innerText = item.namespaceShowName || (item.namespace === "" ? "public" : item.namespace);
        if (item.namespace === activeNamespaceId) {
            option.selected = true;
        }
        nsSelect.appendChild(option);
    });
}

// 切换 Namespace 下拉选单时的响应
function onCompareNsChange() {
    activeNamespaceId = document.getElementById('compareNsSelect').value;
}

// 🔥 核心联动：按下“对比”按钮后，自动跳转并自动填入参数触发查询
async function compareToQueryTab(dataId, group) {
    // 1. 自动跳转到第二个“查询 (版本对比)”分页
    switchTab('search');
    
    // 2. 初始化并更新 Namespace 下拉选单
    initCompareNsDropdown();
    
    // 3. 自动将对应配置文件的 Namespace、Data ID 和 Group 调整至筛选栏中
    const nsSelect = document.getElementById('compareNsSelect');
    if (nsSelect) {
        nsSelect.value = activeNamespaceId || '';
    }
    
    document.getElementById('compareDataId').value = dataId || '';
    document.getElementById('compareGroup').value = group || 'DEFAULT_GROUP';

    // 4. 自动发起历史记录查询与版本对比
    await fetchHistoryAndCompare();
}

// 查询并拉取全量历史版本清单
async function fetchHistoryAndCompare() {
    const nsSelect = document.getElementById('compareNsSelect');
    if (!nsSelect || nsSelect.options.length === 0) {
        initCompareNsDropdown();
    }

    const selectedNs = nsSelect ? nsSelect.value : (activeNamespaceId || '');
    const dataId = document.getElementById('compareDataId').value.trim();
    const group = document.getElementById('compareGroup').value.trim();
    const statusMsg = document.getElementById('compareStatusMsg');

    if (!dataId) {
        alert('请输入需要对比的 Data ID / YAML 档案名称！');
        return;
    }

    if (statusMsg) statusMsg.style.display = 'none';
    document.getElementById('leftDiffBody').innerHTML = '<span style="color:#00f0ff;">正在检索历史版本记录...</span>';
    document.getElementById('rightDiffBody').innerHTML = '<span style="color:#00f0ff;">正在检索历史版本记录...</span>';

    const token = localStorage.getItem('nacos_access_token') || '';
    const tenantParam = (selectedNs === 'public' || !selectedNs) ? '' : selectedNs;

    try {
        // 1. 获取 Nacos 历史改动版本 (拉取最近 20 个版本)
        const historyUrl = `${SERVER_URL}/nacos/v1/cs/history?search=accurate&dataId=${encodeURIComponent(dataId)}&group=${encodeURIComponent(group || 'DEFAULT_GROUP')}&tenant=${encodeURIComponent(tenantParam)}&pageNo=1&pageSize=20&accessToken=${token}`;
        const historyRes = await fetch(historyUrl);
        const historyText = await historyRes.text();

        let historyData = {};
        try { historyData = JSON.parse(historyText); } catch (e) {}

        historyListCache = historyData.pageItems || [];
        historyDetailMap = {};

        // 2. 获取当前最新的实时配置作为第 0 版
        const currUrl = `${SERVER_URL}/nacos/v1/cs/configs?dataId=${encodeURIComponent(dataId)}&group=${encodeURIComponent(group || 'DEFAULT_GROUP')}&tenant=${encodeURIComponent(tenantParam)}&accessToken=${token}`;
        const currRes = await fetch(currUrl);
        const currentContent = await currRes.text();

        historyDetailMap['current'] = {
            content: currentContent,
            time: '当前最新状态',
            label: '【当前最新配置】'
        };

        // 3. 填充左右版本的下拉选单并展示对比结果
        populateVersionSelects();

    } catch (err) {
        if (statusMsg) {
            statusMsg.innerText = `[!] 获取历史版本失败: ${err.message}`;
            statusMsg.style.display = 'block';
        }
    }
}

// 填充版本下拉选择框
function populateVersionSelects() {
    const leftSelect = document.getElementById('compareLeftVersion');
    const rightSelect = document.getElementById('compareRightVersion');

    leftSelect.innerHTML = '';
    rightSelect.innerHTML = '';

    const currentOptRight = document.createElement('option');
    currentOptRight.value = 'current';
    currentOptRight.innerText = '当前最新版本 (Current)';
    rightSelect.appendChild(currentOptRight);

    if (historyListCache.length === 0) {
        const noHistOpt = document.createElement('option');
        noHistOpt.value = 'current';
        noHistOpt.innerText = '无历史版本 (使用当前状态)';
        leftSelect.appendChild(noHistOpt);
    } else {
        historyListCache.forEach((item, index) => {
            const timeStr = item.lastModifiedTime || '未知时间';
            const optText = `[版本 #${index + 1}] 修改时间: ${timeStr} (${item.opType || 'UPDATE'})`;

            const optLeft = document.createElement('option');
            optLeft.value = item.nid;
            optLeft.innerText = optText;
            leftSelect.appendChild(optLeft);

            const optRight = document.createElement('option');
            optRight.value = item.nid;
            optRight.innerText = optText;
            rightSelect.appendChild(optRight);
        });
    }

    rightSelect.value = 'current';
    if (historyListCache.length > 0) {
        leftSelect.value = historyListCache[0].nid;
    } else {
        leftSelect.value = 'current';
    }

    triggerDiffRender();
}

// 根据选中的左右版本进行数据拉取并对比渲染
async function triggerDiffRender() {
    const leftNid = document.getElementById('compareLeftVersion').value;
    const rightNid = document.getElementById('compareRightVersion').value;

    const nsSelect = document.getElementById('compareNsSelect');
    const selectedNs = nsSelect ? nsSelect.value : (activeNamespaceId || '');
    const dataId = document.getElementById('compareDataId').value.trim();
    const group = document.getElementById('compareGroup').value.trim() || 'DEFAULT_GROUP';
    const token = localStorage.getItem('nacos_access_token') || '';
    const tenantParam = (selectedNs === 'public' || !selectedNs) ? '' : selectedNs;

    const leftContent = await fetchContentByNid(leftNid, dataId, group, tenantParam, token);
    const rightContent = await fetchContentByNid(rightNid, dataId, group, tenantParam, token);

    document.getElementById('leftPaneTitle').innerText = `← ${leftContent.time}`;
    document.getElementById('rightPaneTitle').innerText = `→ ${rightContent.time}`;

    renderDiffViews(leftContent.text, rightContent.text);
}

// 根据 NID 缓存或拉取真实文本
async function fetchContentByNid(nid, dataId, group, tenant, token) {
    if (nid === 'current') {
        return { text: historyDetailMap['current'].content, time: '当前最新状态' };
    }

    if (historyDetailMap[nid]) {
        return historyDetailMap[nid];
    }

    const item = historyListCache.find(i => String(i.nid) === String(nid));
    const timeInfo = item ? `修改时间: ${item.lastModifiedTime}` : `NID: ${nid}`;

    try {
        const detailUrl = `${SERVER_URL}/nacos/v1/cs/history?dataId=${encodeURIComponent(dataId)}&group=${encodeURIComponent(group)}&tenant=${encodeURIComponent(tenant)}&nid=${nid}&accessToken=${token}`;
        const res = await fetch(detailUrl);
        const text = await res.text();

        let content = text;
        try {
            const json = JSON.parse(text);
            content = json.content || text;
        } catch(e) {}

        historyDetailMap[nid] = { text: content, time: timeInfo };
        return historyDetailMap[nid];
    } catch(e) {
        return { text: `[!] 拉取版本失败: ${e.message}`, time: timeInfo };
    }
}

// 渲染左右分屏 Side-by-Side 差异
function renderDiffViews(oldText, newText) {
    const oldLines = (oldText || '').split('\n');
    const newLines = (newText || '').split('\n');

    let leftHtml = '';
    let rightHtml = '';

    const maxLines = Math.max(oldLines.length, newLines.length);

    for (let i = 0; i < maxLines; i++) {
        const lineOld = oldLines[i];
        const lineNew = newLines[i];

        if (lineOld === lineNew) {
            leftHtml += `<span class="line-same">${escapeHtml(lineOld || '')}</span>`;
            rightHtml += `<span class="line-same">${escapeHtml(lineNew || '')}</span>`;
        } else {
            if (lineOld !== undefined) {
                leftHtml += `<span class="line-del">- ${escapeHtml(lineOld)}</span>`;
            } else {
                leftHtml += `<span class="line-same"></span>`;
            }

            if (lineNew !== undefined) {
                rightHtml += `<span class="line-add">+ ${escapeHtml(lineNew)}</span>`;
            } else {
                rightHtml += `<span class="line-same"></span>`;
            }
        }
    }

    document.getElementById('leftDiffBody').innerHTML = leftHtml || '<span style="color:#8b949e;">(空)</span>';
    document.getElementById('rightDiffBody').innerHTML = rightHtml || '<span style="color:#8b949e;">(空)</span>';
}
