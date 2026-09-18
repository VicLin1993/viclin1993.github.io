/**
 * ========================================================
 * 模块：js/compare.js
 * 职责：处理配置文件的 Side-by-Side 独立对比弹窗 (Modal)
 * 特性：时间格式统一归一化为 YYYY/M/D HH:mm:ss (+8时区)
 * ========================================================
 */

let historyListCache = []; 
let historyDetailMap = {}; 
let currentCompareDataId = '';
let currentCompareGroup = '';
let currentCompareTenant = '';

// 统一格式化时间为: YYYY/M/D HH:mm:ss (+8 时区)
function formatToUTC8Time(timeInput) {
    if (!timeInput) return '未知时间';
    
    let date;
    if (typeof timeInput === 'number' || !isNaN(Number(timeInput))) {
        date = new Date(Number(timeInput));
    } else {
        // 自动解析如 2026-09-10T18:42:25.731+08:00 或普通字符串
        date = new Date(timeInput);
    }

    if (isNaN(date.getTime())) {
        return timeInput; // 如果无法解析成 Date，则直接原样展示
    }

    // 转为 +8 时区的时间
    const utcTime = date.getTime() + (date.getTimezoneOffset() * 60000);
    const targetDate = new Date(utcTime + (3600000 * 8));

    const year = targetDate.getFullYear();
    const month = targetDate.getMonth() + 1;
    const day = targetDate.getDate();
    const hours = String(targetDate.getHours()).padStart(2, '0');
    const minutes = String(targetDate.getMinutes()).padStart(2, '0');
    const seconds = String(targetDate.getSeconds()).padStart(2, '0');

    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

// 打开独立对比 Modal 弹窗
async function compareToQueryTab(dataId, group) {
    currentCompareDataId = dataId || '';
    currentCompareGroup = group || 'DEFAULT_GROUP';
    
    if (!activeNamespaceId || activeNamespaceId === 'public' || activeNamespaceId === 'undefined') {
        currentCompareTenant = '';
    } else {
        currentCompareTenant = activeNamespaceId;
    }

    document.getElementById('compareModalTitle').innerText = `${currentCompareDataId} (${currentCompareGroup})`;
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
        const historyUrl = `${SERVER_URL}/nacos/v1/cs/history?search=accurate&dataId=${encodeURIComponent(currentCompareDataId)}&group=${encodeURIComponent(currentCompareGroup)}&tenant=${encodeURIComponent(currentCompareTenant)}&pageNo=1&pageSize=20&accessToken=${token}`;
        const historyRes = await fetch(historyUrl);
        const historyText = await historyRes.text();

        let historyData = {};
        try { 
            historyData = JSON.parse(historyText); 
        } catch (e) {
            console.warn('历史列表解析非 JSON:', historyText);
        }

        historyListCache = historyData.pageItems || [];
        historyDetailMap = {};

        const currUrl = `${SERVER_URL}/nacos/v1/cs/configs?dataId=${encodeURIComponent(currentCompareDataId)}&group=${encodeURIComponent(currentCompareGroup)}&tenant=${encodeURIComponent(currentCompareTenant)}&accessToken=${token}`;
        const currRes = await fetch(currUrl);
        const currentContent = await currRes.text();

        historyDetailMap['current'] = {
            text: currentContent,
            time: '当前最新状态'
        };

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
            if (!item || item.nid === undefined || item.nid === null) return;

            // 格式化时间为 2026/9/11 14:02:36 格式
            const rawTime = item.lastModifiedTime || item.createdTime;
            const timeStr = formatToUTC8Time(rawTime);

            const optText = `[版本 #${index + 1}] 修改时间: ${timeStr} (${item.opType || 'UPDATE'})`;

            const optLeft = document.createElement('option');
            optLeft.value = String(item.nid);
            optLeft.innerText = optText;
            leftSelect.appendChild(optLeft);

            const optRight = document.createElement('option');
            optRight.value = String(item.nid);
            optRight.innerText = optText;
            rightSelect.appendChild(optRight);
        });
    }

    rightSelect.value = 'current';
    if (historyListCache.length > 0 && historyListCache[0].nid !== undefined) {
        leftSelect.value = String(historyListCache[0].nid);
    } else {
        leftSelect.value = 'current';
    }

    triggerDiffRender();
}

// 根据选中的左右版本进行数据拉取并对比渲染
async function triggerDiffRender() {
    const leftSelect = document.getElementById('compareLeftVersion');
    const rightSelect = document.getElementById('compareRightVersion');

    if (!leftSelect || !rightSelect) return;

    const leftNid = leftSelect.value;
    const rightNid = rightSelect.value;
    const token = localStorage.getItem('nacos_access_token') || '';

    const leftContent = await fetchContentByNid(leftNid, token);
    const rightContent = await fetchContentByNid(rightNid, token);

    document.getElementById('leftPaneTitle').innerText = `← ${leftContent.time}`;
    document.getElementById('rightPaneTitle').innerText = `→ ${rightContent.time}`;

    renderDiffViews(leftContent.text, rightContent.text);
}

// 严格校验 NID 并安全拉取文本
async function fetchContentByNid(nid, token) {
    if (!nid || nid === 'current' || nid === 'undefined') {
        return historyDetailMap['current'] || { text: '', time: '当前最新状态' };
    }

    if (historyDetailMap[nid]) {
        return historyDetailMap[nid];
    }

    const item = historyListCache.find(i => String(i.nid) === String(nid));
    const rawTime = item ? (item.lastModifiedTime || item.createdTime) : '';
    const timeInfo = item ? `修改时间: ${formatToUTC8Time(rawTime)}` : `版本 NID: ${nid}`;

    try {
        const detailUrl = `${SERVER_URL}/nacos/v1/cs/history?dataId=${encodeURIComponent(currentCompareDataId)}&group=${encodeURIComponent(currentCompareGroup)}&tenant=${encodeURIComponent(currentCompareTenant)}&nid=${encodeURIComponent(nid)}&accessToken=${token}`;
        const res = await fetch(detailUrl);
        const text = await res.text();

        let content = text;
        
        if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
            try {
                const json = JSON.parse(text);
                content = json.content !== undefined ? json.content : text;
            } catch(e) {
                content = text;
            }
        }

        if (content.includes('caused:') || content.includes('NumberFormatException')) {
            content = `[!] 该历史记录版本内容获取失败 (服务端响应格式错误)`;
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
