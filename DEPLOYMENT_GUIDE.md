# DSE English Quest — 全網絡部署指南（Vercel + Railway + Supabase）

> ⚠️ **超級重要**：前端行 Vercel，後端行 Railway，數據庫用 Supabase。完全唔涉及本地！
> 所有設定都喺 Railway 同 Vercel 網頁版完成，唔需要喺本地做任何事情。

---

## 📋 預備工作：你需要有嘅嘢

1. ✅ **Supabase** 帳戶 + 已經創建好 project（同之前一样）
2. ✅ **Railway** 帳戶（連結咗 GitHub）
3. ✅ **Vercel** 帳戶（連結咗 GitHub）
4. ✅ **GitHub** 已經有代碼（commit 並 push 到 GitHub）

---

## 第一步：喺 Railway 設定環境變數（最關鍵！）

你之前喺 Railway deploy 咗 backend，但係**未設定 Supabase 環境變數**，所以 Supabase client 初始化失敗，導致所有 API 都唔 work。

### 1.1 登入 Railway → 搵到你嘅 backend project

1. 去 [railway.app](https://railway.app) → 登入
2. 搵到你之前 deploy 嘅 backend project（名稱應該係 `dse-english-quest-backend`）
3. 點擊 **Settings** 標籤

### 1.2 設定環境變數（喺 Variables 分頁）

點擊 **New Variable**，一個一個添加以下全部變數：

| Variable Name | 值（示例，請換成你嘅真實值） | 說明 |
|---|---|---|
| `SUPABASE_URL` | `https://xxxxxxxxxxxx.supabase.co` | 喺 Supabase Dashboard → Settings → API 搵到 |
| `SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | 喺 Supabase Dashboard → Settings → API 搵到「anon public」 key |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | 喺 Supabase Dashboard → Settings → API 搵到「service_role」 key（**千其唔好益人**） |
| `JWT_SECRET` | `your-super-secure-random-string-32chars` | 自己寫一個隨機字串，至少 32 個字元。可以用 [randomkeygen.com](https://randomkeygen.com) 嘅「CodeIgniter Encryption Keys」 |
| `CLIENT_URL` | `https://dse-english-questv2-2.vercel.app` | **換成你 Vercel 嘅 actual URL**（等下第二步會告訴你點搵） |
| `NODE_ENV` | `production` | 固定寫 `production` |

### 1.3 設定好之後，重啟 Railway deployment

喺 Railway 唔需要手動 restart，佢會自動 detect 到環境變數變化並重新 deploy。等 1-2 分鐘，等佢 deploy 完成。

### 1.4 確認 Railway backend URL

喺 Railway project 頁面，搵到 **Deployments** → 點擊最新嘅 deployment → 睇 **Networking** 或者 **Public Networking**，複製佢俾你嘅 URL（格式係 `https://dse-english-quest-backend.railway.app` 之類）。

**記低呢個 URL**，我哋叫佢 `<RAILWAY_BACKEND_URL>`。

---

## 第二步：喺 Vercel 設定環境變數

### 2.1 搵到你 Vercel project

1. 登入 [vercel.com](https://vercel.com)
2. 搵到你之前 deploy 嘅 `DSE-English-Questv2 2` project
3. 點擊 **Settings**

### 2.2 設定環境變數（Environment Variables 分頁）

點擊 **Add New** → **Environment Variable**，添加：

| Name | Value | Environments |
|---|---|---|
| `VITE_API_URL` | `<RAILWAY_BACKEND_URL>/api` | Production, Preview, Development |
| `VITE_BACKEND_URL` | `<RAILWAY_BACKEND_URL>` | Production, Preview, Development |

**例子**（請換成你實際嘅 Railway URL）：
```
VITE_API_URL = https://dse-english-quest-backend.railway.app/api
VITE_BACKEND_URL = https://dse-english-quest-backend.railway.app
```

### 2.3 Redeploy

設定好環境變數之後，需要重新 deploy：

1. 喺 Vercel → **Deployments** 頁面
2. 點擊最新嗰個 deployment 旁邊嘅 **⋯** 按鈕
3. 選擇 **Redeploy**

等 1-2 分鐘，deploy 完成之後，你嘅 Vercel URL 就會行得通。

### 2.4 確認 Vercel URL

喺 Vercel → **Settings** → **Domains`，複製你嘅 production URL。

---

## 第三步：更新 Railway CLIENT_URL（如果 Vercel URL 確定了）

如果第二步你得到咗確定嘅 Vercel URL（例如 `https://dse-english-questv2-2.vercel.app`），

回到 Railway → Settings → Variables，**更新** `CLIENT_URL` 為：

```
https://dse-english-questv2-2.vercel.app
```

（**唔好加 trailing slash**，唔好加 `/api`，就係純 URL）

---

## 第四步：確認 Supabase 數據庫 schema

確保 Supabase 入面有曬以下 tables。如果冇，你需要喺 Supabase SQL Editor 運行 `backend/setup-database.sql`。

```sql
-- 確認以下 tables 存在
-- profiles, characters, inventory, guest_sessions,
-- question_sets, questions, game_history, user_progress,
-- shop_items, rooms
```

搵到 `backend/setup-database.sql` 嘅內容，貼去 Supabase Dashboard → SQL Editor 運行佢。

---

## 第五步：確認 CORS 設定

你嘅 backend（Railway）需要允許你 Vercel frontend 嘅請求。

確保 Railway 環境變數 `CLIENT_URL` 設定正確（見第一步 1.2）。

**如果 Railway 已經重新 deploy 咗**，CORS 會自動支援你嘅 Vercel URL。

---

## 疑難解答

### Q1: 我點知 Railway backend 有冇 deploy 成功？
A: 喺 Railway → Deployments，睇最新嗰個 deployment 嘅狀態。如果係 ✅ Success，就係成功。如果係 ❌ Failed，點擊睇日誌。

### Q2: 我點知邊個係我嘅 Railway backend URL？
A: Railway → Project → 搵到 networking 分頁，會有一個 `https://xxx.railway.app` 嘅 URL。

### Q3: Railway backend throw error 話 "Missing Supabase environment variables"
A: 係因为你未喺 Railway 設定環境變數。跟住第一步 1.2 做好佢。

### Q4: 前端 show error "Backend not reachable"
A: 確認 Vercel 環境變數 `VITE_API_URL` 設定正確，指向你 Railway backend URL + `/api`。然後 Redeploy。

### Q5: Login/Register 行唔通
A: 確認 Railway 環境變數 `JWT_SECRET` 已經設定。JWT secret 喺 `authMiddleware` 同 `authController` 入面都用同一個值。

### Q6: CORS error
A: 確認 Railway 環境變數 `CLIENT_URL` 設定為你 Vercel 嘅 production URL（唔包括 `/api` 或 trailing slash）。然後重新 deploy Railway。

---

## ✅ 完成之後測試

1. 去你 Vercel URL（例如 `https://dse-english-questv2-2.vercel.app`）
2. 試試以 Guest 身份登入（應該自動創建 guest session）
3. 試試 Register 一個新帳戶
4. 試試 Login
5. 試試揀角色
6. 試試入 Dashboard

如果全部都 work，恭喜你！全部搞掂！

---

## 📊 架構圖

```
用戶瀏覽器
    │
    │  HTTPS (Vercel 網址)
    ▼
┌─────────────────────────────────┐
│  Vercel (Frontend)              │
│  React + Vite                   │
│  環境變數: VITE_API_URL         │
│  → 指向 Railway Backend URL     │
└──────────────┬──────────────────┘
               │ HTTPS (Railway 網址)
               ▼
┌─────────────────────────────────┐
│  Railway (Backend)              │
│  Express + Socket.io            │
│  環境變數:                       │
│  - SUPABASE_URL                 │
│  - SUPABASE_ANON_KEY            │
│  - SUPABASE_SERVICE_ROLE_KEY   │
│  - JWT_SECRET                   │
│  - CLIENT_URL (Vercel URL)     │
└──────────────┬──────────────────┘
               │ HTTPS
               ▼
┌─────────────────────────────────┐
│  Supabase (Database)            │
│  PostgreSQL + Auth              │
│  Tables: profiles, characters,  │
│  inventory, questions, etc.    │
└─────────────────────────────────┘
```
