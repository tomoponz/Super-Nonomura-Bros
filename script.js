'use strict';

// ==========================================
// 1. YouTube API と BGM制御のセットアップ
//    元のコードで動いていた seekTo 方式を維持しています。
// ==========================================
let player;
let isGameOver = false;
let loopCheckInterval;
let ytReady = false;
let ytApiReady = false;
let bgmRequested = false;
let bgmStartSeconds = 4;
let lastBgmAttempt = 0;

const VIDEO_ID = 'vHbkhn2AI8g';

function onYouTubeIframeAPIReady() {
    ytApiReady = true;
    createBgmPlayer();
}

function createBgmPlayer() {
    if (player || !ytApiReady || typeof YT === 'undefined' || !YT.Player) return;

    player = new YT.Player('youtube-player', {
        height: '1',
        width: '1',
        videoId: VIDEO_ID,
        playerVars: {
            autoplay: 0,
            playsinline: 1,
            controls: 0,
            disablekb: 1,
            rel: 0,
            origin: location.origin
        },
        events: {
            onReady: onPlayerReady,
            onStateChange: onPlayerStateChange
        }
    });
}

function onPlayerReady() {
    ytReady = true;
    console.log('BGMの準備が完了しました');

    if (player && typeof player.setVolume === 'function') {
        player.setVolume(75);
    }

    if (bgmRequested) {
        startBgm();
    }
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
    bgmRequested = true;
    bgmStartSeconds = 4;
    isGameOver = false;
    playBgmFrom(4);
}

function playGameOverBgm() {
    bgmRequested = true;
    bgmStartSeconds = 84;
    isGameOver = true;
    playBgmFrom(84);
}

function playBgmFrom(seconds) {
    createBgmPlayer();

    if (!ytReady || !player || typeof player.seekTo !== 'function') return;

    const now = performance.now();
    if (now - lastBgmAttempt < 180) return;
    lastBgmAttempt = now;

    try {
        if (typeof player.unMute === 'function') player.unMute();
        if (typeof player.setVolume === 'function') player.setVolume(75);
        player.seekTo(seconds, true);
        player.playVideo();
    } catch (error) {
        console.warn('BGM再生がブラウザにブロックされました', error);
    }
}

function resumeBgmFromUserGesture() {
    // LINE内ブラウザなどは、初回タップ以外で再生許可が下りることがあります。
    // ゲーム開始後、画面や操作ボタンを触ったタイミングでも再試行します。
    if (!gameStarted || gameEnded || !bgmRequested) return;
    playBgmFrom(bgmStartSeconds);
}

