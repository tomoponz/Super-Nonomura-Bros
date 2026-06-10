'use strict';

// =============================================================
// Super Nonomura Bros - Original side-scrolling course
// -------------------------------------------------------------
// This is an original browser game course designed for GitHub Pages.
// Replace assets/images/player/player_icon.png later to change the hero.
// You can also select an image on the start screen while testing locally.
// =============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const hudCoins = document.getElementById('coin-count');
const hudLives = document.getElementById('life-count');
const hudTime = document.getElementById('time-count');
const startScreen = document.getElementById('start-screen');
const resultScreen = document.getElementById('result-screen');
const resultTitle = document.getElementById('result-title');
const resultMessage = document.getElementById('result-message');
const resultKicker = document.getElementById('result-kicker');
const startButton = document.getElementById('start-button');
const retryButton = document.getElementById('retry-button');
const imageInput = document.getElementById('player-image-input');

const W = canvas.width;
const H = canvas.height;
const WORLD_WIDTH = 6200;
const FLOOR_Y = 470;

const GRAVITY = 0.75;
const MAX_FALL = 18;
const MOVE_ACCEL = 0.85;
const FRICTION = 0.78;
const MAX_RUN = 7.2;
const JUMP_SPEED = -15.8;
const COYOTE_FRAMES = 7;
const JUMP_BUFFER_FRAMES = 8;

const keys = new Set();
const touch = { left: false, right: false, jump: false };

let gameStarted = false;
let gameEnded = false;
let lastTime = 0;
let cameraX = 0;
let selectedPlayerImage = null;

const fallbackStop = new Image();
fallbackStop.src = 'assets/images/player/player_stop.png';

const fallbackMove = new Image();
fallbackMove.src = 'assets/images/player/player_move.png';

const customPlayerImage = new Image();
customPlayerImage.src = 'assets/images/player/player_icon.png';
customPlayerImage.onload = () => {
    selectedPlayerImage = customPlayerImage;
};
customPlayerImage.onerror = () => {
    selectedPlayerImage = null;
};

const state = {
    coins: 0,
    lives: 3,
    time: 300,
    elapsed: 0,
    checkpointX: 80,
};

const player = {
    x: 80,
    y: 330,
    w: 58,
    h: 70,
    vx: 0,
    vy: 0,
    grounded: false,
    coyote: 0,
    jumpBuffer: 0,
    facing: 1,
    invincible: 0,
    animation: 0,
};

// A long, original course.  It borrows the genre idea of a classic platformer,
// but it is not a copy of any published level layout.
const platforms = [
    // ground islands
    { x: 0, y: FLOOR_Y, w: 760, h: 70, kind: 'ground' },
    { x: 850, y: FLOOR_Y, w: 820, h: 70, kind: 'ground' },
    { x: 1780, y: FLOOR_Y, w: 700, h: 70, kind: 'ground' },
    { x: 2580, y: FLOOR_Y, w: 920, h: 70, kind: 'ground' },
    { x: 3630, y: FLOOR_Y, w: 760, h: 70, kind: 'ground' },
    { x: 4510, y: FLOOR_Y, w: 1690, h: 70, kind: 'ground' },

    // raised blocks / pipes / stairs
    { x: 410, y: 370, w: 110, h: 26, kind: 'brick' },
    { x: 560, y: 310, w: 150, h: 26, kind: 'brick' },
    { x: 980, y: 390, w: 150, h: 26, kind: 'brick' },
    { x: 1220, y: 320, w: 170, h: 26, kind: 'brick' },
    { x: 1450, y: 260, w: 120, h: 26, kind: 'brick' },
    { x: 1900, y: 365, w: 150, h: 26, kind: 'brick' },
    { x: 2180, y: 300, w: 160, h: 26, kind: 'brick' },
    { x: 2700, y: 405, w: 110, h: 65, kind: 'pipe' },
    { x: 3000, y: 350, w: 130, h: 120, kind: 'pipe' },
    { x: 3270, y: 285, w: 180, h: 26, kind: 'brick' },
    { x: 3740, y: 385, w: 160, h: 26, kind: 'brick' },
    { x: 3980, y: 315, w: 170, h: 26, kind: 'brick' },
    { x: 4640, y: 410, w: 90, h: 60, kind: 'step' },
    { x: 4730, y: 350, w: 90, h: 120, kind: 'step' },
    { x: 4820, y: 290, w: 90, h: 180, kind: 'step' },
    { x: 5000, y: 330, w: 260, h: 26, kind: 'brick' },
    { x: 5380, y: 390, w: 90, h: 80, kind: 'step' },
    { x: 5470, y: 330, w: 90, h: 140, kind: 'step' },
    { x: 5560, y: 270, w: 90, h: 200, kind: 'step' },
];

