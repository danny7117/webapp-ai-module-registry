# test9

**Module ID**: mod-storynest-test9-018
**Category**: storynest

## Problem
|
  使用者輸入短篇故事提要，系統自動延展成 8 段落的完整故事，並提供繁中/英文雙語版本。

## Inputs (rough)
```json
|
  {
    "prompt": "string",
    "target_languages": ["zh-TW", "en"],
    "tone": "warm|funny|mystery",
    "max_tokens": 1200
  }
```

## Outputs (rough)
```json
|
  {
    "chapters": [{"title": "string", "content": "string"}],
    "bilingual": true,
    "download_url": "string"
  }
```

## Constraints
|
  單次最長 1200 tokens；生成時間 ≤ 30 秒；輸出需可下載為 .md 與 .docx。

## Flow (draft)
1) Validate inputs
2) Call AI / services
3) Store artifacts
4) Return outputs

## Error Codes (draft)
- E001_INVALID_INPUT
- E002_UPSTREAM_FAIL
- E003_TIMEOUT