function stopBgm() {
    bgmRequested = false;
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

const W = 960;
const H = 540;
const WORLD_WIDTH = 6500;
const FLOOR_Y = 470;
const TILE = 32;
const GROUND_DEPTH = TILE * 2;

const GRAVITY = 0.75;
const MAX_FALL = 18;
const MOVE_ACCEL = 0.84;
const FRICTION = 0.78;
const MAX_RUN = 7.25;
const JUMP_SPEED = -15.9;
const COYOTE_FRAMES = 7;
const JUMP_BUFFER_FRAMES = 8;

const keys = new Set();
const touch = { left: false, right: false, jump: false };

let gameStarted = false;
let gameEnded = false;
let lastTime = 0;
let cameraX = 0;
let dpr = 1;

const imgStop = new Image();
imgStop.src = 'assets/images/player/player_stop.png';

const imgMove = new Image();
imgMove.src = 'assets/images/player/player_move.png';

// 任意画像アップロード機能は廃止。
// player_icon.png の自動読み込みも行わないため、player_stop / player_move の歩行アニメが必ず使われます。

const imgEnemy = new Image();
imgEnemy.src = 'assets/images/player/enemy.png';

const state = {
    coins: 0,
    lives: 1,
    time: 300,
    elapsed: 0,
    checkpointX: 80,
};

const hero = {
    x: 80,
    y: 330,
    w: 48,
    h: 64,
    vx: 0,
    vy: 0,
    grounded: false,
    coyote: 0,
    jumpBuffer: 0,
    facing: 1,
    invincible: 0,
    animation: 0,
};

// ドット風の横スクロールコース。既存素材を使わず、矩形タイルだけでレトロ感を出しています。
const platforms = [
    { x: 0, y: FLOOR_Y, w: 760, h: GROUND_DEPTH, kind: 'ground' },
    { x: 850, y: FLOOR_Y, w: 820, h: GROUND_DEPTH, kind: 'ground' },
    { x: 1780, y: FLOOR_Y, w: 700, h: GROUND_DEPTH, kind: 'ground' },
    { x: 2580, y: FLOOR_Y, w: 920, h: GROUND_DEPTH, kind: 'ground' },
    { x: 3630, y: FLOOR_Y, w: 760, h: GROUND_DEPTH, kind: 'ground' },
    { x: 4510, y: FLOOR_Y, w: 1990, h: GROUND_DEPTH, kind: 'ground' },

    { x: 384, y: 374, w: 96, h: 32, kind: 'brick' },
    { x: 512, y: 310, w: 64, h: 32, kind: 'question' },
    { x: 576, y: 310, w: 96, h: 32, kind: 'brick' },
    { x: 960, y: 390, w: 160, h: 32, kind: 'brick' },
    { x: 1184, y: 326, w: 64, h: 32, kind: 'question' },
    { x: 1248, y: 326, w: 160, h: 32, kind: 'brick' },
    { x: 1450, y: 262, w: 128, h: 32, kind: 'brick' },
    { x: 1900, y: 366, w: 160, h: 32, kind: 'brick' },
    { x: 2160, y: 302, w: 192, h: 32, kind: 'brick' },
    { x: 2700, y: 406, w: 96, h: 64, kind: 'pipe' },
    { x: 3000, y: 342, w: 128, h: 128, kind: 'pipe' },
    { x: 3264, y: 286, w: 192, h: 32, kind: 'brick' },
    { x: 3740, y: 386, w: 160, h: 32, kind: 'brick' },
    { x: 3970, y: 322, w: 192, h: 32, kind: 'question' },

    { x: 4640, y: 406, w: 96, h: 64, kind: 'step' },
    { x: 4736, y: 342, w: 96, h: 128, kind: 'step' },
    { x: 4832, y: 278, w: 96, h: 192, kind: 'step' },
    { x: 5024, y: 326, w: 256, h: 32, kind: 'brick' },
    { x: 5376, y: 406, w: 96, h: 64, kind: 'step' },
    { x: 5472, y: 342, w: 96, h: 128, kind: 'step' },
    { x: 5568, y: 278, w: 96, h: 192, kind: 'step' },
    { x: 5664, y: 214, w: 96, h: 256, kind: 'step' },
];

const coins = [
    ...coinLine(430, 330, 4),
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
    enemy(700, 424, 580, 740, 1.2),
    enemy(1320, 424, 980, 1560, 1.35),
    enemy(2030, 424, 1850, 2390, 1.4),
    enemy(2880, 424, 2600, 3190, 1.55),
    enemy(4150, 424, 3660, 4340, 1.45),
    enemy(5200, 282, 5000, 5260, 1.25),
];

const goal = { x: 6120, y: 176, w: 24, h: 294 };

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
    // w/h は当たり判定。drawW/drawH は見た目の大きさ。
    // enemy.png を大きく見せつつ、ぶつかり判定は少し小さめにする。
    const hitW = 34;
    const hitH = 34;
    const hitY = y + 46 - hitH;
    return {
        startX: x,
        x,
        y: hitY,
        w: hitW,
        h: hitH,
        drawW: 72,
        drawH: 66,
        vx: speed,
        startVx: speed,
        minX,
        maxX,
        alive: true,
        squish: 0
    };
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
    // ステージは矩形でドット風に描く。画像だけ drawImageContain 側で高品質化する。
    ctx.imageSmoothingEnabled = false;
}

function hideDeprecatedPlayerPicker() {
    const input = document.getElementById('player-image-input');
    const fileButton = input ? input.closest('.file-button') : null;
    if (fileButton) fileButton.style.display = 'none';

    const note = document.querySelector('.small-note');
    if (note) {
        note.innerHTML = 'プレイヤーは <code>player_stop.png</code> / <code>player_move.png</code> で歩行アニメします。<br />敵は <code>assets/images/player/enemy.png</code> を使用します。';
    }
}

function resetGame() {
    state.coins = 0;
    state.lives = 1;
    state.time = 300;
    state.elapsed = 0;
    state.checkpointX = 80;

    respawnHero(80, 340);
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
        loseLife('穴に落ちました。');
        return;
    }

    updateEnemies(dt);
    collectCoins();
    checkEnemyHits();
    checkGoal();

    // 残機1なので実質チェックポイント再開は使わないが、将来戻せるよう値は維持。
    if (hero.x > 3200) state.checkpointX = Math.max(state.checkpointX, 3060);
    if (hero.x > 4800) state.checkpointX = Math.max(state.checkpointX, 4680);

    cameraX = clamp(hero.x + hero.w / 2 - W * 0.42, 0, WORLD_WIDTH - W);
    updateHud();
}

