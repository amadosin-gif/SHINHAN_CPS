# Figma Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude가 자연어 명령 하나로 Figma 파일과 HTML 파일을 동시에 자동 수정하는 로컬 브릿지 시스템 구축.

**Architecture:** `server.js`가 MCP(stdio)와 WebSocket(port 7777) 두 역할을 동시에 수행한다. Claude Code가 MCP 서버로 `server.js`를 실행하면 WebSocket 포트도 함께 열린다. Figma 플러그인이 WebSocket으로 서버에 연결되고, Claude의 툴 호출이 서버를 거쳐 플러그인으로 전달되어 Figma Plugin API를 통해 문서를 수정한다.

**Tech Stack:** Node.js 24, `@modelcontextprotocol/sdk`, `ws`, `uuid`, `cheerio`

---

## 파일 구조

```
shopping-ux/
├── figma-bridge/
│   ├── package.json          ← 의존성 (ws, uuid, @modelcontextprotocol/sdk, cheerio)
│   ├── server.js             ← MCP 서버 + WebSocket 서버 (핵심)
│   ├── colors.js             ← 자연어 색상 → HEX 변환
│   ├── html-updater.js       ← HTML 파일 수정 로직
│   ├── start.bat             ← 초기 테스트용 실행 파일
│   └── plugin/
│       ├── manifest.json     ← Figma 플러그인 메타데이터
│       ├── code.js           ← 플러그인 메인 로직 (Figma API)
│       └── ui.html           ← 플러그인 패널 (연결 상태)
└── .claude/
    └── settings.local.json   ← MCP 서버 등록 (기존 파일 수정)
```

---

## Task 1: 프로젝트 초기화

**Files:**
- Create: `figma-bridge/package.json`
- Create: `figma-bridge/start.bat`

- [ ] **Step 1: package.json 생성**

`figma-bridge/package.json`:
```json
{
  "name": "figma-bridge",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.10.2",
    "ws": "^8.18.1",
    "uuid": "^11.1.0",
    "cheerio": "^1.0.0"
  }
}
```

- [ ] **Step 2: 의존성 설치**

`figma-bridge/` 디렉터리에서 실행:
```bash
cd figma-bridge && npm install
```
예상 출력: `added XX packages`

- [ ] **Step 3: start.bat 생성**

`figma-bridge/start.bat`:
```bat
@echo off
echo Figma Bridge 서버 시작 중...
node "%~dp0server.js" --standalone
pause
```

- [ ] **Step 4: 커밋**
```bash
git add figma-bridge/package.json figma-bridge/package-lock.json figma-bridge/start.bat
git commit -m "feat: figma-bridge 프로젝트 초기화"
```

---

## Task 2: 색상 변환 모듈

**Files:**
- Create: `figma-bridge/colors.js`

- [ ] **Step 1: colors.js 생성**

`figma-bridge/colors.js`:
```javascript
const COLOR_MAP = {
  '빨간색': '#E30613', '빨강': '#E30613', 'red': '#E30613',
  '파란색': '#1B4FBF', '파랑': '#1B4FBF', 'blue': '#1B4FBF',
  '네이비': '#001C5C', '남색': '#001C5C', 'navy': '#001C5C',
  '초록색': '#03C75A', '초록': '#03C75A', 'green': '#03C75A',
  '흰색': '#FFFFFF', '화이트': '#FFFFFF', 'white': '#FFFFFF',
  '검정색': '#111827', '검정': '#111827', 'black': '#111827',
  '회색': '#6B7280', 'gray': '#6B7280', 'grey': '#6B7280',
  '주황색': '#FF6000', '주황': '#FF6000', 'orange': '#FF6000',
  '신한레드': '#E30613', '신한네이비': '#001C5C', '신한블루': '#1B4FBF',
};

/** HEX 또는 자연어 색상을 { r, g, b } (0~1 범위)로 변환 */
export function parseColor(input) {
  const lower = input.toLowerCase().trim();
  const hex = COLOR_MAP[lower] ?? (lower.startsWith('#') ? lower : null);
  if (!hex) throw new Error(`알 수 없는 색상: "${input}"`);

  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return { r, g, b };
}
```

