# 創意點子 WebApp AI｜模組自動化 × 雛形流程機制
> 本章節為智慧模組庫（webapp-ai-module-registry）的共同規範。  
> 目標：將自然語意需求在 1–2 輪對話內結構化，並以穩定且可回滾的方式自動產生雛形。

---

## 目錄
1. [虛擬化 → 雛形流程強化原則](#虛擬化--雛形流程強化原則)  
2. [模組 Manifest 規格（強制）](#模組-manifest-規格強制)  
3. [自動選模組流程（Match → Rank → Plan）](#自動選模組流程match--rank--plan)  
4. [依賴圖（DAG）與互斥規則](#依賴圖dag與互斥規則)  
5. [雛形 Gate（可用性與效能門檻）](#雛形-gate可用性與效能門檻)  
6. [Safe Deploy 六層保護鏈（對應模組）](#safe-deploy-六層保護鏈對應模組)  
7. [CI 驗證與發版策略](#ci-驗證與發版策略)  
8. [工單模板（模組新增／修改）](#工單模板模組新增修改)  
9. [UX 基線檢查清單（兒童友善＋可及性）](#ux-基線檢查清單兒童友善可及性)

---

## 虛擬化 → 雛形流程強化原則
**目標：** 使用者自然語意 → 需求卡結構化 → 自動組裝雛形（V0.1～V0.3）。

- **P0 鎖定要素**：受眾、平台（手機/桌機/PWA）、離線需求、合規（兒少/隱私/授權）、效能預算。  
- **需求卡制**：玩法、控制、UI/音效、家長模式、可及性、遙測… 卡片可獨立核准/否決。  
- **雛形分段**  
  - **V0.1**：可玩/可用（主流程通）  
  - **V0.2**：可設定（主要參數可調）  
  - **V0.3**：可分享（PWA/體積/啟動優化）  
- **低風險預設**：高對比配色 ON、幽靈影子/輔助 UI ON、遙測 OFF、零個資/無登入。  
- **效能/體積預算**：首包 ≤ **1.5MB**、冷啟 ≤ **2s**、低階機（2018）≥ **45fps**。

---

## 模組 Manifest 規格（強制）
> 每個模組必須附 **Manifest**，否則不可進入智慧模組庫與自動選用流程。

**範例 JSON**
```json
{
  "id": "M-FUN-218",
  "name": "驚喜事件引擎",
  "version": "1.2.3",
  "capabilities": ["events.trigger", "fx.overlay", "schedule"],
  "inputs": { "linesCleared": "number", "elapsedSec": "number", "seed": "number?" },
  "outputs": { "triggeredEvent": "enum<slowmo|clearRow|instantDrop|none>" },
  "dependencies": ["M-CORE-110"],
  "conflicts": ["M-FUN-999"],
  "min_platform": { "web": "1.0.0" },
  "ui_footprint": { "needsOverlayLayer": true },
  "resources": { "bundle_kb": 38, "cpu_ms": 4, "mem_mb": 6 },
  "policy": { "age": "6+", "license": "MIT", "offline_ok": true },
  "tests": [
    { "name": "trigger by lines", "input": {"linesCleared": 6, "elapsedSec": 10}, "expect": {"triggeredEvent": "slowmo"} },
    { "name": "no trigger low activity", "input": {"linesCleared": 0, "elapsedSec": 30}, "expect": {"triggeredEvent": "none"} }
  ],
  "telemetry": { "enabled": false, "redact": ["seed"] },
  "changelog": "Added rate limiter; reduced bundle size."
}
