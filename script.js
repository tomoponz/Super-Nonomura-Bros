// ==========================================
// 1. YouTube API と BGM制御のセットアップ
// ==========================================
let player;
let isGameOver = false;
let loopCheckInterval;

// 動画ID（&t=1s などのパラメータは外し、純粋なIDのみを指定します）
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
        
        // 通常時：84秒（1分24秒）を超えたら強制的に4秒に戻す
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

// 画像の読み込み（パスは指定された階層構造に準拠）
const imgMove = new Image();
imgMove.src = 'assets/images/player/player_move.png';

const imgStop = new Image();
imgStop.src = 'assets/images/player/player_stop.png';

// プレイヤーの状態を管理するオブジェクト
const playerObj = {
    x: canvas.width / 2, // 初期位置X
    y: 350,              // 初期位置Y
    width: 64,           // ※画像のサイズに合わせて調整してください
    height: 64,          // ※画像のサイズに合わせて調整してください
    speed: 5,            // 移動スピード
    isMoving: false,     // 動いているかどうかのフラグ
    facingRight: true    // 右を向いているかどうかのフラグ（true=右, false=左）
};

// キーボード入力を監視
const keys = {};
window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });


// ==========================================
// 3. ゲームのメインループ（移動・描画・判定）
// ==========================================

// スタートボタンが押された時の処理
document.getElementById('start-button').addEventListener('click', () => {
    document.getElementById('start-screen').style.display = 'none';
    isGameOver = false;
    
    // BGMを4秒目から再生
    player.seekTo(4, true);
    player.playVideo();

    // ゲームループ開始
    requestAnimationFrame(gameLoop);
});

// ゲームオーバー処理
function onGameOver() {
    if (isGameOver) return; 
    
    isGameOver = true;
    player.seekTo(84, true); // 例のシーンへ
    console.log("ゲームオーバー：84秒以降を再生中");
}

// 毎フレーム実行されるメインループ
function gameLoop() {
    if (!isGameOver) {
        update(); // 座標の更新
    }
    draw();       // 画面の描画
    requestAnimationFrame(gameLoop);
}

// キャラクターの移動・状態更新処理
function update() {
    playerObj.isMoving = false; // 一旦停止状態にする

    // 右移動
    if (keys['ArrowRight']) {
        playerObj.x += playerObj.speed;
        playerObj.isMoving = true;
        playerObj.facingRight = true; // 右向きとして記憶
    }
    // 左移動
    if (keys['ArrowLeft']) {
        playerObj.x -= playerObj.speed;
        playerObj.isMoving = true;
        playerObj.facingRight = false; // 左向きとして記憶
    }

    // 画面外に出ないようにする制限（必要に応じて）
    if (playerObj.x < 0) playerObj.x = 0;
    if (playerObj.x + playerObj.width > canvas.width) playerObj.x = canvas.width - playerObj.width;

    // ※ここに敵との当たり判定（checkCollisionなど）を追加し、当たったら onGameOver() を呼ぶ
    // 開発テスト用：スペースキーを押すと強制ゲームオーバー
    if (keys['Space']) {
        onGameOver();
    }
}

// 描画処理
function draw() {
    // 画面を一度クリア（背景色で塗りつぶすなどでも可）
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 状態に合わせて使う画像を決定
    const currentImg = playerObj.isMoving ? imgMove : imgStop;

    // 画像がまだ読み込まれていなければ描画をスキップ
    if (!currentImg.complete) return;

    ctx.save(); // 現在の描画設定を保存

    if (playerObj.facingRight) {
        // 右向き（デフォルト）の場合はそのまま描画
        ctx.drawImage(currentImg, playerObj.x, playerObj.y, playerObj.width, playerObj.height);
    } else {
        // 左向きの場合はキャンバスを反転させて描画
        ctx.scale(-1, 1);
        // 座標も反転するため、X座標をマイナスにして画像幅分ズラす必要がある
        ctx.drawImage(currentImg, -playerObj.x - playerObj.width, playerObj.y, playerObj.width, playerObj.height);
    }

    ctx.restore(); // 保存した描画設定に戻す（これをしないと背景なども反転し続ける）
}
