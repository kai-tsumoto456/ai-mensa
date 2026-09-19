# AI Mensa（AIメンサ）

**自分が AI をどう使っているかが分かるツールです。** 手元にある AI ツールのログと設定を読み、使い方を採点して（**AIQ**）、エージェントのハーネス（指示ファイル・skill・hooks・MCP・権限）の状況を表示します。処理はすべて自分のマシンの中で完結します。

[English README](README.md)

```bash
npx ai-mensa
```

実行するとログを読み込み、`http://127.0.0.1:4319` でダッシュボードが開きます。

## できること

- **AIQ**：70〜150 の総合スコアです。130 以上は「メンサ級」と表示します。
- **6つの評価軸**：軸ごとに、根拠になった数値と具体的な改善アドバイスが出ます。

  | 軸 | 見ているもの |
  |---|---|
  | 指示力 | 指示の長さ、最初の指示にファイル・URL・要件が入っているか、訂正の割合 |
  | 委任力 | 1回の指示あたりのツール実行数、サブエージェントの利用、長い自律実行 |
  | 協働効率 | 実行の中断、ツールの失敗率、訂正が続くセッション、プロンプトキャッシュの再利用率 |
  | ハーネス整備度 | 指示ファイル・skill・hooks・MCP・権限があるか、入れた skill・MCP のうち実際に使われている割合 |
  | 活用の幅 | 使っているツール・プロジェクト・モデル・タスクの種類 |
  | 継続性 | 利用日数、週あたりのセッション数、連続利用日数 |

- **セッション一覧**：ツールをまたいだ全会話を、発言・ツール実行・エラー・中断・トークン数つきで見られます。
- **ハーネス**：ツールごとに、指示ファイル・skill・エージェント・コマンド・hooks・MCP サーバー・権限ルール・プラグインを一覧にします。最終更新日と実際に使われた回数も出し、使われていない skill や MCP には印を付けます。
- **LLM による評価（任意）**：伏せ字処理したセッションの要約を LLM に読ませ、指示力・委任力・協働効率を講評つきで採点します。**自分の API キー**を使い、指示したときだけ動きます。

## 対応ツール

| ツール | 読むもの | 方法 |
|---|---|---|
| Claude Code | `~/.claude/projects/**/*.jsonl`、`CLAUDE.md`、skills、agents、commands、`settings.json`、MCP 設定 | 自動 |
| Codex CLI | `~/.codex/sessions`、`archived_sessions`、`AGENTS.md`、`config.toml`、skills、prompts | 自動 |
| Cursor | `state.vscdb`（読み取り専用で開く）、`.cursor/rules`、`.cursorrules`、`mcp.json` | 自動 |
| ChatGPT | 設定 → データコントロール → エクスポート で届く `conversations.json` | `npx ai-mensa import chatgpt-export.zip` |
| Claude.ai | 設定 → プライバシー → データをエクスポート で届く `conversations.json` | `npx ai-mensa import claude-export.zip` |

プロジェクト単位のハーネス（各リポジトリの `CLAUDE.md` や `.cursor/rules` など）は、セッションの作業ディレクトリから見つけます。

## コマンド

```bash
npx ai-mensa                    # 読み込み＋ダッシュボード（--port, --no-open, --since <日数>）
npx ai-mensa scan               # 読み込んでターミナルに AIQ を表示
npx ai-mensa doctor             # 検出できたツールと、設定済みの API キーを表示
npx ai-mensa import <file>      # ChatGPT / Claude.ai のエクスポート（.zip か conversations.json）
npx ai-mensa score              # LLM 評価（--provider, --sample, --lang, --yes）
```

## LLM 評価（API キーは各自で用意）

次のどれかを設定して再起動してください。

| プロバイダ | 環境変数 | 既定のモデル |
|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | `claude-sonnet-5` |
| OpenAI | `OPENAI_API_KEY` | `gpt-5.4-mini` |
| Google | `GEMINI_API_KEY` | `gemini-flash-latest` |

モデルは `AI_MENSA_MODEL` で変えられます。送信する前に「何セッション分・約何トークンを、どのプロバイダに送るか」を表示し、確認を求めます。

送る内容は、直近のセッション最大12件（変更可）の要約です。自分の指示は600字まで、AI の返答は200字まで切り詰め、あとはツール実行の回数だけを含めます。API キー・トークン・メールアドレス・ホームディレクトリのパスは送る前に伏せ字にします。LLM の採点があるときは、その3軸を「統計スコアと LLM スコアの平均」で表示します。

## プライバシー

- すべてローカルで動きます。サーバーは `127.0.0.1` にだけ bind し、ループバック以外の `Host` ヘッダーは拒否します。書き込み系のリクエストには独自ヘッダーを必須にしているので、他の Web サイトからログを読まれたり、採点を勝手に実行されたりすることはありません。
- テレメトリはありません。外部への通信は、自分で開始した LLM 評価だけです。
- ログと Cursor のデータベースは読み取り専用で開きます。解析結果は `~/.ai-mensa/cache.db` にキャッシュします（`AI_MENSA_HOME` で変更可）。このフォルダを消せば、AI Mensa が保存したものはすべて消えます。

## 採点の仕組みと限界

統計スコアは経験則にもとづく近似で、しきい値は [`src/scoring/index.ts`](src/scoring/index.ts) にあります。注意点は次のとおりです。

- **訂正の検出**は、日本語と英語の短い差し戻し表現（「違う」「やり直して」「that's wrong」など）で判定します。誤検出を避けるため控えめにしてあり、丁寧に言い換えた訂正は拾えません。文脈を踏まえた判断は LLM 評価のほうで行います。
- **委任力**はエージェント型のツール（Claude Code、Codex、Cursor）だけで測ります。チャットだけを使っている人は低く出ます（意図した仕様です）。
- **skill・MCP の利用回数**は、ログに残ったツール呼び出しとスラッシュコマンドから数えます。呼び出しの記録を残さずに暗黙で読み込まれる skill は「未使用」と数えられます。
- Codex の自動レビュー（guardian）と、そこから派生したスレッドは除外しています。人が操作したセッションではないためです。

しきい値は、使う人が増えるにつれて見直していきます。匿名化した例を添えて Issue を立ててもらえると助かります。

## 開発

Node.js 22.13 以上が必要です（組み込みの `node:sqlite` を使うため）。

```bash
npm install
npm run build        # サーバー（tsc）＋ Web UI（vite）
npm test             # vitest。テストデータはすべて合成したもの
node bin/ai-mensa.js # ローカルのビルドを実行
npm run dev:web      # UI の開発サーバー（:5173、/api は :4319 に転送）
```

構成：

```
src/adapters/<tool>/   ツールごとのアダプタ：detect, listSources, parse, scanHarness
src/core/              共通データ形式、SQLite キャッシュ、読み込み処理、import
src/scoring/           指標、6軸、AIQ、アドバイス
src/llm/               各プロバイダ（BYOK）、伏せ字処理、プロンプト、JSON の厳密な検証
src/server/            Hono の API と静的 UI の配信
web/                   React UI
```

ツールを追加するときは、共通の `Session` 形式（`src/core/types.ts`）を返すアダプタを1つ書き、`src/adapters/index.ts` に登録します。

## ライセンス

MIT
