---
name: 模組提案 Module Proposal
about: 依下方欄位填寫，系統會自動生成模組骨架
title: "[Module] 請輸入模組名稱"
labels: ["module:proposal"]
---

> **請務必填寫以下欄位，未填完整將不會導入**

```yaml
# ====== REQUIRED ======
category: "<one-of: content | ui | data | system>"
name: "<模組顯示名稱（分享牆用）>"
summary: "<一句話功能描述（分享牆用，將做為搜尋關鍵字）>"
problem: "<要解決的問題/痛點>"

inputs:
  - name: "..."
    type: "string"
    description: "..."
outputs:
  - name: "..."
    type: "string"
    description: "..."

constraints:
  - "例如：單次最多 300 筆"
  - "例如：輸出圖片 1024x1024"

# ====== OPTIONAL ======
tags: ["行銷", "教育", "寵物", "影音"]   # 行業/情境寫在 tags，不再做分頁
cover_image: "https://...（可選）"
notes: "其他補充（可選）"
