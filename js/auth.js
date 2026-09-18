// 权限拦截：未登录跳回登录页
if (localStorage.getItem('is_authenticated') !== 'true') {
    window.location.href = 'index.html';
}
