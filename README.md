# BODY ROAD

身体の輪郭からコースを作り、スマホ2台でハンドルとペダルを分担する協力ゲーム。
現在は開発用ひな形です。撮影・画像処理・3Dゲーム・ルーム参加・QR・DB保存は未実装です。

## 開発環境

- Node.js 24.16.0（`.nvmrc`） / npm
- React / TypeScript / Vite / Three.js
- Socket.IO / Node.js
- ESLint / Prettier

## 起動

```sh
npm ci
cp .env.example .env
npm run dev
```

Web（通常 http://localhost:5173）と通信サーバー（http://localhost:3001）を同時起動します。
Webの接続表示が「サーバー接続済み」ならSocket.IOへの接続が成功しています。
`.env` は省略可能。変更したら開発サーバーを再起動してください。

同じWi-Fiのスマホでは、Viteが表示するNetworkのURLを開きます。
既定ではWeb経由でSocket.IOへ接続するため、スマホ用の接続URL設定は不要です。
ルーム・操作同期・QR生成は今後実装します。カメラや傾きセンサーの利用時は、実機ブラウザのHTTPS・権限要件を確認してください。

別々に起動する場合は `npm run dev:web` と `npm run dev:server`。
PORTを変える場合は `vite.config.ts` のproxyも合わせて変更してください。
VITE_SOCKET_URLを明示して別オリジンへ接続する場合は、サーバーのCLIENT_ORIGINにもWebのオリジンを設定してください。
VITE_から始まる環境変数はブラウザに公開されます。秘密鍵を入れないでください。

## 確認コマンド

```sh
npm run typecheck
npm run lint
npm run format:check
npm run build
```

`npm run format` で書式を揃えます。ビルド成果物はフロントエンドの `dist/`。
通信サーバーは別プロセスで `npm run start:server` を実行します（tsxが必要）。
`npm run preview` はフロントエンドの確認用です。公開時は `/socket.io` のリバースプロキシ、またはVITE_SOCKET_URLとCORSを設定してください。公開環境の構築は含みません。

## 構成と分担

- `src/pages/`: 各画面の入口
- `src/components/`: 共通UI
- `src/game/`: Three.js・道路・車両・荷物（あやか）
- `src/image-processing/`: 画像からCourseDataを作る処理（ゆりえ）
- `src/socket/`: ブラウザ側の通信
- `src/hooks/`: センサーなどのReact用処理
- `src/fixtures/`: サンプルコース
- `shared/`: 共通のコース型・通信型
- `server/`: Socket.IOサーバーと今後のルーム管理
- `public/`: モデル・テクスチャ・音声
- `docs/course-data.md`: DB設計に合わせた共通仕様と未確定事項

TODOファイルは処理の配置場所のみです。ゲーム実装済みを意味しません。
元のJPHACKS提出用テンプレートは `docs/jphacks-template.md` に残しています。
