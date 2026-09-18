async function compareToQueryTab(dataId, group) {
    switchTab('search');
    document.getElementById('compareTargetText').innerText = `${dataId} (${group})`;

    const leftBody = document.getElementById('leftDiffBody');
    const rightBody = document.getElementById('rightDiffBody');
    
    leftBody.innerHTML = '<span style="color:#00f0ff;">正在获取上一版本数据...</span>';
    rightBody.innerHTML = '<span style="color:#00f0ff;">正在获取当前最新版本数据...</span>';

    const token = localStorage.getItem('nacos_access_token') || '';
    // 规范化 Namespace (public 映射为空字符串)
    const tenantParam = (activeNamespaceId === 'public' || !activeNamespaceId) ? '' : activeNamespaceId;

    try {
        // 1. 获取当前最新版本内容
        const currUrl = `${SERVER_URL}/nacos/v1/cs/configs?dataId=${encodeURIComponent(dataId)}&group=${encodeURIComponent(group)}&tenant=${encodeURIComponent(tenantParam)}&accessToken=${token}`;
        const currRes = await fetch(currUrl);
        const currentContent = await currRes.text();

        // 2. 查询 Nacos 历史版本列表
        const historyUrl = `${SERVER_URL}/nacos/v1/cs/history?search=accurate&dataId=${encodeURIComponent(dataId)}&group=${encodeURIComponent(group)}&tenant=${encodeURIComponent(tenantParam)}&pageNo=1&pageSize=5&accessToken=${token}`;
        const historyRes = await fetch(historyUrl);
        const historyText = await historyRes.text();

        let historyData = {};
        try {
            historyData = JSON.parse(historyText);
        } catch (e) {
            throw new Error(`Nacos 历史接口返回异常: ${historyText}`);
        }

        const pageItems = historyData.pageItems || [];

        if (pageItems.length <= 1) {
            renderDiffViews(currentContent, currentContent);
            document.getElementById('leftPaneTitle').innerText = `← 上一版本 (无更早历史纪录，与当前一致)`;
        } else {
            const prevNid = pageItems[1].nid;
            // ⚠️ 必填项补充：dataId 和 group 在 2.0.3+ 是必填参数
            const prevDetailUrl = `${SERVER_URL}/nacos/v1/cs/history?dataId=${encodeURIComponent(dataId)}&group=${encodeURIComponent(group)}&tenant=${encodeURIComponent(tenantParam)}&nid=${prevNid}&accessToken=${token}`;
            const prevRes = await fetch(prevDetailUrl);
            const prevText = await prevRes.text();

            let previousContent = '';
            try {
                const prevJson = JSON.parse(prevText);
                previousContent = prevJson.content || '';
            } catch (e) {
                // 如果返回的是纯文本内容，直接当作配置内容
                previousContent = prevText;
            }

            document.getElementById('leftPaneTitle').innerText = `← 上一版本 (${pageItems[1].lastModifiedTime || '历史改动'})`;
            renderDiffViews(previousContent, currentContent);
        }

    } catch (err) {
        leftBody.innerHTML = `<span style="color:#ff5555;">[!] 获取对比数据失败: ${err.message}</span>`;
        rightBody.innerHTML = `<span style="color:#ff5555;">[!] 获取对比数据失败: ${err.message}</span>`;
    }
}

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
