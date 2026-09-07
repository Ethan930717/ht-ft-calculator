const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'dist-web');

// 清理并重新创建 dist-web 目录
if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

// 复制 index.html
const indexSrc = path.join(rootDir, 'index.html');
if (fs.existsSync(indexSrc)) {
    fs.copyFileSync(indexSrc, path.join(outDir, 'index.html'));
}

// 复制静态资源目录
['css', 'js', 'img'].forEach(folder => {
    const src = path.join(rootDir, folder);
    const dest = path.join(outDir, folder);
    if (fs.existsSync(src)) {
        fs.cpSync(src, dest, { recursive: true });
    }
});

console.log('[prepare-web] 前端静态资源已成功同步至 dist-web 独立目录！');
