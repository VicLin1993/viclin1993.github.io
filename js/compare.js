/**
 * ========================================================
 * 模块：js/compare.js
 * 职责：处理对比点击逻辑，跳转并同步配置查询（Query）分页
 * ========================================================
 */

// 统一时间格式化：YYYY-MM-DD HH:mm:ss
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
            str = str.split('.')[0].split('+')[0].split('Z')[0];
            date = new Date(str.replace(/-/g, '/')); 
            if (isNaN(date.getTime())) return str;
        }
        const pad = (num) => String(num).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    } catch(e) {
        return String(timeInput);
    }
}

/**
 * 点击对比入口：无缝切至“配置查询”Tab，匹配 Namespace / Data ID / Group
 */
async function compareToQueryTab(p1, p2) {
    try {
        let targetDataId = '';
        let targetGroup = 'DEFAULT_GROUP';

        if (typeof p1 === 'object' && p1 !== null) {
            targetDataId = p1.dataId || p1.id || '';
            targetGroup = p1.group || 'DEFAULT_GROUP';
        } else if (typeof p1 === 'number' && typeof configList !== 'undefined' && configList[p1]) {
            const item = configList[p1];
            targetDataId = item.dataId || '';
            targetGroup = item.group || 'DEFAULT_GROUP';
        } else {
            targetDataId = p1 || '';
            targetGroup = p2 || 'DEFAULT_GROUP';
        }

        if (window.appendDebugLog) {
            window.appendDebugLog(`[对比跳转] DataID=${targetDataId}, Group=${targetGroup}`, 'info');
        }

        // 1. 自动切换 Tab
        const tabs = document.querySelectorAll('.tab-btn, [data-tab]');
        tabs.forEach(tab => {
            if (tab.innerText.includes('查询') || tab.getAttribute('data-tab') === 'query') {
                tab.click();
            }
        });

        // 2. 补全与刷新 Namespace 下拉选单（防止无数据）
        if (typeof loadNamespaces === 'function') {
            await loadNamespaces();
        }

        // 3. 填入参数并触发查询
        setTimeout(() => {
            const dataInput = document.getElementById('queryDataId') || document.querySelector('input[placeholder*="Data ID"]');
            if (dataInput) dataInput.value = targetDataId;

            const groupInput = document.getElementById('queryGroup') || document.querySelector('input[placeholder*="Group"]');
            if (groupInput) groupInput.value = targetGroup;

            // 触发查询按钮点击
            const searchBtn = document.getElementById('btnSearch') || document.querySelector('.btn-query, button[onclick*="search"], button[onclick*="query"]');
            if (searchBtn) {
                searchBtn.click();
            }
        }, 150);

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
