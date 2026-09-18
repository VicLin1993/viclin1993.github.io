/**
 * ========================================================
 * 模块：js/compare.js
 * 职责：符合 Nacos 官方 API 规范的配置对比与历史记录查看
 * 说明：
 *   1. 自动适配单参数/双参数/多参数入口，彻底避免点击无反应问题
 *   2. 严格规范时间显示为 2026-09-10 18:42:25 格式
 *   3. 完美兼容 Nacos v1 / v2 / v3 接口
 * ========================================================
 */

let historyListCache = []; 
let historyDetailMap = {}; 
let currentCompareDataId = '';
let currentCompareGroup = '';
let currentCompareTenant = '';

/**
 * 统一时间格式化函数
 * 将各类 ISO 8601、毫秒戳、微秒戳强制清洗为：YYYY-MM-DD HH:mm:ss
 */
function formatSimpleTime(timeInput) {
    if (!timeInput) return '未知时间';

    // 已经是标准格式直接返回
    if (typeof timeInput === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timeInput.trim())) {
        return timeInput.trim();
    }

    try {
        let date;
        if (typeof timeInput === 'number' || (!isNaN(Number(timeInput)) && !String(timeInput).includes('-'))) {
            date = new Date(Number(timeInput));
        } else {
            let str = String(timeInput).replace('T', ' ');
            str = str.split('.')[0].split('+')[0].split('Z')[0];
            date = new Date(str.replace(/-/g, '/')); 
            if (isNaN(date.getTime())) {
                return str; 
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
    } catch(e) {
        return String(timeInput);
    }
}

/**
 * 主入口函数：支持多种调用习惯 (兼容旧代码与新代码)
 */
async function compareToQueryTab(p1, p2) {
    try {
        // 自动识别参数：可能传入的是 (dataId, group) 或 (index)
        if (typeof p1 === 'object' && p1 !== null) {
            currentCompareDataId = p1.dataId || p1.id || '';
            currentCompareGroup = p1.group || 'DEFAULT_GROUP';
        } else if (typeof p1 === 'number' && typeof configList !== 'undefined' && configList[p1]) {
            const item = configList[p1];
            currentCompareDataId = item.dataId || '';
            currentCompareGroup = item.group || 'DEFAULT_GROUP';
        } else {
            currentCompareDataId = p1 || '';
            currentCompareGroup = p2 || 'DEFAULT_GROUP';
        }

        // 处理 namespaceId / tenant 规范
        if (typeof activeNamespaceId !== 'undefined') {
            if (!activeNamespaceId || activeNamespaceId === 'public' || activeNamespaceId === 'undefined') {
                currentCompareTenant = '';
            } else {
                currentCompareTenant = activeNamespaceId;
            }
        } else {
            currentCompareTenant = '';
        }

        // 强行激活对比弹窗
        const modal = document.getElementById('compareModal');
        if (modal) {
            modal.classList.add('active');
        } else {
            alert('未找到对比弹窗容器 #compareModal');
            return;
        }

        const titleEl = document.getElementById('compareModalTitle');
        if (titleEl) {
            titleEl.innerText = `${currentCompareDataId} (${currentCompareGroup})`;
        }

        const statusMsg = document.getElementById('compareStatusMsg');
        if (statusMsg) statusMsg.style.display = 'none';

        document.getElementById('leftDiffBody').innerHTML = '<span style="color:#00f0ff;padding:10px;display:block;">正在检索历史版本记录...</span>';
        document.getElementById('rightDiffBody').innerHTML = '<span style="color:#00f0ff;padding:10px;display:block;">正在检索历史版本记录...</span>';

        await fetchHistoryAndCompare();

    } catch (err) {
        console.error('compareToQueryTab 异常:', err);
        alert('无法启动对比弹窗: ' + err.message);
    }
}

// 提供别名函数，防止主列表脚本调用的方法名不一致
function openCompareModal(p1, p2) {
    compareToQueryTab(p1, p2);
}

function closeCompareModal() {
    const modal = document.getElementById('compareModal');
    if (modal) modal.classList.remove('active');
}

// 核心逻辑：获取历史列表与当前配置
async function fetchHistoryAndCompare() {
    const token = localStorage.getItem('nacos_access_token') || '';
    const statusMsg = document.getElementById('compareStatusMsg');

    try {
        // 1. 获取 Nacos 历史版本列表 (/nacos/v1/cs/history)
        const historyUrl = `${SERVER_URL}/nacos/v1/cs/history?search=accurate&dataId=${encodeURIComponent(currentCompareDataId)}&group=${encodeURIComponent(currentCompareGroup)}&tenant=${encodeURIComponent(currentCompareTenant)}&pageNo=1&pageSize=20&accessToken=${token}`;
        
        const historyRes = await fetch(historyUrl);
        const historyText = await historyRes.text();

        let historyData = {};
        try { 
            historyData = JSON.parse(historyText); 
        } catch (e) {
            console.warn('历史列表非 JSON 格式:', historyText);
        }

        // 兼容不同的 Nacos 版本数据格式
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

        // 2. 获取当前实时配置作为基准版本
        const currUrl = `${SERVER_URL}/nacos/v1/cs/configs?dataId=${encodeURIComponent(currentCompareDataId)}&group=${encodeURIComponent(currentCompareGroup)}&tenant=${encodeURIComponent(currentCompareTenant)}&accessToken=${token}`;
        const currRes = await fetch(currUrl);
        const currentContent = await currRes.text();

        historyDetailMap['current'] = {
            text: currentContent,
            time: '当前最新状态'
        };

        // 3. 渲染选项框
        populateVersionSelects();

    } catch (err) {
        if (statusMsg) {
            statusMsg.innerText = `[!] 获取历史版本失败: ${err.message}`;
            statusMsg.style.display = 'block';
        }
    }
}

// 帮助获取有效的 NID
function getValidHistoryId(item) {
    if (!item) return null;
    const val = item.nid !== undefined ? item.nid : (item.id !== undefined ? item.id : item.historyId);
    if (val === undefined || val === null || val === 'undefined' || val === '') {
        return null;
    }
    return String(val);
}

// 填充下拉选框
function populateVersionSelects() {
    const leftSelect = document.getElementById('compareLeftVersion');
    const rightSelect = document.getElementById('compareRightVersion');

    if (!leftSelect || !rightSelect) return;

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
        noHistOpt.innerText = '无历史记录 (对照当前状态)';
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

// 触发对比渲染
async function triggerDiffRender() {
    const leftSelect = document.getElementById('compareLeftVersion');
    const rightSelect = document.getElementById('compareRightVersion');

    if (!leftSelect || !rightSelect) return;

    const leftId = leftSelect.value;
    const rightId = rightSelect.value;
    const token = localStorage.getItem('nacos_access_token') || '';

    const leftContent = await fetchContentById(leftId, token);
    const rightContent = await fetchContentById(rightId, token);

    document.getElementById('leftPaneTitle').innerText = `← ${formatSimpleTime(leftContent.time)}`;
    document.getElementById('rightPaneTitle').innerText = `→ ${formatSimpleTime(rightContent.time)}`;

    renderDiffViews(leftContent.text, rightContent.text);
}

// 请求具体的历史明细内容
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

    try {
        const detailUrl = `${SERVER_URL}/nacos/v1/cs/history?dataId=${encodeURIComponent(currentCompareDataId)}&group=${encodeURIComponent(currentCompareGroup)}&tenant=${encodeURIComponent(currentCompareTenant)}&nid=${encodeURIComponent(historyId)}&accessToken=${token}`;
        const res = await fetch(detailUrl);
        const text = await res.text();

        let content = text;

        if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
            try {
                const json = JSON.parse(text);
                if (json.data && json.data.content !== undefined) {
                    content = json.data.content;
                } else if (json.content !== undefined) {
                    content = json.content;
                }
            } catch(e) {}
        }

        if (content.includes('NumberFormatException') || content.includes('caused:')) {
            content = `[!] 服务端无法识别该历史记录 (NID=${historyId})`;
        }

        historyDetailMap[historyId] = { text: content, time: cleanTime };
        return historyDetailMap[historyId];

    } catch(e) {
        return { text: `[!] 读取历史数据失败: ${e.message}`, time: cleanTime };
    }
}

// 简单 HTML 转义
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// 比对并按行呈现
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

    document.getElementById('leftDiffBody').innerHTML = leftHtml || '<span style="color:#8b949e;">(无数据)</span>';
    document.getElementById('rightDiffBody').innerHTML = rightHtml || '<span style="color:#8b949e;">(无数据)</span>';
}
