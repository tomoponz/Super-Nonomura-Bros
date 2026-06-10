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
let bgmPlaying = false;
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
        bgmPlaying = true;
        startLoopCheck();
    } else {
        if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED || event.data === YT.PlayerState.CUED) {
            bgmPlaying = false;
        }
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
    playBgmFrom(4, true);
}

function playGameOverBgm() {
    bgmRequested = true;
    bgmStartSeconds = 84;
    isGameOver = true;
    playBgmFrom(84, true);
}

function playBgmFrom(seconds, forceSeek = false) {
    createBgmPlayer();

    if (!ytReady || !player || typeof player.seekTo !== 'function') return;
    if (!forceSeek && bgmPlaying) return;

    const now = performance.now();
    // スマホ操作のたびに seekTo / playVideo を連打すると、音量バーが出ている間だけ鳴るような不安定さが出やすい。
    // そのため、強制開始以外は間隔を空けて一度だけ再試行する。
    if (!forceSeek && now - lastBgmAttempt < 3500) return;
    lastBgmAttempt = now;

    try {
        if (typeof player.unMute === 'function') player.unMute();
        if (forceSeek) player.seekTo(seconds, true);
        player.playVideo();
    } catch (error) {
        console.warn('BGM再生がブラウザにブロックされました', error);
    }
}

function resumeBgmFromUserGesture() {
    // 通常ブラウザで初回タップ時だけ失敗した場合の保険。
    // 再生中は何もしない。失敗時も数秒に1回だけ再試行し、スマホ操作中のBGMリセットを防ぐ。
    if (!gameStarted || gameEnded || !bgmRequested || bgmPlaying) return;
    const now = performance.now();
    if (now - lastBgmAttempt < 3500) return;
    playBgmFrom(bgmStartSeconds, true);
}

function stopBgm() {
    bgmRequested = false;
    bgmPlaying = false;
    if (!ytReady || !player || typeof player.pauseVideo !== 'function') return;
    player.pauseVideo();
}

// ==========================================
// 2. ゲームの描画・キャラクター制御セットアップ
// ==========================================
const canvas = document.getElementById('gameCanvas');
const gameContainer = document.getElementById('game-container');
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
const browserRedirectScreen = document.getElementById('browser-redirect-screen');
const openBrowserButton = document.getElementById('open-browser-button');
const continueLineButton = document.getElementById('continue-line-button');

const BASE_VIEW_W = 960;
const MIN_PORTRAIT_VIEW_W = 360;
let W = BASE_VIEW_W;
const H = 540;
const WORLD_WIDTH = 6500;
const TILE = 32;
const FLOOR_Y = TILE * 14;
const GROUND_DEPTH = TILE * 3;

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
let goalSequence = null;

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
    // w/h は当たり判定。drawW/drawH は見た目の大きさ。
    // 画像を大きくしても、足場や敵との判定が理不尽になりにくいよう分離しています。
    w: 48,
    h: 64,
    drawW: 88,
    drawH: 108,
    vx: 0,
    vy: 0,
    grounded: false,
    coyote: 0,
    jumpBuffer: 0,
    facing: 1,
    invincible: 0,
    animation: 0,
};

