// 1. 动态获取服务地址，禁止在开源代码中硬编码真实敏感域名
const SERVER_URL = localStorage.getItem('nacos_server_addr') || window.SERVER_URL || window.location.origin;
const PAGE_SIZE = 100;

// 全局状态管理
let rawNamespaceList = [];      
let filteredNamespaceList = []; 
let currentPage = 1;            
let activeNamespaceId = '';     

let rawConfigList = [];
let filteredConfigList = [];

let currentEditDataId = '';
let currentEditGroup = '';

// DOM 加载完成初始化鉴权与界面
window.addEventListener('DOMContentLoaded', () => {
    // 拦截未登录非法访问
    if (localStorage.getItem('is_authenticated') !== 'true') {
        window.location.href = 'index.html';
        return;
    }

    // 绑定导航项点击事件，避免硬编码下标
    document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
        item.addEventListener('click', () => {
            const tabKey = item.getAttribute('data-tab');
            if (tabKey) switchTab(tabKey);
        });
    });

    // 默认获取命名空间
    if (typeof fetchNamespaces === 'function') {
        fetchNamespaces();
    }
});

/**
 * 健壮的 Tab 视图切换（基于属性匹配，不依赖 DOM 顺序）
 */
function switchTab(tabKey) {
    // 清除所有高亮与激活状态
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));

    // 精确高亮当前 Tab 按钮
    const activeNav = document.querySelector(`.nav-item[data-tab="${tabKey}"]`);
    if (activeNav) {
        activeNav.classList.add('active');
    }

    // 显示对应的 View 区域
    const targetView = document.getElementById(`view-${tabKey}`);
    if (targetView) {
        targetView.classList.add('active');
    } else {
        console.warn(`[SwitchTab] 未找到对应的视图区域: view-${tabKey}`);
    }
}

/**
 * 状态/错误全局提示
 */
function showError(msg) {
    const statusMsg = document.getElementById('statusMsg');
    if (statusMsg) {
        statusMsg.innerText = msg;
        statusMsg.style.display = 'block';
    }
}

/**
 * 安全退出登录
 */
function logout() {
    // 清除所有相关的登录凭证
    localStorage.removeItem('is_authenticated');
    localStorage.removeItem('nacos_access_token');
    localStorage.removeItem('accessToken');
    
    window.location.href = 'index.html';
}

/**
 * 增强版安全 HTML 字符转义（防止 XSS 和属性截断）
 */
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}