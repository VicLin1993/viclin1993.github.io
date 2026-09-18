/**
 * ========================================================
 * 模块：js/compare.js
 * 职责：点击对比时，跳转并匹配“配置查询”分页的参数，以查询分页界面格式展示对比
 * ========================================================
 */

// 统一时间格式化函数：YYYY-MM-DD HH:mm:ss
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
 * 点击对比的主入口
 * 作用：跳转至查询 Tab，自动填入 Namespace, Data ID, Group 并检索渲染
 */
async function compareToQueryTab(p1, p2) {
    try {
        let targetDataId = '';
        let targetGroup = 'DEFAULT_GROUP';

        // 参数解析兼容
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

        window.appendDebugLog && window.appendDebugLog(`[对比发起] 跳转至查询页，匹配 Data ID: ${targetDataId}, Group: ${targetGroup}`, 'info');

        // 1. 自动切换到“配置查询”Tab 分页
        const queryTabBtn = document.querySelector('[onclick*="query"], [data-tab="query"], #tab-query-btn, .tab-btn-query');
        if (queryTabBtn) {
            queryTabBtn.click();
        } else if (typeof switchTab === 'function') {
            switchTab('query');
        } else if (typeof showTab === 'function') {
            showTab('query');
        }

        // 2. 匹配并填充“配置查询”分页的输入框与下拉选单
        setTimeout(async () => {
            const dataIdInput = document.getElementById('queryDataId') || document.getElementById('searchDataId') || document.querySelector('input[placeholder*="Data ID"]');
            if (dataIdInput) {
                dataIdInput.value = targetDataId;
            }

            const groupInput = document.getElementById('queryGroup') || document.getElementById('searchGroup') || document.querySelector('input[placeholder*="Group"]');
            if (groupInput) {
                groupInput.value = targetGroup;
            }

            // 如果查询页面有执行查询的按钮，自动触发点击
            const searchBtn = document.getElementById('btnSearch') || document.getElementById('queryBtn') || document.querySelector('.btn-query, button[onclick*="search"]');
            if (searchBtn) {
                searchBtn.click();
            } else if (typeof executeQuery === 'function') {
                executeQuery();
            } else if (typeof fetchConfigDetail === 'function') {
                fetchConfigDetail(targetDataId, targetGroup);
            }
        }, 100);

    } catch (err) {
        console.error('compareToQueryTab 报错:', err);
        if (window.appendDebugLog) {
            window.appendDebugLog(`[对比失败] ${err.message}`, 'error');
        }
    }
}

// 别名兼容
function openCompareModal(p1, p2) {
    compareToQueryTab(p1, p2);
}