// 固定サイズのブロックを並べる横スクロールコース。1ブロックを引き伸ばさずに描画します。
const platforms = [
    // すべてTILE単位で配置。1ブロックを引き伸ばさず、同じ大きさのブロックを並べて描画します。
    { x: TILE * 0,   y: FLOOR_Y, w: TILE * 24, h: GROUND_DEPTH, kind: 'ground' },
    { x: TILE * 27,  y: FLOOR_Y, w: TILE * 25, h: GROUND_DEPTH, kind: 'ground' },
    { x: TILE * 56,  y: FLOOR_Y, w: TILE * 22, h: GROUND_DEPTH, kind: 'ground' },
    { x: TILE * 81,  y: FLOOR_Y, w: TILE * 29, h: GROUND_DEPTH, kind: 'ground' },
    { x: TILE * 114, y: FLOOR_Y, w: TILE * 24, h: GROUND_DEPTH, kind: 'ground' },
    { x: TILE * 141, y: FLOOR_Y, w: TILE * 62, h: GROUND_DEPTH, kind: 'ground' },

    { x: TILE * 12,  y: FLOOR_Y - TILE * 3, w: TILE * 3, h: TILE, kind: 'brick' },
    { x: TILE * 16,  y: FLOOR_Y - TILE * 5, w: TILE * 2, h: TILE, kind: 'question' },
    { x: TILE * 18,  y: FLOOR_Y - TILE * 5, w: TILE * 3, h: TILE, kind: 'brick' },
    { x: TILE * 30,  y: FLOOR_Y - TILE * 2, w: TILE * 5, h: TILE, kind: 'brick' },
    { x: TILE * 37,  y: FLOOR_Y - TILE * 4, w: TILE * 2, h: TILE, kind: 'question' },
    { x: TILE * 39,  y: FLOOR_Y - TILE * 4, w: TILE * 5, h: TILE, kind: 'brick' },
    { x: TILE * 45,  y: FLOOR_Y - TILE * 6, w: TILE * 4, h: TILE, kind: 'brick' },
    { x: TILE * 59,  y: FLOOR_Y - TILE * 3, w: TILE * 5, h: TILE, kind: 'brick' },
    { x: TILE * 67,  y: FLOOR_Y - TILE * 5, w: TILE * 6, h: TILE, kind: 'brick' },
    { x: TILE * 84,  y: FLOOR_Y - TILE * 2, w: TILE * 3, h: TILE * 2, kind: 'pipe' },
    { x: TILE * 94,  y: FLOOR_Y - TILE * 4, w: TILE * 4, h: TILE * 4, kind: 'pipe' },
    { x: TILE * 102, y: FLOOR_Y - TILE * 6, w: TILE * 6, h: TILE, kind: 'brick' },
    { x: TILE * 117, y: FLOOR_Y - TILE * 2, w: TILE * 5, h: TILE, kind: 'brick' },
    { x: TILE * 124, y: FLOOR_Y - TILE * 4, w: TILE * 6, h: TILE, kind: 'question' },

    { x: TILE * 145, y: FLOOR_Y - TILE * 2, w: TILE * 3, h: TILE * 2, kind: 'step' },
    { x: TILE * 148, y: FLOOR_Y - TILE * 4, w: TILE * 3, h: TILE * 4, kind: 'step' },
    { x: TILE * 151, y: FLOOR_Y - TILE * 6, w: TILE * 3, h: TILE * 6, kind: 'step' },
    { x: TILE * 157, y: FLOOR_Y - TILE * 4, w: TILE * 8, h: TILE, kind: 'brick' },
    { x: TILE * 168, y: FLOOR_Y - TILE * 2, w: TILE * 3, h: TILE * 2, kind: 'step' },
    { x: TILE * 171, y: FLOOR_Y - TILE * 4, w: TILE * 3, h: TILE * 4, kind: 'step' },
    { x: TILE * 174, y: FLOOR_Y - TILE * 6, w: TILE * 3, h: TILE * 6, kind: 'step' },
    { x: TILE * 177, y: FLOOR_Y - TILE * 8, w: TILE * 3, h: TILE * 8, kind: 'step' },
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
    enemy(TILE * 22, FLOOR_Y, TILE * 18, TILE * 24, 1.2),
    enemy(TILE * 41, FLOOR_Y, TILE * 31, TILE * 49, 1.35),
    enemy(TILE * 63, FLOOR_Y, TILE * 58, TILE * 75, 1.4),
    enemy(TILE * 90, FLOOR_Y, TILE * 82, TILE * 100, 1.55),
    enemy(TILE * 130, FLOOR_Y, TILE * 115, TILE * 136, 1.45),
    enemy(TILE * 163, FLOOR_Y - TILE * 4, TILE * 157, TILE * 165, 1.25),
];
const goal = { x: TILE * 191, y: FLOOR_Y - TILE * 10, w: TILE, h: TILE * 10 };
const goalHouse = { x: TILE * 195, y: FLOOR_Y - TILE * 3, w: TILE * 6, h: TILE * 3 };

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

function enemy(x, bottomY, minX, maxX, speed) {
    // w/h は当たり判定。drawW/drawH は見た目の大きさ。
    // bottomYを基準に置くことで、地面・ブロック上のどちらでも足元が自然に揃います。
    const hitW = 34;
    const hitH = 34;
    return {
        startX: x,
        x,
        y: bottomY - hitH,
        w: hitW,
        h: hitH,
        drawW: 108,
        drawH: 96,
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

    // スマホ縦画面では、960px幅の世界をそのまま縮小表示するとキャラが小さすぎる。
    // CSS上の表示比率に合わせて、見える横幅だけを狭めることで、ゲーム画面全体を拡大して見せる。
    const rect = gameContainer.getBoundingClientRect();
    const cssW = Math.max(1, rect.width || window.innerWidth || BASE_VIEW_W);
    const cssH = Math.max(1, rect.height || window.innerHeight || H);
    const cssAspect = cssW / cssH;
    W = Math.round(clamp(H * cssAspect, MIN_PORTRAIT_VIEW_W, BASE_VIEW_W));

    const targetW = Math.round(W * dpr);
    const targetH = Math.round(H * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
    }

    canvas.style.width = '100%';
    canvas.style.height = '100%';
    prepareCanvasContext();

    if (gameStarted) {
        cameraX = clamp(hero.x + hero.w / 2 - W * 0.42, 0, WORLD_WIDTH - W);
    }
}

function prepareCanvasContext() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // ステージも画像も自然に見えるよう、全体で高品質補間を有効にします。
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
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
    goalSequence = null;
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

    if (goalSequence) {
        updateGoalSequence(dt);
        updateHud();
        return;
    }

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
        startGoalSequence();
    }
}