function moveHeroX(dx) {
    hero.x += dx;
    hero.x = clamp(hero.x, 0, WORLD_WIDTH - hero.w);

    for (const p of platforms) {
        const hitbox = getPlatformHitbox(p);
        if (!rectsOverlap(hero, hitbox)) continue;
        if (dx > 0) hero.x = hitbox.x - hero.w;
        else if (dx < 0) hero.x = hitbox.x + hitbox.w;
        hero.vx = 0;
    }
}

function moveHeroY(dy) {
    hero.y += dy;
    hero.grounded = false;

    for (const p of platforms) {
        const hitbox = getPlatformHitbox(p);
        if (!rectsOverlap(hero, hitbox)) continue;
        if (dy > 0) {
            hero.y = hitbox.y - hero.h;
            hero.vy = 0;
            hero.grounded = true;
        } else if (dy < 0) {
            hero.y = hitbox.y + hitbox.h;
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
        const hitbox = getEnemyHitbox(foe);
        if (!foe.alive || !rectsOverlap(hero, hitbox)) continue;

        const heroBottom = hero.y + hero.h;
        const enemyTop = hitbox.y;
        const isStomp = hero.vy > 0 && heroBottom - enemyTop < 22;

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
        updateHud();
        return;
    }

    state.elapsed = 0;
    state.time = 300;
    respawnHero(state.checkpointX, 340);
    cameraX = clamp(hero.x + hero.w / 2 - W * 0.42, 0, WORLD_WIDTH - W);
}

function draw() {
    prepareCanvasContext();
    ctx.clearRect(0, 0, W, H);

    drawSky();
    ctx.save();
    ctx.translate(-Math.round(cameraX), 0);
    drawBackgroundHills();
    drawGoal();
    drawPlatforms();
    drawCoins();
    drawEnemies();
    drawHero();
    ctx.restore();
}

function drawSky() {
    ctx.fillStyle = '#5c94fc';
    ctx.fillRect(0, 0, W, H);

    drawPixelCloud(130 - cameraX * 0.15, 88, 1.0);
    drawPixelCloud(560 - cameraX * 0.12, 64, 0.75);
    drawPixelCloud(910 - cameraX * 0.18, 124, 0.85);
}

function drawBackgroundHills() {
    for (let x = -200; x < WORLD_WIDTH + 400; x += 520) {
        const base = FLOOR_Y;
        drawPixelHill(x + 120, base, 7);
        drawPixelBush(x + 340, base + 12, 1.0);
    }
}

function drawPixelCloud(x, y, scale) {
    ctx.save();
    ctx.translate(Math.round(wrapParallax(x, -260, W + 260)), Math.round(y));
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    px(-32, 16, 32, 24);
    px(0, 0, 32, 40);
    px(32, 8, 40, 32);
    px(72, 20, 32, 20);
    px(-16, 40, 112, 16);
    ctx.fillStyle = '#d8f0ff';
    px(8, 32, 24, 8);
    px(48, 36, 24, 8);
    ctx.restore();
}

function drawPixelHill(x, base, blocks) {
    ctx.fillStyle = '#00a800';
    for (let row = 0; row < blocks; row++) {
        const width = (blocks - row) * TILE;
        const start = x + row * TILE / 2;
        px(start, base - (row + 1) * TILE, width, TILE);
    }
    ctx.fillStyle = '#7cfc70';
    px(x + 28, base - blocks * TILE + 18, 22, 12);
    px(x + 96, base - (blocks - 2) * TILE + 12, 26, 12);
}

function drawPixelBush(x, y, scale) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(scale, scale);
    ctx.fillStyle = '#00a800';
    px(0, -24, 32, 24);
    px(28, -40, 44, 40);
    px(68, -24, 32, 24);
    ctx.fillStyle = '#7cfc70';
    px(32, -30, 16, 10);
    ctx.restore();
}

function drawPlatforms() {
    for (const p of platforms) {
        if (!isVisible(p.x, p.w)) continue;
        if (p.kind === 'ground') drawGround(p);
        else if (p.kind === 'pipe') drawPipe(p);
        else if (p.kind === 'step') drawStep(p);
        else if (p.kind === 'question') drawQuestionBlocks(p);
        else drawBrick(p);
    }
}

