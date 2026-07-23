// v0.15：url-fetch 反爬增强测试
//   只覆盖纯函数 / 检测器单元逻辑（运行 < 1s）
//   端到端真机测试（fetchUrlCore 触发 chrome fallback）见真机测试脚本：
//     bash test-anti-crawl-e2e.sh
//
// 运行：node server/tools/__tests__/url-fetch.test.js

const cheerio = require('cheerio');
const { isAntiCrawlResponse } = require('../url-fetch');

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else      { console.log(`  ✗ ${label}`); fail++; }
}

// ═══════ 1. isAntiCrawlResponse 单元测试 ═══════
console.log('\n[isAntiCrawlResponse]');

// 正常页面：普通百度百科词条（2KB+）
{
  const paragraph1 = '北京，简称"京"，是中华人民共和国的首都、也是中国政治、文化、科教、交通和国际交往中心。北京位于华北平原北部，背靠燕山山脉，毗邻天津市和河北省。北京历史悠久，是世界历史文化名城和古都之一，拥有 3000 多年的建城史和 800 多年的建都史。北京是中国最大的城市之一，也是全国重要的交通枢纽，拥有现代化的国际机场和高效的城市轨道交通系统。北京市下辖 16 个市辖区，常住人口超过 2000 万，是全国政治、文化、国际交往和科技创新中心。北京拥有众多著名的历史文化遗产，如故宫、天坛、颐和园、八达岭长城等，被联合国教科文组织列入世界文化遗产名录的就有 7 处。';
  const paragraph2 = '经济方面，北京是中国重要的经济中心之一，2024 年地区生产总值超过 4.3 万亿元，第三产业占比超过 80%，金融业、信息服务业、科技服务业发达。中关村是国家自主创新示范区，聚集了小米、字节跳动、百度、京东等知名科技企业。北京也是全国的教育中心，拥有北京大学、清华大学、中国人民大学、北京师范大学等 90 多所高校，在校大学生超过 100 万。';
  const paragraph3 = '北京的交通便利，拥有发达的公路、铁路和航空网络。北京首都国际机场是中国最重要的国际枢纽机场之一，年旅客吞吐量超过 8000 万人次。北京大兴国际机场于 2019 年 9 月正式启用，是中国最大的单体航站楼建筑。北京城市内部拥有完善的地铁系统，截至 2024 年运营里程超过 800 公里，是世界上规模最大的城市轨道交通系统之一。北京还是一个具有深厚文化底蕴的城市，京剧、相声、四合院、胡同文化等都是北京独特的文化符号，每年吸引数百万国内外游客前来参观游览。';
  const html = `<html><head><title>北京 - 百度百科</title></head>
    <body>
      <h1>北京</h1>
      <p>${paragraph1}</p>
      <p>${paragraph2}</p>
      <p>${paragraph3}</p>
    </body></html>`;
  const $ = cheerio.load(html, { decodeEntities: true });
  assert(isAntiCrawlResponse(html, $) === false, '正常百度百科页不被误判');
}

// 场景 1：body 极短（< 800B）
{
  const html = '<html><body><h1>Access Denied</h1></body></html>';
  const $ = cheerio.load(html, { decodeEntities: true });
  assert(isAntiCrawlResponse(html, $) === true, '极短 body 命中反爬检测');
}

// 场景 2：反爬关键词
{
  const html = `<html><head><title>欢迎来到百度</title></head><body>
    <div class="container">
      <!-- 百度安全验证：https://wappass.baidu.com/static/... -->
      <h1>百度安全验证</h1>
      <p>请通过安全验证以继续访问</p>
      <script>window.location.href = '/static/anti_cheat/challenge.html';</script>
      <p>${'x'.repeat(2000)}</p>
    </div></body></html>`;
  const $ = cheerio.load(html, { decodeEntities: true });
  assert(isAntiCrawlResponse(html, $) === true, '「百度安全验证」关键词命中');
}

