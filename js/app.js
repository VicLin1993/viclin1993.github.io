const SERVER_URL = 'https://nacos.wayturnlive.com';
const PAGE_SIZE = 100;

let rawNamespaceList = [];      
let filteredNamespaceList = []; 
let currentPage = 1;            
let activeNamespaceId = '';     

let rawConfigList = [];
let filteredConfigList = [];

let currentEditDataId = '';
let currentEditGroup = '';

window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('is_authenticated') !== 'true') {
        window.location.href = 'index.html';
        return;
    }
    fetchNamespaces();
});

function switchTab(tabKey) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));

    if (tabKey === 'overview') {
        document.querySelectorAll('.nav-item')[0].classList.add('active');
        document.getElementById('view-overview').classList.add('active');
    } else if (tabKey === 'search') {
        document.querySelectorAll('.nav-item')[1].classList.add('active');
        document.getElementById('view-search').classList.add('active');
    } else if (tabKey === 'edit') {
        document.querySelectorAll('.nav-item')[2].classList.add('active');
        document.getElementById('view-edit').classList.add('active');
    }
}

function showError(msg) {
    const statusMsg = document.getElementById('statusMsg');
    if (statusMsg) {
        statusMsg.innerText = msg;
        statusMsg.style.display = 'block';
    }
}

function logout() {
    localStorage.removeItem('is_authenticated');
    localStorage.removeItem('nacos_access_token');
    window.location.href = 'index.html';
}

function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