function startGoalSequence() {
    if (goalSequence) return;
    goalSequence = { phase: 'slide', timer: 0 };
    hero.vx = 0;
    hero.vy = 0;
    hero.facing = 1;
    hero.invincible = 9999;
    hero.x = goal.x - hero.w + 8;
}

function updateGoalSequence(dt) {
    goalSequence.timer += dt;

    if (goalSequence.phase === 'slide') {
        hero.vx = 0;
        hero.vy = 0;
        hero.x = goal.x - hero.w + 8;
        hero.y = Math.min(FLOOR_Y - hero.h, hero.y + 3.1 * dt);
        if (hero.y >= FLOOR_Y - hero.h - 0.5) {
            hero.y = FLOOR_Y - hero.h;
            goalSequence.phase = 'walk';
            goalSequence.timer = 0;
        }
    } else if (goalSequence.phase === 'walk') {
        hero.vx = 2.2;
        hero.x += hero.vx * dt;
        hero.y = FLOOR_Y - hero.h;
        hero.facing = 1;
        if (hero.x > goalHouse.x + goalHouse.w * 0.48) {
            goalSequence.phase = 'enter';
            goalSequence.timer = 0;
            hero.vx = 0;
        }
    } else if (goalSequence.phase === 'enter') {
        hero.vx = 0;
        hero.y = FLOOR_Y - hero.h;
        if (goalSequence.timer > 26) {
            endGame('CLEAR!', `ゴールしました。コイン ${state.coins} 枚獲得。`, true);
        }
    }

    cameraX = clamp(hero.x + hero.w / 2 - W * 0.42, 0, WORLD_WIDTH - W);
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
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#6db7ff');
    sky.addColorStop(1, '#b9e9ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    drawSoftCloud(130 - cameraX * 0.15, 88, 1.0);
    drawSoftCloud(560 - cameraX * 0.12, 64, 0.75);
    drawSoftCloud(910 - cameraX * 0.18, 124, 0.85);
}

function drawBackgroundHills() {
    for (let x = -200; x < WORLD_WIDTH + 400; x += 520) {
        const base = FLOOR_Y;
        drawSmoothHill(x + 120, base, 1.0);
        drawSmoothBush(x + 340, base + 10, 1.0);
    }
}

function drawSoftCloud(x, y, scale) {
    ctx.save();
    ctx.translate(Math.round(wrapParallax(x, -260, W + 260)), Math.round(y));
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    ctx.beginPath();
    ctx.ellipse(0, 28, 32, 22, 0, 0, Math.PI * 2);
    ctx.ellipse(34, 18, 42, 30, 0, 0, Math.PI * 2);
    ctx.ellipse(78, 30, 34, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(218, 240, 255, 0.75)';
    roundRect(-18, 34, 120, 18, 9);
    ctx.fill();
    ctx.restore();
}

function drawSmoothHill(x, base, scale) {
    ctx.save();
    ctx.translate(x, base);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#36b24a';
    ctx.beginPath();
    ctx.moveTo(-60, 0);
    ctx.quadraticCurveTo(70, -150, 230, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.20)';
    ctx.beginPath();
    ctx.ellipse(72, -82, 22, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawSmoothBush(x, y, scale) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(scale, scale);
    ctx.fillStyle = '#21a83b';
    ctx.beginPath();
    ctx.ellipse(20, -16, 28, 19, 0, 0, Math.PI * 2);
    ctx.ellipse(58, -25, 36, 26, 0, 0, Math.PI * 2);
    ctx.ellipse(96, -16, 28, 19, 0, 0, Math.PI * 2);
    ctx.fill();
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
    const cols = Math.round(p.w / TILE);
    const rows = Math.round(p.h / TILE);
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            drawGroundTile(p.x + col * TILE, p.y + row * TILE, row === 0);
        }
    }
}

function drawGroundTile(x, y, isTop) {
    ctx.fillStyle = isTop ? '#58b947' : '#b56632';
    px(x, y, TILE, TILE);
    ctx.fillStyle = isTop ? '#7ed957' : '#d78a45';
    px(x + 2, y + 2, TILE - 4, 5);
    ctx.fillStyle = isTop ? '#2f7f32' : '#7a3d22';
    px(x, y, TILE, 2);
    px(x, y + TILE - 2, TILE, 2);
    px(x, y, 2, TILE);
    px(x + TILE - 2, y, 2, TILE);
    if (!isTop) {
        ctx.fillStyle = 'rgba(80, 35, 16, 0.45)';
        px(x + 8, y + 13, 14, 4);
        px(x + 20, y + 24, 8, 3);
    }
}

function drawBrick(p) {
    const cols = Math.round(p.w / TILE);
    const rows = Math.max(1, Math.round(p.h / TILE));
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            drawBrickBlock(p.x + col * TILE, p.y + row * TILE);
        }
    }
}

