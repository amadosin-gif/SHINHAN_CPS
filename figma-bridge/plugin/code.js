figma.showUI(__html__, { width: 260, height: 140 });

let ws = null;

function connect() {
  ws = new WebSocket('ws://localhost:7777');

  ws.onopen = () => {
    figma.ui.postMessage({ type: 'CONNECTED' });
  };

  ws.onclose = () => {
    figma.ui.postMessage({ type: 'DISCONNECTED' });
    setTimeout(connect, 3000);
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
  const urlMatch = query.match(/node-id=([0-9]+-[0-9]+)/);
  if (urlMatch) {
    const nodeId = urlMatch[1].replace('-', ':');
    const node = figma.getNodeById(nodeId);
    if (!node) return [];
    return [{ nodeId: node.id, name: node.name, type: node.type }];
  }
  const results = figma.currentPage.findAll((n) =>
    n.name.toLowerCase().includes(query.toLowerCase())
  );
  return results.slice(0, 10).map((n) => ({
    nodeId: n.id, name: n.name, type: n.type,
  }));
}

connect();
