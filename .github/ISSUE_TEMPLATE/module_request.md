name: 模組新增／修改申請
description: 新增或修改智慧模組庫的模組
title: "[模組] <請填模組名稱>"
labels: ["module:request"]
body:
  - type: input
    id: capability
    attributes: { label: 1) 目的/能力（capabilities）, placeholder: "events.trigger, db.crud ..." }
    validations: { required: true }
  - type: input
    id: reqcard
    attributes: { label: 2) 需求卡對應（ID/連結） }
  - type: textarea
    id: manifest
    attributes: { label: 3) Manifest（JSON）, description: "貼上完整 JSON" }
    validations: { required: true }
  - type: textarea
    id: tests
    attributes: { label: 4) 測試向量（≥2 條，含預期輸出） }
    validations: { required: true }
  - type: textarea
    id: deps
    attributes: { label: 5) 依賴/互斥說明 }
  - type: input
    id: budget
    attributes: { label: 6) 資源預算, placeholder: "bundle_kb / cpu_ms / mem_mb" }
  - type: input
    id: policy
    attributes: { label: 7) 合規/授權, placeholder: "age, license, offline_ok" }
  - type: textarea
    id: ui
    attributes: { label: 8) UI 足跡（需要容器/圖層） }
  - type: textarea
    id: risk
    attributes: { label: 9) 風險與回退策略 }
  - type: textarea
    id: publish
    attributes: { label: 10) 發布建議（入庫標籤等） }
