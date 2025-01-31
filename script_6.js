/*********************************************************
 *  GLOBAL DATA
 *********************************************************/
let boxIdCounter = 1;
let boxes = [];        // All operation boxes
let connections = [];  // { fromBoxId, toBoxId, toInputIndex }

// For drawing a new line from an output handle
let activeConnection = null; // { fromBoxId, startX, startY }

/*********************************************************
 *  SIDEBAR CREATION
 *********************************************************/
function createCollapsibleItem(name) {
  const li = document.createElement('li');
  li.classList.add('collapsible');

  const span = document.createElement('span');
  span.textContent = name;
  li.appendChild(span);

  const nestedUl = document.createElement('ul');
  nestedUl.classList.add('nested');
  li.appendChild(nestedUl);

  span.addEventListener('click', (e) => {
    e.stopPropagation();
    li.classList.toggle('active');
  });

  return [li, nestedUl];
}

function renderOpcuaStructure(parentUl, data) {
  for (const [name, nodeData] of Object.entries(data)) {
    const [li, nestedUl] = createCollapsibleItem(name);

    // Render tags
    const tags = nodeData["_tags"] || {};
    for (const [tagName, nodeId] of Object.entries(tags)) {
      const tagLi = document.createElement('li');
      const tagSpan = document.createElement('span');
      tagSpan.textContent = tagName;
      tagSpan.style.cursor = 'grab';
      tagSpan.draggable = true;

      tagSpan.addEventListener('dragstart', (ev) => {
        ev.dataTransfer.setData('text/plain', JSON.stringify({
          type: 'tag',
          name: tagName,
          nodeId: nodeId
        }));
      });

      tagLi.appendChild(tagSpan);
      nestedUl.appendChild(tagLi);
    }

    // Sub-groups
    const groups = nodeData["_groups"] || {};
    renderOpcuaStructure(nestedUl, groups);

    parentUl.appendChild(li);
  }
}

async function fetchOpcuaStructure() {
  try {
    const response = await fetch('/api/get-opcua-structure');
    if (!response.ok) {
      console.error("Failed to fetch OPC-UA structure");
      return {};
    }
    return await response.json();
  } catch (err) {
    console.error("Error fetching structure:", err);
    return {};
  }
}

function renderLogicalOperations(parentUl) {
  const [li, nestedUl] = createCollapsibleItem("Logical Operations");
  const ops = ['AND', 'OR', 'NOT', 'GreaterThan', 'LessThan'];

  ops.forEach(op => {
    const opLi = document.createElement('li');
    opLi.classList.add('draggable');
    opLi.textContent = op;
    opLi.dataset.type = 'logicalOperation';
    opLi.dataset.value = op;
    opLi.draggable = true;

    opLi.addEventListener('dragstart', (ev) => {
      ev.dataTransfer.setData('text/plain', JSON.stringify({
        type: 'logicalOperation',
        value: op
      }));
    });

    nestedUl.appendChild(opLi);
  });

  parentUl.appendChild(li);
}

function renderMathOperations(parentUl) {
  const [li, nestedUl] = createCollapsibleItem("Mathematical Operations");
  const ops = ['ADD', 'SUBTRACT', 'MULTIPLY', 'DIVIDE'];

  ops.forEach(op => {
    const opLi = document.createElement('li');
    opLi.classList.add('draggable');
    opLi.textContent = op;
    opLi.dataset.type = 'operation';
    opLi.dataset.value = op;
    opLi.draggable = true;

    opLi.addEventListener('dragstart', (ev) => {
      ev.dataTransfer.setData('text/plain', JSON.stringify({
        type: 'operation',
        value: op
      }));
    });

    nestedUl.appendChild(opLi);
  });

  parentUl.appendChild(li);
}

