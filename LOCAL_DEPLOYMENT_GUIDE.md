# Interview Copilot - 本地部署指南

## 📋 项目概述

Interview Copilot 是一个 AI 面试助手工具，包含以下核心功能：
- **简历/JD 结构化分析**：使用 Gemini Flash + LangChain 进行结构化信息提取与分析修订
- **实时面试辅助**：使用 Gemini 3 Flash 进行流式回答生成
- **会话元数据管理**：支持填写公司名、职位名，并在历史记录中重命名会话标题
- **语音识别**：支持火山引擎 STT 和 MiniMax STT
- **文件上传**：支持 PDF、DOCX、MD、TXT 格式简历上传

## 🏗️ 项目架构

```
frai/
├── backend/                  # Python FastAPI 后端
│   ├── main.py              # 应用入口
│   ├── core/                # 核心配置（数据库、认证、加密）
│   ├── routers/             # API 路由
│   │   ├── interview.py     # 面试核心 API（分析、流式回答、STT代理）
│   │   ├── gemini.py        # Gemini 音频理解 API
│   │   ├── minimax.py       # MiniMax STT/LLM API
│   │   ├── interview_sessions.py  # 面试会话 CRUD
│   │   ├── auth.py          # 认证路由
│   │   ├── health.py        # 健康检查
│   │   ├── storage.py       # 文件存储
│   │   └── settings.py      # 设置管理
│   ├── services/            # 业务逻辑层
│   │   ├── gemini_structured_service.py # Gemini Flash 结构化提取
│   │   ├── structured_schemas.py       # Pydantic 数据模型
│   │   ├── gemini_flash_service.py     # Gemini Flash 流式回答
│   │   ├── gemini_service.py           # Gemini 音频理解
│   │   ├── minimax_service.py          # MiniMax STT/LLM
│   │   ├── volcano_stt_service.py      # 火山引擎 STT
│   │   ├── file_parser_service.py      # 文件解析（PDF/DOCX/MD/TXT）
│   │   └── interview_sessions.py       # 会话管理
│   ├── models/              # SQLAlchemy ORM 模型
│   ├── schemas/             # API 请求/响应模型
│   ├── alembic/             # 数据库迁移
│   ├── requirements.txt     # Python 依赖
│   └── logs/                # 日志目录（运行时生成）
│
├── frontend/                # React + TypeScript 前端
│   ├── src/
│   │   ├── App.tsx          # 路由配置
│   │   ├── pages/
│   │   │   ├── Index.tsx        # 首页（渲染 Workspace）
│   │   │   ├── Workspace.tsx    # 工作台（简历/JD分析 + 会话管理）
│   │   │   └── Interview.tsx    # 面试页面（实时辅助）
│   │   ├── hooks/
│   │   │   ├── useInterviewAI.ts      # 面试 AI Hook
│   │   │   ├── useSpeechRecognition.ts # 语音识别 Hook
│   │   │   └── useVolcanoSTT.ts       # 火山 STT Hook
│   │   ├── lib/
│   │   │   └── config.ts       # API 配置（动态获取 backend URL）
│   │   ├── api/
│   │   │   └── settings.ts     # 设置 API
│   │   └── components/ui/       # shadcn/ui 组件
│   ├── package.json         # Node.js 依赖
│   ├── vite.config.ts       # Vite 配置（含 API 代理）
│   └── tailwind.config.ts   # Tailwind CSS 配置
│
└── LOCAL_DEPLOYMENT_GUIDE.md  # 本文件
```

---

## 🔧 环境要求

| 工具 | 版本要求 | 说明 |
|------|---------|------|
| **Python** | >= 3.10 | 推荐 3.10 - 3.12 |
| **Node.js** | >= 18.x | 推荐 20.x |
| **pnpm** | >= 9.x | 包管理器（也可用 npm/yarn） |
| **PostgreSQL** | >= 14 | 生产数据库（开发可用 SQLite） |

---

## 🔑 API Keys（必须配置）

本项目依赖以下第三方 API，你需要自行获取 API Key：

### 必需的 API Keys

| 环境变量 | 服务 | 用途 | 获取地址 |
|---------|------|------|---------|
| `GOOGLE_API_KEY` | Google AI Studio | Gemini Flash 结构化分析（简历/JD提取 + refine） | https://aistudio.google.com/apikey |
| `GEMINI_API_KEY` | Google AI Studio | Gemini 3 Flash 流式回答 + 音频理解 | https://aistudio.google.com/apikey |

### 可选的 API Keys（按需配置）