const coins = [
    ...coinLine(450, 330, 4),
    ...coinLine(1000, 350, 5),
    ...coinArc(1260, 270, 6),
    ...coinLine(1900, 320, 4),
    ...coinLine(2200, 255, 4),
    ...coinLine(2800, 310, 5),
    ...coinArc(3330, 245, 6),
    ...coinLine(3820, 335, 4),
    ...coinLine(4040, 270, 4),
    ...coinLine(5050, 285, 5),
    ...coinArc(5580, 225, 7),
];

const enemies = [
    enemy(700, 422, 580, 740, 1.2),
    enemy(1320, 422, 980, 1560, 1.35),
    enemy(2030, 422, 1850, 2390, 1.4),
    enemy(2880, 422, 2600, 3190, 1.55),
    enemy(4150, 422, 3660, 4340, 1.45),
    enemy(5200, 282, 5000, 5260, 1.25),
];

const goal = {
    x: 5930,
    y: 190,
    w: 26,
    h: 280,
};

function coinLine(startX, y, count) {
    return Array.from({ length: count }, (_, i) => ({ x: startX + i * 46, y, r: 12, taken: false }));
}

function coinArc(startX, y, count) {
    return Array.from({ length: count }, (_, i) => ({
        x: startX + i * 44,
        y: y - Math.sin((i / Math.max(1, count - 1)) * Math.PI) * 52,
        r: 12,
        taken: false,
    }));
}

function enemy(x, y, minX, maxX, speed) {
    return { x, y, w: 46, h: 46, vx: speed, minX, maxX, alive: true, squish: 0 };
}

function resetGame() {
    state.coins = 0;
    state.lives = 3;
    state.time = 300;
    state.elapsed = 0;
    state.checkpointX = 80;
    player.x = 80;
    player.y = 330;
    player.vx = 0;
    player.vy = 0;
    player.grounded = false;
    player.coyote = 0;
    player.jumpBuffer = 0;
    player.facing = 1;
    player.invincible = 0;
    player.animation = 0;
    cameraX = 0;
    for (const coin of coins) coin.taken = false;
    for (const foe of enemies) {
        foe.alive = true;
        foe.squish = 0;
    }
    gameEnded = false;
    updateHud();
}

function updateHud() {
    hudCoins.textContent = String(state.coins);
    hudLives.textContent = String(state.lives);
    hudTime.textContent = String(Math.max(0, Math.ceil(state.time)));
}

function axisLeft() {
    return keys.has('ArrowLeft') || keys.has('KeyA') || touch.left;
}

function axisRight() {
    return keys.has('ArrowRight') || keys.has('KeyD') || touch.right;
}

function wantsJump() {
    return keys.has('ArrowUp') || keys.has('KeyW') || keys.has('Space') || touch.jump;
}