function populateSidebar(opcStructure) {
  // Logical Ops
  const logicalOpsUl = document.getElementById('logicalOperations');
  logicalOpsUl.innerHTML = '';
  renderLogicalOperations(logicalOpsUl);

  // Math Ops
  const mathOpsUl = document.getElementById('mathOperations');
  mathOpsUl.innerHTML = '';
  renderMathOperations(mathOpsUl);

  // OPC Structure
  const opcUl = document.getElementById('opc-structure');
  opcUl.innerHTML = '';
  if (Object.keys(opcStructure).length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No server connection or no structure found.';
    opcUl.appendChild(li);
  } else {
    renderOpcuaStructure(opcUl, opcStructure);
  }
}

/*********************************************************
 *  OPERATION BOX CREATION
 *********************************************************/
function createUniqueBoxId() {
  return boxIdCounter++;
}

function createOperationBox(opType, opName, x, y) {
  const boxId = createUniqueBoxId();

  // Determine input count
  let inputCount = 2;
  if (opType === 'operation') {
    // math => 8 inputs
    inputCount = 8;
  } else if (opName === 'NOT') {
    inputCount = 1;
  }

  const boxData = {
    id: boxId,
    type: opType,  // 'logicalOperation' or 'operation'
    operationName: opName,
    inputCount: inputCount,
    inputs: Array(inputCount).fill(null),
    outputValue: null,
    x: x - 100,
    y: y - 75
  };
  boxes.push(boxData);

  // Create DOM element
  const boxEl = document.createElement('div');
  boxEl.classList.add('operation-box');
  boxEl.dataset.boxId = boxId;
  boxEl.style.left = (x - 100) + 'px';
  boxEl.style.top = (y - 75) + 'px';

  // Title
  const title = document.createElement('div');
  title.classList.add('operation-name');
  title.textContent = opName;
  boxEl.appendChild(title);

  // Output display
  const outputVal = document.createElement('div');
  outputVal.classList.add('output-value');
  outputVal.textContent = "Output: ?";
  boxEl.appendChild(outputVal);

  // Inputs container
  const inputsContainer = document.createElement('div');
  inputsContainer.classList.add('inputs-container');

  for (let i = 0; i < inputCount; i++) {
    const inpEl = document.createElement('div');
    inpEl.classList.add('input');
    inpEl.textContent = '?';
    inpEl.dataset.inputIndex = i;

    // Accept drops from tags
    inpEl.addEventListener('dragover', (ev) => ev.preventDefault());
    inpEl.addEventListener('drop', (ev) => {
      ev.preventDefault();
      const dStr = ev.dataTransfer.getData('text/plain');
      if (!dStr) return;
      const droppedData = JSON.parse(dStr);
      if (droppedData.type === 'tag') {
        inpEl.textContent = droppedData.name;
        boxData.inputs[i] = {
          sourceType: 'tag',
          tagName: droppedData.name,
          nodeId: droppedData.nodeId
        };
        recalcAndDraw();
      }
    });

    inputsContainer.appendChild(inpEl);
  }
  boxEl.appendChild(inputsContainer);

  // Output handle
  const handle = document.createElement('div');
  handle.classList.add('output-handle');
  boxEl.appendChild(handle);

  // Mousedown => start drawing a line
  handle.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    const rect = boxEl.getBoundingClientRect();
    activeConnection = {
      fromBoxId: boxId,
      startX: rect.right,
      startY: rect.top + rect.height / 2
    };
  });

  // Attach to DOM
  document.querySelector('.canvas-container').appendChild(boxEl);
  return boxData;
}

/*********************************************************
 *  DRAWING LINES
 *********************************************************/