- [ ] **Step 2: 동작 확인**
```bash
node --input-type=module <<'EOF'
import { parseColor } from './figma-bridge/colors.js';
console.log(parseColor('빨간색'));   // { r: 0.89, g: 0.024, b: 0.075 }
console.log(parseColor('#E30613')); // 동일
console.log(parseColor('navy'));    // { r: 0, g: 0.11, b: 0.36 }
EOF
```

- [ ] **Step 3: 커밋**
```bash
git add figma-bridge/colors.js
git commit -m "feat: 자연어 색상 → HEX 변환 모듈"
```

---

## Task 3: HTML 수정 모듈

**Files:**
- Create: `figma-bridge/html-updater.js`

- [ ] **Step 1: html-updater.js 생성**

`figma-bridge/html-updater.js`:
```javascript
import { load } from 'cheerio';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const HTML_PATH = resolve(process.cwd(), '../mockups/shopping-benefit-popup.html');

/**
 * HTML 파일 수정
 * @param {'css'|'text'|'attr'} type
 * @param {string} selector  - CSS 셀렉터 (예: '.guide-banner', '#mainTitle')
 * @param {string} property  - CSS 속성명 또는 'text' 또는 속성명
 * @param {string} value     - 변경할 값
 */
export function updateHtml({ type, selector, property, value }) {
  const html = readFileSync(HTML_PATH, 'utf-8');
  const $ = load(html, { decodeEntities: false });

  if (type === 'text') {
    $(selector).first().text(value);
  } else if (type === 'css') {
    const el = $(selector).first();
    // 인라인 style 속성 수정
    let style = el.attr('style') ?? '';
    const re = new RegExp(`${property}\\s*:[^;]+;?`, 'i');
    if (re.test(style)) {
      style = style.replace(re, `${property}: ${value};`);
    } else {
      style += ` ${property}: ${value};`;
    }
    el.attr('style', style.trim());
  } else if (type === 'attr') {
    $(selector).first().attr(property, value);
  } else {
    throw new Error(`알 수 없는 type: ${type}`);
  }

  writeFileSync(HTML_PATH, $.html(), 'utf-8');
  return { success: true };
}
```

- [ ] **Step 2: 동작 확인**
```bash
node --input-type=module <<'EOF'
import { updateHtml } from './figma-bridge/html-updater.js';
// 가이드 배너 배경색 테스트 변경
updateHtml({ type: 'css', selector: '.guide-banner', property: 'background', value: 'red' });
console.log('HTML 수정 완료');
// 브라우저에서 shopping-benefit-popup.html 열어서 배너가 빨간색인지 확인
EOF
```

- [ ] **Step 3: 원래대로 복구**
```bash
node --input-type=module <<'EOF'
import { updateHtml } from './figma-bridge/html-updater.js';
updateHtml({ type: 'css', selector: '.guide-banner', property: 'background', value: 'linear-gradient(135deg, var(--sh-navy) 0%, var(--sh-blue) 100%)' });
console.log('복구 완료');
EOF
```

- [ ] **Step 4: 커밋**
```bash
git add figma-bridge/html-updater.js
git commit -m "feat: HTML 파일 수정 모듈 (cheerio)"
```

---

## Task 4: MCP + WebSocket 서버

**Files:**
- Create: `figma-bridge/server.js`

- [ ] **Step 1: server.js 생성**

