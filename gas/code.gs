/**
 * 定期実行トリガーをセットアップする関数
 * * <トリガー設定前の準備>
 * スクリプトプロパティに以下のIDを設定してください。
 * - DOC_ID_1: 天気
 * - DOC_ID_2: 最新ニュース (全カテゴリ統合・新着30件)
 * - DOC_ID_3: 国内ニュース
 * - DOC_ID_4: 国際ニュース
 * - DOC_ID_5: ITニュース
 * - DOC_ID_6: 科学ニュース
 */
function setupTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));

  // --- 1. 天気予報：0:05, 6:05, 12:05, 18:05 頃 ---
  [0, 6, 12, 18].forEach(hour => {
    ScriptApp.newTrigger('fetchWeather')
      .timeBased()
      .atHour(hour)
      .nearMinute(5)
      .everyDays(1)
      .create();
  });

  // --- 2. ニュース：毎時 00分 頃 ---
  // すべてのニュースを一括取得・更新する関数を登録
  ScriptApp.newTrigger('fetchAllNews')
    .timeBased()
    .everyHours(1)
    .nearMinute(0)
    .create();
  
  console.log('すべてのトリガーを再設定しました。');
}

/**
 * ---------------------------------------------------------
 * 各実行用メイン関数
 * ---------------------------------------------------------
 */

/**
 * 天気予報の取得
 */
function fetchWeather() {
  console.log(`天気：開始`);
  const docId = PropertiesService.getScriptProperties().getProperty('DOC_ID_1');
  const url = 'https://weather.tsukumijima.net/api/forecast/city/230010';
  
  try {
    const response = UrlFetchApp.fetch(url);
    const data = JSON.parse(response.getContentText());
    
    let content = `更新日時：${getFormattedDate(new Date())}\n\n`;
    content += `${formatWeatherDate(data.description.publicTime)}発表\n`;
    content += `${data.title}\n\n`;
    content += `${data.description.bodyText}\n\n`;

    data.forecasts.forEach(f => {
      const minTemp = f.temperature.min.celsius || '-';
      const maxTemp = f.temperature.max.celsius || '-';
      
      content += `【${formatWeatherDate(f.date, true)} ${f.dateLabel}の天気 ${f.telop} ${maxTemp}℃/${minTemp}℃】\n`;
      content += `詳細：${f.detail.weather || '---'}\n`;
      content += `風向き：${f.detail.wind || '---'}\n`;
      content += `波の高さ：${f.detail.wave || '---'}\n`;
      content += `降水確率(0時～6時)：${f.chanceOfRain.T00_06}\n`;
      content += `降水確率(6時～12時)：${f.chanceOfRain.T06_12}\n`;
      content += `降水確率(12時～18時)：${f.chanceOfRain.T12_18}\n`;
      content += `降水確率(18時～24時)：${f.chanceOfRain.T18_24}\n\n`;
    });

    updateDoc(docId, content);
    console.log(`天気：完了`);
  } catch (e) {
    console.error('天気取得エラー: ' + e.toString());
  }
}

/**
 * 全ニュースの取得・統合・個別更新
 */
function fetchAllNews() {
  console.log(`全ニュース取得処理：開始`);
  
  const newsSources = [
    { propKey: 'DOC_ID_3', url: 'https://news.yahoo.co.jp/rss/categories/domestic.xml', label: '国内' },
    { propKey: 'DOC_ID_4', url: 'https://news.yahoo.co.jp/rss/categories/world.xml', label: '国際' },
    { propKey: 'DOC_ID_5', url: 'https://news.yahoo.co.jp/rss/categories/it.xml', label: 'IT' },
    { propKey: 'DOC_ID_6', url: 'https://news.yahoo.co.jp/rss/categories/science.xml', label: '科学' }
  ];

  let allNewsList = [];

  // 1. 各カテゴリの取得と個別ドキュメント更新
  newsSources.forEach(source => {
    const list = getNewsListFromRSS(source.url);
    if (list.length > 0) {
      // 個別カテゴリのドキュメントを更新
      const content = createNewsContent(list);
      updateDoc(PropertiesService.getScriptProperties().getProperty(source.propKey), content);
      
      // 統合リストに追加
      allNewsList = allNewsList.concat(list);
    }
  });

  // 2. 全ニュースをpubDateで降順（新しい順）にソート
  allNewsList.sort((a, b) => b.pubDate - a.pubDate);

  // 3. 最新ニュース（最大30件）を出力
  const latestNewsDocId = PropertiesService.getScriptProperties().getProperty('DOC_ID_2');
  const top30News = allNewsList.slice(0, 30);
  const latestContent = createNewsContent(top30News);
  
  updateDoc(latestNewsDocId, latestContent);

  console.log(`全ニュース取得処理：完了`);
}

/**
 * ---------------------------------------------------------
 * 共通ロジック・ユーティリティ
 * ---------------------------------------------------------
 */

/**
 * RSSからニュースリスト（配列）を取得する
 */
function getNewsListFromRSS(url) {
  try {
    const response = UrlFetchApp.fetch(url);
    const xml = XmlService.parse(response.getContentText());
    const items = xml.getRootElement().getChild('channel').getChildren('item');
    
    return items.map(item => {
      return {
        title: item.getChildText('title'),
        link: item.getChildText('link'),
        description: item.getChildText('description'),
        pubDate: new Date(item.getChildText('pubDate'))
      };
    });
  } catch (e) {
    console.error(`RSS取得エラー (${url}): ` + e.toString());
    return [];
  }
}

/**
 * ニュースリストをドキュメント用のテキスト形式に変換
 */
function createNewsContent(newsList) {
  let content = `更新日時：${getFormattedDate(new Date())}\n`;
  content += "\n";
  
  newsList.forEach(news => {
    content += `【${getFormattedDate(news.pubDate)}】\n`;
    content += `${news.title}\n`;
    content += `${news.description}\n\n`;
  });
  return content;
}

/**
 * Googleドキュメントの内容を上書き更新
 */
function updateDoc(docId, content) {
  if (!docId) {
    console.warn("Doc IDが設定されていません。");
    return;
  }
  try {
    const doc = DocumentApp.openById(docId);
    const body = doc.getBody();
    body.clear();
    body.setText(content);
  } catch (e) {
    console.error(`ドキュメント更新エラー (ID: ${docId}): ` + e.toString());
  }
}

/**
 * 日時フォーマット：2026/4/25(Sat)5:16:31
 */
function getFormattedDate(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const Y = date.getFullYear();
  const M = date.getMonth() + 1;
  const D = date.getDate();
  const day = days[date.getDay()];
  const h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  
  return `${Y}/${M}/${D}(${day})${h}:${m}:${s}`;
}

/**
 * 天気API用の日時整形
 */
function formatWeatherDate(dateStr, dateOnly = false) {
  if (!dateStr) return '---';
  const date = new Date(dateStr);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const Y = date.getFullYear();
  const M = date.getMonth() + 1;
  const D = date.getDate();
  const day = days[date.getDay()];
  
  if (dateOnly) {
    return `${Y}/${M}/${D}(${day})`;
  }
  
  const h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${Y}/${M}/${D}(${day})${h}:${m}:${s}`;
}