function drawAllConnections() {
  const linesCanvas = document.getElementById('linesCanvas');
  const ctx = linesCanvas.getContext('2d');

  // Clear
  ctx.clearRect(0, 0, linesCanvas.width, linesCanvas.height);

  // Make sure canvas matches container size
  resizeCanvases();

  // Draw existing connections
  connections.forEach(conn => {
    const fromBox = boxes.find(b => b.id === conn.fromBoxId);
    const toBox = boxes.find(b => b.id === conn.toBoxId);
    if (!fromBox || !toBox) return;

    const fromPt = getBoxOutputCenter(fromBox);
    const toPt = getBoxInputCenter(toBox, conn.toInputIndex);

    // Convert to canvas coords
    const cRect = linesCanvas.getBoundingClientRect();
    const startX = fromPt.x - cRect.left;
    const startY = fromPt.y - cRect.top;
    const endX = toPt.x - cRect.left;
    const endY = toPt.y - cRect.top;

    ctx.beginPath();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    // Bezier for a bit of curve
    ctx.moveTo(startX, startY);
    ctx.bezierCurveTo(
      startX + 50, startY,
      endX - 50, endY,
      endX, endY
    );
    ctx.stroke();
  });

  // If we're dragging a new connection line
  if (activeConnection) {
    ctx.beginPath();
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;

    const cRect = linesCanvas.getBoundingClientRect();
    const startX = activeConnection.startX - cRect.left;
    const startY = activeConnection.startY - cRect.top;
    const endX = (activeConnection.currentX || activeConnection.startX) - cRect.left;
    const endY = (activeConnection.currentY || activeConnection.startY) - cRect.top;

    ctx.moveTo(startX, startY);
    ctx.bezierCurveTo(
      startX + 50, startY,
      endX - 50, endY,
      endX, endY
    );
    ctx.stroke();
  }
}

function getBoxOutputCenter(box) {
  // Find the box DOM
  const boxEl = document.querySelector(`.operation-box[data-box-id='${box.id}']`);
  if (!boxEl) {
    // fallback
    return { x: box.x + 220, y: box.y + 110 };
  }
  const rect = boxEl.getBoundingClientRect();
  return {
    x: rect.right - 8,
    y: rect.top + rect.height / 2
  };
}

function getBoxInputCenter(box, inputIndex) {
  const boxEl = document.querySelector(`.operation-box[data-box-id='${box.id}']`);
  if (!boxEl) return { x: box.x, y: box.y };

  const inpEl = boxEl.querySelector(`.input[data-input-index='${inputIndex}']`);
  if (!inpEl) return { x: box.x, y: box.y };

  const rect = inpEl.getBoundingClientRect();
  return {
    x: rect.left,
    y: rect.top + rect.height / 2
  };
}

/*********************************************************
 *  EVALUATION
 *********************************************************/
function evaluateBox(box) {
  // Gather input values
  const inputValues = box.inputs.map(inp => {
    if (!inp) {
      // If null, treat as 0 (math) or false (logic)
      return (box.type === 'logicalOperation') ? false : 0;
    }
    // If input is a tag, we do the same approach:
    if (inp.sourceType === 'tag') {
      // No real reading => treat as 0 or false
      return (box.type === 'logicalOperation') ? false : 0;
    } else if (inp.sourceType === 'box') {
      // It's from another box
      const sourceBox = boxes.find(b => b.id === inp.sourceId);
      if (!sourceBox) {
        return (box.type === 'logicalOperation') ? false : 0;
      }
      return sourceBox.outputValue ?? 0;
    }
    return 0;
  });

  // Compute
  let result = null;
  if (box.type === 'logicalOperation') {
    switch (box.operationName) {
      case 'NOT':
        result = !inputValues[0];
        break;
      case 'AND':
        result = inputValues[0] && inputValues[1];
        break;
      case 'OR':
        result = inputValues[0] || inputValues[1];
        break;
      case 'GreaterThan':
        result = inputValues[0] > inputValues[1];
        break;
      case 'LessThan':
        result = inputValues[0] < inputValues[1];
        break;
      default:
        result = false;
    }
  } else {
    // math
    switch (box.operationName) {
      case 'ADD':
        result = inputValues.reduce((a, b) => a + b, 0);
        break;
      case 'SUBTRACT':
        if (inputValues.length > 0) {
          result = inputValues[0];
          for (let i = 1; i < inputValues.length; i++) {
            result -= inputValues[i];
          }
        } else {
          result = 0;
        }
        break;
      case 'MULTIPLY':
        result = 1;
        for (let val of inputValues) {
          result *= val;
        }
        break;
      case 'DIVIDE':
        if (inputValues.length > 0) {
          let numerator = inputValues[0];
          let denominator = 1;
          for (let i = 1; i < inputValues.length; i++) {
            denominator *= inputValues[i];
          }
          result = (denominator === 0) ? Infinity : (numerator / denominator);
        } else {
          result = 0;
        }
        break;
      default:
        result = 0;
    }
  }

  box.outputValue = result;
}

