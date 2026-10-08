# Kikkake

東京の体験コミュニティー。[仕様書](docs/仕様書.md)を基に、会員登録・ログイン・企画投稿・参加申請・承認・開催進行・グループチャットを実装しています。

## Codexクラウドで開発する

Node.js **24以上**（組み込みSQLite）/ npm 11。既存の `/workspace/kikkake` を使用してください。外部サービスのAPIキーは不要です。

```sh
cd /workspace/kikkake
npm ci
npm run api                         # ターミナル1: API、ポート3001
npm run dev -- --port 5173           # ターミナル2: 画面、APIへプロキシ
```

初期データベースは空です。マイページから登録してください。登録直後は閲覧のみです。投稿・参加・チャットには本人確認が必要です。利用者や運営への切り替え機能はありません。

## 本人確認と運営権限

本人確認サービスとの連携は未実装です。信頼できる運営が適切な確認を行った後、**サーバー管理者だけ**が次を実行します。ブラウザから自己承認・運営権限付与はできません。

```sh
node scripts/admin.js verify user@example.com
node scripts/admin.js unverify user@example.com
node scripts/admin.js promote operator@example.com
node scripts/admin.js demote operator@example.com
```

開発テストで架空のアカウントを確認済みにする場合も同じ手順です。公開環境で未確認の利用者に実行しないでください。変更履歴はauditテーブルに記録します。

## データと通信

SQLite: `data/kikkake.sqlite`（`DB_PATH`で変更可能）。ユーザー・セッション・企画・応募・承認・メッセージ・通知を保持し、更新をトランザクションで処理します。WALモード。データベースはGitに含めません。運用では永続ディスク、容量監視、SQLiteバックアップAPI等による整合性のあるバックアップが必要です。単一Nodeプロセス向けで、水平分散には対応していません。

チャットはHTTP POSTで保存し、SSEが接続した利用者へ「変更あり」だけを通知します。クライアントが権限で絞られた最新データを取得します。SSEにメッセージ本文や応募理由は含みません。切断後はEventSourceが再接続し、最新状態を取得します。作成・参加承認は投稿者限定、運営承認は運営限定、チャット読み書きは本人確認済みの承認参加者限定です。未承認利用者に応募理由・メッセージ・詳細な集合場所を返しません。

認証はscryptでハッシュしたパスワードと7日有効のHttpOnly/SameSite Cookieを使用します。DBにはセッショントークンのハッシュを保存します。書き込みAPIはOriginとセッション単位のCSRFトークンを検証します。認証と投稿にプロセス内レート制限があります。

## 検証

```sh
npm test
npm run build
```

モデルテストに加え、HTTP APIで本人確認制限・不正な権限付与・CSRF・応募承認・定員・閲覧制限・開催確定・SQLite再起動保持・ログアウト・SSEを検証します。

## 本番の起動例（未デプロイ）

```sh
npm run build
NODE_ENV=production APP_ORIGIN=https://your-domain.example PORT=3001 DB_PATH=/persistent/kikkake.sqlite npm start
```

同じNodeサーバーが `dist/` とAPIを提供します。HTTPS終端プロキシが必要です。`APP_ORIGIN` はブラウザがアクセスする正確なオリジン（末尾スラッシュなし）に設定します。本番ではCookieにSecureを付与し、HTTPS設定なしでは起動しません。プロキシでSSEのバッファリングを無効にしてください。開発時の既定オリジンは `http://localhost:5173` です。

## 残る公開前の作業

メール・電話認証、本人/学生確認サービス、規約とプライバシーポリシーへの同意フロー、運営管理画面、パスワード再設定、個人チャット、画像、申請編集・保留・見送り、通報とブロック、キャンセル、アンケート、メール通知、データ削除/保存期間は未実装です。登録時は年齢条件を自己申告しますが正式な年齢確認は運営確認工程で必要です。現在は開発版であり、この実装だけで一般公開に必要な機能が揃ったことにはなりません。
