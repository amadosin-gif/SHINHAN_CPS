# Figma Bridge — Design Spec
Date: 2026-04-29

## 목표
Claude에게 자연어로 요청하면 Figma 파일과 HTML 파일이 동시에 자동 수정되는 로컬 브릿지 시스템.

---

## 전체 구조

```
[Claude Code]
     │  MCP 툴 호출
     ▼
[figma-bridge/server.js]     ← start.bat 더블클릭으로 실행
     │                  │
     │ WebSocket         │ fs.writeFileSync
     ▼                  ▼
[Figma Plugin]      [HTML 파일]
     │
     │ Figma Plugin API
     ▼
 Figma 문서 반영
```

### 컴포넌트 목록

| 컴포넌트 | 위치 | 역할 |
|---|---|---|
| MCP 서버 | `figma-bridge/server.js` | Claude의 툴 호출을 받아 처리 |
| WebSocket 서버 | `figma-bridge/server.js` (동일 프로세스) | Figma 플러그인과 통신 |
| Figma 플러그인 | `figma-bridge/plugin/` | Figma Plugin API로 문서 수정 |
| start.bat | `figma-bridge/start.bat` | 서버 실행 진입점 |

---

## 파일 구조

```
shopping-ux/
└── figma-bridge/
    ├── package.json
    ├── start.bat              ← 더블클릭으로 서버 실행
    ├── server.js              ← MCP + WebSocket 서버 (단일 프로세스)
    └── plugin/
        ├── manifest.json      ← Figma 플러그인 메타데이터
        ├── code.js            ← 플러그인 메인 로직 (Figma API 호출)
        └── ui.html            ← 플러그인 패널 (연결 상태 표시)
```

---

## MCP 툴 명세

### `figma_find_node`
이름 또는 URL의 node-id로 노드를 검색한다.

- **입력:** `{ query: string }` — 노드 이름 또는 Figma URL
- **출력:** `{ nodeId: string, name: string, type: string }[]`
- **동작:** query가 Figma URL이면 node-id 파라미터를 추출. 아니면 문서 전체를 이름으로 검색.

### `figma_get_selection`
Figma에서 현재 선택된 노드를 반환한다.

- **입력:** 없음
- **출력:** `{ nodeId: string, name: string, type: string }[]`

### `figma_update_text`
텍스트 노드의 내용을 변경한다.

- **입력:** `{ nodeId: string, text: string }`
- **출력:** `{ success: boolean }`

### `figma_update_fill`
노드의 배경/채우기 색상을 변경한다.

- **입력:** `{ nodeId: string, color: string }` — color는 HEX(`#E30613`) 또는 자연어(`red`, `navy`)
- **출력:** `{ success: boolean }`

### `figma_update_size`
노드의 크기 또는 위치를 변경한다.

- **입력:** `{ nodeId: string, width?: number, height?: number, x?: number, y?: number }`
- **출력:** `{ success: boolean }`

### `figma_create_node`
새 노드를 생성하여 지정된 부모 노드 아래에 추가한다.

- **입력:** `{ parentId: string, type: 'TEXT'|'FRAME'|'RECTANGLE', properties: object }`
- **출력:** `{ nodeId: string }`

### `figma_delete_node`
노드를 삭제한다.

- **입력:** `{ nodeId: string }`
- **출력:** `{ success: boolean }`

### `update_html`
`mockups/shopping-benefit-popup.html` 파일을 수정한다.

- **입력:** `{ selector: string, property: string, value: string }` — CSS selector + 속성 + 값
- **출력:** `{ success: boolean }`

---

## 위치 지정 방법 (3가지)

### 방법 1 — Figma에서 직접 선택
Figma에서 프레임/노드 클릭 → Claude에게 "지금 선택한 거 기준으로 작업해줘"
→ `figma_get_selection` 호출로 자동 식별

### 방법 2 — Figma URL 붙여넣기
`figma.com/design/<key>/...?node-id=130-324`
→ URL에서 node-id 자동 파싱

### 방법 3 — 이름으로 검색
"1-2 배너 섹션 기준으로" → `figma_find_node({ query: "1-2. 쇼핑 혜택 > 배너" })`

---

## 통신 프로토콜

### MCP 서버 ↔ Figma 플러그인 (WebSocket)

**명령 메시지 (서버 → 플러그인):**
```json
{
  "id": "uuid",
  "action": "UPDATE_TEXT" | "UPDATE_FILL" | "UPDATE_SIZE" | "CREATE_NODE" | "DELETE_NODE" | "GET_SELECTION" | "FIND_NODE",
  "payload": { ... }
}
```

**응답 메시지 (플러그인 → 서버):**
```json
{
  "id": "uuid",
  "success": true,
  "data": { ... }
}
```

MCP 툴 호출은 플러그인 응답을 받을 때까지 최대 10초 대기 후 타임아웃.

---

## 플러그인 UI

Figma 패널에 간단한 상태창만 표시:
- 🟢 서버 연결됨 (localhost:7777)
- 🔴 서버 연결 안 됨

서버 포트: **7777** (충돌 가능성이 낮은 포트)

---

## Claude Code 설정 변경

`server.js`는 하나의 프로세스에서 두 역할을 동시에 수행:
- **MCP 프로토콜** (stdio) — Claude Code와 통신
- **WebSocket 서버** (port 7777) — Figma 플러그인과 통신

Claude Code가 MCP 서버로 등록하면 자동으로 포트 7777도 함께 열린다.

```json
// .claude/settings.local.json 에 추가
{
  "mcpServers": {
    "figma-bridge": {
      "command": "node",
      "args": ["figma-bridge/server.js"]
    }
  }
}
```

`start.bat`은 초기 테스트용 — Figma 플러그인이 서버에 잘 연결되는지 Claude Code 없이 먼저 확인할 때 사용. 정식 사용 시에는 Claude Code가 서버를 자동으로 실행한다.

---

## 사용자 흐름 (완성 후)

1. `start.bat` 더블클릭 → WebSocket 서버 실행
2. Figma 열고 플러그인 실행 → 🟢 연결됨 확인
3. Claude에게 요청
4. Figma 자동 반영 + HTML 자동 반영

---

## 범위 밖 (이번 구현에 포함하지 않음)

- 여러 HTML 파일 동시 관리
- Figma 컴포넌트 라이브러리 생성/수정
- 실행 취소(Undo) 히스토리 관리
- 플러그인 자동 재연결 (수동 재실행으로 대체)
