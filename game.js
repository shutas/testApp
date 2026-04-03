(function () {
  "use strict";

  const COLS = 10;
  const ROWS = 20;
  const LOCK_DELAY_MS = 500;
  const LINES_PER_LEVEL = 10;
  const DAS_DELAY = 170;
  const DAS_REPEAT = 50;
  const MOBILE_BREAKPOINT = 600;

  let BLOCK = 28;
  let PREVIEW_BLOCK = 18;

  const SHAPES = {
    I: [[0, 0], [1, 0], [2, 0], [3, 0]],
    O: [[0, 0], [1, 0], [0, 1], [1, 1]],
    T: [[0, 0], [1, 0], [2, 0], [1, 1]],
    S: [[1, 0], [2, 0], [0, 1], [1, 1]],
    Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
    L: [[0, 0], [0, 1], [1, 1], [2, 1]],
    J: [[2, 0], [0, 1], [1, 1], [2, 1]],
  };

  const PIECE_NAMES = Object.keys(SHAPES);

  const WALL_KICKS = {
    normal: {
      "0>1": [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
      "1>0": [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
      "1>2": [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
      "2>1": [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
      "2>3": [[0,0],[1,0],[1,-1],[0,2],[1,2]],
      "3>2": [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
      "3>0": [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
      "0>3": [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    },
    I: {
      "0>1": [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
      "1>0": [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
      "1>2": [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
      "2>1": [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
      "2>3": [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
      "3>2": [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
      "3>0": [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
      "0>3": [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
    },
  };

  const LINE_SCORES = [0, 100, 300, 500, 800];

  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");

  const nextCanvas = document.getElementById("next-canvas");
  const nextCtx = nextCanvas.getContext("2d");
  const holdCanvas = document.getElementById("hold-canvas");
  const holdCtx = holdCanvas.getContext("2d");

  const nextCanvasMobile = document.getElementById("next-canvas-mobile");
  const nextCtxMobile = nextCanvasMobile.getContext("2d");
  const holdCanvasMobile = document.getElementById("hold-canvas-mobile");
  const holdCtxMobile = holdCanvasMobile.getContext("2d");

  const scoreEl = document.getElementById("score");
  const highScoreEl = document.getElementById("high-score");
  const levelEl = document.getElementById("level");
  const linesEl = document.getElementById("lines");
  const scoreDesktopEl = document.getElementById("score-desktop");
  const highScoreDesktopEl = document.getElementById("high-score-desktop");
  const levelDesktopEl = document.getElementById("level-desktop");
  const linesDesktopEl = document.getElementById("lines-desktop");

  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayScore = document.getElementById("overlay-score");
  const restartBtn = document.getElementById("restart-btn");

  let board, bag, piece, nextPiece, holdPiece, canHold;
  let score, highScore, level, totalLines;
  let dropInterval, dropTimer, lockTimer;
  let lastTime, running, gameOver;
  let keyState;

  highScore = Number(sessionStorage.getItem("tetrisHighScore")) || 0;
  highScoreEl.textContent = highScore;
  highScoreDesktopEl.textContent = highScore;

  function isMobile() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
  }

  function computeBlockSize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (isMobile()) {
      const topBarHeight = 60;
      const statsBarHeight = 40;
      const gestureHintHeight = 48;
      const holdBtnHeight = 52;
      const padding = 30;
      const availH = vh - topBarHeight - statsBarHeight - gestureHintHeight - holdBtnHeight - padding;
      const availW = vw - 16;
      BLOCK = Math.floor(Math.min(availW / COLS, availH / ROWS));
      BLOCK = Math.max(BLOCK, 12);
      PREVIEW_BLOCK = Math.max(Math.floor(BLOCK * 0.6), 10);
    } else {
      const sidebarWidth = 120;
      const gaps = 48;
      const availW = vw - sidebarWidth * 2 - gaps - 40;
      const availH = vh - 80;
      BLOCK = Math.floor(Math.min(availW / COLS, availH / ROWS));
      BLOCK = Math.min(BLOCK, 32);
      BLOCK = Math.max(BLOCK, 16);
      PREVIEW_BLOCK = 18;
    }
  }

  function sizeCanvases() {
    canvas.width = COLS * BLOCK;
    canvas.height = ROWS * BLOCK;

    const pw = PREVIEW_BLOCK * 5;
    const ph = PREVIEW_BLOCK * 3;

    nextCanvas.width = pw;
    nextCanvas.height = ph;
    holdCanvas.width = pw;
    holdCanvas.height = ph;
    nextCanvasMobile.width = pw;
    nextCanvasMobile.height = ph;
    holdCanvasMobile.width = pw;
    holdCanvasMobile.height = ph;
  }

  function handleResize() {
    computeBlockSize();
    sizeCanvases();
    if (board) render();
  }

  function createBoard() {
    return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  }

  function shuffleBag() {
    const arr = [...PIECE_NAMES];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function getNextFromBag() {
    if (bag.length === 0) bag = shuffleBag();
    return bag.pop();
  }

  function createPiece(name) {
    return {
      name,
      cells: SHAPES[name].map(([x, y]) => [x, y]),
      x: Math.floor((COLS - 4) / 2),
      y: 0,
      rotation: 0,
    };
  }

  function rotatedCells(cells, times) {
    let c = cells.map(([x, y]) => [x, y]);
    for (let t = 0; t < times; t++) {
      c = c.map(([x, y]) => [-y, x]);
    }
    const minX = Math.min(...c.map(([x]) => x));
    const minY = Math.min(...c.map(([, y]) => y));
    return c.map(([x, y]) => [x - minX, y - minY]);
  }

  function getAbsoluteCells(p) {
    const cells = rotatedCells(SHAPES[p.name], p.rotation);
    return cells.map(([cx, cy]) => [p.x + cx, p.y + cy]);
  }

  function isValid(p) {
    return getAbsoluteCells(p).every(
      ([x, y]) => x >= 0 && x < COLS && y < ROWS && (y < 0 || board[y][x] === 0)
    );
  }

  function lockPiece() {
    const cells = getAbsoluteCells(piece);
    for (const [x, y] of cells) {
      if (y < 0) {
        endGame();
        return;
      }
      board[y][x] = 1;
    }
    clearLines();
    canHold = true;
    spawnPiece();
  }

  function clearLines() {
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r].every((c) => c !== 0)) {
        board.splice(r, 1);
        board.unshift(new Array(COLS).fill(0));
        cleared++;
        r++;
      }
    }
    if (cleared > 0) {
      score += LINE_SCORES[cleared] * level;
      totalLines += cleared;
      level = Math.floor(totalLines / LINES_PER_LEVEL) + 1;
      dropInterval = getDropInterval(level);
      updateUI();
    }
  }

  function getDropInterval(lvl) {
    return Math.max(50, 800 - (lvl - 1) * 70);
  }

  function spawnPiece() {
    piece = createPiece(nextPiece);
    piece.rotation = 0;
    nextPiece = getNextFromBag();
    lockTimer = null;
    if (!isValid(piece)) {
      endGame();
    }
  }

  function endGame() {
    gameOver = true;
    running = false;
    if (score > highScore) {
      highScore = score;
      sessionStorage.setItem("tetrisHighScore", String(highScore));
      highScoreEl.textContent = highScore;
      highScoreDesktopEl.textContent = highScore;
    }
    overlayTitle.textContent = "Game Over";
    overlayScore.textContent = "Score: " + score;
    overlay.classList.remove("hidden");
  }

  function hold() {
    if (!canHold) return;
    canHold = false;
    if (holdPiece === null) {
      holdPiece = piece.name;
      spawnPiece();
    } else {
      const tmp = holdPiece;
      holdPiece = piece.name;
      piece = createPiece(tmp);
    }
    lockTimer = null;
  }

  function tryMove(dx, dy) {
    const test = { ...piece, x: piece.x + dx, y: piece.y + dy };
    if (isValid(test)) {
      piece.x = test.x;
      piece.y = test.y;
      return true;
    }
    return false;
  }

  function tryRotate(dir) {
    if (piece.name === "O") return;
    const oldRot = piece.rotation;
    const newRot = (oldRot + dir + 4) % 4;
    const kickTable = piece.name === "I" ? WALL_KICKS.I : WALL_KICKS.normal;
    const key = oldRot + ">" + newRot;
    const kicks = kickTable[key] || [[0, 0]];

    for (const [kx, ky] of kicks) {
      const test = { ...piece, rotation: newRot, x: piece.x + kx, y: piece.y - ky };
      if (isValid(test)) {
        piece.x = test.x;
        piece.y = test.y;
        piece.rotation = newRot;
        return;
      }
    }
  }

  function hardDrop() {
    let dropped = 0;
    while (tryMove(0, 1)) dropped++;
    score += dropped * 2;
    updateUI();
    lockPiece();
    dropTimer = 0;
  }

  function getGhostY() {
    let gy = piece.y;
    const cells = rotatedCells(SHAPES[piece.name], piece.rotation);
    while (true) {
      const next = gy + 1;
      const ok = cells.every(([cx, cy]) => {
        const nx = piece.x + cx;
        const ny = next + cy;
        return nx >= 0 && nx < COLS && ny < ROWS && (ny < 0 || board[ny][nx] === 0);
      });
      if (!ok) break;
      gy = next;
    }
    return gy;
  }

  function drawBlock(context, x, y, size, style) {
    context.fillStyle = style;
    context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  }

  function drawBoard() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 0.5;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        ctx.strokeRect(c * BLOCK, r * BLOCK, BLOCK, BLOCK);
      }
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c]) {
          drawBlock(ctx, c, r, BLOCK, "#fff");
        }
      }
    }
  }

  function drawGhost() {
    const gy = getGhostY();
    if (gy === piece.y) return;
    const cells = rotatedCells(SHAPES[piece.name], piece.rotation);
    for (const [cx, cy] of cells) {
      const x = piece.x + cx;
      const y = gy + cy;
      if (y >= 0) {
        ctx.strokeStyle = "#444";
        ctx.lineWidth = 1;
        ctx.strokeRect(x * BLOCK + 2, y * BLOCK + 2, BLOCK - 4, BLOCK - 4);
      }
    }
  }

  function drawPiece() {
    const cells = getAbsoluteCells(piece);
    for (const [x, y] of cells) {
      if (y >= 0) {
        drawBlock(ctx, x, y, BLOCK, "#fff");
      }
    }
  }

  function drawPreview(context, name, canvasEl) {
    context.fillStyle = "#000";
    context.fillRect(0, 0, canvasEl.width, canvasEl.height);
    if (!name) return;

    const cells = SHAPES[name];
    const maxX = Math.max(...cells.map(([x]) => x));
    const maxY = Math.max(...cells.map(([, y]) => y));
    const w = (maxX + 1) * PREVIEW_BLOCK;
    const h = (maxY + 1) * PREVIEW_BLOCK;
    const offX = (canvasEl.width - w) / 2;
    const offY = (canvasEl.height - h) / 2;

    for (const [cx, cy] of cells) {
      context.fillStyle = "#fff";
      context.fillRect(
        offX + cx * PREVIEW_BLOCK + 1,
        offY + cy * PREVIEW_BLOCK + 1,
        PREVIEW_BLOCK - 2,
        PREVIEW_BLOCK - 2
      );
    }
  }

  function updateUI() {
    scoreEl.textContent = score;
    levelEl.textContent = level;
    linesEl.textContent = totalLines;
    highScoreEl.textContent = highScore;
    scoreDesktopEl.textContent = score;
    levelDesktopEl.textContent = level;
    linesDesktopEl.textContent = totalLines;
    highScoreDesktopEl.textContent = highScore;
  }

  function render() {
    drawBoard();
    if (!gameOver && piece) {
      drawGhost();
      drawPiece();
    }
    drawPreview(nextCtx, nextPiece, nextCanvas);
    drawPreview(holdCtx, holdPiece, holdCanvas);
    drawPreview(nextCtxMobile, nextPiece, nextCanvasMobile);
    drawPreview(holdCtxMobile, holdPiece, holdCanvasMobile);
  }

  function update(dt) {
    handleDAS(dt);

    dropTimer += dt;
    if (dropTimer >= dropInterval) {
      dropTimer = 0;
      if (!tryMove(0, 1)) {
        if (lockTimer === null) {
          lockTimer = 0;
        }
      } else {
        lockTimer = null;
      }
    }

    if (lockTimer !== null) {
      lockTimer += dt;
      if (lockTimer >= LOCK_DELAY_MS) {
        lockPiece();
        lockTimer = null;
        dropTimer = 0;
      }
    }
  }

  function gameLoop(time) {
    if (!running) return;
    const dt = time - lastTime;
    lastTime = time;
    update(dt);
    render();
    requestAnimationFrame(gameLoop);
  }

  function startGame() {
    computeBlockSize();
    sizeCanvases();

    board = createBoard();
    bag = shuffleBag();
    score = 0;
    level = 1;
    totalLines = 0;
    dropInterval = getDropInterval(1);
    dropTimer = 0;
    lockTimer = null;
    holdPiece = null;
    canHold = true;
    gameOver = false;
    running = true;
    keyState = {};

    nextPiece = getNextFromBag();
    spawnPiece();
    updateUI();
    overlay.classList.add("hidden");

    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }

  function handleDAS(dt) {
    for (const dir of [-1, 1]) {
      const key = dir === -1 ? "left" : "right";
      const state = keyState[key];
      if (!state || !state.held) continue;
      state.time += dt;
      if (!state.moved) {
        if (state.time >= DAS_DELAY) {
          tryMove(dir, 0);
          state.moved = true;
          state.repeatTime = 0;
        }
      } else {
        state.repeatTime += dt;
        if (state.repeatTime >= DAS_REPEAT) {
          tryMove(dir, 0);
          state.repeatTime -= DAS_REPEAT;
        }
      }
    }

    if (keyState.down && keyState.down.held) {
      keyState.down.time += dt;
      if (keyState.down.time >= DAS_REPEAT) {
        if (tryMove(0, 1)) {
          score += 1;
          updateUI();
        }
        keyState.down.time -= DAS_REPEAT;
      }
    }
  }

  document.addEventListener("keydown", (e) => {
    if (gameOver) return;
    if (!running) return;

    switch (e.code) {
      case "ArrowLeft":
        e.preventDefault();
        if (!keyState.left || !keyState.left.held) {
          tryMove(-1, 0);
          keyState.left = { held: true, time: 0, moved: false, repeatTime: 0 };
        }
        break;
      case "ArrowRight":
        e.preventDefault();
        if (!keyState.right || !keyState.right.held) {
          tryMove(1, 0);
          keyState.right = { held: true, time: 0, moved: false, repeatTime: 0 };
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        if (!keyState.down || !keyState.down.held) {
          if (tryMove(0, 1)) {
            score += 1;
            updateUI();
          }
          keyState.down = { held: true, time: 0 };
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        tryRotate(1);
        break;
      case "KeyZ":
        tryRotate(-1);
        break;
      case "Space":
        e.preventDefault();
        hardDrop();
        break;
      case "KeyC":
      case "ShiftLeft":
      case "ShiftRight":
        hold();
        break;
    }
  });

  document.addEventListener("keyup", (e) => {
    switch (e.code) {
      case "ArrowLeft":
        if (keyState.left) keyState.left.held = false;
        break;
      case "ArrowRight":
        if (keyState.right) keyState.right.held = false;
        break;
      case "ArrowDown":
        if (keyState.down) keyState.down.held = false;
        break;
    }
  });

  /* --- Touch gesture controls --- */
  const SWIPE_THRESHOLD = 30;
  const TAP_MAX_DIST = 15;
  const TAP_MAX_TIME = 200;
  const HARD_DROP_SPEED = 0.8;
  const SOFT_DROP_DELAY = 200;
  const SOFT_DROP_INTERVAL = 80;

  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let touchId = null;
  let gestureHandled = false;
  let softDropInterval = null;
  let softDropTimeout = null;
  let horizontalMoves = 0;
  let downwardSwipeDetected = false;

  function stopSoftDrop() {
    if (softDropTimeout !== null) {
      clearTimeout(softDropTimeout);
      softDropTimeout = null;
    }
    if (softDropInterval !== null) {
      clearInterval(softDropInterval);
      softDropInterval = null;
    }
  }

  const holdBtn = document.getElementById("hold-btn");

  function isExcludedTarget(el) {
    return el === holdBtn || el === restartBtn || (overlay && overlay.contains(el));
  }

  document.addEventListener("touchstart", (e) => {
    if (gameOver || !running) return;
    if (touchId !== null) return;
    if (isExcludedTarget(e.target)) return;
    e.preventDefault();

    const touch = e.changedTouches[0];
    touchId = touch.identifier;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = performance.now();
    gestureHandled = false;
    horizontalMoves = 0;
    downwardSwipeDetected = false;
  }, { passive: false });

  document.addEventListener("touchmove", (e) => {
    if (gameOver || !running) return;
    if (touchId === null) return;
    e.preventDefault();

    let touch = null;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchId) {
        touch = e.changedTouches[i];
        break;
      }
    }
    if (!touch) return;

    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx > SWIPE_THRESHOLD && absDx > absDy * 1.2) {
      const dir = dx > 0 ? 1 : -1;
      const cellsMoved = Math.floor(absDx / SWIPE_THRESHOLD);
      const movesNeeded = cellsMoved - horizontalMoves;
      for (let i = 0; i < movesNeeded; i++) {
        tryMove(dir, 0);
      }
      horizontalMoves = cellsMoved;
      gestureHandled = true;
    }

    if (absDy > SWIPE_THRESHOLD && dy > 0 && absDy > absDx * 1.5) {
      if (!downwardSwipeDetected) {
        downwardSwipeDetected = true;
        gestureHandled = true;
        softDropTimeout = setTimeout(() => {
          softDropTimeout = null;
          if (touchId === null) return;
          softDropInterval = setInterval(() => {
            if (tryMove(0, 1)) {
              score += 1;
              updateUI();
            }
          }, SOFT_DROP_INTERVAL);
        }, SOFT_DROP_DELAY);
      }
    }
  }, { passive: false });

  document.addEventListener("touchend", (e) => {
    if (touchId === null) return;

    let touch = null;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchId) {
        touch = e.changedTouches[i];
        break;
      }
    }
    if (!touch) return;

    e.preventDefault();
    const wasSoftDropping = softDropInterval !== null;
    touchId = null;
    stopSoftDrop();

    if (gameOver || !running) return;

    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const elapsed = performance.now() - touchStartTime;

    if (!gestureHandled && dist <= TAP_MAX_DIST && elapsed <= TAP_MAX_TIME) {
      tryRotate(1);
      return;
    }

    if (dy > SWIPE_THRESHOLD && Math.abs(dx) < dy * 0.7 && !wasSoftDropping) {
      const speed = dy / elapsed;
      if (speed >= HARD_DROP_SPEED) {
        hardDrop();
      }
    }
  }, { passive: false });

  document.addEventListener("touchcancel", () => {
    touchId = null;
    stopSoftDrop();
  });

  if (holdBtn) {
    holdBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      if (!gameOver && running) hold();
    }, { passive: false });
    holdBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!gameOver && running) hold();
    });
  }

  restartBtn.addEventListener("click", startGame);

  window.addEventListener("resize", handleResize);

  startGame();
})();
