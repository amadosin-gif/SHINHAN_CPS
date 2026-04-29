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
      const color = parseColor(args.color);
      result = await sendToPlugin('UPDATE_FILL', { nodeId: args.nodeId, color });

    } else {
      const ACTION_MAP = {
        figma_find_node:     'FIND_NODE',
        figma_get_selection: 'GET_SELECTION',
        figma_update_text:   'UPDATE_TEXT',
        figma_update_size:   'UPDATE_SIZE',
        figma_create_node:   'CREATE_NODE',
        figma_delete_node:   'DELETE_NODE',
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
  console.error('[Bridge] 대기 중... Figma 플러그인을 실행하세요. (port 7777)');
} else {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[Bridge] MCP 서버 시작됨 (port 7777)');
}
