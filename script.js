'use strict';

// ==========================================
// 1. YouTube API と BGM制御のセットアップ
//    ここは「最初のコードで動いていた方式」を残しています。
// ==========================================
let player;
let isGameOver = false;
let loopCheckInterval;
let ytReady = false;

const VIDEO_ID = 'vHbkhn2AI8g';

function onYouTubeIframeAPIReady() {
    player = new YT.Player('youtube-player', {
        height: '0',
        width: '0',
        videoId: VIDEO_ID,
        playerVars: {
            'playsinline': 1,
            'controls': 0,
            'disablekb': 1
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady() {
    ytReady = true;
    console.log('BGMの準備が完了しました');
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        startLoopCheck();
    } else {
        clearInterval(loopCheckInterval);
    }
}

function startLoopCheck() {
    clearInterval(loopCheckInterval);
    loopCheckInterval = setInterval(() => {
        if (!player || typeof player.getCurrentTime !== 'function') return;

        const currentTime = player.getCurrentTime();

        // 通常時は4秒〜84秒をループ。元コードと同じ seekTo 方式です。
        if (!isGameOver && currentTime >= 84) {
            player.seekTo(4, true);
        }
    }, 100);
}

function startBgm() {
    if (!ytReady || !player || typeof player.seekTo !== 'function') return;
    isGameOver = false;
    player.seekTo(4, true);
    player.playVideo();
}

function playGameOverBgm() {
    if (!ytReady || !player || typeof player.seekTo !== 'function') return;
    isGameOver = true;
    player.seekTo(84, true);
    player.playVideo();
}

function stopBgm() {
    if (!ytReady || !player || typeof player.pauseVideo !== 'function') return;
    player.pauseVideo();
}

// ==========================================
// 2. ゲームの描画・キャラクター制御セットアップ
// ==========================================
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

const W = 960;
const H = 540;
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
let dpr = 1;
let selectedPlayerImage = null;
let selectedObjectUrl = null;

const imgStop = new Image();
imgStop.src = 'assets/images/player/player_stop.png';

const imgMove = new Image();
imgMove.src = 'assets/images/player/player_move.png';

const imgPlayerIcon = new Image();
imgPlayerIcon.onload = () => {
    selectedPlayerImage = imgPlayerIcon;
};
imgPlayerIcon.onerror = () => {
    selectedPlayerImage = null;
};
imgPlayerIcon.src = 'assets/images/player/player_icon.png';

const imgEnemy = new Image();
imgEnemy.src = 'assets/images/player/enemy.png';

const state = {
    coins: 0,
    lives: 3,
    time: 300,
    elapsed: 0,
    checkpointX: 80,
};

const hero = {
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

// 1-1風ではなく、GitHub公開しやすいオリジナルの長い横スクロールコースです。
const platforms = [
    { x: 0, y: FLOOR_Y, w: 760, h: 70, kind: 'ground' },
    { x: 850, y: FLOOR_Y, w: 820, h: 70, kind: 'ground' },
    { x: 1780, y: FLOOR_Y, w: 700, h: 70, kind: 'ground' },
    { x: 2580, y: FLOOR_Y, w: 920, h: 70, kind: 'ground' },
    { x: 3630, y: FLOOR_Y, w: 760, h: 70, kind: 'ground' },
    { x: 4510, y: FLOOR_Y, w: 1690, h: 70, kind: 'ground' },

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

const goal = { x: 5930, y: 190, w: 26, h: 280 };

function coinLine(startX, y, count) {
    return Array.from({ length: count }, (_, i) => ({
        x: startX + i * 46,
        y,
        r: 12,
        taken: false,
    }));
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
    return { startX: x, x, y, w: 46, h: 46, vx: speed, startVx: speed, minX, maxX, alive: true, squish: 0 };
}

function resizeCanvasForHighDpi() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const targetW = Math.round(W * dpr);
    const targetH = Math.round(H * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
    }

    canvas.style.width = '100%';
    canvas.style.height = '100%';
    prepareCanvasContext();
}

function prepareCanvasContext() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
}

function resetGame() {
    state.coins = 0;
    state.lives = 3;
    state.time = 300;
    state.elapsed = 0;
    state.checkpointX = 80;

    respawnHero(80, 330);
    cameraX = 0;

    for (const coin of coins) coin.taken = false;
    for (const foe of enemies) {
        foe.x = foe.startX;
        foe.vx = foe.startVx;
        foe.alive = true;
        foe.squish = 0;
    }

    gameEnded = false;
    updateHud();
}

function respawnHero(x, y) {
    hero.x = x;
    hero.y = y;
    hero.vx = 0;
    hero.vy = 0;
    hero.grounded = false;
    hero.coyote = 0;
    hero.jumpBuffer = 0;
    hero.facing = 1;
    hero.invincible = 90;
    hero.animation = 0;
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
    resizeCanvasForHighDpi();
    resetGame();
    gameStarted = true;
    startScreen.classList.add('hidden');
    resultScreen.classList.add('hidden');
    lastTime = performance.now();
    startBgm();
    requestAnimationFrame(gameLoop);
}

function endGame(title, message, isClear) {
    gameEnded = true;
    resultKicker.textContent = isClear ? 'COURSE CLEAR' : 'GAME OVER';
    resultTitle.textContent = title;
    resultMessage.textContent = message;
    resultScreen.classList.remove('hidden');

    if (isClear) stopBgm();
    else playGameOverBgm();
}

function gameLoop(now) {
    if (!gameStarted) return;

    const dt = Math.min(2, (now - lastTime) / (1000 / 60));
    lastTime = now;

    if (!gameEnded) update(dt);
    draw();

    if (!gameEnded) requestAnimationFrame(gameLoop);
}

function update(dt) {
    hero.animation += dt;
    if (hero.invincible > 0) hero.invincible -= dt;

    state.elapsed += dt / 60;
    state.time = Math.max(0, 300 - state.elapsed);
    if (state.time <= 0) {
        loseLife('時間切れ。もう一度チャレンジ。');
        return;
    }

    const left = axisLeft();
    const right = axisRight();
    const jumpPressed = wantsJump();

    if (left && !right) {
        hero.vx -= MOVE_ACCEL * dt;
        hero.facing = -1;
    } else if (right && !left) {
        hero.vx += MOVE_ACCEL * dt;
        hero.facing = 1;
    } else {
        hero.vx *= Math.pow(FRICTION, dt);
        if (Math.abs(hero.vx) < 0.04) hero.vx = 0;
    }

    hero.vx = clamp(hero.vx, -MAX_RUN, MAX_RUN);

    if (jumpPressed) hero.jumpBuffer = JUMP_BUFFER_FRAMES;
    else if (hero.jumpBuffer > 0) hero.jumpBuffer -= dt;

    if (hero.grounded) hero.coyote = COYOTE_FRAMES;
    else if (hero.coyote > 0) hero.coyote -= dt;

    if (hero.jumpBuffer > 0 && hero.coyote > 0) {
        hero.vy = JUMP_SPEED;
        hero.grounded = false;
        hero.coyote = 0;
        hero.jumpBuffer = 0;
    }

    if (!jumpPressed && hero.vy < -4) {
        hero.vy *= 0.86;
    }

    moveHeroX(hero.vx * dt);
    hero.vy = Math.min(MAX_FALL, hero.vy + GRAVITY * dt);
    moveHeroY(hero.vy * dt);

    if (hero.y > H + 120) {
        loseLife('穴に落ちました。チェックポイントから再開。');
        return;
    }

    updateEnemies(dt);
    collectCoins();
    checkEnemyHits();
    checkGoal();

    if (hero.x > 3200) state.checkpointX = Math.max(state.checkpointX, 3060);
    if (hero.x > 4800) state.checkpointX = Math.max(state.checkpointX, 4680);

    cameraX = clamp(hero.x + hero.w / 2 - W * 0.42, 0, WORLD_WIDTH - W);
    updateHud();
}

function moveHeroX(dx) {
    hero.x += dx;
    hero.x = clamp(hero.x, 0, WORLD_WIDTH - hero.w);

    for (const p of platforms) {
        if (!rectsOverlap(hero, p)) continue;
        if (dx > 0) hero.x = p.x - hero.w;
        else if (dx < 0) hero.x = p.x + p.w;
        hero.vx = 0;
    }
}

function moveHeroY(dy) {
    hero.y += dy;
    hero.grounded = false;

    for (const p of platforms) {
        if (!rectsOverlap(hero, p)) continue;
        if (dy > 0) {
            hero.y = p.y - hero.h;
            hero.vy = 0;
            hero.grounded = true;
        } else if (dy < 0) {
            hero.y = p.y + p.h;
            hero.vy = 0;
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
        const coinBox = { x: coin.x - coin.r, y: coin.y - coin.r, w: coin.r * 2, h: coin.r * 2 };
        if (rectsOverlap(hero, coinBox)) {
            coin.taken = true;
            state.coins += 1;
        }
    }
}

function checkEnemyHits() {
    if (hero.invincible > 0) return;

    for (const foe of enemies) {
        if (!foe.alive || !rectsOverlap(hero, foe)) continue;

        const heroBottom = hero.y + hero.h;
        const enemyTop = foe.y + 10;
        const isStomp = hero.vy > 0 && heroBottom - enemyTop < 24;

        if (isStomp) {
            foe.alive = false;
            foe.squish = 0;
            hero.vy = JUMP_SPEED * 0.55;
            state.coins += 2;
        } else {
            loseLife('敵にぶつかりました。');
        }
        return;
    }
}

function checkGoal() {
    if (rectsOverlap(hero, goal)) {
        endGame('CLEAR!', `ゴールしました。コイン ${state.coins} 枚獲得。`, true);
    }
}

function loseLife(message) {
    state.lives -= 1;
    if (state.lives <= 0) {
        endGame('GAME OVER', message, false);
        return;
    }

    state.elapsed = 0;
    state.time = 300;
    respawnHero(state.checkpointX, 330);
    cameraX = clamp(hero.x + hero.w / 2 - W * 0.42, 0, WORLD_WIDTH - W);
}

function draw() {
    prepareCanvasContext();
    ctx.clearRect(0, 0, W, H);

    drawSky();
    ctx.save();
    ctx.translate(-cameraX, 0);
    drawBackgroundHills();
    drawGoal();
    drawPlatforms();
    drawCoins();
    drawEnemies();
    drawHero();
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

function drawGoal() {
    if (!isVisible(goal.x, 180)) return;

    ctx.fillStyle = '#f8fbff';
    ctx.fillRect(goal.x, goal.y, goal.w, goal.h);
    ctx.fillStyle = '#ef476f';
    ctx.beginPath();
    ctx.moveTo(goal.x + goal.w, goal.y + 16);
    ctx.lineTo(goal.x + goal.w + 115, goal.y + 44);
    ctx.lineTo(goal.x + goal.w, goal.y + 74);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(goal.x - 20, goal.y + goal.h, goal.w + 48, 14);
}

function drawCoins() {
    for (const coin of coins) {
        if (coin.taken || !isVisible(coin.x - coin.r, coin.r * 2)) continue;
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(coin.x, coin.y, coin.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#c89012';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.arc(coin.x - 4, coin.y - 5, 3, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawEnemies() {
    for (const foe of enemies) {
        if (!isVisible(foe.x, foe.w)) continue;
        if (!foe.alive && foe.squish > 18) continue;

        const h = foe.alive ? foe.h : Math.max(10, foe.h * 0.28);
        const y = foe.alive ? foe.y : foe.y + foe.h - h;

        ctx.save();
        ctx.translate(foe.x + foe.w / 2, y + h / 2);
        if (foe.vx < 0) ctx.scale(-1, 1);

        if (isLoadedImage(imgEnemy)) {
            drawImageContain(imgEnemy, -foe.w / 2, -h / 2, foe.w, h);
        } else {
            // enemy.png がまだ無い場合のフォールバック表示
            ctx.fillStyle = '#7b3f1d';
            ctx.beginPath();
            ctx.ellipse(0, 2, foe.w / 2, h / 2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(-10, -6, 5, 0, Math.PI * 2);
            ctx.arc(10, -6, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#111';
            ctx.beginPath();
            ctx.arc(-9, -6, 2, 0, Math.PI * 2);
            ctx.arc(9, -6, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

function drawHero() {
    if (hero.invincible > 0 && Math.floor(hero.invincible / 6) % 2 === 0) return;

    const moving = Math.abs(hero.vx) > 0.4;
    const fallback = moving && isLoadedImage(imgMove) ? imgMove : imgStop;
    const currentImg = selectedPlayerImage || fallback;

    ctx.save();
    ctx.translate(hero.x + hero.w / 2, hero.y + hero.h / 2);
    if (hero.facing < 0) ctx.scale(-1, 1);

    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;

    if (isLoadedImage(currentImg)) {
        drawImageContain(currentImg, -hero.w / 2, -hero.h / 2, hero.w, hero.h);
    } else {
        ctx.fillStyle = '#ef476f';
        ctx.fillRect(-hero.w / 2, -hero.h / 2, hero.w, hero.h);
    }

    ctx.restore();
}

function drawImageContain(img, x, y, w, h) {
    if (!isLoadedImage(img)) return;

    const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    const drawX = x + (w - drawW) / 2;
    const drawY = y + (h - drawH) / 2;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
}

function isLoadedImage(img) {
    return img && img.complete && img.naturalWidth > 0;
}

function rectsOverlap(a, b) {
    return a.x < b.x + b.w &&
           a.x + a.w > b.x &&
           a.y < b.y + b.h &&
           a.y + a.h > b.y;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function isVisible(x, width) {
    return x + width > cameraX - 80 && x < cameraX + W + 80;
}

function wrapParallax(x, min, max) {
    const span = max - min;
    let value = x;
    while (value < min) value += span;
    while (value > max) value -= span;
    return value;
}

function setTouch(key, value, button) {
    touch[key] = value;
    if (button) button.classList.toggle('pressed', value);
}

window.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'KeyA', 'KeyD', 'KeyW'].includes(e.code)) {
        e.preventDefault();
    }
    keys.add(e.code);
});

window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
});

for (const button of document.querySelectorAll('.touch-button')) {
    const key = button.dataset.key;

    button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        button.setPointerCapture(e.pointerId);
        setTouch(key, true, button);
    });

    button.addEventListener('pointerup', (e) => {
        e.preventDefault();
        setTouch(key, false, button);
    });

    button.addEventListener('pointercancel', () => {
        setTouch(key, false, button);
    });

    button.addEventListener('lostpointercapture', () => {
        setTouch(key, false, button);
    });
}

imageInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (selectedObjectUrl) URL.revokeObjectURL(selectedObjectUrl);
    selectedObjectUrl = URL.createObjectURL(file);

    const img = new Image();
    img.onload = () => {
        selectedPlayerImage = img;
    };
    img.src = selectedObjectUrl;
});

startButton.addEventListener('click', startGame);
retryButton.addEventListener('click', startGame);
window.addEventListener('resize', resizeCanvasForHighDpi);

resizeCanvasForHighDpi();
updateHud();
draw();
