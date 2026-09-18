// 辅助工具：转义 HTML 防止 XSS
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function fetchNamespaces() {
    const container = document.getElementById('namespaceContainer');
    const statusMsg = document.getElementById('statusMsg');
    
    if (container) container.innerHTML = '<div style="color: #00f0ff; font-size: 13px; grid-column: span 10;">正在读取 Nacos 命名空间...</div>';
    if (statusMsg) statusMsg.style.display = 'none';

    const token = localStorage.getItem('nacos_access_token') || localStorage.getItem('accessToken') || '';
    
    // 如果没有 Token，直接判定未登录
    if (!token) {
        showError(`[!] 未检测到登录凭证，请先登录`);
        setTimeout(logout, 1500);
        return;
    }

    // 清理 SERVER_URL 末尾多余的斜杠，防止双斜杠 // 问题
    const cleanServerUrl = (typeof SERVER_URL !== 'undefined' ? SERVER_URL : '').replace(/\/+$/, '');

    try {
        const response = await fetch(`${cleanServerUrl}/nacos/v1/console/namespaces?accessToken=${encodeURIComponent(token)}`);
        
        // 拦截 HTTP 状态码错误 (401, 403, 500 等)
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                if (container) container.innerHTML = '';
                showError(`[!] 凭证已失效 (${response.status})，即将重新登录...`);
                setTimeout(logout, 2000);
                return;
            }
            throw new Error(`服务响应异常: HTTP ${response.status}`);
        }

        const resData = await response.json();

        // Nacos Token 校验逻辑
        if (resData.code === 403 || resData.code === 401 || (resData.message && resData.message.toLowerCase().includes('token'))) {
            if (container) container.innerHTML = '';
            showError(`[!] 凭证已过期，即将重新登录...`);
            setTimeout(logout, 2000);
            return;
        }

        // 兼容不同的 Nacos 返回格式
        if (Array.isArray(resData)) {
            rawNamespaceList = resData;
        } else if (resData && Array.isArray(resData.data)) {
            rawNamespaceList = resData.data;
        } else {
            rawNamespaceList = [];
        }

        filteredNamespaceList = [...rawNamespaceList];
        
        const countElem = document.getElementById('nsTotalCount');
        if (countElem) countElem.innerText = filteredNamespaceList.length;
        
        currentPage = 1;
        renderCurrentPage();

    } catch (err) {
        if (container) container.innerHTML = '';
        showError(`[!] 读取失败: ${err.message}`);
    }
}

function renderCurrentPage() {
    const container = document.getElementById('namespaceContainer');
    if (!container) return;
    
    container.innerHTML = '';

    const totalItems = filteredNamespaceList.length;
    const totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;

    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filteredNamespaceList.slice(startIdx, startIdx + PAGE_SIZE);

    if (pageItems.length === 0) {
        container.innerHTML = '<div style="color: #8b949e; grid-column: span 10; text-align: center; padding: 40px;">无符合条件的命名空间</div>';
    } else {
        pageItems.forEach((item) => {
            const card = document.createElement('div');
            card.className = 'ns-card';

            // 格式化展示的名称与真实的 namespaceId
            const rawNs = item.namespace || '';
            const nsId = rawNs === '' ? 'public' : rawNs;
            const nsName = item.namespaceShowName || nsId;
            const desc = item.namespaceDesc || '';
            const configCount = item.configCount !== undefined ? `${item.configCount} 项配置` : '';

            card.innerHTML = `
                <div class="ns-name">${escapeHtml(nsName)}</div>
                <div class="ns-id">${escapeHtml(rawNs === '' ? 'public (默认)' : rawNs)}</div>
                ${desc ? `<div class="ns-desc">${escapeHtml(desc)}</div>` : ''}
                ${configCount ? `<div class="ns-badge">${escapeHtml(configCount)}</div>` : ''}
            `;

            card.onclick = () => {
                // 确保点击时传入准确的 namespaceId (如果为空则传入 'public' 或保持空，看后台适配)
                if (typeof loadConfigsOfNamespace === 'function') {
                    loadConfigsOfNamespace(nsId, nsName);
                }
            };

            container.appendChild(card);
        });
    }

    const currentTxt = document.getElementById('pageCurrentText');
    const totalTxt = document.getElementById('pageTotalText');
    if (currentTxt) currentTxt.innerText = currentPage;
    if (totalTxt) totalTxt.innerText = totalPages;

    renderPaginationControls(totalPages);
}

function renderPaginationControls(totalPages) {
    const controls = document.getElementById('paginationControls');
    if (!controls) return;
    
    controls.innerHTML = '';

    if (totalPages <= 1) return;

    const firstBtn = document.createElement('button');
    firstBtn.className = 'page-btn';
    firstBtn.innerText = '<<';
    firstBtn.disabled = currentPage === 1;
    firstBtn.onclick = () => goToPage(1);
    controls.appendChild(firstBtn);

    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
    }

    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
        pageBtn.innerText = i;
        pageBtn.onclick = () => goToPage(i);
        controls.appendChild(pageBtn);
    }

    const lastBtn = document.createElement('button');
    lastBtn.className = 'page-btn';
    lastBtn.innerText = '>>';
    lastBtn.disabled = currentPage === totalPages;
    lastBtn.onclick = () => goToPage(totalPages);
    controls.appendChild(lastBtn);
}

function goToPage(page) {
    currentPage = page;
    renderCurrentPage();
}

function onSearchInput() {
    const searchElem = document.getElementById('searchInput');
    const query = searchElem ? searchElem.value.toLowerCase().trim() : '';
    
    filteredNamespaceList = rawNamespaceList.filter(item => {
        const name = (item.namespaceShowName || '').toLowerCase();
        const id = (item.namespace || '').toLowerCase();
        const desc = (item.namespaceDesc || '').toLowerCase();
        return name.includes(query) || id.includes(query) || desc.includes(query);
    });
    
    const countElem = document.getElementById('nsTotalCount');
    if (countElem) countElem.innerText = filteredNamespaceList.length;
    
    currentPage = 1;
    renderCurrentPage();
}