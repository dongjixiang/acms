/**
 * erp-api.js — ERP 对接模拟 API
 * 模拟库存查询、物料信息拉取、MPQ校验
 */
window.ERPApi = (function() {
  // 模拟物料数据库
  const materialDB = {
    'STM32F103C8T6': { manufacturer: 'ST', mpq: 2500, stock: 1250, package: 'LQFP-48', desc: '32位ARM Cortex-M3 MCU, 72MHz, 64KB Flash', spec: 'STM32F103C8T6_datasheet.pdf' },
    'ESP32-WROOM-32': { manufacturer: 'Espressif', mpq: 800, stock: 600, package: 'SMD-38', desc: 'WiFi+BT双模SoC, 240MHz双核', spec: 'ESP32-WROOM-32_datasheet.pdf' },
    'LM358P': { manufacturer: 'TI', mpq: 3000, stock: 2800, package: 'DIP-8', desc: '双路通用运算放大器', spec: 'LM358P_datasheet.pdf' },
    'AMS1117-3.3': { manufacturer: 'AMS', mpq: 5000, stock: 4800, package: 'SOT-223', desc: '3.3V低压差线性稳压器, 1A', spec: 'AMS1117_datasheet.pdf' },
    'ATmega328P': { manufacturer: 'Microchip', mpq: 1000, stock: 550, package: 'DIP-28', desc: '8位AVR MCU, 32KB Flash, 16MHz', spec: 'ATmega328P_datasheet.pdf' },
    'NRF24L01+': { manufacturer: 'Nordic', mpq: 1000, stock: 1100, package: 'QFN-20', desc: '2.4GHz无线收发器', spec: 'NRF24L01_datasheet.pdf' }
  };

  /** 模拟延迟 */
  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  /** 查询库存可用数量 */
  async function queryStock(modelName) {
    await delay(400 + Math.random() * 600);
    const material = materialDB[modelName];
    if (!material) return { success: false, message: `未找到型号 ${modelName} 的库存信息`, data: null };
    return { success: true, data: { model: modelName, stock: material.stock, mpq: material.mpq, warehouse: '主仓库-A01', lastUpdate: new Date().toISOString() } };
  }

  /** 拉取 ERP 物料信息 */
  async function fetchMaterial(modelName) {
    await delay(300 + Math.random() * 400);
    const material = materialDB[modelName];
    if (!material) return { success: false, message: `未找到型号 ${modelName} 的物料信息`, data: null };
    return { success: true, data: { model: modelName, ...material } };
  }

  /** MPQ 校验 */
  function validateMPQ(modelName, quantity) {
    const material = materialDB[modelName];
    if (!material) return { valid: true, mpq: null, message: '未查到MPQ信息' };
    if (quantity % material.mpq !== 0) {
      return { valid: false, mpq: material.mpq, message: `MPQ校验失败：${modelName} 的最小包装量为 ${material.mpq}，当前数量 ${quantity} 不是MPQ整数倍（余数: ${quantity % material.mpq}）` };
    }
    return { valid: true, mpq: material.mpq, message: `✓ MPQ校验通过（MPQ: ${material.mpq}）` };
  }

  /** 批量拉取 */
  async function batchFetch(models) {
    const results = [];
    for (const m of models) {
      const stock = await queryStock(m);
      const material = await fetchMaterial(m);
      results.push({ model: m, stock: stock.data, material: material.data });
    }
    return results;
  }

  return { queryStock, fetchMaterial, validateMPQ, batchFetch };
})();
