// dashboard 加载时：检查 sessionStorage 里有没有解密后的 Nacos 配置
(function () {
    const testCfg = sessionStorage.getItem('nacos_test_cfg');
    const prodCfg = sessionStorage.getItem('nacos_prod_cfg');
    if (!testCfg || !prodCfg) {
        window.location.href = 'index.html';
    }
})();
