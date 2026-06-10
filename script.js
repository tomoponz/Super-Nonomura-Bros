// ==========================================
// 1. YouTube API と BGM制御のセットアップ
// ==========================================
let player;
let isGameOver = false;
let loopCheckInterval;

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

function onPlayerReady(event) {
    console.log("BGMの準備が完了しました");
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

        let currentTime = player.getCurrentTime();
        
        if (!isGameOver && currentTime >= 84) {
            player.seekTo(4, true);
        }
    }, 100);
}

// ==========================================
// 2. ゲームの描画・キャラクター制御セットアップ
// ==========================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const imgMove = new Image();
imgMove.src = 'assets/images/player/player_move.png';

const imgStop = new Image();
imgStop.src = 'assets/images/player/player_stop.png';

// コースの足場（プラットフォーム）を定義
// x, y: 座標, width: 幅, height: 高さ
const platforms = [
    { x: 0, y: 440, width: 640, height: 40 },   // 地面（一番下）
    { x: 150, y: 320, width: 120, height: 20 }, // 空中の足場1
    { x: 350, y: 220, width: 120, height: 20 }, // 空中の足場2
    { x: 500, y: 120, width: 80, height: 20 }   // 空中の足場3
];

// プレイヤーの状態（重力とジャンプ力を追加）
const playerObj = {
    x: 50,               // 初期位置X
    y: 100,              // 初期位置Y（空中からスタートして落下させます）
    width: 64,           
    height: 64,          
    speed: 5,            // 左右の移動スピード
    vy: 0,               // ★Y軸方向の速度（落下速度）
    gravity: 0.5,        // ★重力の強さ
    jumpPower: -12,      // ★ジャンプ力（マイナスで上方向へ）
    isGrounded: false,   // ★地面に着地しているかどうかのフラグ
    isMoving: false,     
    facingRight: true    
};

const keys = {};
window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });


// ==========================================
// 3. ゲームのメインループ（移動・描画・判定）
// ==========================================

document.getElementById('start-button').addEventListener('click', () => {
    document.getElementById('start-screen').style.display = 'none';
    isGameOver = false;
    
    player.seekTo(4, true);
    player.playVideo();

    requestAnimationFrame(gameLoop);
});

function onGameOver() {
    if (isGameOver) return; 
    
    isGameOver = true;
    player.seekTo(84, true); 
    console.log("ゲームオーバー：84秒以降を再生中");
}

function gameLoop() {
    if (!isGameOver) {
        update(); 
    }
    draw();       
    requestAnimationFrame(gameLoop);
}

// ★2つの四角形が重なっているかを判定する便利関数
function checkCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

// キャラクターの移動・当たり判定処理
function update() {
    playerObj.isMoving = false; 

    // --- 1. X軸（左右）の移動と当たり判定 ---
    let nextX = playerObj.x;
    if (keys['ArrowRight']) {
        nextX += playerObj.speed;
        playerObj.isMoving = true;
        playerObj.facingRight = true;
    }
    if (keys['ArrowLeft']) {
        nextX -= playerObj.speed;
        playerObj.isMoving = true;
        playerObj.facingRight = false;
    }

    // 壁にぶつかったら移動させない処理
    for (let p of platforms) {
        // 次に移動する予定の座標で当たり判定をテスト
        if (checkCollision({x: nextX, y: playerObj.y, width: playerObj.width, height: playerObj.height}, p)) {
            if (nextX > playerObj.x) nextX = p.x - playerObj.width; // 右の壁にぶつかった
            else if (nextX < playerObj.x) nextX = p.x + p.width;    // 左の壁にぶつかった
        }
    }
    playerObj.x = nextX; // 判定後の安全な座標を確定

    // 画面外制限（左右）
    if (playerObj.x < 0) playerObj.x = 0;
    if (playerObj.x + playerObj.width > canvas.width) playerObj.x = canvas.width - playerObj.width;


    // --- 2. Y軸（ジャンプ・重力）の移動と当たり判定 ---
    // 地面にいる時に「上矢印キー」でジャンプ
    if (keys['ArrowUp'] && playerObj.isGrounded) {
        playerObj.vy = playerObj.jumpPower;
        playerObj.isGrounded = false; // 空中状態へ
    }

    // 重力を加えて落下させる
    playerObj.vy += playerObj.gravity;
    let nextY = playerObj.y + playerObj.vy;
    playerObj.isGrounded = false; // 一旦空中状態と仮定する

    // 床や天井との当たり判定
    for (let p of platforms) {
        if (checkCollision({x: playerObj.x, y: nextY, width: playerObj.width, height: playerObj.height}, p)) {
            if (playerObj.vy > 0) { 
                // 下に落ちていて床にぶつかった場合（着地）
                nextY = p.y - playerObj.height; // 床の上に位置を補正
                playerObj.isGrounded = true;    // 着地フラグを立てる
                playerObj.vy = 0;               // 落下速度をリセット
            } else if (playerObj.vy < 0) {
                // 上にジャンプしていて天井にぶつかった場合
                nextY = p.y + p.height;         // 天井の下に位置を補正
                playerObj.vy = 0;               // 上昇速度をリセット（落下し始める）
            }
        }
    }
    playerObj.y = nextY; // 判定後の安全なY座標を確定


    // 開発テスト用：スペースキーを押すと強制ゲームオーバー
    if (keys['Space']) {
        onGameOver();
    }
}

// 描画処理
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // --- ★コース（足場）の描画 ---
    ctx.fillStyle = '#8B4513'; // ブロックの色（茶色）
    for (let p of platforms) {
        ctx.fillRect(p.x, p.y, p.width, p.height);
        // ブロックの枠線を描画して見やすくする
        ctx.strokeStyle = '#5c2e0b';
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x, p.y, p.width, p.height);
    }

    // --- プレイヤーの描画 ---
    const currentImg = playerObj.isMoving ? imgMove : imgStop;
    if (!currentImg.complete) return;

    ctx.save();
    if (playerObj.facingRight) {
        ctx.drawImage(currentImg, playerObj.x, playerObj.y, playerObj.width, playerObj.height);
    } else {
        ctx.scale(-1, 1);
        ctx.drawImage(currentImg, -playerObj.x - playerObj.width, playerObj.y, playerObj.width, playerObj.height);
    }
    ctx.restore(); 
}
