async function loadConfigsOfNamespace(namespaceId, namespaceName) {
    activeNamespaceId = namespaceId;
    document.getElementById('currentNsTitle').innerText = namespaceName || namespaceId || 'public';
    
    document.getElementById('filterDataId').value = '';
    document.getElementById('filterGroup').value = '';
    
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.getElementById('view-configs').classList.add('active');

    const tableBody = document.getElementById('configTableBody');
    const statusMsg = document.getElementById('configStatusMsg');
    tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#00f0ff;">正在拉取 Nacos 配置数据...</td></tr>';
    statusMsg.style.display = 'none';

    const token = localStorage.getItem('nacos_access_token') || '';

    try {
        const url = `${SERVER_URL}/nacos/v1/cs/configs?dataId=&group=&appName=&config_tags=&pageNo=1&pageSize=500&tenant=${namespaceId}&search=accurate&accessToken=${token}`;
        const response = await fetch(url);
        const resData = await response.json();

        rawConfigList = resData.pageItems || [];
        filteredConfigList = [...rawConfigList];

        renderConfigTable(filteredConfigList);

    } catch (err) {
        tableBody.innerHTML = '';
        statusMsg.innerText = `[!] 配置加载失败: ${err.message}`;
        statusMsg.style.display = 'block';
    }
}

function renderConfigTable(list) {
    const tableBody = document.getElementById('configTableBody');
    tableBody.innerHTML = '';

    document.getElementById('configFilteredCount').innerText = list.length;

    if (!list || list.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#8b949e; padding:30px;">无符合条件的配置数据</td></tr>';
        return;
    }

    list.forEach(config => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="color:#00ff88; font-weight:bold;">${config.dataId}</td>
            <td><span style="background:rgba(0,240,255,0.1); padding:2px 8px; border-radius:3px; color:#00f0ff;">${config.group}</span></td>
            <td style="color:#8b949e;">${config.appName || '-'}</td>
            <td>
                <button class="btn-edit" onclick="openEditModal('${config.dataId}', '${config.group}')">编辑</button>
                <button class="btn-compare" onclick="compareToQueryTab('${config.dataId}', '${config.group}')">对比</button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

function applyCombinedFilter() {
    const queryDataId = document.getElementById('filterDataId').value.trim().toLowerCase();
    const queryGroup = document.getElementById('filterGroup').value.trim().toLowerCase();

    filteredConfigList = rawConfigList.filter(item => {
        const dataId = (item.dataId || '').toLowerCase();
        const group = (item.group || '').toLowerCase();

        const matchDataId = !queryDataId || dataId.includes(queryDataId);
        const matchGroup = !queryGroup || group.includes(queryGroup);

        return matchDataId && matchGroup;
    });

    renderConfigTable(filteredConfigList);
}

function resetConfigFilter() {
    document.getElementById('filterDataId').value = '';
    document.getElementById('filterGroup').value = '';
    filteredConfigList = [...rawConfigList];
    renderConfigTable(filteredConfigList);
}
