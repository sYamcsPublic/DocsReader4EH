/**
 * 定期実行トリガーをセットアップする関数
 * Function to set up a scheduled trigger
 * 
 * 実行タイミングに左右されず、指定した「時刻・分」に基づいて設定。
 * Configured based on specified “hours and minutes,” regardless of the execution timing.
 *
 * <トリガー設定前の準備 / Preparation before setting up the trigger>
 * トリガーセットアップ前に出力先のGoogleドキュメントを作成して、ドキュメントIDをスクリプトプロパティに設定が必要。
 * Before setting up the trigger, you must create the destination Google Doc and set its document ID in the script properties.
 * - DOC_ID_1: 天気 / Weather
 * - DOC_ID_2: 国内ニュース / Domestic News
 * - DOC_ID_3: 国際ニュース / World News
 * - DOC_ID_4: ITニュース / IT News
 * - DOC_ID_5: 科学ニュース / Science News
 */
function setupTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));

  // --- 1. 天気予報：0:05, 6:05, 12:05, 18:05 頃に固定 ---
  [0, 6, 12, 18].forEach(hour => {
    ScriptApp.newTrigger('fetchWeather')
      .timeBased()
      .atHour(hour)
      .nearMinute(5) // 5分頃を指定
      .everyDays(1)  // 毎日、この時間に実行
      .create();
  });

  // --- 2. ニュース：毎時 00分 頃に固定 ---
  const newsFunctions = [
    'fetchDomesticNews',
    'fetchWorldNews',
    'fetchItNews',
    'fetchScienceNews'
  ];
  
  newsFunctions.forEach(funcName => {
    ScriptApp.newTrigger(funcName)
      .timeBased()
      .everyHours(1)
      .nearMinute(0) // ここで0分近辺を指定
      .create();
  });
  
  console.log('すべてのトリガーを再設定しました。');
}

/**
 * ---------------------------------------------------------
 * 各実行用メイン関数
 * ---------------------------------------------------------
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
      
      content += `【${f.dateLabel}の天気 ${formatWeatherDate(f.date, true)} ${f.telop} ${maxTemp}℃/${minTemp}℃】\n`;
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

function fetchDomesticNews() {
  console.log(`国内ニュース：開始`);
  processNewsRSS('DOC_ID_2', 'https://news.yahoo.co.jp/rss/categories/domestic.xml');
  console.log(`国内ニュース：完了`);
}

function fetchWorldNews() {
  console.log(`国際ニュース：開始`);
  processNewsRSS('DOC_ID_3', 'https://news.yahoo.co.jp/rss/categories/world.xml');
  console.log(`国際ニュース：完了`);
}

function fetchItNews() {
  console.log(`ITニュース：開始`);
  processNewsRSS('DOC_ID_4', 'https://news.yahoo.co.jp/rss/categories/it.xml');
  console.log(`ITニュース：完了`);
}

function fetchScienceNews() {
  console.log(`科学ニュース：開始`);
  processNewsRSS('DOC_ID_5', 'https://news.yahoo.co.jp/rss/categories/science.xml');
  console.log(`科学ニュース：完了`);
}

/**
 * ---------------------------------------------------------
 * 共通ロジック・ユーティリティ
 * ---------------------------------------------------------
 */

/**
 * ニュースRSSの取得・整形・出力
 */
function processNewsRSS(propKey, url) {
  const docId = PropertiesService.getScriptProperties().getProperty(propKey);
  
  try {
    const response = UrlFetchApp.fetch(url);
    const xml = XmlService.parse(response.getContentText());
    const items = xml.getRootElement().getChild('channel').getChildren('item');
    
    let newsList = items.map(item => {
      return {
        title: item.getChildText('title'),
        link: item.getChildText('link'),
        description: item.getChildText('description'),
        pubDate: new Date(item.getChildText('pubDate'))
      };
    });

    // pubDateで降順（新しい順）にソート
    newsList.sort((a, b) => b.pubDate - a.pubDate);

    let content = `更新日時：${getFormattedDate(new Date())}\n\n`;
    
    newsList.forEach(news => {
      content += `【${getFormattedDate(news.pubDate)}】\n`;
      content += `${news.title}\n`;
      content += `${news.description}\n\n`;
    });

    updateDoc(docId, content);
  } catch (e) {
    console.error(`RSS取得エラー (${propKey}): ` + e.toString());
  }
}

/**
 * Googleドキュメントの内容を上書き更新
 */
function updateDoc(docId, content) {
  if (!docId) return;
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();
  body.clear();
  body.setText(content);
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
 * ISO 8601等から「2026/4/25(Sat)4:38:00」形式へ
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
