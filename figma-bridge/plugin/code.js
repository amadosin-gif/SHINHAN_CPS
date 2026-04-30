figma.showUI(__html__, { width: 260, height: 140 });

figma.ui.onmessage = async function(msg) {
  var data = {};
  var success = true;
  var error = null;

  try {
    if (msg.action === 'FIND_NODE') {
      data = findNode(msg.payload.query);

    } else if (msg.action === 'GET_SELECTION') {
      data = figma.currentPage.selection.map(function(n) {
        return { nodeId: n.id, name: n.name, type: n.type, x: n.x, y: n.y, width: n.width, height: n.height };
      });

    } else if (msg.action === 'UPDATE_TEXT') {
      var node = figma.getNodeById(msg.payload.nodeId);
      if (!node || node.type !== 'TEXT') throw new Error('텍스트 노드를 찾을 수 없습니다.');
      await figma.loadFontAsync(node.fontName);
      node.characters = msg.payload.text;

    } else if (msg.action === 'UPDATE_FILL') {
      var node = figma.getNodeById(msg.payload.nodeId);
      if (!node) throw new Error('노드를 찾을 수 없습니다.');
      if (msg.payload.color) node.fills = [{ type: 'SOLID', color: msg.payload.color }];
      if (msg.payload.strokeColor) {
        node.strokes = [{ type: 'SOLID', color: msg.payload.strokeColor }];
        node.strokeWeight = msg.payload.strokeWeight || 1;
        node.strokeAlign = 'OUTSIDE';
      }

    } else if (msg.action === 'UPDATE_SIZE') {
      var node = figma.getNodeById(msg.payload.nodeId);
      if (!node) throw new Error('노드를 찾을 수 없습니다.');
      var width = msg.payload.width;
      var height = msg.payload.height;
      var x = msg.payload.x;
      var y = msg.payload.y;
      if (width != null || height != null) {
        node.resize(
          width !== undefined && width !== null ? width : node.width,
          height !== undefined && height !== null ? height : node.height
        );
      }
      if (x != null) node.x = x;
      if (y != null) node.y = y;
      if (msg.payload.cornerRadius != null) node.cornerRadius = msg.payload.cornerRadius;

    } else if (msg.action === 'CREATE_NODE') {
      var parent = figma.getNodeById(msg.payload.parentId);
      if (!parent) throw new Error('부모 노드를 찾을 수 없습니다.');
      var props = msg.payload.properties !== undefined && msg.payload.properties !== null ? msg.payload.properties : {};
      var newNode;
      if (msg.payload.type === 'TEXT') {
        newNode = figma.createText();
        await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
        if (props.fontSize) newNode.fontSize = props.fontSize;
        if (props.color) newNode.fills = [{ type: 'SOLID', color: props.color }];
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
      var node = figma.getNodeById(msg.payload.nodeId);
      if (!node) throw new Error('노드를 찾을 수 없습니다.');
      node.remove();

    } else {
      throw new Error('알 수 없는 action: ' + msg.action);
    }

  } catch (e) {
    success = false;
    error = e.message;
  }

  figma.ui.postMessage({ type: 'RESULT', id: msg.id, success: success, data: data, error: error });
};

function findNode(query) {
  var urlMatch = query.match(/node-id=([0-9]+-[0-9]+)/);
  if (urlMatch) {
    var nodeId = urlMatch[1].replace('-', ':');
    var node = figma.getNodeById(nodeId);
    if (!node) return [];
    return [{ nodeId: node.id, name: node.name, type: node.type }];
  }
  var results = figma.currentPage.findAll(function(n) {
    return n.name.toLowerCase().includes(query.toLowerCase());
  });
  return results.slice(0, 10).map(function(n) {
    return { nodeId: n.id, name: n.name, type: n.type, x: n.x, y: n.y, width: n.width, height: n.height };
  });
}