| 环境变量 | 服务 | 用途 | 获取地址 |
|---------|------|------|---------|
| `MINIMAX_API_KEY` | MiniMax | 备用 STT + LLM | https://platform.minimaxi.com/ |
| `VOLC_APP_ID` | 火山引擎 | 语音识别（STT） | https://console.volcengine.com/ |
| `VOLC_ACCESS_TOKEN` | 火山引擎 | 语音识别认证 | 同上 |

---

## 📦 安装步骤

### Step 1: 克隆/下载项目

将整个项目文件夹下载到本地。项目根目录应包含 `backend/` 和 `frontend/` 两个子目录。

### Step 2: 配置环境变量

在 `backend/` 目录下创建 `.env` 文件：

```bash
cd backend
touch .env
```

编辑 `.env` 文件，填入你的 API Keys：

```env
# ===== 必需 =====
# Google Gemini Flash (结构化分析 + refine)
GOOGLE_API_KEY=your-google-ai-studio-key-here

# Google Gemini (面试回答生成 + 音频理解)
GEMINI_API_KEY=your-google-ai-studio-key-here

# ===== 数据库 =====
# 开发环境用 SQLite（无需额外安装）:
DATABASE_URL=sqlite+aiosqlite:///./interview_copilot.db

# 生产环境用 PostgreSQL（需先创建数据库）:
# DATABASE_URL=postgresql+asyncpg://username:password@localhost:5432/interview_copilot

# ===== 可选 =====
# MiniMax (备用 STT/LLM)
# MINIMAX_API_KEY=your-minimax-key

# 火山引擎 STT
# VOLC_APP_ID=your-volc-app-id
# VOLC_ACCESS_TOKEN=your-volc-access-token
```

> ⚠️ **重要**：`.env` 文件中的值不要带引号，不要有多余空格。
> - ✅ 正确: `GOOGLE_API_KEY=abc123`
> - ❌ 错误: `GOOGLE_API_KEY="abc123"` 或 `GOOGLE_API_KEY = abc123`

### Step 3: 安装后端依赖

```bash
cd backend

# 创建 Python 虚拟环境（推荐）
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# 或 Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt
```

**requirements.txt 包含的主要依赖：**
- `fastapi` + `uvicorn` — Web 框架
- `sqlalchemy` + `asyncpg` + `aiosqlite` — 数据库 ORM（异步）
- `alembic` — 数据库迁移
- `langchain` + `langchain-core` + `langchain-google-genai` — Gemini Flash 结构化输出
- `google-genai` — Gemini Flash 原生调用
- `pdfplumber` + `python-docx` — 文件解析
- `openai` — OpenAI 兼容 API 调用
- `websockets` — 火山引擎 STT WebSocket
- `pydantic` + `pydantic-settings` — 数据验证
- `python-jose` — JWT 认证
- `stripe` — 支付（可选）

### Step 4: 安装前端依赖

```bash
cd frontend

# 使用 pnpm（推荐）
pnpm install

# 或使用 npm
# npm install

# 或使用 yarn
# yarn install
```

> **注意**：`package.json` 中包含 `@metagptx/web-sdk` 和 `@metagptx/vite-plugin-source-locator`，这些是 Atoms 平台专用包。本地部署时需要处理（见下方"本地适配"章节）。

---

## 🔨 本地适配（重要！）

由于项目是在 Atoms 平台上开发的，部分代码依赖平台特有的包和配置。本地部署需要做以下适配：

### 4.1 移除/替换 Atoms 平台依赖

#### 前端 `vite.config.ts`

原始配置中使用了 Atoms 平台插件，本地需要移除：

```typescript
// vite.config.ts - 本地适配版本
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    // 移除 viteSourceLocator() 和 atoms()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'router-vendor': ['react-router-dom'],
        },
      },
    },
  },
});
```

#### 前端 `package.json`

移除 Atoms 平台专用依赖：

```json
// 删除以下两行:
"@metagptx/web-sdk": "latest",
"@metagptx/vite-plugin-source-locator": "latest"

// devDependencies 中删除:
"lovable-tagger": "^1.1.7"
```

#### 前端 API 调用适配

项目中使用了 `@metagptx/web-sdk` 的 `client.apiCall.invoke` 方法。你需要检查 `frontend/src/pages/Workspace.tsx` 和其他页面中的 API 调用，将其替换为标准的 `fetch` 或 `axios` 调用。

**示例替换：**

```typescript
// 原始（Atoms 平台）:
const response = await client.apiCall.invoke({
  path: '/api/v1/interview/analyze-structured',
  method: 'POST',
  body: { text, type: 'resume', language },
});

// 替换为标准 fetch:
const response = await fetch('/api/v1/interview/analyze-structured', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text, type: 'resume', language }),
});
const data = await response.json();
```