function drawBrickBlock(x, y) {
    ctx.fillStyle = '#c96a32';
    px(x, y, TILE, TILE);
    ctx.fillStyle = '#f0a35d';
    px(x + 3, y + 3, TILE - 6, 6);
    ctx.fillStyle = '#79351c';
    px(x, y, TILE, 2);
    px(x, y + TILE - 2, TILE, 2);
    px(x, y, 2, TILE);
    px(x + TILE - 2, y, 2, TILE);
    px(x + 4, y + 16, TILE - 8, 2);
    px(x + 16, y + 5, 2, 11);
    px(x + 8, y + 18, 2, 12);
    px(x + 24, y + 18, 2, 12);
}

function drawQuestionBlocks(p) {
    const cols = Math.round(p.w / TILE);
    const rows = Math.max(1, Math.round(p.h / TILE));
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            drawQuestionBlock(p.x + col * TILE, p.y + row * TILE);
        }
    }
}

function drawQuestionBlock(x, y) {
    ctx.fillStyle = '#f0ad2e';
    px(x, y, TILE, TILE);
    ctx.fillStyle = '#ffd66a';
    px(x + 3, y + 3, TILE - 6, 6);
    ctx.fillStyle = '#8a5a10';
    px(x, y, TILE, 2);
    px(x, y + TILE - 2, TILE, 2);
    px(x, y, 2, TILE);
    px(x + TILE - 2, y, 2, TILE);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x + TILE / 2, y + TILE / 2 + 1);
}