`figma-bridge/server.js`:
```javascript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { parseColor } from './colors.js';
import { updateHtml } from './html-updater.js';

// ── WebSocket 서버 (Figma 플러그인과 통신) ──────────────────
const wss = new WebSocketServer({ port: 7777 });
let pluginSocket = null;
const pending = new Map(); // id → { resolve, reject }

wss.on('connection', (ws) => {
  pluginSocket = ws;
  console.error('[Bridge] Figma 플러그인 연결됨');

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    const handler = pending.get(msg.id);
    if (handler) {
      pending.delete(msg.id);
      if (msg.success) handler.resolve(msg.data ?? {});
      else handler.reject(new Error(msg.error ?? '플러그인 오류'));
    }
  });

  ws.on('close', () => {
    pluginSocket = null;
    console.error('[Bridge] Figma 플러그인 연결 끊김');
  });
});

/** 플러그인에 명령을 보내고 응답을 기다린다 (최대 10초) */
function sendToPlugin(action, payload) {
  return new Promise((resolve, reject) => {
    if (!pluginSocket || pluginSocket.readyState !== WebSocket.OPEN) {
      return reject(new Error('Figma 플러그인이 연결되어 있지 않습니다. 플러그인을 실행해 주세요.'));
    }
    const id = randomUUID();
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('플러그인 응답 시간 초과 (10초)'));
    }, 10000);
    pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject:  (e) => { clearTimeout(timer); reject(e); },
    });
    pluginSocket.send(JSON.stringify({ id, action, payload }));
  });
}

// ── MCP 서버 ──────────────────────────────────────────────
const server = new Server(
  { name: 'figma-bridge', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// 툴 목록
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'figma_find_node',
      description: '이름 또는 Figma URL로 노드를 검색합니다.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', description: '노드 이름 또는 Figma URL' } },
        required: ['query'],
      },
    },
    {
      name: 'figma_get_selection',
      description: 'Figma에서 현재 선택된 노드를 반환합니다.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'figma_update_text',
      description: '텍스트 노드의 내용을 변경합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          nodeId: { type: 'string' },
          text:   { type: 'string' },
        },
        required: ['nodeId', 'text'],
      },
    },
    {
      name: 'figma_update_fill',
      description: '노드의 배경/채우기 색상을 변경합니다. color는 HEX(#E30613) 또는 자연어(빨간색, navy).',
      inputSchema: {
        type: 'object',
        properties: {
          nodeId: { type: 'string' },
          color:  { type: 'string' },
        },
        required: ['nodeId', 'color'],
      },
    },
    {
      name: 'figma_update_size',
      description: '노드의 크기 또는 위치를 변경합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          nodeId: { type: 'string' },
          width:  { type: 'number' },
          height: { type: 'number' },
          x:      { type: 'number' },
          y:      { type: 'number' },
        },
        required: ['nodeId'],
      },
    },
    {
      name: 'figma_create_node',
      description: '새 노드를 생성하여 지정된 부모 노드 아래에 추가합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          parentId:   { type: 'string' },
          type:       { type: 'string', enum: ['TEXT', 'FRAME', 'RECTANGLE'] },
          properties: { type: 'object' },
        },
        required: ['parentId', 'type'],
      },
    },
    {
      name: 'figma_delete_node',
      description: '노드를 삭제합니다.',
      inputSchema: {
        type: 'object',
        properties: { nodeId: { type: 'string' } },
        required: ['nodeId'],
      },
    },
    {
      name: 'update_html',
      description: 'mockups/shopping-benefit-popup.html 파일을 수정합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          type:     { type: 'string', enum: ['css', 'text', 'attr'], description: '수정 방식' },
          selector: { type: 'string', description: 'CSS 셀렉터 (예: .guide-banner)' },
          property: { type: 'string', description: 'CSS 속성명 또는 attr 이름' },
          value:    { type: 'string', description: '변경할 값' },
        },
        required: ['type', 'selector', 'value'],
      },
    },
  ],
}));

// 툴 실행
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  try {
    let result;

    if (name === 'update_html') {
      result = updateHtml(args);

    } else if (name === 'figma_update_fill') {
      // 색상을 Figma가 이해하는 { r, g, b }로 변환 후 플러그인에 전달
      const color = parseColor(args.color);
      result = await sendToPlugin('UPDATE_FILL', { nodeId: args.nodeId, color });

    } else {
      // 나머지 툴은 action 이름으로 매핑
      const ACTION_MAP = {
        figma_find_node:    'FIND_NODE',
        figma_get_selection:'GET_SELECTION',
        figma_update_text:  'UPDATE_TEXT',
        figma_update_size:  'UPDATE_SIZE',
        figma_create_node:  'CREATE_NODE',
        figma_delete_node:  'DELETE_NODE',
      };
      const action = ACTION_MAP[name];
      if (!action) throw new Error(`알 수 없는 툴: ${name}`);
      result = await sendToPlugin(action, args);
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };

  } catch (err) {
    return {
      content: [{ type: 'text', text: `오류: ${err.message}` }],
      isError: true,
    };
  }
});

// ── 시작 ─────────────────────────────────────────────────
const isStandalone = process.argv.includes('--standalone');

if (isStandalone) {
  // start.bat 으로 실행 시: WebSocket만 구동, MCP 없음
  console.error('[Bridge] 대기 중... Figma 플러그인을 실행하세요. (port 7777)');
} else {
  // Claude Code MCP 서버로 실행 시: MCP + WebSocket 함께 구동
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[Bridge] MCP 서버 시작됨 (port 7777)');
}
```

