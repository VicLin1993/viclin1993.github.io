// 页面初始化：显示当前连接的服务器地址
(function () {
    const url = localStorage.getItem('nacos_server_url') || '';
    localStorage.setItem('nacos_server_addr', url);
    const el = document.getElementById('currentServer');
    if (el) el.innerText = url || '未配置';
})();
