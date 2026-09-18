/**
 * ========================================================
 * 模块：js/compare.js
 * 职责：配置对比视图，左=上一版本，右=当前版本
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

/**
 * 打开对比视图
 */
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

        // 切换到对比视图（不切换左侧导航高亮）
        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        const compareView = document.getElementById('view-compare');
        if (compareView) compareView.classList.add('active');

        const nsInput = document.getElementById('compareNs');
        const groupInput = document.getElementById('compareGroup');
        const dataIdInput = document.getElementById('compareDataId');

        if (nsInput) nsInput.value = targetNs || '';
        if (groupInput) groupInput.value = targetGroup;
        if (dataIdInput) dataIdInput.value = targetDataId;

        refreshNamespaceDatalist();
        refreshCompareDatalists(targetNs).catch(e => console.error(e));

        if (targetDataId) {
            await loadCompareContent();
        }
    } catch (err) {
        console.error('openCompareView 异常:', err);
        if (window.appendDebugLog) {
            window.appendDebugLog(`[对比异常] ${err.message}`, 'error');
        }
    }
}

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
        console.error('刷新对比 datalist 失败:', err);
    }
}

async function loadCompareContent() {
    const nsInput = document.getElementById('compareNs');
    const groupInput = document.getElementById('compareGroup');
    const dataIdInput = document.getElementById('compareDataId');
    const leftArea = document.getElementById('compareLeft');
    const rightArea = document.getElementById('compareRight');
    const leftMeta = document.getElementById('compareLeftMeta');
    const rightMeta = document.getElementById('compareRightMeta');

    const nsId = (nsInput ? nsInput.value : '').trim();
    const group = (groupInput ? groupInput.value : '').trim() || 'DEFAULT_GROUP';
    const dataId = (dataIdInput ? dataIdInput.value : '').trim();

    if (!dataId) {
        alert('请填写 Data ID');
        return;
    }

    const token = localStorage.getItem('nacos_access_token') || '';
    const cleanUrl = (localStorage.getItem('nacos_server_url') || '').replace(/\/+$/, '');
    const tenant = (nsId === 'public' || !nsId) ? '' : nsId;

    leftArea.value = '加载中...';
    rightArea.value = '加载中...';
    leftMeta.innerText = '';
    rightMeta.innerText = '';

    // 当前版本 → 右边
    try {
        const currentUrl = `${cleanUrl}/nacos/v1/cs/configs?dataId=${encodeURIComponent(dataId)}&group=${encodeURIComponent(group)}&tenant=${encodeURIComponent(tenant)}&accessToken=${encodeURIComponent(token)}`;
        const currentResp = await fetch(currentUrl);
        if (!currentResp.ok) throw new Error('HTTP ' + currentResp.status);
        const currentContent = await currentResp.text();
        rightArea.value = currentContent || '';
        rightMeta.innerText = '当前版本';
    } catch (err) {
        rightArea.value = `[!] 加载当前版本失败: ${err.message}`;
    }

    // 历史版本（第一条 = 上一版本）→ 左边
    try {
        const historyUrl = `${cleanUrl}/nacos/v1/cs/history?search=accurate&dataId=${encodeURIComponent(dataId)}&group=${encodeURIComponent(group)}&tenant=${encodeURIComponent(tenant)}&pageNo=1&pageSize=10&accessToken=${encodeURIComponent(token)}`;
        const historyResp = await fetch(historyUrl);
        if (!historyResp.ok) throw new Error('HTTP ' + historyResp.status);
        const historyData = await historyResp.json();
        const items = historyData.pageItems || [];

        if (items.length === 0) {
            leftArea.value = '（没有历史版本，这是首次创建的配置）';
            leftMeta.innerText = '无历史记录';
        } else {
            const latest = items[0];
            leftArea.value = latest.content || '';
            leftMeta.innerText = formatSimpleTime(latest.lastModifiedTime || latest.createdTime);
        }
    } catch (err) {
        leftArea.value = `[!] 加载历史版本失败: ${err.message}`;
    }

    refreshCompareDatalists(nsId).catch(e => console.error(e));
}

// 兼容旧调用名
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
