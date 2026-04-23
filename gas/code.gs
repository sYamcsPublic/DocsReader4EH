/**
 * ==============================================================================
 * 【自動情報更新ツール：天気・ニュース・英単語】
 *
 * * --- 使い方 (How to setup) ---
 * * 1. Googleドキュメントの準備 (Prepare Google Docs)
 * 3つのドキュメントを作成し、URLからIDを取得します。
 * URL: docs.google.com/document/d/[この部分がID]/edit
 * Create 3 Google Docs and copy their IDs from the URL.
 *
 * * 2. APIキーの取得 (Get Gemini API Key)
 * Google AI Studio (https://aistudio.google.com/) でキーを発行します。
 * Get your Gemini API Key at Google AI Studio.
 *
 * * 3. スクリプトプロパティの設定 (Set Script Properties)
 * GASエディタ左側の「設定（歯車アイコン）」＞「スクリプトプロパティ」に以下を追加。
 * In GAS Settings (gear icon), add these to "Script Properties":
 * - GEMINI_API_KEY : (取得したAPIキー)
 * - DOC_ID_1       : (天気用ドキュメントID)
 * - DOC_ID_2       : (ニュース用ドキュメントID)
 * - DOC_ID_3       : (英単語用ドキュメントID)
 *
 * * 4. 地域の変更 (Set your Location)
 * 「fetchWeather」関数内の lat (緯度) と lon (経度) をお住まいの地域に変更してください。
 * Update 'lat' and 'lon' in the 'fetchWeather' function to match your location.
 *
 * * 5. タイムゾーンの設定 (Set Timezone)
 * 日本以外で使用する場合、コード内の "Asia/Tokyo" をすべて置換し、
 * 「設定（歯車アイコン）」内のタイムゾーンも自身の地域に合わせてください。
 * If using outside Japan, replace all "Asia/Tokyo" in the code,
 * and update the Timezone in "Settings (gear icon)".
 *
 * * 6. 初回実行と承認 (First Run & Authorization)
 * 「updateInformationDocs」を選択して「実行」ボタンを押します。
 * 承認画面で「このアプリは確認されていません」と出た場合は、
 * 【詳細】→【(プロジェクト名)に移動(安全ではない)】をクリックして許可してください。
 * Select "updateInformationDocs" and click "Run". If you see "This app isn't verified", 
 * click "Advanced" -> "Go to [Project Name] (unsafe)" to authorize.
 * 
 * * 7. 定期実行の設定 (Automation)
 * 左側の「トリガー（時計アイコン）」から、時間主導型で好きな間隔を設定してください。
 * ただし、各サービスのAPIリクエストには上限があり、1日あたりのリクエスト数を制限する配慮が必要です。
 * Set a "Time-driven" trigger via the "Triggers" menu (clock icon).
 * However, there are limits on the number of API requests for each service,
 * so care must be taken to limit the number of requests per day.
 *
 * * ==============================================================================
 */

/**
 * テキスト生成・出力メイン関数：日当たり数回程度(朝昼夜+α)
 * 定期トリガーでこの関数を呼び出すように設定。
 * Main function for text generation and output: Runs several times a day (morning, noon, night, and more)
 * Configure a scheduled trigger to call this function.
 */
function updateInformationDocs() {
  const props = PropertiesService.getScriptProperties().getProperties();

  const now = new Date();
  const jstTime = Utilities.formatDate(now, "Asia/Tokyo", "yyyy/MM/dd(E) HH:mm");
  const results = [];
  const tasks = [
    {
      id: props.DOC_ID_1,
      name: "天気",
      handler: () => fetchWeather()
    },
    {
      id: props.DOC_ID_2,
      name: "ニュース",
      handler: () => fetchNews()
    },
    {
      id: props.DOC_ID_3,
      name: "英単語",
      handler: () => fetchGeminiResponse(
        props.GEMINI_API_KEY,
        `本日覚えるべきおすすめの英単語をいくつか選定し、それぞれの「カタカナ表記の読み方」「日本語訳」「語源」「例文」「日本人が間違いやすいポイント」「日常会話での使い方」などを日本語で詳しく解説してください。
        まず最初に「おすすめの英単語、カタカナ表記の読み方、日本語訳」の一覧を教えてください。その後、各英単語の解説をお願いします。
        1000～1500文字程度のボリュームで記述してください。
        重要：マークダウン形式はNG。かつ、文章の途中で終わらず、必ず最後まで完結させてください。`
      )
    }
  ];

  tasks.forEach(task => {
    try {
      console.log(`${task.name}：開始...`);
      const content = task.handler();
      const doc = DocumentApp.openById(task.id);
      const body = doc.getBody();
      body.clear();
      body.setText(`更新日時：${jstTime}\n\n${content}`);
      doc.saveAndClose();
      const msg = `✅ ${task.name}：正常に完了`;
      console.log(msg);
      results.push(msg);
    } catch (e) {
      const msg = `❌ ${task.name}：エラー -> ${e.message}`;
      console.log(msg);
      results.push(msg);
    }
  });

  // ▼ メール送信
  sendResultMail(results, jstTime);
}

