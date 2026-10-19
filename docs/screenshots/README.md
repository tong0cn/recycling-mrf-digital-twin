# 视觉验收截图（Visual acceptance screenshots）

本目录存放 `recycling-mrf-digital-twin` 的浏览器视觉验收截图（当前为**程序化微缩沙盘**版本，2026-10-19 第三轮修改后重拍：去掉了吊顶灯带、整体提亮增艳、设备与动线重排并新增园区前场）。过程与结论见 [`../VALIDATION.md`](../VALIDATION.md)。

## 采集方式

- 被测页面：`npm run build` 后 `npm run preview -- --host 127.0.0.1 --port 5202 --strictPort`（生产构建，非 dev 服务）；`live-*.png` 两张改测 GitHub Pages 线上地址以验证部署链路
- 浏览器：Chromium（`agent-browser` 0.25.3，headless，经 CDP 控制），视口 `1440×900`（桌面）与 `390×844`（窄屏）
- 全部画面为程序化几何 + 运行时 Canvas2D 贴图的实时 WebGL 渲染；网络请求只有同源 3 条（文档、JS、CSS），页面不加载任何外部字体、贴图或 CDN 资源
- 渲染是确定性的：同一构建、同一视口重新截图与上一版**逐字节相同**
- 帧率（`1440×900`，3 秒 `requestAnimationFrame` 采样，headless Chromium + ANGLE D3D11 / RTX 4070 Laptop）：暂停 151 FPS、1 倍速运行 122 FPS；headless 的 rAF 不受 vsync 限制，这是渲染上限而非屏幕刷新率

## 文件清单

| 文件 | 视口 | 场景时刻 | 说明 |
| --- | --- | --- | --- |
| `desktop-01-initial.png` | 1440×900 | 0.0 s（暂停） | 首屏：顶栏指标、设备列表、俯视全厂（含墙外的园区前场与三个停靠位）、右侧详情/看板 |
| `desktop-02-midshift.png` | 1440×900 | 42.5 s | 运行中：两条线同时运行、两辆货车靠月台卸货、叉车搬运、料仓有料 |
| `desktop-03-shiftend.png` | 1440×900 | 100.0 s | 班末段（拖动时间轴到 100 s，走关键帧重放）：设备陆续待机，事件流停在打包/装车记录 |
| `desktop-04-device.png` | 1440×900 | 40.3 s | 选中 PET 料仓并「跟随选中设备」：近景读数（当前存量、打包阈值、预警线）、上下游、只读态控制区 |
| `desktop-05-intervention.png` | 1440×900 | 40.3 s | 开启干预模式并选中光选机 #1、把识别阈值改到 0.70：滑块可用、干预记录 1 条 |
| `desktop-06-enclosed.png` | 1440×900 | 37.8 s | 俯瞰机位下切到屋顶实体：彩钢瓦墙板、屋面压型接缝与长边厂牌；此模式下隐藏悬浮标签 |
| `narrow-01-initial.png` | 390×844 | 0.0 s（暂停） | 窄屏首屏：三块纵向堆叠，操作提示与材质图例分两行，竖屏机位已拉远、整块沙盘入画 |
| `narrow-02-panel.png` | 390×844 | 0.0 s（滚到底） | 窄屏滚到底：料仓水位、搬运任务、近 7 日进出货量与「演示数据」边界说明 |
| `live-01-deployed.png` | 1440×900 | 0.0 s（暂停） | GitHub Pages 线上首帧（`https://yuhaoxiong.github.io/recycling-mrf-digital-twin/`）：与 `desktop-01-initial.png` 逐字节相同 |
| `live-02-running.png` | 1440×900 | 约 7 s | 线上点「继续」后：验证部署环境的播放、相机与仿真时钟均正常 |

> 截图仅用于人眼核对，不参与任何自动化测试；`docs/VALIDATION.md` 记录当时观察到的问题、修复项与仍未验证的部分。
