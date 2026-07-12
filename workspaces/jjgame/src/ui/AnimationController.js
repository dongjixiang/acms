// ACMS · AnimationController.js
// 消消乐游戏动画控制器 —— 管理交换、消除、下落、新生成等关键动作的动画队列。
// 使用 CSS transform + transition 实现 GPU 加速动画。
// 动画队列有序，避免重叠导致的视觉混乱。
//
// 任务 T-MRDO0EEZ 实现

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    // 浏览器环境：将 class 本身挂载到全局，而非返回包装对象
    var result = factory();
    root.AnimationController = result.AnimationController;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ==================== 动画时长常量 ====================
  const ANIM = {
    SWAP: 500,                  // 交换动画 500ms
    INVALID_SWAP: 300,          // 无效交换回退 300ms
    ELIMINATE: 300,             // 消除动画 300ms
    FALL: 400,                  // 下落动画 400ms
    SPAWN: 350,                 // 新生成动画 350ms
    CHAIN_GLOW: 600,            // 连锁高亮 600ms
    SCORE_POP: 800,             // 得分弹出 800ms
    MATCH_HIGHLIGHT: 600,       // 匹配高亮 600ms
  };

  /**
   * 动画控制器类
   * 负责管理所有游戏相关动画的执行、排队和清理。
   */
  class AnimationController {
    /**
     * @param {Object} options
     * @param {HTMLElement} options.gridEl — 游戏网格容器元素
     * @param {Object} options.gameTypes — GameTypes 模块引用
     * @param {Function} [options.getCellElement] — 根据 {y,x} 获取对应 DOM 元素的回调
     * @param {Function} [options.onAnimationComplete] — 动画完成回调
     * @param {number} [options.gridSize] — 网格大小（用于计算下落距离）
     */
    constructor(options = {}) {
      if (!options || !options.gridEl) {
        throw new TypeError('AnimationController: requires gridEl');
      }

      this.gridEl = options.gridEl;
      this.gameTypes = options.gameTypes || null;
      this.getCellElement = options.getCellElement || null;
      this.onAnimationComplete = options.onAnimationComplete || null;
      this.gridSize = options.gridSize || 8;

      // 动画队列：Promise 链式执行
      this._queue = [];
      this._isProcessing = false;

      // 动画锁：阻塞新动画加入
      this._locked = false;

      // 已创建的动画元素（用于清理）
      this._activeAnimations = new Map();
    }

    // ==================== 公共 API ====================

    /**
     * 加锁：阻止新动画加入队列（用于连锁消除期间）
     */
    lock() {
      this._locked = true;
    }

    /**
     * 解锁：允许新动画加入队列
     */
    unlock() {
      this._locked = false;
    }

    /**
     * 清空动画队列
     */
    clearQueue() {
      this._queue = [];
      this._isProcessing = false;
    }

    /**
     * 获取队列长度
     * @returns {number}
     */
    get queueLength() {
      return this._queue.length;
    }

    /**
     * 获取动画锁状态
     * @returns {boolean}
     */
    get isLocked() {
      return this._locked;
    }

    // ==================== 动画执行入口 ====================

    /**
     * 将动画推入队列并按序执行
     * @param {Function} animFn — 返回 Promise 的动画函数
     * @returns {Promise<void>}
     */
    enqueue(animFn) {
      if (this._locked) {
        // 队列已满时跳过（避免堆积）
        return Promise.resolve();
      }

      const wrapped = () => {
        try {
          return animFn();
        } catch (err) {
          console.error('[AnimationController] Queue animation error:', err);
          return Promise.resolve();
        }
      };

      this._queue.push(wrapped);

      if (!this._isProcessing) {
        this._processQueue();
      }

      return wrapped();
    }

    /**
     * 处理动画队列（Promise 链式执行）
     * @private
     */
    async _processQueue() {
      this._isProcessing = true;

      while (this._queue.length > 0) {
        const fn = this._queue.shift();
        await fn();
      }

      this._isProcessing = false;

      if (this.onAnimationComplete) {
        this.onAnimationComplete();
      }
    }

    // ==================== 交换动画 ====================

    /**
     * 执行方块交换动画
     * 使用 translate 变换坐标，500ms ease-in-out
     * @param {{y:number,x:number}} a — 第一个方块坐标
     * @param {{y:number,x:number}} b — 第二个方块坐标
     * @returns {Promise<void>}
     */
    animateSwap(a, b) {
      return this.enqueue(() => {
        return new Promise((resolve) => {
          const elA = this._getCellElement(a);
          const elB = this._getCellElement(b);

          if (!elA || !elB) {
            resolve();
            return;
          }

          // 计算位移向量
          const dx = (b.x - a.x);
          const dy = (b.y - a.y);
          const cellSize = this._getCellSize();
          const moveX = dx * cellSize;
          const moveY = dy * cellSize;

          // 应用过渡动画
          elA.classList.add('animating-swap');
          elB.classList.add('animating-swap');

          // 使用 transform 实现 GPU 加速
          elA.style.transform = `translate(${moveX}px, ${moveY}px)`;
          elB.style.transform = `translate(${-moveX}px, ${-moveY}px)`;

          // 动画结束后清理
          const cleanup = () => {
            // T-MRH7H9GA 修复：先禁用 transition，再清除 transform，
            // 防止棋子"平滑移回原位"的视觉 bug。
            // 如果先移除 animating-swap 类（该类定义了 transition），
            // 再清除 transform，浏览器会用默认 transition 把棋子滑回原位。
            // 正确顺序：先关闭 transition → 清除 transform → 恢复 transition。
            elA.style.transition = 'none';
            elB.style.transition = 'none';
            elA.classList.remove('animating-swap');
            elB.classList.remove('animating-swap');
            elA.style.transform = '';
            elB.style.transform = '';
            // 强制重排以确保 transition 禁用生效
            void elA.offsetHeight;
            void elB.offsetHeight;
            elA.classList.add('animating-swap');
            elB.classList.add('animating-swap');
            elA.style.transition = '';
            elB.style.transition = '';
            this._activeAnimations.delete(elA);
            this._activeAnimations.delete(elB);
            resolve();
          };

          // 监听 transitionend 确保动画完成
          let endCount = 0;
          const checkDone = () => {
            endCount++;
            if (endCount >= 2) {
              elA.removeEventListener('transitionend', handlerA);
              elB.removeEventListener('transitionend', handlerB);
              cleanup();
            }
          };

          const handlerA = (e) => {
            if (e.target === elA) {
              elA.removeEventListener('transitionend', handlerA);
              checkDone();
            }
          };

          const handlerB = (e) => {
            if (e.target === elB) {
              elB.removeEventListener('transitionend', handlerB);
              checkDone();
            }
          };

          elA.addEventListener('transitionend', handlerA);
          elB.addEventListener('transitionend', handlerB);

          // 超时保护（最多等待 600ms）
          setTimeout(() => {
            // T-MRH7H9GA 修复：禁用 transition → 清除 transform → 强制重排 → 恢复 transition
            // 防止棋子"平滑移回原位"的视觉 bug
            elA.style.transition = 'none';
            elB.style.transition = 'none';
            elA.classList.remove('animating-swap');
            elB.classList.remove('animating-swap');
            elA.style.transform = '';
            elB.style.transform = '';
            // 强制重排以确保 transition 禁用生效
            void elA.offsetHeight;
            void elB.offsetHeight;
            elA.classList.add('animating-swap');
            elB.classList.add('animating-swap');
            elA.style.transition = '';
            elB.style.transition = '';
            this._activeAnimations.delete(elA);
            this._activeAnimations.delete(elB);
            resolve();
          }, ANIM.SWAP + 100);

          // 标记交换完成
          requestAnimationFrame(() => {
            elA.classList.add('swapped');
            elB.classList.add('swapped');
          });
        });
      });
    }

    /**
     * 执行无效交换回退动画
     * 300ms ease-in-out
     * @param {{y:number,x:number}} a
     * @param {{y:number,x:number}} b
     * @returns {Promise<void>}
     */
    animateInvalidSwap(a, b) {
      return this.enqueue(() => {
        return new Promise((resolve) => {
          const elA = this._getCellElement(a);
          const elB = this._getCellElement(b);

          if (!elA || !elB) {
            resolve();
            return;
          }

          const dx = (b.x - a.x);
          const dy = (b.y - a.y);
          const cellSize = this._getCellSize();
          const moveX = dx * cellSize;
          const moveY = dy * cellSize;

          // 先移动到交换位置
          elA.classList.add('animating-invalid-swap');
          elB.classList.add('animating-invalid-swap');
          elA.style.transform = `translate(${moveX}px, ${moveY}px)`;
          elB.style.transform = `translate(${-moveX}px, ${-moveY}px)`;

          // 短暂停留后回退
          setTimeout(() => {
            // 回退到原位
            elA.style.transform = 'translate(0, 0)';
            elB.style.transform = 'translate(0, 0)';

            const cleanup = () => {
              // T-MRH7H9GA 修复：禁用 transition 后再清除 transform，防止回退动画残留
              elA.style.transition = 'none';
              elB.style.transition = 'none';
              elA.classList.remove('animating-invalid-swap', 'reverted');
              elB.classList.remove('animating-invalid-swap', 'reverted');
              elA.style.transform = '';
              elB.style.transform = '';
              this._activeAnimations.delete(elA);
              this._activeAnimations.delete(elB);
              resolve();
            };

            const handlerA = () => {
              elA.removeEventListener('transitionend', handlerA);
              if (elA.classList.contains('reverted') && elB.classList.contains('reverted')) {
                cleanup();
              }
            };

            const handlerB = () => {
              elB.removeEventListener('transitionend', handlerB);
              if (elA.classList.contains('reverted') && elB.classList.contains('reverted')) {
                cleanup();
              }
            };

            elA.addEventListener('transitionend', handlerA);
            elB.addEventListener('transitionend', handlerB);

            // 超时保护
            setTimeout(() => {
              cleanup();
            }, ANIM.INVALID_SWAP + 100);
          }, ANIM.INVALID_SWAP);
        });
      });
    }

    // ==================== 匹配高亮动画 ====================

    /**
     * 对匹配的方块执行高亮动画
     * @param {{y:number,x:number}[]} cells
     * @returns {Promise<void>}
     */
    animateMatchHighlight(cells) {
      return this.enqueue(() => {
        return new Promise((resolve) => {
          const els = cells.map(c => this._getCellElement(c)).filter(Boolean);

          if (els.length === 0) {
            resolve();
            return;
          }

          els.forEach(el => {
            el.classList.add('match-highlight');
          });

          setTimeout(() => {
            els.forEach(el => {
              el.classList.remove('match-highlight');
            });
            resolve();
          }, ANIM.MATCH_HIGHLIGHT);
        });
      });
    }

    // ==================== 消除动画 ====================

    /**
     * 执行方块消除动画（缩放 + 透明度）
     * @param {{y:number,x:number}[]} cells
     * @returns {Promise<void>}
     */
    animateEliminate(cells) {
      return this.enqueue(() => {
        return new Promise((resolve) => {
          const els = cells.map(c => this._getCellElement(c)).filter(Boolean);

          if (els.length === 0) {
            resolve();
            return;
          }

          els.forEach(el => {
            el.classList.add('eliminating');
          });

          setTimeout(() => {
            els.forEach(el => {
              el.classList.remove('eliminating');
            });
            resolve();
          }, ANIM.ELIMINATE);
        });
      });
    }

    // ==================== 下落动画 ====================

    /**
     * 执行方块下落动画
     * @param {{y:number,x:number}} cell — 目标位置
     * @param {number} distance — 下落距离（格子数）
     * @returns {Promise<void>}
     */
    animateFall(cell, distance) {
      return this.enqueue(() => {
        return new Promise((resolve) => {
          const el = this._getCellElement(cell);

          if (!el) {
            resolve();
            return;
          }

          const cellSize = this._getCellSize();
          const fallDistance = distance * cellSize;

          el.classList.add('falling');
          el.style.transform = `translateY(-${fallDistance}px)`;

          // 强制重排以触发动画
          void el.offsetHeight;

          el.style.transform = 'translateY(0)';

          const cleanup = () => {
            el.classList.remove('falling');
            el.style.transform = '';
            this._activeAnimations.delete(el);
            resolve();
          };

          const handler = () => {
            el.removeEventListener('transitionend', handler);
            cleanup();
          };

          el.addEventListener('transitionend', handler);

          // 超时保护
          setTimeout(() => {
            cleanup();
          }, ANIM.FALL + 100);
        });
      });
    }

    // ==================== 新生成动画 ====================

    /**
     * 执行新生成方块的入场动画
     * @param {{y:number,x:number}} cell
     * @returns {Promise<void>}
     */
    animateSpawn(cell) {
      return this.enqueue(() => {
        return new Promise((resolve) => {
          const el = this._getCellElement(cell);

          if (!el) {
            resolve();
            return;
          }

          el.classList.add('spawning');

          setTimeout(() => {
            el.classList.remove('spawning');
            resolve();
          }, ANIM.SPAWN);
        });
      });
    }

    // ==================== 连锁特效 ====================

    /**
     * 连锁消除时的发光特效
     * @param {{y:number,x:number}} cell
     * @returns {Promise<void>}
     */
    animateChainGlow(cell) {
      return this.enqueue(() => {
        return new Promise((resolve) => {
          const el = this._getCellElement(cell);

          if (!el) {
            resolve();
            return;
          }

          el.classList.add('chain-glow');

          setTimeout(() => {
            el.classList.remove('chain-glow');
            resolve();
          }, ANIM.CHAIN_GLOW);
        });
      });
    }

    // ==================== 得分弹出 ====================

    /**
     * 得分数字弹出效果
     * @param {HTMLElement} containerEl — 得分显示容器
     * @param {number} score — 得分值
     * @returns {Promise<void>}
     */
    animateScorePop(containerEl, score) {
      return this.enqueue(() => {
        return new Promise((resolve) => {
          if (!containerEl) {
            resolve();
            return;
          }

          const popEl = document.createElement('div');
          popEl.className = 'score-pop';
          popEl.textContent = '+' + score;
          popEl.style.left = '50%';
          popEl.style.top = '50%';
          containerEl.appendChild(popEl);

          // 强制重排
          void popEl.offsetHeight;

          popEl.classList.add('visible');

          const cleanup = () => {
            if (popEl.parentNode) popEl.parentNode.removeChild(popEl);
            resolve();
          };

          setTimeout(cleanup, ANIM.SCORE_POP);
        });
      });
    }

    // ==================== 工具方法 ====================

    /**
     * 获取单元格的 DOM 元素
     * @param {{y:number,x:number}} coords
     * @returns {HTMLElement|null}
     * @private
     */
    _getCellElement(coords) {
      if (this.getCellElement) {
        return this.getCellElement(coords);
      }
      return this.gridEl.querySelector(
        `[data-cell][data-y="${coords.y}"][data-x="${coords.x}"]`
      );
    }

    /**
     * 获取单元格尺寸（像素）
     * @returns {number}
     * @private
     */
    _getCellSize() {
      const sample = this.gridEl.querySelector('.cell');
      if (sample) {
        return sample.offsetWidth;
      }
      // 回退默认值
      return 50;
    }

    // ==================== 批量操作 ====================

    /**
     * 批量消除多个匹配组
     * @param {{cells: Array<{y:number,x:number}>}[]} matchGroups
     * @returns {Promise<void>}
     */
    async animateBatchEliminate(matchGroups) {
      for (const group of matchGroups) {
        if (group && group.cells) {
          await this.animateMatchHighlight(group.cells);
          await this.animateEliminate(group.cells);
        }
      }
    }

    /**
     * 批量执行下落动画序列
     * @param {{y:number,x:number,distance:number}[]} cells
     * @param {number[][]} newGrid — 变化后的 grid 数据（用于计算位置）
     * @returns {Promise<void>}
     */
    async animateFallSequence(cells, newGrid) {
      const promises = cells.map(cell => {
        return this.animateFall(cell, cell.distance);
      });
      await Promise.all(promises);
    }

    /**
     * 批量执行新生成方块动画
     * @param {{y:number,x:number}[]} cells
     * @returns {Promise<void>}
     */
    async animateSpawnSequence(cells) {
      const promises = cells.map(cell => {
        return this.animateSpawn(cell);
      });
      await Promise.all(promises);
    }

    /**
     * 清理所有活跃的动画元素
     * @private
     */
    cleanupAllAnimations() {
      this._activeAnimations.forEach((el) => {
        el.classList.remove(
          'animating-swap',
          'animating-invalid-swap',
          'match-highlight',
          'eliminating',
          'falling',
          'spawning',
          'chain-glow'
        );
        el.style.transform = '';
        if (el.parentNode) el.parentNode.removeChild(el);
      });

      // 清空队列
      this.clearQueue();
    }

    /**
     * 销毁控制器
     */
    destroy() {
      this.cleanupAllAnimations();
      this._queue = [];
      this._activeAnimations.clear();
    }
  }

  return { AnimationController, ANIM };
});