function drawGround(p) {
    ctx.fillStyle = '#c84c0c';
    px(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#ffb05a';
    px(p.x, p.y, p.w, 10);
    ctx.fillStyle = '#5c2c0c';

    for (let x = p.x; x < p.x + p.w; x += TILE) {
        px(x, p.y, 2, p.h);
    }
    for (let y = p.y; y < p.y + p.h; y += 20) {
        px(p.x, y, p.w, 2);
    }

    ctx.fillStyle = '#8c3408';
    for (let x = p.x + 10; x < p.x + p.w; x += 48) {
        px(x, p.y + 28, 20, 6);
    }
}

function drawBrick(p) {
    const blocks = Math.max(1, Math.round(p.w / TILE));
    for (let i = 0; i < blocks; i++) {
        drawBrickBlock(p.x + i * TILE, p.y, TILE, p.h);
    }
}

function drawBrickBlock(x, y, w, h) {
    ctx.fillStyle = '#c84c0c';
    px(x, y, w, h);
    ctx.fillStyle = '#ffb05a';
    px(x + 3, y + 3, w - 6, 5);
    ctx.fillStyle = '#5c2c0c';
    px(x, y, w, 3);
    px(x, y + h - 3, w, 3);
    px(x, y, 3, h);
    px(x + w - 3, y, 3, h);
    px(x + w / 2 - 1, y + 4, 2, h - 8);
    px(x + 4, y + h / 2 - 1, w - 8, 2);
}

function drawQuestionBlocks(p) {
    const blocks = Math.max(1, Math.round(p.w / TILE));
    for (let i = 0; i < blocks; i++) {
        drawQuestionBlock(p.x + i * TILE, p.y, TILE, p.h);
    }
}

function drawQuestionBlock(x, y, w, h) {
    ctx.fillStyle = '#f8b800';
    px(x, y, w, h);
    ctx.fillStyle = '#fff060';
    px(x + 4, y + 4, w - 8, 5);
    ctx.fillStyle = '#8c5c00';
    px(x, y, w, 3);
    px(x, y + h - 3, w, 3);
    px(x, y, 3, h);
    px(x + w - 3, y, 3, h);
    ctx.fillStyle = '#ffffff';
    px(x + 13, y + 7, 8, 5);
    px(x + 21, y + 12, 5, 8);
    px(x + 16, y + 20, 7, 5);
    px(x + 16, y + 27, 6, 4);
}

function drawPipe(p) {
    ctx.fillStyle = '#005800';
    px(p.x - 12, p.y, p.w + 24, 28);
    px(p.x, p.y + 20, p.w, p.h - 20);
    ctx.fillStyle = '#00a800';
    px(p.x - 6, p.y + 4, p.w + 12, 18);
    px(p.x + 6, p.y + 24, p.w - 12, p.h - 28);
    ctx.fillStyle = '#80d010';
    px(p.x + 12, p.y + 28, 14, p.h - 34);
    ctx.fillStyle = '#003800';
    px(p.x - 12, p.y + 24, p.w + 24, 4);
    px(p.x + p.w - 10, p.y + 28, 5, p.h - 34);
}

function drawStep(p) {
    drawBrick(p);
}

function drawGoal() {
    if (!isVisible(goal.x, 180)) return;

    ctx.fillStyle = '#ffffff';
    px(goal.x, goal.y, goal.w, goal.h);
    ctx.fillStyle = '#d8d8d8';
    px(goal.x + goal.w - 6, goal.y, 6, goal.h);
    ctx.fillStyle = '#00a800';
    px(goal.x + goal.w, goal.y + 24, 112, 28);
    ctx.fillStyle = '#80d010';
    px(goal.x + goal.w + 8, goal.y + 30, 82, 8);
    ctx.fillStyle = '#c84c0c';
    px(goal.x - 22, goal.y + goal.h, goal.w + 54, 16);
}

function drawCoins() {
    for (const coin of coins) {
        if (coin.taken || !isVisible(coin.x - coin.r, coin.r * 2)) continue;
        drawPixelCoin(coin.x, coin.y, coin.r);
    }
}

function drawPixelCoin(x, y, r) {
    ctx.fillStyle = '#f8d800';
    px(x - 8, y - 12, 16, 4);
    px(x - 12, y - 8, 24, 16);
    px(x - 8, y + 8, 16, 4);
    ctx.fillStyle = '#fff060';
    px(x - 4, y - 8, 5, 16);
    ctx.fillStyle = '#8c5c00';
    px(x + 8, y - 5, 4, 10);
}

function drawEnemies() {
    for (const foe of enemies) {
        const drawW = foe.drawW || foe.w;
        if (!isVisible(foe.x - (drawW - foe.w) / 2, drawW)) continue;
        if (!foe.alive && foe.squish > 18) continue;

        const drawH = foe.alive ? (foe.drawH || foe.h) : Math.max(12, (foe.drawH || foe.h) * 0.28);
        const drawY = foe.y + foe.h - drawH;

        ctx.save();
        ctx.translate(Math.round(foe.x + foe.w / 2), Math.round(drawY + drawH / 2));
        if (foe.vx < 0) ctx.scale(-1, 1);

        if (isLoadedImage(imgEnemy)) {
            drawImageContain(imgEnemy, -drawW / 2, -drawH / 2, drawW, drawH, true);
        } else {
            // enemy.png の読み込み待ち・配置ミス確認用。通常は表示されません。
            ctx.fillStyle = '#111111';
            px(-drawW / 2, -drawH / 2, drawW, drawH);
            ctx.fillStyle = '#ffffff';
            px(-drawW / 2 + 8, -drawH / 2 + 8, drawW - 16, 7);
        }
        ctx.restore();
    }
}

function drawHero() {
    if (hero.invincible > 0 && Math.floor(hero.invincible / 6) % 2 === 0) return;

    const currentImg = getHeroFrame();

    ctx.save();
    ctx.translate(Math.round(hero.x + hero.w / 2), Math.round(hero.y + hero.h / 2));
    if (hero.facing < 0) ctx.scale(-1, 1);

    if (isLoadedImage(currentImg)) {
        drawImageContain(currentImg, -hero.w / 2, -hero.h / 2, hero.w, hero.h, true);
    } else {
        drawFallbackHero();
    }

    ctx.restore();
}

function getHeroFrame() {
    const moving = Math.abs(hero.vx) > 0.4;

    if (!hero.grounded && isLoadedImage(imgMove)) {
        return imgMove;
    }

    if (moving && isLoadedImage(imgMove) && isLoadedImage(imgStop)) {
        const frame = Math.floor(hero.animation / 7) % 2;
        return frame === 0 ? imgStop : imgMove;
    }

    if (moving && isLoadedImage(imgMove)) return imgMove;
    return imgStop;
}

function drawFallbackHero() {
    ctx.fillStyle = '#d82800';
    px(-18, -35, 36, 18);
    ctx.fillStyle = '#f8c090';
    px(-16, -17, 32, 24);
    ctx.fillStyle = '#0058f8';
    px(-18, 7, 36, 32);
    ctx.fillStyle = '#ffffff';
    px(5, -9, 6, 6);
}

function drawImageContain(img, x, y, w, h, smoothImage = true) {
    if (!isLoadedImage(img)) return;

    const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    const drawW = Math.round(img.naturalWidth * scale);
    const drawH = Math.round(img.naturalHeight * scale);
    const drawX = Math.round(x + (w - drawW) / 2);
    const drawY = Math.round(y + (h - drawH) / 2);

    ctx.imageSmoothingEnabled = smoothImage;
    if (smoothImage) ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.imageSmoothingEnabled = false;
}

function isLoadedImage(img) {
    return img && img.complete && img.naturalWidth > 0;
}

function px(x, y, w, h) {
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function getPlatformHitbox(p) {
    if (p.kind === 'pipe') {
        // drawPipe() は上フチを左右に12px広げて描いているので、
        // 当たり判定も見た目に合わせる。これでドカンの端にめり込みにくくなる。
        return { x: p.x - 12, y: p.y, w: p.w + 24, h: p.h };
    }
    return p;
}

function getEnemyHitbox(foe) {
    // enemy.png は大きく描くが、理不尽に当たらないよう判定はさらに内側にする。
    const insetX = 4;
    const insetTop = 3;
    const insetBottom = 2;
    return {
        x: foe.x + insetX,
        y: foe.y + insetTop,
        w: foe.w - insetX * 2,
        h: foe.h - insetTop - insetBottom
    };
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

document.addEventListener('pointerdown', resumeBgmFromUserGesture, { passive: true });
document.addEventListener('touchend', resumeBgmFromUserGesture, { passive: true });

startButton.addEventListener('click', startGame);
retryButton.addEventListener('click', startGame);
window.addEventListener('resize', resizeCanvasForHighDpi);

hideDeprecatedPlayerPicker();
resizeCanvasForHighDpi();
updateHud();
draw();