function startGame() {
    resetGame();
    gameStarted = true;
    startScreen.classList.add('hidden');
    resultScreen.classList.add('hidden');
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function endGame(title, message, isClear) {
    gameEnded = true;
    resultKicker.textContent = isClear ? 'COURSE CLEAR' : 'GAME OVER';
    resultTitle.textContent = title;
    resultMessage.textContent = message;
    resultScreen.classList.remove('hidden');
}

function gameLoop(now) {
    if (!gameStarted) return;
    const dt = Math.min(2, (now - lastTime) / (1000 / 60));
    lastTime = now;

    if (!gameEnded) {
        update(dt);
    }
    draw();

    if (!gameEnded) {
        requestAnimationFrame(gameLoop);
    }
}

function update(dt) {
    player.animation += dt;
    if (player.invincible > 0) player.invincible -= dt;

    state.elapsed += dt / 60;
    state.time = Math.max(0, 300 - state.elapsed);
    if (state.time <= 0) {
        loseLife('時間切れ。もう一度チャレンジ。');
    }

    const left = axisLeft();
    const right = axisRight();
    const jumpPressed = wantsJump();

    if (left && !right) {
        player.vx -= MOVE_ACCEL * dt;
        player.facing = -1;
    } else if (right && !left) {
        player.vx += MOVE_ACCEL * dt;
        player.facing = 1;
    } else {
        player.vx *= Math.pow(FRICTION, dt);
        if (Math.abs(player.vx) < 0.04) player.vx = 0;
    }

    player.vx = clamp(player.vx, -MAX_RUN, MAX_RUN);

    if (jumpPressed) player.jumpBuffer = JUMP_BUFFER_FRAMES;
    else if (player.jumpBuffer > 0) player.jumpBuffer -= dt;

    if (player.grounded) player.coyote = COYOTE_FRAMES;
    else if (player.coyote > 0) player.coyote -= dt;

    if (player.jumpBuffer > 0 && player.coyote > 0) {
        player.vy = JUMP_SPEED;
        player.grounded = false;
        player.coyote = 0;
        player.jumpBuffer = 0;
    }

    // Short hop when jump is released early.
    if (!jumpPressed && player.vy < -4) {
        player.vy *= 0.86;
    }

    movePlayerX(player.vx * dt);
    player.vy = Math.min(MAX_FALL, player.vy + GRAVITY * dt);
    movePlayerY(player.vy * dt);

    if (player.y > H + 120) {
        loseLife('穴に落ちました。チェックポイントから再開。');
    }

    updateEnemies(dt);
    collectCoins();
    checkEnemyHits();
    checkGoal();

    if (player.x > 3200) state.checkpointX = Math.max(state.checkpointX, 3060);
    if (player.x > 4800) state.checkpointX = Math.max(state.checkpointX, 4680);

    cameraX = clamp(player.x + player.w / 2 - W * 0.42, 0, WORLD_WIDTH - W);
    updateHud();
}

function movePlayerX(dx) {
    player.x += dx;
    player.x = clamp(player.x, 0, WORLD_WIDTH - player.w);

    for (const p of platforms) {
        if (!rectsOverlap(player, p)) continue;
        if (dx > 0) {
            player.x = p.x - player.w;
        } else if (dx < 0) {
            player.x = p.x + p.w;
        }
        player.vx = 0;
    }
}

function movePlayerY(dy) {
    player.y += dy;
    player.grounded = false;

    for (const p of platforms) {
        if (!rectsOverlap(player, p)) continue;
        if (dy > 0) {
            player.y = p.y - player.h;
            player.vy = 0;
            player.grounded = true;
        } else if (dy < 0) {
            player.y = p.y + p.h;
            player.vy = 0;
        }
    }
}

function updateEnemies(dt) {
    for (const foe of enemies) {
        if (!foe.alive) {
            foe.squish += dt;
            continue;
        }
        foe.x += foe.vx * dt;
        if (foe.x < foe.minX || foe.x + foe.w > foe.maxX) {
            foe.vx *= -1;
            foe.x = clamp(foe.x, foe.minX, foe.maxX - foe.w);
        }
    }
}

function collectCoins() {
    for (const coin of coins) {
        if (coin.taken) continue;
        const cx = coin.x;
        const cy = coin.y;
        const nearestX = clamp(cx, player.x, player.x + player.w);
        const nearestY = clamp(cy, player.y, player.y + player.h);
        const dist = Math.hypot(cx - nearestX, cy - nearestY);
        if (dist < coin.r + 3) {
            coin.taken = true;
            state.coins += 1;
        }
    }
}

function checkEnemyHits() {
    for (const foe of enemies) {
        if (!foe.alive || !rectsOverlap(player, foe)) continue;
        const playerBottom = player.y + player.h;
        const stomp = player.vy > 2 && playerBottom - foe.y < 26;
        if (stomp) {
            foe.alive = false;
            foe.squish = 0;
            player.vy = -10.5;
            state.coins += 2;
        } else if (player.invincible <= 0) {
            loseLife('敵にぶつかりました。踏めば倒せます。');
        }
    }
}

function checkGoal() {
    if (rectsOverlap(player, goal)) {
        const bonus = Math.ceil(state.time / 10);
        endGame('CLEAR!', `コイン ${state.coins} 枚 + タイムボーナス ${bonus} 点。GitHub公開用の横スクロールコース完成です。`, true);
    }
}

function loseLife(reason) {
    if (gameEnded) return;
    state.lives -= 1;
    if (state.lives <= 0) {
        endGame('GAME OVER', reason, false);
        updateHud();
        return;
    }

    player.x = state.checkpointX;
    player.y = 300;
    player.vx = 0;
    player.vy = 0;
    player.invincible = 110;
    player.grounded = false;
    cameraX = clamp(player.x - W * 0.25, 0, WORLD_WIDTH - W);
    updateHud();
}

function draw() {
    ctx.clearRect(0, 0, W, H);
    drawSky();
    ctx.save();
    ctx.translate(-cameraX, 0);
    drawBackgroundHills();
    drawPlatforms();
    drawCoins();
    drawGoal();
    drawEnemies();
    drawPlayer();
    ctx.restore();
}

function drawSky() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#70c5ff');
    sky.addColorStop(1, '#bdefff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    drawCloud(130 - cameraX * 0.15, 95, 1.0);
    drawCloud(560 - cameraX * 0.12, 70, 0.72);
    drawCloud(910 - cameraX * 0.18, 130, 0.85);
}

function drawBackgroundHills() {
    for (let x = -200; x < WORLD_WIDTH + 400; x += 520) {
        const base = FLOOR_Y;
        ctx.fillStyle = '#77c66e';
        ctx.beginPath();
        ctx.ellipse(x + 160, base + 26, 180, 115, 0, Math.PI, 0, true);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.beginPath();
        ctx.ellipse(x + 100, base - 10, 44, 22, 0, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawCloud(x, y, scale) {
    ctx.save();
    ctx.translate(wrapParallax(x, -260, W + 260), y);
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(0, 20, 25, 0, Math.PI * 2);
    ctx.arc(28, 8, 32, 0, Math.PI * 2);
    ctx.arc(62, 20, 24, 0, Math.PI * 2);
    ctx.fillRect(-6, 20, 78, 26);
    ctx.fill();
    ctx.restore();
}

function drawPlatforms() {
    for (const p of platforms) {
        if (!isVisible(p.x, p.w)) continue;
        if (p.kind === 'ground') drawGround(p);
        else if (p.kind === 'pipe') drawPipe(p);
        else if (p.kind === 'step') drawStep(p);
        else drawBrick(p);
    }
}

function drawGround(p) {
    ctx.fillStyle = '#8c5a2b';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#5aae44';
    ctx.fillRect(p.x, p.y, p.w, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    for (let x = p.x; x < p.x + p.w; x += 42) {
        ctx.fillRect(x + 8, p.y + 28, 20, 4);
    }
}

function drawBrick(p) {
    ctx.fillStyle = '#c7793a';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = '#8a431a';
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x, p.y, p.w, p.h);
    for (let x = p.x + 28; x < p.x + p.w; x += 56) {
        ctx.beginPath();
        ctx.moveTo(x, p.y);
        ctx.lineTo(x, p.y + p.h);
        ctx.stroke();
    }
}

function drawPipe(p) {
    ctx.fillStyle = '#138a42';
    ctx.fillRect(p.x, p.y + 18, p.w, p.h - 18);
    ctx.fillStyle = '#19b35a';
    ctx.fillRect(p.x - 12, p.y, p.w + 24, 24);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(p.x + 12, p.y + 24, 13, p.h - 30);
    ctx.strokeStyle = '#0b5d2a';
    ctx.lineWidth = 3;
    ctx.strokeRect(p.x - 12, p.y, p.w + 24, 24);
    ctx.strokeRect(p.x, p.y + 18, p.w, p.h - 18);
}

function drawStep(p) {
    ctx.fillStyle = '#b7652f';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = '#6e3618';
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x, p.y, p.w, p.h);
}

function drawCoins() {
    for (const coin of coins) {
        if (coin.taken || !isVisible(coin.x - coin.r, coin.r * 2)) continue;
        const shimmer = Math.sin((player.animation + coin.x * 0.04) * 0.12);
        ctx.save();
        ctx.translate(coin.x, coin.y);
        ctx.scale(0.72 + Math.abs(shimmer) * 0.28, 1);
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(0, 0, coin.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#a56d00';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillRect(-3, -8, 4, 16);
        ctx.restore();
    }
}

function drawEnemies() {
    for (const foe of enemies) {
        if (!isVisible(foe.x, foe.w) || (!foe.alive && foe.squish > 18)) continue;
        ctx.save();
        if (foe.alive) {
            ctx.fillStyle = '#7447ff';
            roundRect(ctx, foe.x, foe.y, foe.w, foe.h, 12);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(foe.x + 14, foe.y + 16, 5, 0, Math.PI * 2);
            ctx.arc(foe.x + 32, foe.y + 16, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#17172a';
            ctx.fillRect(foe.x + 12, foe.y + 16, 4, 5);
            ctx.fillRect(foe.x + 30, foe.y + 16, 4, 5);
            ctx.fillStyle = '#3b226f';
            ctx.fillRect(foe.x + 10, foe.y + 34, 28, 5);
        } else {
            ctx.fillStyle = 'rgba(116,71,255,0.55)';
            roundRect(ctx, foe.x, foe.y + 26, foe.w, 14, 8);
            ctx.fill();
        }
        ctx.restore();
    }
}

function drawGoal() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(goal.x, goal.y, goal.w, goal.h);
    ctx.fillStyle = '#073b4c';
    ctx.fillRect(goal.x + goal.w, goal.y + 18, 120, 58);
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText('GOAL', goal.x + goal.w + 25, goal.y + 56);
    ctx.fillStyle = '#333';
    ctx.fillRect(goal.x - 4, goal.y + goal.h, goal.w + 8, 8);
}

function drawPlayer() {
    if (player.invincible > 0 && Math.floor(player.invincible / 6) % 2 === 0) return;

    const moving = Math.abs(player.vx) > 0.7 && player.grounded;
    const img = selectedPlayerImage || (moving ? fallbackMove : fallbackStop);
    const bob = moving ? Math.sin(player.animation * 0.35) * 2 : 0;

    ctx.save();
    ctx.translate(player.x + player.w / 2, player.y + player.h / 2 + bob);
    if (player.facing < 0) ctx.scale(-1, 1);

    if (img && img.complete && img.naturalWidth > 0) {
        // Draw as a rounded icon so any later image works well as the hero.
        ctx.save();
        roundRect(ctx, -player.w / 2, -player.h / 2, player.w, player.h, 14);
        ctx.clip();
        ctx.drawImage(img, -player.w / 2, -player.h / 2, player.w, player.h);
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 3;
        roundRect(ctx, -player.w / 2, -player.h / 2, player.w, player.h, 14);
        ctx.stroke();
    } else {
        ctx.fillStyle = '#ef476f';
        roundRect(ctx, -player.w / 2, -player.h / 2, player.w, player.h, 14);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 22px system-ui, sans-serif';
        ctx.fillText('P', -7, 8);
    }
    ctx.restore();
}

function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function isVisible(x, w) {
    return x + w >= cameraX - 100 && x <= cameraX + W + 100;
}

function roundRect(context, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(x + w - radius, y);
    context.quadraticCurveTo(x + w, y, x + w, y + radius);
    context.lineTo(x + w, y + h - radius);
    context.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    context.lineTo(x + radius, y + h);
    context.quadraticCurveTo(x, y + h, x, y + h - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
}

function wrapParallax(value, min, max) {
    const span = max - min;
    let v = value;
    while (v < min) v += span;
    while (v > max) v -= span;
    return v;
}

window.addEventListener('keydown', (event) => {
    const playable = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'KeyA', 'KeyD', 'KeyW', 'Space'];
    if (playable.includes(event.code)) {
        event.preventDefault();
        keys.add(event.code);
    }
});

window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
});

for (const button of document.querySelectorAll('.touch-button')) {
    const key = button.dataset.key;
    const set = (value) => {
        touch[key] = value;
        button.classList.toggle('pressed', value);
    };
    button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        set(true);
    });
    button.addEventListener('pointerup', () => set(false));
    button.addEventListener('pointercancel', () => set(false));
    button.addEventListener('pointerleave', () => set(false));
}

window.addEventListener('contextmenu', (event) => {
    if (event.target.classList && event.target.classList.contains('touch-button')) {
        event.preventDefault();
    }
});

imageInput.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        const img = new Image();
        img.onload = () => {
            selectedPlayerImage = img;
        };
        img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
});

startButton.addEventListener('click', startGame);
retryButton.addEventListener('click', startGame);

// Draw the title screen background immediately.
draw();