function drawPipe(p) {
    // 当たり判定と同じ幅の本体。上部キャップだけ左右にTILE/2広げる。
    const capX = p.x - TILE / 2;
    const capW = p.w + TILE;
    ctx.fillStyle = '#0a6f30';
    roundRect(capX, p.y, capW, TILE, 6);
    ctx.fill();
    ctx.fillStyle = '#16a34a';
    roundRect(p.x, p.y + TILE * 0.65, p.w, p.h - TILE * 0.65, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
    px(p.x + 10, p.y + TILE + 4, 12, Math.max(8, p.h - TILE - 10));
    ctx.fillStyle = '#064e24';
    px(capX, p.y + TILE - 5, capW, 5);
    px(p.x + p.w - 8, p.y + TILE, 5, p.h - TILE);
}

function drawStep(p) {
    drawBrick(p);
}

function drawGoal() {
    if (!isVisible(goal.x - 80, 420)) return;

    drawGoalHouse();

    ctx.fillStyle = '#f8fbff';
    px(goal.x, goal.y, goal.w * 0.42, goal.h);
    ctx.fillStyle = '#d1d5db';
    px(goal.x + goal.w * 0.42 - 4, goal.y, 4, goal.h);
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(goal.x + goal.w * 0.42, goal.y + TILE);
    ctx.lineTo(goal.x + goal.w * 0.42 + TILE * 3.6, goal.y + TILE * 1.55);
    ctx.lineTo(goal.x + goal.w * 0.42, goal.y + TILE * 2.15);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#b56632';
    px(goal.x - 12, goal.y + goal.h, goal.w + 24, 12);
}

function drawGoalHouse() {
    const h = goalHouse;
    ctx.fillStyle = '#8b5a2b';
    roundRect(h.x, h.y + TILE, h.w, h.h - TILE, 6);
    ctx.fill();
    ctx.fillStyle = '#a13d2d';
    ctx.beginPath();
    ctx.moveTo(h.x - 16, h.y + TILE + 4);
    ctx.lineTo(h.x + h.w / 2, h.y - 10);
    ctx.lineTo(h.x + h.w + 16, h.y + TILE + 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#5b3218';
    roundRect(h.x + h.w / 2 - 18, h.y + h.h - 46, 36, 46, 5);
    ctx.fill();
    ctx.fillStyle = '#f6d365';
    roundRect(h.x + 18, h.y + TILE + 22, 30, 24, 4);
    ctx.fill();
    roundRect(h.x + h.w - 48, h.y + TILE + 22, 30, 24, 4);
    ctx.fill();
}

function drawCoins() {
    for (const coin of coins) {
        if (coin.taken || !isVisible(coin.x - coin.r, coin.r * 2)) continue;
        drawSmoothCoin(coin.x, coin.y, coin.r);
    }
}

function drawSmoothCoin(x, y, r) {
    ctx.fillStyle = '#f9c74f';
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.78, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b7791f';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.25, y - r * 0.32, r * 0.18, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
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
    if (!goalSequence && hero.invincible > 0 && Math.floor(hero.invincible / 6) % 2 === 0) return;

    const currentImg = getHeroFrame();

    ctx.save();
    ctx.translate(Math.round(hero.x + hero.w / 2), Math.round(hero.y + hero.h / 2));
    if (hero.facing < 0) ctx.scale(-1, 1);

    if (isLoadedImage(currentImg)) {
        const drawW = hero.drawW || hero.w;
        const drawH = hero.drawH || hero.h;
        const drawX = -drawW / 2;
        const drawY = hero.h / 2 - drawH;
        drawImageContain(currentImg, drawX, drawY, drawW, drawH, true);
    } else {
        drawFallbackHero();
    }

    ctx.restore();
}

function getHeroFrame() {
    const moving = Math.abs(hero.vx) > 0.25 || Boolean(goalSequence && goalSequence.phase === 'walk');

    // 画像切り替えは「停止中」と「移動中」の2種類だけに固定。
    // 距離やブロック単位でパラパラ切り替わる歩行アニメは行いません。
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
    ctx.imageSmoothingEnabled = true;
}

function isLoadedImage(img) {
    return img && img.complete && img.naturalWidth > 0;
}

function px(x, y, w, h) {
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function roundRect(x, y, w, h, radius) {
    const r = Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h), r);
        return;
    }
    const rx = Math.round(x);
    const ry = Math.round(y);
    const rw = Math.round(w);
    const rh = Math.round(h);
    ctx.moveTo(rx + r, ry);
    ctx.lineTo(rx + rw - r, ry);
    ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + r);
    ctx.lineTo(rx + rw, ry + rh - r);
    ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - r, ry + rh);
    ctx.lineTo(rx + r, ry + rh);
    ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r);
    ctx.lineTo(rx, ry + r);
    ctx.quadraticCurveTo(rx, ry, rx + r, ry);
}

function getPlatformHitbox(p) {
    if (p.kind === 'pipe') {
        // drawPipe() は上フチを左右にTILE/2広げて描くため、判定も同じ幅に合わせる。
        return { x: p.x - TILE / 2, y: p.y, w: p.w + TILE, h: p.h };
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


function isLineInAppBrowser() {
    return /Line\//i.test(navigator.userAgent || '');
}

function openExternalBrowser() {
    const url = location.href.split('#')[0];
    const isAndroid = /Android/i.test(navigator.userAgent || '');

    if (isAndroid) {
        const parsed = new URL(url);
        const scheme = parsed.protocol.replace(':', '');
        const path = `${parsed.host}${parsed.pathname}${parsed.search}`;
        const intentUrl = `intent://${path}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
        location.href = intentUrl;
        return;
    }

    window.open(url, '_blank', 'noopener');
}

function setupLineBrowserGuard() {
    if (!browserRedirectScreen || !isLineInAppBrowser()) return;
    browserRedirectScreen.classList.remove('hidden');
    stopBgm();
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

if (openBrowserButton) openBrowserButton.addEventListener('click', openExternalBrowser);
if (continueLineButton) {
    continueLineButton.addEventListener('click', () => {
        browserRedirectScreen.classList.add('hidden');
    });
}

startButton.addEventListener('click', startGame);
retryButton.addEventListener('click', startGame);
window.addEventListener('resize', resizeCanvasForHighDpi);

hideDeprecatedPlayerPicker();
resizeCanvasForHighDpi();
updateHud();
draw();
setupLineBrowserGuard();
