const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function createWindow() {
    const win = new BrowserWindow({
        width: 1360,
        height: 900,
        minWidth: 960,
        minHeight: 650,
        title: '半全场实战配资计算器',
        icon: path.join(__dirname, 'img/logo.png'),
        autoHideMenuBar: true,
        backgroundColor: '#0b0f17', // 配合暗黑科技风格底色，避免白屏闪烁
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false // 桌面模式下允许无阻直连竞彩官方接口
        }
    });

    win.loadFile('index.html');
    Menu.setApplicationMenu(null); // 隐藏原生工具菜单栏，全屏沉浸呈现计算器
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