{
  const html = `<html><head><title>Just a moment...</title></head><body>
    <p>Verifying you are human. This may take a few seconds.</p>
    <p>Ray ID: 8a1f2c3e8b0d2345</p>
    <p>${'y'.repeat(2000)}</p>
  </body></html>`;
  const $ = cheerio.load(html, { decodeEntities: true });
  assert(isAntiCrawlResponse(html, $) === true, 'Cloudflare challenge 命中（Ray ID + Just a moment）');
}

// 场景 3：JS-only
{
  const html = `<html><head><title>Some Page</title></head><body>
    <div id="root"></div>
    <script>window.__INIT_STATE__ = {"data": "everything"};</script>
    <script>React.render(document.getElementById('root'), App);</script>
  </body></html>`;
  const $ = cheerio.load(html, { decodeEntities: true });
  assert(isAntiCrawlResponse(html, $) === true, 'JS-only 单页应用命中反爬检测');
}

// 场景 4：标题为空
{
  const html = `<html><head><title></title></head><body>
    <p>${'content '.repeat(300)}</p>
  </body></html>`;
  const $ = cheerio.load(html, { decodeEntities: true });
  assert(isAntiCrawlResponse(html, $) === true, '空标题命中反爬检测');
}

// 场景 4b：通用验证页标题
{
  const html = `<html><head><title>Just a moment...</title></head><body>
    <p>${'content '.repeat(300)}</p>
  </body></html>`;
  const $ = cheerio.load(html, { decodeEntities: true });
  assert(isAntiCrawlResponse(html, $) === true, '通用验证页标题（Just a moment）命中');
}

// 边界 case：仅 HTML 但有足够可见文本（2KB+）
{
  const html = `<html><head><title>Article Title</title></head><body>
    <article>
      <p>${'This is a normal article. '.repeat(50)}</p>
    </article>
  </body></html>`;
  const $ = cheerio.load(html, { decodeEntities: true });
  assert(isAntiCrawlResponse(html, $) === false, '正常文章（足够可见文本）通过检测');
}

// 边界 case：无 $ 参数
{
  assert(isAntiCrawlResponse('Just a moment, verifying... short') === true, '无 $ 参数 + 极短 body 命中场景 1');
  assert(isAntiCrawlResponse('Just a moment ' + '正常文字 '.repeat(100)) === true, '无 $ 参数 + 含关键词 命中场景 2');
}

// ═══════ 2. final url-fetch.js 字段 + 检测器组合测试（不调真 chrome）════════
console.log('\n[检测器综合判定]');

// 反爬 200 + 含关键词（最常见场景：百度安全验证返回 200 + 验证关键词）
{
  const antiCrawlHtml = `<html><head><title>百度安全验证</title></head><body><h1>请通过安全验证</h1><p>${'x'.repeat(5000)}</p></body></html>`;
  const $ = cheerio.load(antiCrawlHtml, { decodeEntities: true });
  assert(isAntiCrawlResponse(antiCrawlHtml, $) === true, '反爬 200（含关键词 + 长 body）被识别');
}
// 反爬 200 + 极短 body
{
  const shortHtml = '<html><body><h1>Forbidden</h1></body></html>';
  const $ = cheerio.load(shortHtml, { decodeEntities: true });
  assert(isAntiCrawlResponse(shortHtml, $) === true, '反爬 200（极短 body）被识别');
}
// 反爬 200 + JS-only
{
  const spaHtml = `<html><head><title>SPA</title></head><body><div id="app"></div><script>app.mount();</script></body></html>`;
  const $ = cheerio.load(spaHtml, { decodeEntities: true });
  assert(isAntiCrawlResponse(spaHtml, $) === true, '反爬 200（JS-only）被识别');
}

// ═══════ 总结 ═══════
console.log(`\n${'='.repeat(40)}`);
console.log(`通过 ${pass}, 失败 ${fail}`);
if (fail > 0) process.exit(1);
console.log('\n✓ 提示：fetchUrlCore 端到端真机测试见 scripts/test-anti-crawl-e2e.sh');