/* =========================
   メール送信
========================= */
function sendResultMail(results, time) {
  const to = Session.getActiveUser().getEmail(); // 自分宛（変更可）
  const subject = "Docs定期処理結果";
  const body = `
実行時刻: ${time}

結果:
${results.join("\n")}
`;
  MailApp.sendEmail({
    to: to,
    subject: subject,
    body: body
  });
}

/* =========================
   天気（Open-Meteo）
========================= */
function fetchWeather() {
  const lat = 35.6895;
  const lon = 139.6917;

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}
  &hourly=temperature_2m,apparent_temperature,precipitation_probability,snowfall,windspeed_10m,weathercode
  &daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,snowfall_sum,windspeed_10m_max,weathercode
  &timezone=Asia%2FTokyo`.replace(/\n|\s/g, '');

  const res = UrlFetchApp.fetch(url, {
    headers: {
      "User-Agent": "my-weather-app/1.0"
    }
  });
  const json = JSON.parse(res.getContentText());

// const mockJson = {
//   hourly: {
//     time: [
//       "2026-04-22T09:00",
//       "2026-04-22T10:00",
//       "2026-04-22T11:00",
//       "2026-04-23T09:00",
//       "2026-04-23T10:00"
//     ],
//     temperature_2m: [18.2, 19.5, 21.0, 17.0, 18.3],
//     apparent_temperature: [17.8, 19.0, 20.5, 16.5, 18.0],
//     precipitation_probability: [10, 20, 30, 40, 50],
//     snowfall: [0, 0, 0, 0.5, 1.2],
//     windspeed_10m: [5.2, 6.1, 4.8, 3.5, 4.0],
//     weathercode: [1, 2, 3, 71, 73]
//   },
//   daily: {
//     time: [
//       "2026-04-22",
//       "2026-04-23",
//       "2026-04-24"
//     ],
//     temperature_2m_max: [22.0, 19.0, 21.5],
//     temperature_2m_min: [12.5, 10.0, 11.2],
//     precipitation_probability_max: [30, 60, 20],
//     snowfall_sum: [0, 3.5, 0],
//     windspeed_10m_max: [8.5, 10.2, 7.0],
//     weathercode: [1, 71, 2]
//   }
// };
// const json = mockJson;

  const hourly = json.hourly;
  const daily = json.daily;

  const now = new Date();
  const todayStr = Utilities.formatDate(now, "Asia/Tokyo", "yyyy-MM-dd");

  const beforehour = new Date(now);
  beforehour.setHours(now.getHours() - 1);

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowStr = Utilities.formatDate(tomorrow, "Asia/Tokyo", "yyyy-MM-dd");

  let todayText = `【今日の天気 ${formatDateWithDay(daily.time[0])}】\n`;
  let tomorrowText = `【明日の天気 ${formatDateWithDay(daily.time[1])}】\n`;

  for (let i = 0; i < hourly.time.length; i++) {
    const t = new Date(hourly.time[i]);
    const dateStr = Utilities.formatDate(t, "Asia/Tokyo", "yyyy-MM-dd");

    const time = Utilities.formatDate(t, "Asia/Tokyo", "HH:mm");
    const weather = weatherCodeToJP(hourly.weathercode[i]);

    const line = `${time} ${weather} 気温:${hourly.temperature_2m[i]}℃ 体感:${hourly.apparent_temperature[i]}℃ 降水:${hourly.precipitation_probability[i]}% 降雪:${hourly.snowfall[i]}mm 風速:${hourly.windspeed_10m[i]}km/h\n`;

    // 今日（現在以降のみ）
    if (dateStr === todayStr && t >= beforehour) {
      todayText += line;
    }

    // 明日（全時間）
    if (dateStr === tomorrowStr) {
      tomorrowText += line;
    }
  }

  let weekText = "\n【今後一週間の天気】\n";
  for (let i = 0; i < daily.time.length; i++) {
    const date = formatDateWithDay(daily.time[i]);
    const weather = weatherCodeToJP(daily.weathercode[i]);

    const rain = daily.precipitation_probability_max[i];
    const wind = daily.windspeed_10m_max[i];
    const snow = daily.snowfall_sum[i];

    weekText += `${date} ${weather} 最高:${daily.temperature_2m_max[i]}℃ 最低:${daily.temperature_2m_min[i]}℃ `
            + `降水:${rain}% 降雪:${snow}mm 風速:${wind}km/h\n`;
  }

  return `${todayText}\n${tomorrowText}${weekText}`;
}

/* =========================
   時刻フォーマット
========================= */
function formatTime(dateStr) {
  const date = new Date(dateStr);
  return Utilities.formatDate(date, "Asia/Tokyo", "HH:mm");
}

/* =========================
   日付 + 曜日
========================= */
function formatDateWithDay(dateStr) {
  const date = new Date(dateStr);
  return Utilities.formatDate(date, "Asia/Tokyo", "yyyy/MM/dd(E)");
}

/* =========================
   天気コード → 日本語
========================= */
function weatherCodeToJP(code) {
  const map = {
    0: "快晴",
    1: "晴れ",
    2: "晴れ時々曇り",
    3: "曇り",
    45: "霧",
    48: "霧氷",
    51: "小雨",
    53: "雨",
    55: "強い雨",
    56: "着氷性霧雨",
    57: "強い着氷性霧雨",
    61: "弱い雨",
    63: "雨",
    65: "大雨",
    66: "弱い着氷性雨",
    67: "強い着氷性雨",
    71: "小雪",
    73: "雪",
    75: "大雪",
    77: "雪粒",
    80: "にわか雨",
    81: "強いにわか雨",
    82: "激しいにわか雨",
    85: "にわか雪",
    86: "強いにわか雪",
    95: "雷雨",
    96: "雷雨（ひょう）",
    99: "激しい雷雨（ひょう）"
  };

  return map[code] || "不明";
}

/* =========================
   ニュース（RSS）
========================= */
function fetchNews() {
  const url = "https://news.google.com/rss?hl=ja&gl=JP&ceid=JP:ja";
  const xml = UrlFetchApp.fetch(url).getContentText();
  const doc = XmlService.parse(xml);

  const items = doc.getRootElement()
    .getChild("channel")
    .getChildren("item");

  // ▼ パース
  const parsed = items.map(item => {
    const pubDateStr = item.getChildText("pubDate");
    return {
      title: item.getChildText("title"),
      pubDate: new Date(pubDateStr),
    };
  });

  // ▼ 降順ソート
  parsed.sort((a, b) => b.pubDate - a.pubDate);

  // ▼ 重複排除（titleベース）
  const seen = new Set();
  const unique = parsed.filter(item => {
    if (seen.has(item.title)) return false;
    seen.add(item.title);
    return true;
  });

  // ▼ 出力
  let result = "";
  unique.forEach(item => {
    const date = Utilities.formatDate(item.pubDate, "Asia/Tokyo", "yyyy/MM/dd(E)HH:mm:ss");
    result += `【${date}】\n${item.title}\n\n`;
  });

  return result;
}

/* =========================
   日付変換（GMT → JST）
========================= */
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return Utilities.formatDate(date, "Asia/Tokyo", "yyyy/MM/dd(E)HH:mm:ss");
}

/* =========================
   HTML除去
========================= */
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/* =========================
   Gemini
========================= */
function fetchGeminiResponse(apiKey, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 4096,
      temperature: 0.7
    }
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true // 503エラーなどをスクリプトでハンドリングするために必須
  };

  const maxRetries = 3; // 最大再試行回数
  let retryCount = 0;
  let waitTimeSec = 5; // 最初の待機時間（5秒）

  while (retryCount <= maxRetries) {
    try {
      Utilities.sleep(1000);
      const response = UrlFetchApp.fetch(url, options);
      const responseCode = response.getResponseCode();
      const resText = response.getContentText();
      const json = JSON.parse(resText);
      // console.log(json)

      // 成功時 (HTTP 200)
      if (responseCode === 200 && json.candidates && json.candidates[0]) {
        const candidate = json.candidates[0];
        if (candidate.finishReason !== "STOP") {
          console.warn(`警告: 完了理由が ${candidate.finishReason} です。`);
        }
        return candidate.content.parts[0].text;
      }

      // 503 (過負荷) または 429 (レート制限) の場合、リトライする
      if (responseCode === 503 || responseCode === 429) {
        if (retryCount < maxRetries) {
          const retryAfter = json.error?.details?.find(d => d.retryDelay)?.retryDelay.replace('s', '') || waitTimeSec;
          const waitTime = parseFloat(retryAfter) * 1000;
          console.warn(`サーバー負荷高（HTTPステータス:${responseCode}）のため再試行します (${retryCount + 1}回目)。${waitTime/1000}秒待機中...`);
          Utilities.sleep(waitTime);
          retryCount++;
          waitTimeSec *= 2; // 待機時間を倍にしていく（指数バックオフ）
          continue;
        }
      }

      // その他のエラー
      throw new Error(`APIエラー: ${responseCode} - ${resText}`);

    } catch (e) {
      if (retryCount >= maxRetries) {
        throw new Error(`最大リトライ回数を超過しました: ${e.message}`);
      }
      retryCount++;
      Utilities.sleep(waitTimeSec);
      waitTimeSec *= 2;
    }
  }
}

