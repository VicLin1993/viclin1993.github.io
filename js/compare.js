/**
 * ========================================================
 * 模块：js/compare.js
 * 职责：严格遵循 Nacos 官方 Admin/Console API 规范处理配置对比与历史记录
 * 特性：
 *   1. 完美兼容 Nacos v1 / v2 / v3 接口数据结构 (支持 data 嵌套与纯文本)
 *   2. 规范化时间展示：全统一为 2026-09-10 18:42:25 格式
 *   3. 严格校验 nid 参数，杜绝 undefined / null 发送到后端触发 NumberFormatException
 * ========================================================
 */

let historyListCache = []; 
let historyDetailMap = {}; 
let currentCompareDataId = '';
let currentCompareGroup = '';
let currentCompareTenant = '';

/**
 * 时间清洗函数
 * 输入: 2026-09-10T18:42:25.731+08:00 / 1789000000000
 * 输出: 2026-09-10 18:42:25
 */
function formatSimpleTime(timeInput) {
    if (!timeInput) return '未知时间';

    // 如果本身已经是规范格式，直接返回
    if (typeof timeInput === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timeInput)) {
        return timeInput;
    }

    let date;
    if (typeof timeInput === 'number' || (!isNaN(Number(timeInput)) && !String(timeInput).includes('-'))) {
        date = new Date(Number(timeInput));
    } else {
        // 替换 ISO 8601 字符串中的 T 
        let str = String(timeInput).replace('T', ' ');
        // 截掉毫秒与时区尾巴 (+08:00 或 .731)
        str = str.split('.')[0].split('+')[0].split('Z')[0];
        date = new Date(str.replace(/-/g, '/')); // 兼容 Safari/Mac 日期解析
        if (isNaN(date.getTime())) {
            return str; // 解析失败则返回裁剪后的干净字符串
        }
    }

    const pad = (num) => String(num).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 打开独立对比 Modal 弹窗
