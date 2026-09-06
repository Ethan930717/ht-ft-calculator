# -*- coding: utf-8 -*-
"""
竞彩半全场「多维变式 & 人造单关」实战配资计算器 (HT/FT) - 桌面启动器
作者：大胡 (Dahu)
说明：支持本地直接运行，或使用 PyInstaller 编译打包为 Windows 单文件 .exe
"""
import os
import sys
import threading
import http.server
import socketserver

PORT = 15280
HTML_DIR = os.path.dirname(os.path.abspath(__file__))

def start_local_server():
    """启动极简本地静态文件微服务，避免 file:// 协议在部分浏览器环境下的跨域安全限制"""
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=HTML_DIR, **kwargs)
        def log_message(self, format, *args):
            pass # 静音控制台日志

    try:
        with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
            httpd.serve_forever()
    except Exception as e:
        print(f"本地静态服务启动提示: {e}")

def main():
    # 后台启动静态服务器
    t = threading.Thread(target=start_local_server, daemon=True)
    t.start()

    url = f"http://127.0.0.1:{PORT}/index.html"

    # 优先尝试使用 pywebview 打开沉浸式原生窗口
    try:
        import webview
        window = webview.create_window(
            title="竞彩半全场「多维变式 & 人造单关」实战配资计算器 (HT/FT) - By @大胡",
            url=url,
            width=1320,
            height=880,
            min_size=(960, 680),
            background_color="#0b0f17"
        )
        webview.start()
    except ImportError:
        # 若未安装 pywebview，平滑回退至系统默认浏览器打开
        import webbrowser
        print(f"未检测到 pywebview，正在启动系统默认浏览器访问: {url}")
        webbrowser.open(url)
        print("提示：运行 pip install pywebview 可升级为独立原生桌面窗口！")
        try:
            while True:
                import time
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n程序已退出。")

if __name__ == "__main__":
    main()
