
# Docs Reader for EvenHub

Google Docs reader application for Even Realities G2 glasses.
Even Realities G2 グラスで Google ドキュメントを閲覧するためのリーダーアプリです。

- [English](#english)
- [日本語](#japanese)

---

<a name="english"></a>

# English

## 1. Features
- **Google Drive Integration**: Set a specific folder in your Google Drive to display only the plain text information of Google Docs directly on Even G2. (Assumes Google account login.)
- **Persistent Settings**: Google account login and various settings are persisted once configured.
- **Versatile Use Cases**: Usage depends on the user's imagination.
- **Auto-scroll / Auto-update**: Includes automatic scrolling and update functions (with some limitations).
- **Multilingual Character Support**: Supports both Japanese and English text using full-width characters (kanji, hiragana, katakana), half-width alphanumerics, and half-width special characters.

## 2. Regarding Certain Limitations
**Prerequisite: Do not close the Even app on your smartphone (it is okay to lock your phone).**
Additionally, behavior may become unstable due to power-saving modes on the Even G2, Even R1, or your smartphone. If this occurs, please try the following:
- Switch to another app, such as the Dashboard, from the home screen, then return to this app (you may need to make the Even app on your smartphone active at this time)
- Reactivate or reload the Even app or this app on your smartphone
- Restart the Even app on your smartphone, or restart the smartphone itself

## 3. Initial Setup for General Users

### 3.1 Note the Google Drive Folder ID
Access the Google Drive folder you want to read. The Folder ID is the part of the URL shown below:
`https://drive.google.com/drive/folders/[FOLDER_ID]`
Example: If the URL is `https://drive.google.com/drive/folders/1abc2def3ghi`, the Folder ID is `1abc2def3ghi`.

### 3.2 GCP Setup (Obtaining Client ID and Client Secret)
Configure Google Cloud Platform (GCP) so that the app can access Drive. (You must configure this yourself.)
- We recommend creating a project named “DocsReader.”
- This app handles only the information necessary for login. It does not transmit any personal information to external sources.
- Setup procedure:
  1. Access the [Google Cloud Console](https://console.cloud.google.com/) and create a new project named “DocsReader” (or use an existing project).
  2. Under **API and Services > Enabled APIs and Services**, enable the `Google Drive API` and `Google Docs API`.
  3. Configure **OAuth consent screen > Overview**.
    - Enter “DocsReader” as the app name and your own Gmail address.
    - Select “External”.
  4. Create a **OAuth consent screen > Client**.
    - **Application type**: Web application.
    - **Authorized JavaScript origins**: `https://docsreader4eh.syamcspublic.workers.dev`
    - **Authorized Redirect URIs**: `https://docsreader4eh.syamcspublic.workers.dev/` (the trailing `/` is important).
  5. Make a note of the displayed **Client ID** and **Client Secret**.
  6. Configure **OAuth Consent Screen > Audience**.
    - Set the test user’s own Google account
  7. Configure **OAuth Consent Screen > Data Access**.
    - Add `.../auth/drive` and `.../auth/documents.readonly` to the scopes. (You should be able to find them by entering `drive` and `documents` in the filter.)

### 3.3 Install PWA on PC or Smartphone
Open `https://docsreader4eh.syamcspublic.workers.dev/` in your browser.
- **PC (Chrome/Edge)**: Click the "Install" icon in the address bar.
- **Smartphone (iOS/Safari)**: Tap the "Share" button and select "Add to Home Screen".
- **Smartphone (Android/Chrome)**: Tap the menu (three dots) and select "Install app".

### 3.4 Operations in PWA App
1. Launch the app installed in 3.3 above.
2. Enter the **Google Client ID** obtained in 3.2 into the settings field.
3. Enter the **Google Client Secret** obtained in 3.2 into the settings field.
4. Enter the **Folder ID** noted in 3.1 into the "Google Drive Folder ID" settings field.
5. Tap the `Continue with Google` button.
6. Enter your Google account and password.
7. If you see the message “This app has not been verified by Google,” tap ‘Details’ or “Continue” in the lower-left corner. (Please proceed on the assumption that you trust this app.)
8. Tap "Go to DocsReader (unsafe)".
9. When "You are trying to sign in to DocsReader" appears, tap "Next".
10. When "DocsReader wants to access your Google Account" appears, allow all access and tap "Continue".
11. You will automatically return to the app screen in a logged-in state. Next time you launch the app, steps 2-10 are no longer necessary.
12. When you click the “Read on Device” button, a list of documents will appear on the device.

**Note:** The screen may go blank and display nothing following a PWA app update or similar action. If this happens, please clear your browser cache and try accessing the page again.

### 3.5 Operations in Even App (Smartphone)
1. Install this app via EvenHub.
2. Repeat steps 3.4.2 to 3.4.4 within the settings screen of the Even app.
3. In the **PWA app** (from 3.4), tap the copy icon in "My Refresh Token (Copy from here)".
4. In the **Even app**, paste the copied token into "Paste Token from another device" and tap "SAVE & RELOAD".
5. The app will reload in a logged-in state. Next time you launch the app, steps 1-4 part of this setup are no longer necessary.
6. When you press the “Sync Glasses” button, a list of documents will appear on the glasses. (The Even app on your smartphone must be running in the background, but it will work even if the screen is locked.)
7. When you press the “Close Glasses App” button, the app on the glasses will close.

## 4. How to Use

### 4.1.1 Top Screen
- **Gear Icon (Top Right)**: Opens the "App Settings" screen.
- **Refresh Icon (Top Right)**: Syncs read progress across devices using your Google Drive (Uploads/Downloads the latest state).
- **Status Bar (Top Left)**: Displays app status.
- **Log-in Info**: Displays the logged-in user icon and name. Use the "LOGOUT" button to sign out.
- **"Read on Device" Button**: Transitions to either the "Documents List" or "Content View" (most recent state).
- **"Sync Glasses" Button (Even App only)**: Displays the "Documents List" on the glasses.
- **"Close Glasses App" Button (Even App only)**: Exits the app on the glasses HUD.

### 4.1.2 App Settings Screen
- **Google Client ID**: Input field for your GCP Client ID.
- **Google Client Secret**: Input field for your GCP Client Secret.
- **Google Drive Folder ID**: Input field for the folder ID containing your Google Docs.
- **My Refresh Token (Copy from here)**: Copies the refresh token to enable login in restricted environments (like the Even app browser).
- **Paste Token from another device**: Paste a refresh token here to log in without direct authentication.
- **Clear Document Cache**: Clears the locally cached document data. Use this if updates on Google Drive do not reflect in the app. Note: This may reset the reading position of updated documents.
- **Color Theme**: Sets the color theme for PC/Smartphone screens.
- **Auto Scroll Speed**: Sets the interval for automatic scrolling in the "Content View".
- **Enable Auto Mode**: Specify whether to enable Auto Mode. (Enabling Auto Mode will increase battery consumption.)

### 4.1.3 Documents List Screen
- Displays a list of Google Docs in the specified folder.
- Shows the read percentage for each document.
- Tap a document to transition to the "Content View".
- **On Glasses**: Double-tap to cycle through modes:
  - **Normal Mode**: Shows document list (*1).
  - **One-Line Mode**: Shows only the top line of the screen (*1).
  - **Screen-Off Mode**: Hides the entire screen (*2).

### 4.1.4 Documents List (Glasses HUD Display)
- (*1) In these modes, the top line shows: "Current Time, Manual(M)/Auto(A)/Manual Locked(M:lck) Mode, Glasses Battery Level".
- **One-Line Mode actions**:
  - **Single Tap**: Refreshes the display (Time, Battery). (Auto-updates periodically in Auto mode; only on interaction in Manual mode).
  - **Scroll Up/Down**: Toggles between Manual and Auto mode (only if "Allow Auto Mode" is enabled on the smartphone). If "M:lck" is displayed, the mode is locked to Manual.
- (*2) Screen-Off mode allows for a seamless reading experience by keeping the app running in the background.

### 4.1.5 Content View Screen
- Scrolls to a point near where you last finished reading.
- **"MANUAL" / "AUTO" Buttons (PWA only)**: Switches between scroll modes.
- **Auto Scroll**: Displays a countdown until the next scroll.
- **"PREVIOUS" / "NEXT" Buttons (PWA only)**: Navigates between files. "PREVIOUS" scrolls to the bottom of the previous file; "NEXT" scrolls to the top of the next file.
- **Scroll Up (Glasses)**: Move to the previous page.
- **Scroll Down (Glasses)**: Move to the next page.
- **Double-Tap (Glasses)**: Return to the "Documents List" screen.

## 5. Privacy Policy & Disclaimer
- This app is highly experimental. Use it at your own risk.
- No income is generated from this application.
- Irreversible updates or service suspension may occur.
- This app handles only the information necessary for login. We do not collect or transmit personal information to external parties. (In other words, even if you contact us, we likely cannot provide personalized support as we cannot identify individual users.)
- To sync read progress across various devices, two files (`DocsReader4EH.datetime.txt`, `DocsReader4EH.data.json`) will be created/updated in the root of your own Google Drive. Please allow these files to exist. Modify or delete them at your own risk.
- Keep your GCP Client ID and Client Secret secure.

## 6. Developer Notes

### 6.1 Architecture
The `evenhub` package primarily handles redirection to the main application hosted on `cloudflare`. The core logic resides in the `cloudflare` directory.

### 6.2 side: Cloudflare
#### 6.2.1 Installation
```bash
cd cloudflare
npm install
```
#### 6.2.2 Local Testing
Start dev server for Cloudflare side:
```bash
cd cloudflare
npm run dev
```

Test as a PWA by accessing:  
http://localhost:5174

#### 6.2.3 Build for Production
```bash
cd cloudflare
npm run build
```

#### 6.2.4 Deployment
Deploy the `dist` folder contents to Cloudflare Pages (or similar static hosts).

#### 6.2.5 [Reference] Deployment Example
https://dash.cloudflare.com/login  

#### 6.2.6 [Reference] QR Code Creation
Run the following in a terminal with a black background:
```
npx evenhub qr --url "https://docsreader4eh.syamcspublic.workers.dev/"
```

### 6.3 side: EvenHub
#### 6.3.1 Installation
```bash
cd evenhub
npm install
```
#### 6.3.2 Local Testing
**Start the Cloudflare dev server (port 5174) before proceeding.**

Start dev server for EvenHub side (port 5173):
```bash
cd evenhub
npm run dev
```

Start the simulator in another terminal:
```bash
cd evenhub
npm run simulator
```

#### 6.3.3 Build Package for Production
```bash
cd evenhub
npm run pack
```
This generates `DocsReader4EH.ehpk`.

#### 6.3.4 Deployment
Upload the `.ehpk` file to the [EvenHub Portal](https://hub.evenrealities.com).

---

<a name="japanese"></a>

# 日本語

## 1. 本アプリの特色
- **Google ドライブ連携**: 自身のGoogleドライブの特定フォルダを設定し、フォルダ直下のGoogleドキュメントのプレーンなテキスト情報のみをEven G2に表示します。（Googleアカウントのログインを前提としています。）
- **設定の永続化**: Googleアカウントのログインや各種設定は一度設定すれば永続化されます。
- **多種多様な使い方**: ユーザのアイデア次第で使い方は多種多様です。
- **自動機能**: 一定の制限はありますが、自動スクロール/自動更新機能があります。
- **多言語文字対応**: 全角文字（漢字・ひらがな・カタカナ等）・半角英数字・半角特殊文字を使用した日本語と英語のテキスト表示に対応しています。

## 2. 一定の制限について
**前提条件：スマホ内のEvenアプリのタスクは削除しないでください（スマホのロックはOKです）。**
また、Even G2 / Even R1 / スマホそれぞれの省電力モードが起因して挙動が不安定になることがあります。この際は以下を試みてください。
- グラスメニューからダッシュボードなど別のアプリに一度切り替えてから、再度本アプリにアクセスする（このときにスマホ側のEvenアプリをアクティブにする必要があるかもしれません）
- スマホ側でEvenアプリまたは本アプリを再度アクティブ、または再読み込みを行う
- スマホのEvenアプリ自体の再起動、スマホ自体の再起動

## 3. 一般ユーザ向けの当アプリの初期設定方法

### 3.1 Googleドライブの特定フォルダのフォルダIDをメモ
目的のGoogleドライブフォルダを開きます。URLの以下の部分がフォルダIDです。
`https://drive.google.com/drive/folders/[フォルダID]`
例：URLが `https://drive.google.com/drive/folders/1abc2def3ghi` の場合、IDは `1abc2def3ghi` です。

### 3.2 GCP設定（クライアントIDとクライアントシークレットの取得）
アプリがドライブにアクセスできるようにGoogle Cloud Platform (GCP) を設定します。（ユーザー自身で設定する必要があります）
- プロジェクト名は「DocsReader」として作成することを推奨します。
- 本アプリではログインに必要な情報のみを扱っています。個人情報を外部に送信することは一切実施していません。
- 設定手順:
  1. [Google Cloud Console](https://console.cloud.google.com/) にアクセスして、新規プロジェクト「DocsReader」を作成。（もしくは既存のプロジェクトを使用）
  2. **API とサービス > 有効な API とサービス** から、`Google Drive API` と `Google Docs API` を有効化。
  3. **OAuth 同意画面 > 概要** を設定。
    - アプリ名「DocsReader」メールアドレスはユーザー自身のGmailアドレスを入力。
    - 「外部」を選択。
  4. **OAuth 同意画面 > クライアント** を作成。
    - **アプリケーションの種類**: ウェブ アプリケーション。
    - **承認済みの JavaScript 生成元**: `https://docsreader4eh.syamcspublic.workers.dev`
    - **承認済みのリダイレクト URI**: `https://docsreader4eh.syamcspublic.workers.dev/` （末尾の `/` が重要）。
  5. 表示された **クライアント ID** と **クライアント シークレット** を控えておきます。
  6. **OAuth 同意画面 > 対象** を設定。
    - テストユーザーにユーザー自身のGoogleアカウントを設定
  7. **OAuth 同意画面 > データアクセス** を設定。
    - スコープに `.../auth/drive` および `.../auth/documents.readonly` を追加。（フィルタに`drive`,`documents`と入力すると表示されると思います）

### 3.3 PCもしくはスマホにPWAをインストール
`https://docsreader4eh.syamcspublic.workers.dev/` をブラウザで開きます。
- **PC (Chrome/Edge)**: アドレスバーの「インストール」アイコンをクリック。
- **スマホ (iOS/Safari)**: 「共有」ボタンを押し、「ホーム画面に追加」を選択。
- **スマホ (Android/Chrome)**: メニュー（三点リーダー）から「アプリをインストール」を選択。

### 3.4 PWAアプリでの操作
1. 上記3.3でインストールしたアプリを起動します。
2. 設定画面の「Google Client ID」に 3.2 で取得したIDを入力（コピペ推奨）。
3. 設定画面の「Google Client Secret」に 3.2 で取得したシークレットを入力（コピペ推奨）。
4. 設定画面の「Google Drive Folder ID」に 3.1 でメモしたフォルダIDを入力（コピペ推奨）。
5. `Continue with Google` ボタンを押下。
6. Googleアカウントとパスワードを入力。
7. 「このアプリは Google で確認されていません」と表示されたら、左下の「詳細」や「続行」をタップ。(以降、本アプリを信頼している前提で進めてください)
8. 「DocsReader（安全ではないページ）に移動」をタップ。
9. 「DocsReader に再ログインしようとしています」が表示されたら「次へ」をタップ。
10. 「DocsReader が Google アカウントへのアクセスを求めています」が表示されたら、すべてのアクセスを許可して「続行」をタップ。
11. ログイン状態でアプリ画面に自動的に戻ります。次回以降の起動時は 2～10 の操作は不要です。
12. 「Read on Device」ボタンを押下すると、デバイス上でドキュメントリストが表示されます。

**注意：**PWAアプリのバージョンアップ等で画面が真っ白で何も表示されなくなることがあります。その際は、ブラウザのキャッシュをクリアしてから再度アクセスしてください。

### 3.5 Evenアプリでの操作
1. EvenHubで本アプリをインストールします。
2. Evenアプリ内の設定画面でも、3.4.2～3.4.4と同様の操作を実施します。
3. **PWAアプリ**（3.4）の設定内にある「My Refresh Token (Copy from here)」のコピーアイコンをタップしてトークンをコピーします。
4. **Evenアプリ**の設定内にある「Paste Token from another device」にコピーしたトークンをペーストし、「SAVE & RELOAD」を押下します。
5. ログイン状態で再読み込みされます。次回以降の起動時は 3.5.1～3.5.4 の操作は不要です。
6. 「Sync Glasses」ボタンを押下すると、グラスにドキュメントリストが表示されます。（スマホのEvenアプリがバックグラウンドで動作している必要がありますが、画面をロックしても動作します）
7. 「Close Glasses App」ボタンを押下すると、グラスのアプリが終了します。

## 4. 本アプリの使い方

### 4.1.1 トップ画面
- **右上の歯車アイコン**: 「App Settings」画面を開きます。
- **右上の更新アイコン**: ユーザ自身のGoogleドライブを利用して既読状況を同期します（最後に保存した状態をアップロードまたはダウンロード）。
- **左上のアプリ表示欄**: アプリの様々な状況を表示します。
- **ログインユーザ表示欄**: ログイン中のアイコンとユーザ名を表示。「LOGOUT」ボタンからログアウトも可能です。
- **「Read on Device」ボタン**: 「Documents List」画面、もしくは「本文表示」画面（直近の状態）を表示します。
- **「Sync Glasses」ボタン (Evenアプリのみ)**: グラスに「Documents List」画面を表示します。
- **「Close Glasses App」ボタン (Evenアプリのみ)**: グラス側のアプリを終了します。

### 4.1.2 「App Settings」画面
- **Google Client ID**: GCPで取得したクライアントIDの入力欄。
- **Google Client Secret**: GCPで取得したクライアントシークレットの入力欄。
- **Google Drive Folder ID**: 表示したいドキュメントが格納されているフォルダのID入力欄。
- **My Refresh Token (Copy from here)**: 自動ログインできない環境（Evenアプリ内ブラウザ等）に認証情報を渡すための、リフレッシュコピー用。
- **Paste Token from another device**: 別のデバイスで取得したリフレッシュトークンを入力する欄。
- **Clear Document Cache**: ローカルに保存されたドキュメントのキャッシュをクリアします。Googleドライブ側の更新状態が反映されない場合に利用してください。※更新されたドキュメントは既読位置がずれる可能性があります。
- **Color Theme**: PC/スマホ側のカラーテーマ。
- **Auto Scroll Speed**: 本文表示時の自動スクロール間隔を指定。
- **Enable Auto Mode**: Auto Mode を許可するかどうかを指定。（Auto Mode を許可すると、バッテリー消費量が増加します）

### 4.1.3 「Documents List」画面
- 指定フォルダ直下のGoogleドキュメント一覧を表示。
- 既読割合（%）が表示されます。
- ドキュメントをタップすると「本文表示」画面へ遷移します。
- **グラス側操作**: ダブルタップするたびに以下のモードを切り替えます。
  - **通常モード**: Googleドキュメント一覧を表示 (*1)
  - **1行モード**: 画面上部1行のみを表示 (*1)
  - **消灯モード**: 画面全体を非表示にする (*2)

### 4.1.4 「Documents List」画面のグラス表示
- (*1) では1行目に「現在日時、手動(M)/自動(A)/手動固定(M:lck)モード、グラスバッテリー残量」が表示されます。
- **1行モードでのアクション**:
  - **シングルタップ**: 画面更新（日時・バッテリー）。自動モードでは定期更新されます。
  - **上下スクロール**: 手動(M)と自動(A)モードの切替（スマホ側で Auto Mode が許可されている場合のみ）。「M:lck」と表示されている場合は、手動から切り替えることはできません。
- (*2) 消灯モードにより、アプリを常時起動したままシームレスに読書へ復帰できます。

### 4.1.5 「本文表示」画面
- 最後に読み終えた箇所付近までスクロールします。
- **「MANUAL」「AUTO」ボタン (PWAのみ)**: 手動と自動スクロールを切り替えます。
- **自動スクロール時**: 次のスクロールまでの秒数をカウントダウン表示します。
- **「PREVIOUS」「NEXT」ボタン (PWAのみ)**: 前後のファイルへ移動。前ファイルは最下部、次ファイルは最上段へ移動します。
- **上スクロール (グラス)**: 前ページへ遷移。
- **下スクロール (グラス)**: 次ページへ遷移。
- **ダブルタップ (グラス)**: 「Documents List」画面へ戻る。

## 5. プライバシーポリシーと免責事項
- 本アプリは実験的な側面が強いです。自己責任の下での利用をお願いします。
- 本アプリに関連した収入は一切発生していません。
- 不可逆的なバージョンアップ、もしくはサービス停止の可能性があります。
- ログインに必要な情報のみを扱っています。個人情報の収集や外部への送信は行っていません。（逆に言えばお問い合わせをいただいても、個人情報が特定できないため対応できない可能性が高いです。）
- デバイス間で既読状況を共有するため、ユーザー自身のGoogleドライブのマイドライブ直下に `DocsReader4EH.datetime.txt` および `DocsReader4EH.data.json` が作成・更新されます。これらのファイルの存在を許容してください。変更・削除は自己責任となります。
- GCPのクライアントIDやクライアントシークレットは、漏洩しないようユーザ自身で厳重に管理してください。



## 6. 開発者向け情報

### 6.1 アプリ構成
`evenhub` フォルダの内容はCloudflareへのリダイレクトを主な役割としています。アプリ本体のロジックは `cloudflare` フォルダに集約されています。



### 6.2 side: Cloudflare

#### 6.2.1 インストール
```bash
cd cloudflare
npm install
```

#### 6.2.2 ローカルテスト

cloudflare相当の開発サーバを起動
```bash
cd cloudflare
npm run dev
```

以下URLにアクセスすることでPWA相当のテストが可能  
http://localhost:5174

#### 6.2.3 本番ビルド
```bash
cd cloudflare
npm run build
```

#### 6.2.4 デプロイ
`dist` フォルダを Cloudflare Pages 等にデプロイしてください。

#### 6.2.5 [参考]デプロイ例
https://dash.cloudflare.com/login  

#### 6.2.6 [参考]QRコードの作成方法

以下を背景が黒いターミナルで実行
```
npx evenhub qr --url "https://docsreader4eh.syamcspublic.workers.dev/"
```


### 6.3 side: EvenHub

#### 6.3.1 インストール
```bash
cd evenhub
npm install
```

#### 6.3.2 ローカルテスト

**以下を実施する前にcloudflareに相当する開発サーバを起動しておくこと(ポート番号:5174)**

以下でevenhubに相当する開発サーバを起動(ポート番号:5173)
```bash
cd evenhub
npm run dev
```

以下別のターミナルでシミュレータを起動
```bash
cd evenhub
npm run simulator
```

#### 6.3.3 本番パッケージビルド
```bash
cd evenhub
npm run pack
```
`DocsReader4EH.ehpk` が生成されます。

#### 6.3.4 デプロイ
`.ehpk` ファイルを [EvenHub Portal](https://hub.evenrealities.com) にアップロードします。

---

## License
MIT License

Developed by **sYamcs**
