async function openEditModal(dataId, group) {
    currentEditDataId = dataId;
    currentEditGroup = group;

    document.getElementById('modalDataId').innerText = `${dataId} (${group})`;
    const textarea = document.getElementById('configContentArea');
    textarea.value = '正在读取服务器配置数据...';
    document.getElementById('editModal').classList.add('active');

    const token = localStorage.getItem('nacos_access_token') || '';

    try {
        const url = `${SERVER_URL}/nacos/v1/cs/configs?dataId=${encodeURIComponent(dataId)}&group=${encodeURIComponent(group)}&tenant=${encodeURIComponent(activeNamespaceId)}&accessToken=${token}`;
        const response = await fetch(url);
        const contentText = await response.text();
        
        textarea.value = contentText;
    } catch (err) {
        textarea.value = `[!] 获取内容失败: ${err.message}`;
    }
}

async function saveConfigToServer() {
    const content = document.getElementById('configContentArea').value;
    const token = localStorage.getItem('nacos_access_token') || '';

    try {
        const response = await fetch(`${SERVER_URL}/nacos/v1/cs/configs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                dataId: currentEditDataId,
                group: currentEditGroup,
                tenant: activeNamespaceId,
                content: content,
                accessToken: token
            })
        });

        const resultText = await response.text();

        if (response.ok && (resultText === 'true' || resultText.includes('true'))) {
            alert('✓ 配置已成功同步更新至 Nacos 服务器！');
            closeEditModal();
        } else {
            alert(`[!] 保存失败: ${resultText}`);
        }
    } catch (err) {
        alert(`[!] 更新异常: ${err.message}`);
    }
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
}