> **提示**：搜索项目中所有 `client.apiCall` 和 `import { client }` 的引用，逐一替换。

### 4.2 前端 API 基础 URL 配置

`frontend/src/lib/config.ts` 已经配置了动态 API URL 获取逻辑。本地开发时，Vite 的 proxy 配置会将 `/api` 请求代理到 `http://localhost:8000`，所以前端直接使用相对路径 `/api/...` 即可。

如果需要直接连接后端（不通过 Vite proxy），可以设置环境变量：

```bash
# frontend/.env.local
VITE_API_BASE_URL=http://localhost:8000
```

---

## 🚀 启动项目

### 启动后端

```bash
cd backend

# 激活虚拟环境
source venv/bin/activate

# 加载环境变量
export $(cat .env | xargs)
# 或在 Windows PowerShell:
# Get-Content .env | ForEach-Object { if ($_ -match '^\s*([^#][^=]+)=(.*)$') { [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim()) } }

# 启动后端服务（开发模式，自动重载）
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 或直接运行
python main.py
```

后端启动后：
- API 文档: http://localhost:8000/docs (Swagger UI)
- 健康检查: http://localhost:8000/api/v1/health

### 启动前端

```bash
cd frontend

# 开发模式
pnpm dev
# 或 npm run dev

# 生产构建
pnpm build
pnpm preview
```

前端启动后：
- 应用地址: http://localhost:3000
- Vite 会自动将 `/api` 请求代理到 `http://localhost:8000`

---

## 🗄️ 数据库

### 开发环境（SQLite）

如果 `.env` 中配置了 SQLite URL，后端启动时会自动创建数据库文件和表结构，无需额外操作。

```env
DATABASE_URL=sqlite+aiosqlite:///./interview_copilot.db
```

### 生产环境（PostgreSQL）

```bash
# 1. 安装 PostgreSQL
# Ubuntu: sudo apt install postgresql
# Mac: brew install postgresql

# 2. 创建数据库
sudo -u postgres psql
CREATE DATABASE interview_copilot;
CREATE USER myuser WITH PASSWORD 'mypassword';
GRANT ALL PRIVILEGES ON DATABASE interview_copilot TO myuser;
\q

# 3. 配置 .env
# DATABASE_URL=postgresql+asyncpg://myuser:mypassword@localhost:5432/interview_copilot

# 4. 运行数据库迁移（如果有）
cd backend
alembic upgrade head
```

---

## 📡 API 端点一览

### 面试核心 API (`/api/v1/interview`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/interview/analyze-structured` | Gemini Flash 结构化分析（简历/JD） |
| POST | `/api/v1/interview/refine-analysis` | 根据用户反馈修改分析结果 |
| POST | `/api/v1/interview/upload-resume` | 上传简历文件（PDF/DOCX/MD/TXT） |
| POST | `/api/v1/interview/generate-answer` | Gemini Flash 流式生成面试回答 |
| WS | `/api/v1/interview/ws/volcano-stt/{session_id}` | 火山引擎 STT WebSocket 代理 |

### Gemini API (`/api/v1/gemini`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/gemini/analyze-audio` | Gemini 音频理解（多模态） |

### MiniMax API (`/api/v1/minimax`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/minimax/transcribe` | MiniMax 语音转文字 |

### 会话管理 (`/api/v1/interview-sessions`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/interview-sessions/` | 获取所有面试会话 |
| POST | `/api/v1/interview-sessions/` | 创建新会话 |
| GET | `/api/v1/interview-sessions/{id}` | 获取单个会话 |
| PUT | `/api/v1/interview-sessions/{id}` | 更新会话 |
| DELETE | `/api/v1/interview-sessions/{id}` | 删除会话 |

---

## 🔍 功能使用流程

```
┌─────────────────────────────────────────────────────────┐
│                    Workspace 页面                         │
│                                                          │
│  1. 上传/粘贴简历 ──→ Gemini Flash 结构化提取 ──→ ResumeProfile │
│  2. 粘贴 JD ──────→ Gemini Flash 结构化提取 ──→ JDProfile       │
│  3. 查看分析结果 ──→ Confirm 或 Request Changes           │
│  4. Confirm ──→ 生成 concise_context                     │
│  5. Start Interview ──→ 跳转面试页面                      │
│                                                          │
├─────────────────────────────────────────────────────────┤
│                    Interview 页面                         │
│                                                          │
│  6. 开始录音 ──→ 火山STT/MiniMax STT ──→ 实时转写        │
│  7. 检测到问题 ──→ Gemini 3 Flash ──→ 流式生成回答       │
│  8. 回答显示在界面上，支持多轮对话                         │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 数据流

```
简历文本/文件 ──→ [后端] file_parser_service ──→ 纯文本
                          ↓
                  gemini_structured_service (Gemini Flash + LangChain)
                          ↓
                  ResumeProfile (Pydantic 结构化数据)
                          ↓
                  build_concise_context() ──→ 精简上下文
                          ↓
              [面试时] gemini_flash_service (Gemini 3 Flash)
                          ↓
                  流式面试回答 (SSE/Streaming)
