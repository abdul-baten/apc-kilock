# 開発環境

* Editor,IDEはEditorConfigに対応しているものにして下さい。標準で対応していないものはEditorConfig Pluginを入れて下さい

http://editorconfig.org/

* Node.jsバージョン 0.10.x
* MongoDB
* Redis
* SASS(ruby gem)

# 開発メンバー登録
1. 下記のURLへ移動（要ログイン）
        https://dashboard.heroku.com/apps/kilock-salesforce-extension/access
2. Editをクリック
3. 登録するユーザのHerokuID(Email)を入力、必要な権限を付与してSave

# ソース取得
1. Heroku Toolbeltインストール
       https://toolbelt.heroku.com/
2. Heroku Login
        $ heroku login
        Enter your Heroku credentials.
        Email:(Heroku ID)
        Password (typing will be hidden):(Password)
3. Heroku上のGitからクローン
        $ heroku git:clone --app kilock-salesforce-extension
  既にソース取得済みなら
        $ heroku git:remote --app kilock-salesforce-extension
4. 開発ブランチチェックアウト
        $ git checkout -b develop heroku/develop

# ローカルでデバッグ
1. 必要なコマンドインストール
        $ npm update -g npm
        $ npm install -g grunt-cli bower
2. ソースのルートディレクトリにライブラリインストール(※packege.json,bower.jsonのライブラリがインストールされる)
        $ npm install
        $ bower install
3. 開発サーバ起動
        $ grunt serve
4. ブラウザで下記のURLにアクセス
        http://localhost:9000

# デプロイ
1. 開発ブランチチェックアウト(Herokuログイン状態であること)
        $ git checkout -b develop heroku/develop
2. 下記コマンドでビルド
        $ grunt build
3. distブランチへpush
        $ grunt buildcontrol:heroku
4. distブランチチェックアウト
        $ git checkout -b dist heroku/dist
5. デプロイ(masterへpush)
        $ git push heroku dist:master
