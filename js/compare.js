/**
 * ========================================================
 * 模块：js/compare.js
 * 职责：处理对比点击逻辑，跳转并同步配置查询（Query）分页
 * ========================================================
 */

// 统一时间格式化：YYYY-MM-DD HH:mm:ss
function formatSimpleTime(timeInput) {
    if (!timeInput) return '未知时间';
    
    // 如果已经是格式化的标准字符串，直接返回
    if (typeof timeInput === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timeInput.trim())) {
        return timeInput.trim();
    }

    try {
        let date;
        if (typeof timeInput === 'number' || (!isNaN(Number(timeInput)) && !String(timeInput).includes('-'))) {
            date = new Date(Number(timeInput));
        } else {
            // 清理 ISO 格式中的 T、Z 及毫秒后缀，保证跨浏览器兼容 (尤其是 Safari)
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
 * 安全为输入框填值并触发 input/change 事件
 */
function setInputValueAndTrigger(elem, value) {
    if (!elem) return;
    elem.value = value;
    // 手动触发 input 和 change 事件，兼容现代前端事件监听逻辑
    elem.dispatchEvent(new Event('input', { bubbles: true }));
    elem.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * 点击对比入口：无缝切至“配置查询”Tab，匹配 Namespace / Data ID / Group
 */
async function compareToQueryTab(p1, p2) {
    try {
        let targetDataId = '';
        let targetGroup = 'DEFAULT_GROUP';

        // 参数归一化解析
        if (typeof p1 === 'object' && p1 !== null) {
            targetDataId = p1.dataId || p1.id || '';
            targetGroup = p1.group || 'DEFAULT_GROUP';
        } else if (typeof p1 === 'number' && typeof rawConfigList !== 'undefined' && rawConfigList[p1]) {
            // 兼容之前项目中的 rawConfigList 或 configList
            const item = rawConfigList[p1];
            targetDataId = item.dataId || '';
            targetGroup = item.group || 'DEFAULT_GROUP';
        } else {
            targetDataId = p1 || '';
            targetGroup = p2 || 'DEFAULT_GROUP';
        }

        if (window.appendDebugLog) {
            window.appendDebugLog(`[对比跳转] DataID=${targetDataId}, Group=${targetGroup}`, 'info');
        }

        // 1. 优先采用样式切换视图 Section（如 view-query），若无则通过 Tab 按钮匹配
        const targetView = document.getElementById('view-query');
        if (targetView) {
            document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
            targetView.classList.add('active');
        }

        // 匹配导航 Tab 激活高亮状态
        const tabs = document.querySelectorAll('.tab-btn, [data-tab]');
        tabs.forEach(tab => {
            const attr = tab.getAttribute('data-tab');
            const isMatch = attr === 'query' || tab.id === 'tab-query' || (tab.innerText && tab.innerText.trim() === '配置查询');
            if (isMatch) {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
            }
        });

        // 2. 刷新 Namespace 列表（防止列表为空）
        if (typeof loadNamespaces === 'function') {
            await loadNamespaces();
        }

        // 3. 异步填入参数并触发查询（增加防御性轮询，保障 DOM 节点存在）
        const fillAndSearch = () => {
            const dataInput = document.getElementById('queryDataId') || document.querySelector('input[placeholder*="Data ID"]');
            const groupInput = document.getElementById('queryGroup') || document.querySelector('input[placeholder*="Group"]');

            if (dataInput) setInputValueAndTrigger(dataInput, targetDataId);
            if (groupInput) setInputValueAndTrigger(groupInput, targetGroup);

            // 触发查询
            if (typeof doQueryConfig === 'function') {
                doQueryConfig();
            } else {
                const searchBtn = document.getElementById('btnSearch') || 
                                  document.getElementById('btnQuery') || 
                                  document.querySelector('.btn-query, button[onclick*="search"], button[onclick*="query"]');
                if (searchBtn) searchBtn.click();
            }
        };

        // 延迟执行，留出 DOM 渲染时间
        setTimeout(fillAndSearch, 100);

    } catch (err) {
        console.error('compareToQueryTab 异常:', err);
        if (window.appendDebugLog) {
            window.appendDebugLog(`[跳转异常] ${err.message}`, 'error');
        }
    }
}

function openCompareModal(p1, p2) {
    compareToQueryTab(p1, p2);
}