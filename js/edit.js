// 辅助函数：格式化 tenant 参数 (public 空间需传空字符串)
function getSanitizedTenant(nsId) {
    return (nsId === 'public' || !nsId) ? '' : nsId;
}

async function openEditModal(dataId, group) {
    currentEditDataId = dataId;
    currentEditGroup = group;

    const dataIdElem = document.getElementById('modalDataId');
    const textarea = document.getElementById('configContentArea');
    const modal = document.getElementById('editModal');

    if (dataIdElem) dataIdElem.innerText = `${dataId} (${group})`;
    if (textarea) textarea.value = '正在读取服务器配置数据...';
    if (modal) modal.classList.add('active');

    const token = localStorage.getItem('nacos_access_token') || localStorage.getItem('accessToken') || '';
    const cleanServerUrl = (typeof SERVER_URL !== 'undefined' ? SERVER_URL : '').replace(/\/+$/, '');
    const tenant = getSanitizedTenant(typeof activeNamespaceId !== 'undefined' ? activeNamespaceId : '');

    try {
        const url = `${cleanServerUrl}/nacos/v1/cs/configs?dataId=${encodeURIComponent(dataId)}&group=${encodeURIComponent(group)}&tenant=${encodeURIComponent(tenant)}&accessToken=${encodeURIComponent(token)}`;
        const response = await fetch(url);

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                if (textarea) textarea.value = '[!] 登录凭证已失效，请重新登录。';
                setTimeout(() => {
                    if (typeof logout === 'function') logout();
                }, 2000);
                return;
            }
            throw new Error(`HTTP ${response.status} (${response.statusText})`);
        }

        const contentText = await response.text();
        if (textarea) textarea.value = contentText;

    } catch (err) {
        if (textarea) textarea.value = `[!] 获取内容失败: ${err.message}`;
    }
}

async function saveConfigToServer() {
    const textarea = document.getElementById('configContentArea');
    const saveBtn = document.getElementById('saveConfigBtn'); // 假设保存按钮有 id
    const content = textarea ? textarea.value : '';
    const token = localStorage.getItem('nacos_access_token') || localStorage.getItem('accessToken') || '';
    const cleanServerUrl = (typeof SERVER_URL !== 'undefined' ? SERVER_URL : '').replace(/\/+$/, '');
    const tenant = getSanitizedTenant(typeof activeNamespaceId !== 'undefined' ? activeNamespaceId : '');

    // 防止重复提交 UI 状态控制
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerText = '正在保存...';
    }

    try {
        const response = await fetch(`${cleanServerUrl}/nacos/v1/cs/configs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                dataId: currentEditDataId,
                group: currentEditGroup,
                tenant: tenant,
                content: content,
                accessToken: token
            })
        });

        const resultText = (await response.text()).trim();

        if (response.ok && (resultText === 'true' || resultText.toLowerCase() === 'true')) {
            alert('✓ 配置已成功同步更新至 Nacos 服务器！');
            closeEditModal();
            // 如果主页面有刷新配置列表的函数，建议调用刷新
            if (typeof refreshConfigList === 'function') {
                refreshConfigList();
            }
        } else {
            alert(`[!] 保存失败: ${resultText || ('HTTP Status ' + response.status)}`);
        }
    } catch (err) {
        alert(`[!] 更新异常: ${err.message}`);
    } finally {
        // 恢复按钮状态
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerText = '保存配置';
        }
    }
}

function closeEditModal() {
    const modal = document.getElementById('editModal');
    if (modal) modal.classList.remove('active');
}