// 搜索"夏日海滩壁纸" 3 张图，并返回视觉描述
const path = require('path');
const { browserSearchBaiduImage } = require('./server/services/web-search');
const visionService = require('./server/services/vision-service');

async function main() {
  const query = '夏日海滩壁纸';
  const maxResults = 3;
  
  console.log(`[search] 搜索 "${query}"...`);
  
  // 1) 搜图
  let imgResult;
  try {
    imgResult = await browserSearchBaiduImage(query, maxResults);
  } catch (e) {
    console.error('[search] 失败:', e.message);
    return;
  }
  
  if (imgResult.error) {
    console.error('[search] 搜索失败:', imgResult.error);
    return;
  }
  
  const rawImages = imgResult.images || [];
  console.log(`[search] 找到 ${rawImages.length} 张图`);
  
  if (rawImages.length === 0) {
    console.log('未搜到结果');
    return;
  }
  
  // 2) 并发下载 + 描述
  const concurrency = 2;
  const described = [];
  
  for (let i = 0; i < rawImages.length; i += concurrency) {
    const batch = rawImages.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(async (img) => {
      const out = { thumb: img.thumb, url: img.url, title: img.title };
      try {
        const fr = await visionService.fetchImageBuffer(img.url);
        if (!fr.ok) {
          out.fetch_error = fr.error;
          return out;
        }
        const dr = await visionService.describeImage(fr.buffer, {}, {});
        if (dr.ok) {
          out.description = dr.description;
          out.mime = dr.mime;
          out.size = dr.size;
        } else {
          out.describe_error = dr.error || 'VISION_FAIL';
        }
      } catch (e) {
        out.describe_error = e.message || 'UNKNOWN';
      }
      return out;
    }));
    described.push(...batchResults);
    console.log(`[describe] 完成 ${Math.min(i + concurrency, rawImages.length)}/${rawImages.length}`);
  }
  
  const describedCount = described.filter(d => d.description).length;
  console.log(`\n=== 结果 ===`);
  console.log(`查询: ${query}`);
  console.log(`找到: ${rawImages.length} 张，成功描述: ${describedCount} 张`);
  console.log('');
  
  for (let idx = 0; idx < described.length; idx++) {
    const img = described[idx];
    console.log(`--- 图 ${idx + 1} ---`);
    console.log(`标题: ${img.title || '(无标题)'}`);
    console.log(`URL: ${img.url}`);
    if (img.description) {
      console.log(`描述: ${img.description}`);
    } else {
      console.log(`错误: ${img.fetch_error || img.describe_error || '未知'}`);
    }
    console.log('');
  }
}

main().catch(e => console.error('Fatal:', e));
