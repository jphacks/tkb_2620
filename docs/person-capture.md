# 人物写真の選択（Issue #2）

「写真」→「写真を選ぶ」→全身判定→「この写真を使う」。携帯で撮影済みの写真を使う方式。
カメラは起動しない。写真の選び直し・判定の再試行・読み込みキャンセルに対応する。
ファイル選択のキャンセルは元の写真を保持する。画面離脱や新しい写真の選択後に古い判定結果を反映しない。

## 画像と判定結果の受け渡し

`CapturedPerson` を `App` のstateで保持し、`CapturePage.onConfirm` で確定する。
`blob` は画像の向きを適用し、長辺を最大2048pxに縮小したPNG。切り抜き・鏡像化はしない。
`width` / `height` は変換後の寸法。輪郭処理はこのPNGを入力とする。
`bodyStatus` は `full_body` / `clipped` / `unknown`、`recognitionMessage` は判定の説明。
`capturedAt` は読み込み時刻。リロードすると写真は消える。
輪郭処理は次のIssueで `createImageBitmap(image.blob)` から開始できる。

## 認識

MediaPipe Pose Landmarker LiteをIMAGEモードで実行する。写真の選択ごとに一度判定する。
顔・肩・肘・手首・腰・膝・足首・踵・足先の可視性0.65以上と端の余白を確認する。
頭頂や服の輪郭は検出点ではないため、見切れの完全な判定ではない。
認識できないときは理由を表示し、その写真の使用も可能にする。輪郭生成は未実装。
ランタイムはjsDelivrの固定バージョン1.1.1、モデルはGoogle StorageのLite float16 v1から取得する。
写真はブラウザ内で処理し、サーバーへの送信・DB保存はしない。

20MB以下・5000万画素以下のブラウザがデコード可能な写真に対応する。
HEICなど読み込めない形式はJPEGへの変換を案内する。

## 確認

`npm run test:capture` / `npm run lint` / `npm run format:check` / `npm run build`。
実機では縦横写真・全身・見切れ・認識なし・モデル通信失敗・写真の選び直し・確定後の画面移動を確認する。
自動検査のみでは実際の写真に対する認識精度は保証しない。
