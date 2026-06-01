/**
 * form-validator.js — 表单验证引擎
 * 支持必填校验、格式校验、MPQ校验、数量阈值警告
 */
(function() {
  'use strict';

  const Validator = {
    errors: [],

    /** 运行所有规则 */
    validate(rules, data) {
      this.errors = [];
      for (const rule of rules) {
        const value = this._getValue(data, rule.field);
        if (rule.required && !value) {
          this.errors.push({ field: rule.field, message: rule.label + '为必填项', type: 'error' });
          continue;
        }
        if (value && rule.pattern && !rule.pattern.test(value)) {
          this.errors.push({ field: rule.field, message: rule.label + '格式不正确', type: 'error' });
        }
        if (rule.min !== undefined && value < rule.min) {
          this.errors.push({ field: rule.field, message: rule.label + '不能小于' + rule.min, type: 'error' });
        }
        if (rule.max !== undefined && value > rule.max) {
          this.errors.push({ field: rule.field, message: rule.label + '不能超过' + rule.max, type: 'warning' });
        }
      }
      return this.errors;
    },

    /** MPQ（最小包装量）校验 */
    validateMPQ(modelName, quantity) {
      const mpqMap = {
        'STM32F103C8T6': 2500, 'ESP32-WROOM-32': 800, 'LM358P': 3000,
        'AMS1117-3.3': 5000, 'ATmega328P': 1000, 'CH340G': 2000,
        'NRF24L01+': 1000, 'TP4056': 3000, '1N4148': 10000, 'IRF520': 3000
      };
      const mpq = mpqMap[modelName];
      if (!mpq) return { valid: true, mpq: null, message: '' };
      if (quantity % mpq !== 0) {
        return { valid: false, mpq, message: `${modelName} 的MPQ为${mpq}，建议填写MPQ整数倍 (当前差值: ${mpq - (quantity % mpq)})` };
      }
      return { valid: true, mpq, message: '✓ MPQ校验通过' };
    },

    /** 数量阈值警告 */
    checkQuantityThreshold(modelName, quantity) {
      const thresholds = {
        'Jetson Nano 4GB': { warn: 5, error: 10 },
        'Raspberry Pi 4B': { warn: 10, error: 20 },
        'STM32F103C8T6': { warn: 50, error: 100 }
      };
      const t = thresholds[modelName];
      if (!t) return null;
      if (quantity >= t.error) return { level: 'error', message: `${modelName} 数量超过${t.error}，建议联系PM确认库存` };
      if (quantity >= t.warn) return { level: 'warning', message: `${modelName} 数量接近${t.warn}，请确认是否合理` };
      return null;
    },

    /** 显示错误到表单 */
    showErrors(containerId, errors) {
      const container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = errors.map(e =>
        `<div class="form-error ${e.type === 'warning' ? 'warning' : ''}">${e.message}</div>`
      ).join('');
    },

    /** 表单字段高亮 */
    highlightFields(errors) {
      document.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
      errors.forEach(e => {
        const el = document.querySelector(`[name="${e.field}"]`);
        if (el) el.classList.add('is-invalid');
      });
    },

    _getValue(obj, path) {
      return path.split('.').reduce((o, k) => o && o[k] !== undefined ? o[k] : '', obj);
    }
  };

  window.Validator = Validator;
  console.log('[Validator] 表单验证模块已加载');
})();
