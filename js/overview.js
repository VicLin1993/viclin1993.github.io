async function fetchNamespaces() {
    const container = document.getElementById('namespaceContainer');
    const statusMsg = document.getElementById('statusMsg');
    
    container.innerHTML = '<div style="color: #00f0ff; font-size: 13px; grid-column: span 10;">正在读取 Nacos 命名空间...</div>';
    statusMsg.style.display = 'none';

    const token = localStorage.getItem('nacos_access_token') || '';

    try {
        const response = await fetch(`${SERVER_URL}/nacos/v1/console/namespaces?accessToken=${token}`);
        const resData = await response.json();

        if (resData.code === 403 || resData.code === 401 || (resData.message && resData.message.toLowerCase().includes('token'))) {
            container.innerHTML = '';
            showError(`[!] 凭证已过期，即将重新登录...`);
            setTimeout(logout, 2000);
            return;
        }

        if (Array.isArray(resData)) {
            rawNamespaceList = resData;
        } else if (resData && Array.isArray(resData.data)) {
            rawNamespaceList = resData.data;
        } else {
            rawNamespaceList = [];
        }

        filteredNamespaceList = [...rawNamespaceList];
        document.getElementById('nsTotalCount').innerText = filteredNamespaceList.length;
        
        currentPage = 1;
        renderCurrentPage();

    } catch (err) {
        container.innerHTML = '';
        showError(`[!] 读取失败: ${err.message}`);
    }
}

function renderCurrentPage() {
    const container = document.getElementById('namespaceContainer');
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

            const nsName = item.namespaceShowName || (item.namespace === "" ? "public" : item.namespace);
            const nsId = item.namespace === "" ? "public (默认)" : item.namespace;
            const desc = item.namespaceDesc || '';
            const configCount = item.configCount !== undefined ? `${item.configCount} 项配置` : '';

            card.innerHTML = `
                <div class="ns-name">${nsName}</div>
                <div class="ns-id">${nsId}</div>
                ${desc ? `<div class="ns-desc">${desc}</div>` : ''}
                ${configCount ? `<div class="ns-badge">${configCount}</div>` : ''}
            `;

            card.onclick = () => {
                loadConfigsOfNamespace(item.namespace, nsName);
            };

            container.appendChild(card);
        });
    }

    document.getElementById('pageCurrentText').innerText = currentPage;
    document.getElementById('pageTotalText').innerText = totalPages;

    renderPaginationControls(totalPages);
}

function renderPaginationControls(totalPages) {
    const controls = document.getElementById('paginationControls');
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
    const query = document.getElementById('searchInput').value.toLowerCase();
    filteredNamespaceList = rawNamespaceList.filter(item => {
        const name = (item.namespaceShowName || '').toLowerCase();
        const id = (item.namespace || '').toLowerCase();
        const desc = (item.namespaceDesc || '').toLowerCase();
        return name.includes(query) || id.includes(query) || desc.includes(query);
    });
    document.getElementById('nsTotalCount').innerText = filteredNamespaceList.length;
    currentPage = 1;
    renderCurrentPage();
}