- [ ] **Step 2: 서버 단독 실행 테스트 (`--standalone`)**
```bash
node figma-bridge/server.js --standalone
```
예상 출력: `[Bridge] 대기 중... Figma 플러그인을 실행하세요. (port 7777)`
Ctrl+C로 종료.

- [ ] **Step 3: 커밋**
```bash
git add figma-bridge/server.js
git commit -m "feat: MCP + WebSocket 브릿지 서버"
```

---

## Task 5: Figma 플러그인

**Files:**
- Create: `figma-bridge/plugin/manifest.json`
- Create: `figma-bridge/plugin/ui.html`
- Create: `figma-bridge/plugin/code.js`

- [ ] **Step 1: manifest.json 생성**

`figma-bridge/plugin/manifest.json`:
```json
{
  "name": "Figma Bridge",
  "id": "figma-bridge-local-001",
  "api": "1.0.0",
  "main": "code.js",
  "ui": "ui.html",
  "editorType": ["figma"]
}
```

- [ ] **Step 2: ui.html 생성**

`figma-bridge/plugin/ui.html`:
```html
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: -apple-system, sans-serif; padding: 16px; margin: 0; background: #F9FAFB; }
  .status { display: flex; align-items: center; gap: 8px; padding: 12px; border-radius: 8px; font-size: 13px; font-weight: 600; }
  .status.connected    { background: #D1FAE5; color: #065F46; }
  .status.disconnected { background: #FEE2E2; color: #991B1B; }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .connected    .dot { background: #10B981; }
  .disconnected .dot { background: #EF4444; }
  .hint { margin-top: 12px; font-size: 11px; color: #6B7280; line-height: 1.6; }
</style>
</head>
<body>
  <div class="status disconnected" id="status">
    <div class="dot"></div>
    <span id="label">서버 연결 중...</span>
  </div>
  <div class="hint">
    서버가 꺼져 있으면 <b>start.bat</b>을 먼저 실행하거나<br>
    Claude Code를 열어주세요.
  </div>
  <script>
    window.onmessage = (e) => {
      const { type } = e.data.pluginMessage;
      const el = document.getElementById('status');
      const lb = document.getElementById('label');
      if (type === 'CONNECTED') {
        el.className = 'status connected';
        lb.textContent = '서버 연결됨 (localhost:7777)';
      } else if (type === 'DISCONNECTED') {
        el.className = 'status disconnected';
        lb.textContent = '서버 연결 안 됨';
      }
    };
  </script>
</body>
</html>
```

- [ ] **Step 3: code.js 생성**