```

---

## 🐛 常见问题排查

### 1. Gemini Flash 结构化分析返回空结果或报错

**检查 GOOGLE_API_KEY 是否正确：**
```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_GOOGLE_API_KEY" | head -5
```

**常见错误：**
- `API key not valid`：API Key 无效或过期
- `.env` 文件中 key 值带了引号或多余空格
- 环境变量没有正确加载（确认 `export $(cat .env | xargs)` 已执行）

### 2. Gemini Flash 不工作

**检查 GEMINI_API_KEY：**
```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_GEMINI_KEY" | head -5
```

**注意：** Gemini API 在中国大陆可能需要代理访问。

### 3. 数据库连接失败

- SQLite：确保 backend 目录有写入权限
- PostgreSQL：确认数据库服务运行中，用户名密码正确

### 4. 前端 API 请求 404

- 确认后端已启动在 `localhost:8000`
- 确认 Vite proxy 配置正确（`/api` → `http://localhost:8000`）
- 检查浏览器控制台网络请求

### 5. Pydantic 验证错误（Gemini Flash 返回嵌套对象）

已在 `structured_schemas.py` 中添加了 `@field_validator` 自动处理。如果仍有问题，检查后端日志：
```bash
tail -100 backend/logs/app_*.log | grep -i "error\|validation"
```

---

## 📝 技术栈总结

| 层级 | 技术 | 版本 |
|------|------|------|
| **前端框架** | React + TypeScript | React 18.x |
| **UI 库** | shadcn/ui + Radix UI | Latest |
| **样式** | Tailwind CSS | 3.x |
| **构建工具** | Vite | 5.x |
| **路由** | React Router DOM | 6.x |
| **状态管理** | TanStack React Query | 5.x |
| **后端框架** | FastAPI | >= 0.110 |
| **Python 运行时** | Python | 3.10+ |
| **ORM** | SQLAlchemy (async) | 2.x |
| **数据库** | SQLite (dev) / PostgreSQL (prod) | - |
| **AI - 结构化分析** | Gemini Flash + LangChain Google GenAI | - |
| **AI - 面试回答** | Gemini 3 Flash (google-genai) | - |
| **AI - 音频理解** | Gemini 3 Flash (multimodal) | - |
| **STT** | 火山引擎 / MiniMax | - |

---

## 🐳 Docker 部署（可选）

如果你想用 Docker 部署，可以创建以下文件：

### `docker-compose.yml`

```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    env_file:
      - ./backend/.env
    environment:
      - DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/interview_copilot
    depends_on:
      - db

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - VITE_API_BASE_URL=http://localhost:8000

  db:
    image: postgres:15
    environment:
      POSTGRES_DB: interview_copilot
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  pgdata:
```

### `backend/Dockerfile`

```dockerfile
FROM python:3.10-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### `frontend/Dockerfile`

```dockerfile
FROM node:20-slim

RUN npm install -g pnpm

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install

COPY . .

EXPOSE 3000
CMD ["pnpm", "dev", "--host", "0.0.0.0"]
```

---

## ✅ 部署检查清单

- [ ] Python 3.10+ 已安装
- [ ] Node.js 18+ 已安装
- [ ] pnpm 已安装 (`npm install -g pnpm`)
- [ ] `backend/.env` 已创建并填入 API Keys
- [ ] `GOOGLE_API_KEY` 已配置（Gemini Flash 分析必需）
- [ ] `GEMINI_API_KEY` 已配置（面试回答必需）
- [ ] `DATABASE_URL` 已配置（SQLite 或 PostgreSQL）
- [ ] 后端依赖已安装 (`pip install -r requirements.txt`)
- [ ] 前端依赖已安装 (`pnpm install`)
- [ ] 已移除/替换 Atoms 平台专用依赖（`@metagptx/*`）
- [ ] 已替换 `client.apiCall.invoke` 为标准 `fetch` 调用
- [ ] 后端启动成功 (`http://localhost:8000/docs` 可访问)
- [ ] 前端启动成功 (`http://localhost:3000` 可访问)
- [ ] 简历分析功能正常（上传简历 → 查看结构化结果）
- [ ] 面试功能正常（开始面试 → 语音识别 → AI 回答）

---

*最后更新: 2026-04-08*
