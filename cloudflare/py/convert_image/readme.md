
# アイコン用画像変換

cd ./py/convert_image

## 初回のみ仮想環境作成
python -m virtualenv venv

## 仮想環境起動
.\venv\Scripts\activate

## 必要ライブラリのインストール
python.exe -m pip install Pillow

## 画像変換
python convertImage.py

## 仮想環境終了
deactivate