`figma-bridge/plugin/code.js`:
```javascript
figma.showUI(__html__, { width: 260, height: 140 });

let ws = null;
let reconnectTimer = null;

function connect() {
  ws = new WebSocket('ws://localhost:7777');

  ws.onopen = () => {
    figma.ui.postMessage({ type: 'CONNECTED' });
  };

  ws.onclose = () => {
    figma.ui.postMessage({ type: 'DISCONNECTED' });
    // 3초 후 재연결 시도
    reconnectTimer = setTimeout(connect, 3000);
  };

  ws.onerror = () => {
    ws.close();
  };

  ws.onmessage = async (event) => {
    const msg = JSON.parse(event.data);
    let data = {};
    let success = true;
    let error = null;

    try {
      if (msg.action === 'FIND_NODE') {
        data = findNode(msg.payload.query);

      } else if (msg.action === 'GET_SELECTION') {
        data = figma.currentPage.selection.map((n) => ({
          nodeId: n.id, name: n.name, type: n.type,
        }));

      } else if (msg.action === 'UPDATE_TEXT') {
        const node = figma.getNodeById(msg.payload.nodeId);
        if (!node || node.type !== 'TEXT') throw new Error('텍스트 노드를 찾을 수 없습니다.');
        await figma.loadFontAsync(node.fontName);
        node.characters = msg.payload.text;

      } else if (msg.action === 'UPDATE_FILL') {
        const node = figma.getNodeById(msg.payload.nodeId);
        if (!node) throw new Error('노드를 찾을 수 없습니다.');
        node.fills = [{ type: 'SOLID', color: msg.payload.color }];

      } else if (msg.action === 'UPDATE_SIZE') {
        const node = figma.getNodeById(msg.payload.nodeId);
        if (!node) throw new Error('노드를 찾을 수 없습니다.');
        const { width, height, x, y } = msg.payload;
        if (width != null || height != null) {
          node.resize(width ?? node.width, height ?? node.height);
        }
        if (x != null) node.x = x;
        if (y != null) node.y = y;

      } else if (msg.action === 'CREATE_NODE') {
        const parent = figma.getNodeById(msg.payload.parentId);
        if (!parent) throw new Error('부모 노드를 찾을 수 없습니다.');
        const props = msg.payload.properties ?? {};
        let newNode;
        if (msg.payload.type === 'TEXT') {
          newNode = figma.createText();
          await figma.loadFontAsync({ family: 'Roboto', style: 'Regular' });
          if (props.text) newNode.characters = props.text;
        } else if (msg.payload.type === 'RECTANGLE') {
          newNode = figma.createRectangle();
        } else {
          newNode = figma.createFrame();
        }
        if (props.width && props.height) newNode.resize(props.width, props.height);
        if (props.x != null) newNode.x = props.x;
        if (props.y != null) newNode.y = props.y;
        parent.appendChild(newNode);
        data = { nodeId: newNode.id };

      } else if (msg.action === 'DELETE_NODE') {
        const node = figma.getNodeById(msg.payload.nodeId);
        if (!node) throw new Error('노드를 찾을 수 없습니다.');
        node.remove();

      } else {
        throw new Error(`알 수 없는 action: ${msg.action}`);
      }

    } catch (e) {
      success = false;
      error = e.message;
    }

    ws.send(JSON.stringify({ id: msg.id, success, data, error }));
  };
}

function findNode(query) {
  // Figma URL에서 node-id 파싱
  const urlMatch = query.match(/node-id=([0-9]+-[0-9]+)/);
  if (urlMatch) {
    const nodeId = urlMatch[1].replace('-', ':');
    const node = figma.getNodeById(nodeId);
    if (!node) return [];
    return [{ nodeId: node.id, name: node.name, type: node.type }];
  }
  // 이름으로 검색
  const results = figma.currentPage.findAll((n) =>
    n.name.toLowerCase().includes(query.toLowerCase())
  );
  return results.slice(0, 10).map((n) => ({
    nodeId: n.id, name: n.name, type: n.type,
  }));
}

connect();
```