function recalcAllBoxes() {
  // naive pass in creation order
  for (let b of boxes) {
    evaluateBox(b);
  }

  // Update DOM
  for (let b of boxes) {
    const boxEl = document.querySelector(`.operation-box[data-box-id='${b.id}']`);
    if (boxEl) {
      const outValEl = boxEl.querySelector('.output-value');
      outValEl.textContent = "Output: " + b.outputValue;
    }
  }
}

function recalcAndDraw() {
  recalcAllBoxes();
  drawAllConnections();
}

/*********************************************************
 *  RESIZING CANVASES
 *********************************************************/
function resizeCanvases() {
  const container = document.querySelector('.canvas-container');
  const rect = container.getBoundingClientRect();
  const logicCanvas = document.getElementById('logicCanvas');
  const linesCanvas = document.getElementById('linesCanvas');

  logicCanvas.width = rect.width;
  logicCanvas.height = rect.height;
  linesCanvas.width = rect.width;
  linesCanvas.height = rect.height;
}

/*********************************************************
 *  MOUSE EVENTS
 *********************************************************/
function onMouseMove(e) {
  if (!activeConnection) return;
  activeConnection.currentX = e.clientX;
  activeConnection.currentY = e.clientY;
  drawAllConnections();
}

function onMouseUp(e) {
  if (!activeConnection) return;

  // Check if we dropped on an input
  const el = document.elementFromPoint(e.clientX, e.clientY);
  if (el && el.classList.contains('input')) {
    const toBoxEl = el.closest('.operation-box');
    if (toBoxEl) {
      const toBoxId = parseInt(toBoxEl.dataset.boxId, 10);
      const inputIndex = parseInt(el.dataset.inputIndex, 10);
      connections.push({
        fromBoxId: activeConnection.fromBoxId,
        toBoxId: toBoxId,
        toInputIndex: inputIndex
      });

      const toBox = boxes.find(b => b.id === toBoxId);
      if (toBox) {
        toBox.inputs[inputIndex] = {
          sourceType: 'box',
          sourceId: activeConnection.fromBoxId
        };
      }
      recalcAndDraw();
    }
  }

  activeConnection = null;
  drawAllConnections();
}

/*********************************************************
 *  CANVAS INIT
 *********************************************************/
function initializeCanvas() {
  const logicCanvas = document.getElementById('logicCanvas');

  resizeCanvases();
  window.addEventListener('resize', () => {
    resizeCanvases();
    recalcAndDraw();
  });

  // Drag-and-drop for operators => create box
  logicCanvas.addEventListener('dragover', (e) => e.preventDefault());
  logicCanvas.addEventListener('drop', (e) => {
    e.preventDefault();
    const dataStr = e.dataTransfer.getData('text/plain');
    if (!dataStr) return;
    const item = JSON.parse(dataStr);

    const rect = logicCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (item.type === 'logicalOperation' || item.type === 'operation') {
      createOperationBox(item.type, item.value, x, y);
      recalcAndDraw();
    }
  });

  // line drawing with window-level events
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

/*********************************************************
 *  MAIN
 *********************************************************/
window.onload = async () => {
  try {
    const structure = await fetchOpcuaStructure();
    populateSidebar(structure);
    initializeCanvas();
    recalcAndDraw();
  } catch (err) {
    console.error("Initialization error:", err);
  }
};
