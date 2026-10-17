# Deployment & Multi-Network Guide

This guide explains how to take Afterglow beyond a local Wi-Fi network so users across the internet (cellular, home Wi-Fi, different cities) can join the same watch party.

---

## 1. Why Pure Vercel Serverless Functions Don't Support WebSockets

| Platform | WebSocket Support | In-Memory State Retention | Verdict for Watch Party |
|---|---|---|---|
| **Vercel Serverless** | ❌ Disconnects after ~10–15s | ❌ Stateless (resets between HTTP requests) | **Frontend only** (cannot host Socket.IO server) |
| **Render.com** (Free) | ✅ Fully supported | ✅ Persistent Node.js process | **Recommended** (Fullstack in 1 click) |
| **Railway / Fly.io** | ✅ Fully supported | ✅ Persistent container/VM | **Excellent alternative** |
| **Cloudflare Tunnel / ngrok** | ✅ Fully supported | ✅ Connects to local machine | **Best for instant testing right now** |

> **Senior Engineer Note**: Socket.IO maintains long-lived TCP/WebSocket connections and stateful in-memory room data (`members`, `playback` clock, `reactions`, `polls`, `queue`). Vercel Serverless functions freeze when requests finish and scale across independent AWS Lambda containers that do not share memory.

---

## 2. Option A: 1-Click Free Cloud Deployment on Render (Recommended)

Deploying to Render takes 2 minutes and gives you a free `https://<your-app>.onrender.com` domain with automatic HTTPS and WebSocket support.

1. Go to [render.com](https://render.com) and sign in with GitHub.
2. Click **New +** -> **Blueprint**.
3. Select your repository: `tezz-e/watchparty`.
4. Render will read the included [`render.yaml`](../render.yaml) blueprint:
   - Build Command: `npm install && npm run build`
   - Start Command: `npm run server`
5. Click **Apply**.
6. When the deployment finishes, open your Render URL (e.g., `https://afterglow-watchparty.onrender.com`).
   - Anyone anywhere in the world on any network (4G/5G, Wi-Fi) can open the link.
   - When you click **INVITE**, it automatically copies the public URL with your room code.

---

## 3. Option B: Vercel Frontend + Render Backend (Split Architecture)

If you specifically want your frontend hosted on `https://<your-project>.vercel.app`:

1. **Deploy the Backend to Render**:
   - Follow Option A above. Copy your Render backend URL: e.g. `https://afterglow-backend.onrender.com`.
2. **Deploy the Frontend to Vercel**:
   - Go to [vercel.com](https://vercel.com) and click **Add New** -> **Project**.
   - Select `tezz-e/watchparty`.
   - The included [`vercel.json`](../vercel.json) handles Vite build output (`dist`) and SPA rewrites automatically.
   - Under **Environment Variables**, add:
     - `VITE_SOCKET_URL` = `https://afterglow-backend.onrender.com`
   - Click **Deploy**.
3. Now your friends can visit your Vercel URL, and it connects seamlessly over secure WebSockets (`WSS`) to your backend.

---

## 4. Option C: Test Across Networks Right Now (Instant 10-Second Tunnel)

If you want to test right now with a friend on their phone or cellular network without waiting for cloud deployment:

In a terminal, run:

```bash
npx localtunnel --port 3001
```

Or using Cloudflare's free quick tunnel:

```bash
cloudflared tunnel --url http://localhost:3001
```

You will get a public URL like `https://funny-dog-42.loca.lt` or `https://xyz.trycloudflare.com`. Open that link on any phone or send it to a friend anywhere in the world!