- [ ] **Step 4: 커밋**
```bash
git add figma-bridge/plugin/
git commit -m "feat: Figma 플러그인 (WebSocket 클라이언트 + Plugin API)"
```

---

## Task 6: Claude Code MCP 등록

**Files:**
- Modify: `.claude/settings.local.json`

- [ ] **Step 1: settings.local.json 수정**

기존 내용에 `mcpServers` 블록 추가:
```json
{
  "permissions": {
    "allow": [
      "mcp__figma__get_figma_data",
      "Bash(start *)"
    ]
  },
  "mcpServers": {
    "figma-bridge": {
      "command": "node",
      "args": ["figma-bridge/server.js"]
    }
  }
}
```

- [ ] **Step 2: Claude Code 재시작**

Claude Code를 완전히 종료 후 다시 열기.
`/mcp` 명령으로 `figma-bridge` 서버가 목록에 표시되는지 확인.

- [ ] **Step 3: 커밋**
```bash
git add .claude/settings.local.json
git commit -m "feat: Claude Code에 figma-bridge MCP 서버 등록"
```

---

## Task 7: Figma 플러그인 설치 및 연결 테스트

> 이 Task는 코드 작성이 없고 Figma 앱에서의 수동 작업입니다.

- [ ] **Step 1: Figma에서 플러그인 로컬 등록**

1. Figma 데스크탑 앱 실행
2. 메뉴 → **Plugins** → **Development** → **Import plugin from manifest...**
3. `C:\Users\amado\Projects\shopping-ux\figma-bridge\plugin\manifest.json` 선택
4. "Figma Bridge" 플러그인이 목록에 등록됨 확인

- [ ] **Step 2: 연결 테스트**

1. Claude Code를 연다 (MCP 서버 자동 시작)
2. 작업 중인 Figma 파일 열기
3. 메뉴 → **Plugins** → **Development** → **Figma Bridge** 실행
4. 플러그인 패널에 **🟢 서버 연결됨** 표시 확인

- [ ] **Step 3: 첫 번째 툴 테스트**

Claude에게 입력:
> "figma_get_selection 툴 써서 지금 선택된 노드 알려줘"

Figma에서 아무 노드나 클릭 후 같은 명령 재시도.
예상 응답: `[{ "nodeId": "xxx:xxx", "name": "...", "type": "..." }]`

---

## Task 8: 엔드투엔드 검증

> 전체 시스템이 의도대로 동작하는지 확인합니다.

- [ ] **Step 1: 텍스트 변경 테스트**

1. Figma에서 텍스트 노드 클릭
2. Claude에게: `"지금 선택한 노드 텍스트를 '테스트 완료'로 바꿔줘"`
3. Figma에서 텍스트 변경 확인

- [ ] **Step 2: 색상 변경 테스트**

1. Figma에서 프레임 클릭
2. Claude에게: `"지금 선택한 프레임 배경색을 신한레드로 바꿔줘"`
3. Figma에서 색상 변경 확인

- [ ] **Step 3: HTML 동시 변경 테스트**

Claude에게:
> `"가이드 배너(.guide-banner) CSS 배경색을 #E30613으로 바꿔줘"`

`mockups/shopping-benefit-popup.html` 브라우저에서 열어 변경 확인.

- [ ] **Step 4: 이름 검색 테스트**

Claude에게:
> `"'쇼핑 혜택'이라는 이름의 노드 찾아줘"`

예상 응답: 해당 노드 목록 반환

- [ ] **Step 5: URL node-id 테스트**

Figma에서 프레임 선택 후 URL 복사 → Claude에게 붙여넣기:
> `"이 URL의 노드 찾아줘: https://figma.com/design/AXOKVvR1QPK86efBOTd4Sj/...?node-id=130-324"`

예상 응답: 해당 노드 정보 반환
