#!/usr/bin/env node
const http = require("http");
const { execSync } = require("child_process");
const fs = require("fs");

function checkPort(host, port, timeout = 5000) {
  return new Promise((resolve) => {
    const socket = require("net").createConnection(port, host);
    socket.setTimeout(timeout);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      resolve(false);
    });
  });
}

function checkProcess(name) {
  try {
    const result = execSync(`ps aux | grep "${name}" | grep -v grep`, { encoding: "utf-8" });
    return { running: true, output: result.trim() };
  } catch (e) {
    return { running: false, output: "" };
  }
}

function checkHttpEndpoint(url, timeout = 10000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout }, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk.toString();
      });
      res.on("end", () => {
        resolve({
          ok: res.statusCode === 200,
          status: res.statusCode,
          body: body,
        });
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, status: null, body: "Request timeout" });
    });
    req.on("error", (err) => {
      resolve({ ok: false, status: null, body: err.message });
    });
  });
}

function printSeparator() {
  console.log("=".repeat(60));
}

async function printDiagnosis() {
  printSeparator();
  console.log("  前端健康检查失败 - 排查诊断信息");
  printSeparator();

  console.log("\n【1. 进程检查】");
  const viteProcess = checkProcess("vite");
  const nodeProcess = checkProcess("node");
  console.log(`  Vite 进程: ${viteProcess.running ? "运行中" : "未运行"}`);
  if (viteProcess.output) {
    console.log(`    ${viteProcess.output.split("\n")[0].substring(0, 100)}`);
  }
  console.log(`  Node 进程: ${nodeProcess.running ? "运行中" : "未运行"}`);

  console.log("\n【2. 端口检查】");
  const port5173 = await checkPort("127.0.0.1", 5173);
  console.log(`  端口 5173: ${port5173 ? "监听中" : "未监听"}`);

  console.log("\n【3. 首页访问检查】");
  const homeResult = await checkHttpEndpoint("http://127.0.0.1:5173/");
  console.log(`  首页 /: ${homeResult.ok ? "正常" : "异常"}`);
  if (homeResult.status !== null) {
    console.log(`    HTTP 状态码: ${homeResult.status}`);
  }
  if (homeResult.body) {
    console.log(`    响应长度: ${homeResult.body.length} 字节`);
    if (homeResult.body.length > 0) {
      console.log(`    响应片段: ${homeResult.body.substring(0, 200).replace(/\n/g, " ")}`);
    }
  }

  console.log("\n【4. 后端 API 连接检查】");
  const internalApiUrl = process.env.BACKEND_INTERNAL_URL || process.env.VITE_API_BASE_URL || "http://backend:8000/api";
  const browserApiUrl = process.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api";
  console.log(`  容器内部地址: ${internalApiUrl}`);
  console.log(`  浏览器访问地址: ${browserApiUrl}`);
  const apiHealthUrl = internalApiUrl.replace(/\/?$/, "/health/");
  const apiResult = await checkHttpEndpoint(apiHealthUrl);
  console.log(`  健康检查端点: ${apiResult.ok ? "可访问" : "不可访问"}`);
  if (apiResult.status !== null) {
    console.log(`    HTTP 状态码: ${apiResult.status}`);
  }
  if (apiResult.body) {
    console.log(`    响应: ${apiResult.body.substring(0, 200)}`);
  }

  console.log("\n【5. 环境变量】");
  console.log(`  VITE_API_BASE_URL: ${process.env.VITE_API_BASE_URL || "not set"}`);
  console.log(`  BACKEND_INTERNAL_URL: ${process.env.BACKEND_INTERNAL_URL || "not set"}`);
  console.log(`  NODE_ENV: ${process.env.NODE_ENV || "not set"}`);

  console.log("\n【6. 文件系统检查】");
  const packageJsonExists = fs.existsSync("/app/package.json");
  const nodeModulesExists = fs.existsSync("/app/node_modules");
  const srcExists = fs.existsSync("/app/src");
  console.log(`  package.json: ${packageJsonExists ? "存在" : "不存在"}`);
  console.log(`  node_modules/: ${nodeModulesExists ? "存在" : "不存在"}`);
  console.log(`  src/: ${srcExists ? "存在" : "不存在"}`);

  console.log("\n【7. 排查建议】");
  const suggestions = [];
  if (!viteProcess.running && !nodeProcess.running) {
    suggestions.push("  - Vite/Node 进程未启动，检查启动命令和日志");
  }
  if (!port5173) {
    suggestions.push("  - 5173 端口未监听，确认 Vite dev server 是否成功启动");
  }
  if (!nodeModulesExists) {
    suggestions.push("  - node_modules 不存在，可能依赖未安装");
  }
  if (!apiResult.ok) {
    suggestions.push("  - 后端 API 不可访问，检查后端服务是否启动及网络连接");
  }
  if (suggestions.length === 0) {
    suggestions.push("  - 请查看容器日志获取更多错误信息");
    suggestions.push("  - 检查 Vite 配置和依赖是否正确");
  }
  suggestions.forEach((s) => console.log(s));

  console.log("\n");
  printSeparator();
}

async function main() {
  const result = await checkHttpEndpoint("http://127.0.0.1:5173/");

  if (result.ok) {
    console.log(`Health check passed: HTTP ${result.status}, ${result.body.length} bytes`);
    process.exit(0);
  } else {
    await printDiagnosis();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Health check script error:", err);
  process.exit(1);
});
