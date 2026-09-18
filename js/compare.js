/**
 * ========================================================
 * 模块：js/compare.js
 * 职责：处理配置文件的 Side-by-Side 独立对比弹窗 (Modal)
 * 特性：防 JSON 解析崩溃、自动兼容纯文本/JSON 响应、自由版本对比
 * ========================================================
 */

let historyListCache = []; 
let historyDetailMap = {}; 
let currentCompareDataId = '';
let currentCompareGroup = '';
let currentCompareTenant = '';

// 打开独立对比 Modal 弹窗
async function compareToQueryTab(dataId, group) {
    currentCompareDataId = dataId;
    currentCompareGroup = group;
    currentCompareTenant = (activeNamespaceId === 'public' || !activeNamespaceId) ? '' : activeNamespaceId;

    document.getElementById('compareModalTitle').innerText = `${dataId} (${group})`;
    document.getElementById('compareModal').classList.add('active');

    const statusMsg = document.getElementById('compareStatusMsg');
    if (statusMsg) statusMsg.style.display = 'none';

    document.getElementById('leftDiffBody').innerHTML = '<span style="color:#00f0ff;">正在检索历史版本记录...</span>';
    document.getElementById('rightDiffBody').innerHTML = '<span style="color:#00f0ff;">正在检索历史版本记录...</span>';

    await fetchHistoryAndCompare();
}

function closeCompareModal() {
    document.getElementById('compareModal').classList.remove('active');
}

// 查询并拉取历史版本清单
async function fetchHistoryAndCompare() {
    const token = localStorage.getItem('nacos_access_token') || '';
    const statusMsg = document.getElementById('compareStatusMsg');

    try {
        // 1. 获取 Nacos 历史改动版本
        const historyUrl = `${SERVER_URL}/nacos/v1/cs/history?search=accurate&dataId=${encodeURIComponent(currentCompareDataId)}&group=${encodeURIComponent(currentCompareGroup)}&tenant=${encodeURIComponent(currentCompareTenant)}&pageNo=1&pageSize=20&accessToken=${token}`;
        const historyRes = await fetch(historyUrl);
        const historyText = await historyRes.text();

        let historyData = {};
        try { 
            historyData = JSON.parse(historyText); 
        } catch (e) {
            console.warn('历史版本列表非标准 JSON, 尝试降级处理:', historyText);
        }

        historyListCache = historyData.pageItems || [];
        historyDetailMap = {};

        // 2. 获取当前最新实时的配置内容作为【当前最新】
        const currUrl = `${SERVER_URL}/nacos/v1/cs/configs?dataId=${encodeURIComponent(currentCompareDataId)}&group=${encodeURIComponent(currentCompareGroup)}&tenant=${encodeURIComponent(currentCompareTenant)}&accessToken=${token}`;
        const currRes = await fetch(currUrl);
        const currentContent = await currRes.text();

        historyDetailMap['current'] = {
            text: currentContent,
            time: '当前最新状态'
        };

        // 3. 渲染版本下拉框
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
    const token = localStorage.getItem('nacos_access_token') || '';

    const leftContent = await fetchContentByNid(leftNid, token);
    const rightContent = await fetchContentByNid(rightNid, token);

    document.getElementById('leftPaneTitle').innerText = `← ${leftContent.time}`;
    document.getElementById('rightPaneTitle').innerText = `→ ${rightContent.time}`;

    renderDiffViews(leftContent.text, rightContent.text);
}

// 安全拉取 NID 文本（修复 caused: Failed to... 造成的 JSON 异常）
async function fetchContentByNid(nid, token) {
    if (nid === 'current') {
        return historyDetailMap['current'];
    }

    if (historyDetailMap[nid]) {
        return historyDetailMap[nid];
    }

    const item = historyListCache.find(i => String(i.nid) === String(nid));
    const timeInfo = item ? `修改时间: ${item.lastModifiedTime}` : `NID: ${nid}`;

    try {
        const detailUrl = `${SERVER_URL}/nacos/v1/cs/history?dataId=${encodeURIComponent(currentCompareDataId)}&group=${encodeURIComponent(currentCompareGroup)}&tenant=${encodeURIComponent(currentCompareTenant)}&nid=${nid}&accessToken=${token}`;
        const res = await fetch(detailUrl);
        const text = await res.text();

        let content = text;
        
        // 安全 JSON 解析防御
        if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
            try {
                const json = JSON.parse(text);
                content = json.content !== undefined ? json.content : text;
            } catch(e) {
                content = text;
            }
        }

        // 如果 Nacos 抛出异常文本（以 caused: 开头）
        if (content.includes('caused:')) {
            content = `[!] 读取历史版本明细受限或记录已清除\n服务端响应信息:\n${content}`;
        }

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
