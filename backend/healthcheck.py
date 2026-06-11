#!/usr/bin/env python
import os
import sys
import socket
import subprocess
import urllib.request
import urllib.error


def check_port(host, port, timeout=5):
    try:
        sock = socket.create_connection((host, port), timeout)
        sock.close()
        return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


def check_process(name):
    try:
        result = subprocess.run(
            ["pgrep", "-f", name],
            capture_output=True,
            text=True
        )
        return result.returncode == 0, result.stdout.strip()
    except FileNotFoundError:
        return False, "pgrep not available"


def check_http_endpoint(url, timeout=10):
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
            return response.status == 200, response.status, body
    except urllib.error.HTTPError as e:
        return False, e.code, e.reason
    except urllib.error.URLError as e:
        return False, None, str(e.reason)
    except Exception as e:
        return False, None, str(e)


def check_database():
    db_path = os.getenv("SQLITE_PATH", "/data/db.sqlite3")
    exists = os.path.exists(db_path)
    readable = os.access(db_path, os.R_OK) if exists else False
    writable = os.access(db_path, os.W_OK) if exists else False
    return exists, readable, writable, db_path


def print_diagnosis():
    print("=" * 60)
    print("  后端健康检查失败 - 排查诊断信息")
    print("=" * 60)

    print("\n【1. 进程检查】")
    gunicorn_running, gunicorn_pids = check_process("gunicorn")
    python_running, python_pids = check_process("python.*manage.py")
    print(f"  Gunicorn 进程: {'运行中' if gunicorn_running else '未运行'}")
    if gunicorn_pids:
        print(f"    PID: {gunicorn_pids}")
    print(f"  Python 进程: {'运行中' if python_running else '未运行'}")
    if python_pids:
        print(f"    PID: {python_pids}")

    print("\n【2. 端口检查】")
    port_8000 = check_port("127.0.0.1", 8000)
    print(f"  端口 8000: {'监听中' if port_8000 else '未监听'}")

    print("\n【3. 数据库检查】")
    db_exists, db_readable, db_writable, db_path = check_database()
    print(f"  数据库文件: {db_path}")
    print(f"    存在: {db_exists}")
    if db_exists:
        print(f"    可读: {db_readable}")
        print(f"    可写: {db_writable}")

    print("\n【4. 环境变量】")
    print(f"  DJANGO_DEBUG: {os.getenv('DJANGO_DEBUG', 'not set')}")
    print(f"  DJANGO_ALLOWED_HOSTS: {os.getenv('DJANGO_ALLOWED_HOSTS', 'not set')}")
    print(f"  SQLITE_PATH: {os.getenv('SQLITE_PATH', 'not set')}")

    print("\n【5. HTTP 端点诊断】")
    ok, status, body = check_http_endpoint("http://127.0.0.1:8000/api/health/")
    print(f"  /api/health/: {'正常' if ok else '异常'}")
    if status is not None:
        print(f"    HTTP 状态码: {status}")
    if body:
        print(f"    响应内容: {body[:200]}")

    print("\n【6. 排查建议】")
    suggestions = []
    if not gunicorn_running and not python_running:
        suggestions.append("  - Django/Gunicorn 进程未启动，检查启动命令和日志")
    if not port_8000:
        suggestions.append("  - 8000 端口未监听，确认服务是否成功启动")
    if not db_exists:
        suggestions.append("  - 数据库文件不存在，检查 volume 挂载和 migrate 是否执行")
    if not suggestions:
        suggestions.append("  - 请查看容器日志获取更多错误信息")
        suggestions.append("  - 检查网络连接和防火墙设置")
    for s in suggestions:
        print(s)

    print("\n" + "=" * 60)


def main():
    url = "http://127.0.0.1:8000/api/health/"
    ok, status, body = check_http_endpoint(url)

    if ok:
        print(f"Health check passed: {body}")
        sys.exit(0)
    else:
        print_diagnosis()
        sys.exit(1)


if __name__ == "__main__":
    main()