async function compareToQueryTab(dataId, group) {
    currentCompareDataId = dataId || '';
    currentCompareGroup = group || 'DEFAULT_GROUP';
    
    // 官方规范：public 命名空间在请求租户/namespaceId 参数时应传递空字符串 ''
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

// 查询并拉取历史版本清单 (遵循 /nacos/v1/cs/history GET 规范)
async function fetchHistoryAndCompare() {
    const token = localStorage.getItem('nacos_access_token') || '';
    const statusMsg = document.getElementById('compareStatusMsg');

    try {
        // 1. 获取 Nacos 历史版本列表
        const historyUrl = `${SERVER_URL}/nacos/v1/cs/history?search=accurate&dataId=${encodeURIComponent(currentCompareDataId)}&group=${encodeURIComponent(currentCompareGroup)}&tenant=${encodeURIComponent(currentCompareTenant)}&pageNo=1&pageSize=20&accessToken=${token}`;
        const historyRes = await fetch(historyUrl);
        const historyText = await historyRes.text();

        let historyData = {};
        try { 
            historyData = JSON.parse(historyText); 
        } catch (e) {
            console.warn('历史列表解析非 JSON:', historyText);
        }

        // 兼容 v1 (pageItems) 与 v2/v3 (data.pageItems / data) 结构
        if (historyData.data && Array.isArray(historyData.data.pageItems)) {
            historyListCache = historyData.data.pageItems;
        } else if (Array.isArray(historyData.pageItems)) {
            historyListCache = historyData.pageItems;
        } else if (Array.isArray(historyData.data)) {
            historyListCache = historyData.data;
        } else {
            historyListCache = [];
        }

        historyDetailMap = {};

        // 2. 获取当前最新实时配置 (作为基准版)
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

// 从项目条目中提取有效历史 ID (兼容 nid / id / historyId)
function getValidHistoryId(item) {
    if (!item) return null;
    const val = item.nid !== undefined ? item.nid : (item.id !== undefined ? item.id : item.historyId);
    if (val === undefined || val === null || val === 'undefined' || val === '') {
        return null;
    }
    return String(val);
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

    let validCount = 0;

    historyListCache.forEach((item) => {
        const historyId = getValidHistoryId(item);
        if (!historyId) return;

        validCount++;
        const rawTime = item.lastModifiedTime || item.createdTime || item.modifiedTime;
        const timeStr = formatSimpleTime(rawTime);

        const optText = `[版本 #${validCount}] 修改时间: ${timeStr} (${item.opType || 'UPDATE'})`;

        const optLeft = document.createElement('option');
        optLeft.value = historyId;
        optLeft.innerText = optText;
        leftSelect.appendChild(optLeft);

        const optRight = document.createElement('option');
        optRight.value = historyId;
        optRight.innerText = optText;
        rightSelect.appendChild(optRight);
    });

    if (validCount === 0) {
        const noHistOpt = document.createElement('option');
        noHistOpt.value = 'current';
        noHistOpt.innerText = '无历史版本 (使用当前状态)';
        leftSelect.appendChild(noHistOpt);
    }

    rightSelect.value = 'current';
    
    const firstValidId = historyListCache.map(getValidHistoryId).find(id => id !== null);
    if (firstValidId) {
        leftSelect.value = firstValidId;
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

    const leftId = leftSelect.value;
    const rightId = rightSelect.value;
    const token = localStorage.getItem('nacos_access_token') || '';

    const leftContent = await fetchContentById(leftId, token);
    const rightContent = await fetchContentById(rightId, token);

    // 确保标题上的时间也被 formatSimpleTime 清洗过
    document.getElementById('leftPaneTitle').innerText = `← ${formatSimpleTime(leftContent.time)}`;
    document.getElementById('rightPaneTitle').innerText = `→ ${formatSimpleTime(rightContent.time)}`;

    renderDiffViews(leftContent.text, rightContent.text);
}

// 按照官方 API 要求获取单个历史版本明细
async function fetchContentById(historyId, token) {
    if (!historyId || historyId === 'current' || historyId === 'undefined') {
        return historyDetailMap['current'] || { text: '', time: '当前最新状态' };
    }

    if (historyDetailMap[historyId]) {
        return historyDetailMap[historyId];
    }

    const item = historyListCache.find(i => getValidHistoryId(i) === String(historyId));
    const rawTime = item ? (item.lastModifiedTime || item.createdTime || item.modifiedTime) : '';
    const cleanTime = formatSimpleTime(rawTime);
    const timeInfo = item ? `修改时间: ${cleanTime}` : `版本 ID: ${historyId}`;

    try {
        // 官方文档：获取特定历史版本明细必须包含 nid, dataId, group
        const detailUrl = `${SERVER_URL}/nacos/v1/cs/history?dataId=${encodeURIComponent(currentCompareDataId)}&group=${encodeURIComponent(currentCompareGroup)}&tenant=${encodeURIComponent(currentCompareTenant)}&nid=${encodeURIComponent(historyId)}&accessToken=${token}`;
        const res = await fetch(detailUrl);
        const text = await res.text();

        let content = text;
        
        // 解析官方标准的 JSON 响应包
        if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
            try {
                const json = JSON.parse(text);
                // Nacos v2/v3 嵌套在 json.data 中，v1 嵌套在 json.content 或 json 中
                if (json.data && json.data.content !== undefined) {
                    content = json.data.content;
                } else if (json.content !== undefined) {
                    content = json.content;
                } else {
                    content = text;
                }
            } catch(e) {
                content = text;
            }
        }

        // 防御：若服务端返回了异常抛出字符串
        if (content.includes('caused:') || content.includes('NumberFormatException')) {
            content = `[!] 读取历史版本明细失败，服务端未能找到 NID=${historyId} 的配置记录`;
        }

        historyDetailMap[historyId] = { text: content, time: cleanTime };
        return historyDetailMap[historyId];

    } catch(e) {
        return { text: `[!] 拉取版本失败: ${e.message}`, time: cleanTime };
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
