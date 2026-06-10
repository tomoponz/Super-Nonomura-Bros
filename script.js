
// ==========================================
// 1. YouTube API と BGM制御のセットアップ
// ==========================================
let player;
let isGameOver = false;
let loopCheckInterval;

// 対象のYouTube動画ID（URLの v= の後の文字列）を指定してください
const VIDEO_ID = 'vHbkhn2AI8g&t=1s'; 

// YouTube APIのコードが読み込まれると自動的に実行される関数
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

// プレイヤーの準備が完了した時の処理
function onPlayerReady(event) {
    // 準備ができたらスタートボタンを押せるようにするなどの処理を入れると親切です
    console.log("BGMの準備が完了しました");
}

// 動画の再生状態が変わった時の処理
function onPlayerStateChange(event) {
    // 再生中（PLAYING: 1）になったらループ監視を開始
    if (event.data === YT.PlayerState.PLAYING) {
        startLoopCheck();
    } else {
        clearInterval(loopCheckInterval);
    }
}

// 4秒〜84秒のループを監視する処理
function startLoopCheck() {
    clearInterval(loopCheckInterval);
    loopCheckInterval = setInterval(() => {
        if (!player || typeof player.getCurrentTime !== 'function') return;

        let currentTime = player.getCurrentTime();
        
        // 通常時：84秒を超えたら強制的に4秒に戻す
        if (!isGameOver && currentTime >= 84) {
            player.seekTo(4, true);
        }
    }, 100); // 0.1秒ごとにチェック
}


// ==========================================
// 2. ゲーム画面のイベントと連携
// ==========================================

// スタートボタンが押された時の処理
document.getElementById('start-button').addEventListener('click', () => {
    // スタート画面を隠す
    document.getElementById('start-screen').style.display = 'none';
    
    // ゲーム初期化
    isGameOver = false;
    
    // BGMを4秒目から再生開始（ユーザーのクリックイベント内なので再生が許可される）
    player.seekTo(4, true);
    player.playVideo();

    // ※ここにゲームのメインループ（敵を動かすなど）の開始処理を書く
});

// 敵に触れた（ゲームオーバー）時の処理
function onGameOver() {
    if (isGameOver) return; // 二重実行を防止
    
    isGameOver = true;
    
    // 強制的に84秒（1分24秒）の位置に飛ばし、垂れ流す
    player.seekTo(84, true);
    
    console.log("ゲームオーバー：84秒以降を再生中");

    // ※ここにプレイヤーの動きを止める、泣き叫ぶ画像を表示するなどの演出を書く
}

// ==========================================
// 3. ゲームのメインループ（モックアップ）
// ==========================================
// ※実際にはここにCanvasを使った当たり判定などを書いていきます

/* // 当たり判定のイメージ
function gameLoop() {
    if (!isGameOver) {
        updatePlayerPosition();
        updateEnemyPosition();
        
        if (checkCollision(player, enemy)) {
            onGameOver(); // 当たったらBGMを飛ばす
        }
    }
    requestAnimationFrame(gameLoop);
}
*/
