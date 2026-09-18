// 辅助函数：格式化 tenant 参数 (public 空间必须传空字符串)
function getSanitizedTenant(nsId) {
    return (nsId === 'public' || nsId === 'public (默认)' || !nsId) ? '' : nsId;
}

// 辅助函数：安全转义 HTML，防止 XSS 和属性截断
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function loadConfigsOfNamespace(namespaceId, namespaceName) {
    // 规范化内部保存的 activeNamespaceId
    activeNamespaceId = namespaceId;
    
    const titleElem = document.getElementById('currentNsTitle');
    if (titleElem) {
        titleElem.innerText = namespaceName || (namespaceId === '' ? 'public (默认)' : namespaceId);
    }
    
    const filterDataId = document.getElementById('filterDataId');
    const filterGroup = document.getElementById('filterGroup');
    if (filterDataId) filterDataId.value = '';
    if (filterGroup) filterGroup.value = '';
    
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    const targetView = document.getElementById('view-configs');
    if (targetView) targetView.classList.add('active');

    const tableBody = document.getElementById('configTableBody');
    const statusMsg = document.getElementById('configStatusMsg');
    
    if (tableBody) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#00f0ff;">正在拉取 Nacos 配置数据...</td></tr>';
    }
    if (statusMsg) statusMsg.style.display = 'none';

    const token = localStorage.getItem('nacos_access_token') || localStorage.getItem('accessToken') || '';
    const cleanServerUrl = (typeof SERVER_URL !== 'undefined' ? SERVER_URL : '').replace(/\/+$/, '');
    const tenant = getSanitizedTenant(namespaceId);

    try {
        const url = `${cleanServerUrl}/nacos/v1/cs/configs?dataId=&group=&appName=&config_tags=&pageNo=1&pageSize=500&tenant=${encodeURIComponent(tenant)}&search=accurate&accessToken=${encodeURIComponent(token)}`;
        const response = await fetch(url);

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                if (statusMsg) {
                    statusMsg.innerText = '[!] 登录凭证已失效，请重新登录';
                    statusMsg.style.display = 'block';
                }
                setTimeout(() => {
                    if (typeof logout === 'function') logout();
                }, 2000);
                return;
            }
            throw new Error(`服务响应异常: HTTP ${response.status}`);
        }

        const resData = await response.json();

        // 兼容 Nacos Token 校验失败报错
        if (resData.code === 403 || resData.code === 401 || (resData.message && resData.message.toLowerCase().includes('token'))) {
            if (statusMsg) {
                statusMsg.innerText = '[!] 登录凭证已过期，即将重新登录...';
                statusMsg.style.display = 'block';
            }
            setTimeout(() => {
                if (typeof logout === 'function') logout();
            }, 2000);
            return;
        }

        rawConfigList = resData.pageItems || [];
        filteredConfigList = [...rawConfigList];

        renderConfigTable(filteredConfigList);

    } catch (err) {
        if (tableBody) tableBody.innerHTML = '';
        if (statusMsg) {
            statusMsg.innerText = `[!] 配置加载失败: ${err.message}`;
            statusMsg.style.display = 'block';
        }
    }
}

function renderConfigTable(list) {
    const tableBody = document.getElementById('configTableBody');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';

    const countElem = document.getElementById('configFilteredCount');
    if (countElem) countElem.innerText = list ? list.length : 0;

    if (!list || list.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#8b949e; padding:30px;">无符合条件的配置数据</td></tr>';
        return;
    }

    list.forEach(config => {
        const tr = document.createElement('tr');
        
        const safeDataId = escapeHtml(config.dataId);
        const safeGroup = escapeHtml(config.group);
        const safeAppName = escapeHtml(config.appName || '-');

        tr.innerHTML = `
            <td style="color:#00ff88; font-weight:bold;">${safeDataId}</td>
            <td><span style="background:rgba(0,240,255,0.1); padding:2px 8px; border-radius:3px; color:#00f0ff;">${safeGroup}</span></td>
            <td style="color:#8b949e;">${safeAppName}</td>
            <td>
                <button class="btn-edit" data-dataid="${safeDataId}" data-group="${safeGroup}">编辑</button>
                <button class="btn-compare" data-dataid="${safeDataId}" data-group="${safeGroup}">对比</button>
            </td>
        `;

        // 通过事件监听绑定，避免 onclick 拼接字符串导致的引号引发报错
        const editBtn = tr.querySelector('.btn-edit');
        const compareBtn = tr.querySelector('.btn-compare');

        if (editBtn) {
            editBtn.onclick = () => {
                if (typeof openEditModal === 'function') openEditModal(config.dataId, config.group);
            };
        }
        if (compareBtn) {
            compareBtn.onclick = () => {
                if (typeof compareToQueryTab === 'function') compareToQueryTab(config.dataId, config.group);
            };
        }

        tableBody.appendChild(tr);
    });
}

function applyCombinedFilter() {
    const filterDataIdElem = document.getElementById('filterDataId');
    const filterGroupElem = document.getElementById('filterGroup');

    const queryDataId = filterDataIdElem ? filterDataIdElem.value.trim().toLowerCase() : '';
    const queryGroup = filterGroupElem ? filterGroupElem.value.trim().toLowerCase() : '';

    filteredConfigList = (rawConfigList || []).filter(item => {
        const dataId = (item.dataId || '').toLowerCase();
        const group = (item.group || '').toLowerCase();

        const matchDataId = !queryDataId || dataId.includes(queryDataId);
        const matchGroup = !queryGroup || group.includes(queryGroup);

        return matchDataId && matchGroup;
    });

    renderConfigTable(filteredConfigList);
}

function resetConfigFilter() {
    const filterDataIdElem = document.getElementById('filterDataId');
    const filterGroupElem = document.getElementById('filterGroup');
    
    if (filterDataIdElem) filterDataIdElem.value = '';
    if (filterGroupElem) filterGroupElem.value = '';
    
    filteredConfigList = [...(rawConfigList || [])];
    renderConfigTable(filteredConfigList);
}