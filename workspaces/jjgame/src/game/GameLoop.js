// ACMS · GameLoop.js
// 消消乐游戏主循环 —— 集成 GameState、InputHandler、AnimationController、Modal 和 UI 更新。
// 监听步数归零事件，触发游戏结束模态框；处理重新开始和分享。
// 修复 T-MRGDBST1: 添加 grid:changed 事件订阅，确保 DOM 随数据同步更新
//
// 任务 T-MRDO0EFH 实现

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var result = factory();
    module.exports = result;
  } else {
    var result = factory();
    // 将返回对象的每个属性挂载到全局，保持向后兼容
    for (var key in result) {
      if (result.hasOwnProperty(key)) {
        root[key] = result[key];
      }
    }
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * 游戏主循环类
   * 串联 GameState（模型）、InputHandler（输入）、AnimationController（动画）、
   * Modal（UI 模态框）和 UI 更新逻辑。
   */
  class GameLoop {
    /**
     * @param {Object} options
     * @param {GameState} options.gameState — GameState 实例
     * @param {HTMLElement} options.gridEl — 游戏网格容器 DOM
     * @param {HTMLElement} [options.scoreDisplay] — 分数显示元素
     * @param {HTMLElement} [options.movesDisplay] — 步数显示元素
     * @param {Function} [options.getCellElement] — 根据 {y,x} 获取对应 DOM 元素
     * @param {Function} [options.onReset] — 完全重置回调（用于重新开始）
     */
    constructor(options = {}) {
      if (!options || !options.gameState || !options.gridEl) {
        throw new TypeError('GameLoop: requires gameState and gridEl');
      }

      this.gameState = options.gameState;
      this.gridEl = options.gridEl;
      this.scoreDisplay = options.scoreDisplay || null;
      this.movesDisplay = options.movesDisplay || null;
      this.getCellElement = options.getCellElement || null;
      this.onReset = options.onReset || null;

      // 模态框实例
      this._modal = null;

      // 输入处理器实例
      this._inputHandler = null;

      // 动画控制器实例
      this._animationController = null;

      // 订阅清理函数集合
      this._subscriptions = [];

      // 定时器/动画队列引用（用于清理）
      this._timers = [];
      this._rafIds = [];

      // 游戏结束标志（防止重复触发）
      this._gameOverTriggered = false;

      // 绑定事件
      this._init();
    }

    /**
     * 初始化：绑定事件监听器
     */
    _init() {
      // 1. 监听分数变化
      this._subscribe('score:changed', (score) => {
        if (this.scoreDisplay) {
          this.scoreDisplay.textContent = score;
        }
      });

      // 2. 监听步数变化
      this._subscribe('moves:changed', (movesLeft) => {
        if (this.movesDisplay) {
          this.movesDisplay.textContent = movesLeft;
          // 步数低时高亮警告
          if (this.movesDisplay.classList) {
            if (movesLeft <= 3) {
              this.movesDisplay.classList.add('low');
            } else {
              this.movesDisplay.classList.remove('low');
            }
          }
        }
        // 步数归零时触发游戏结束
        if (movesLeft === 0) {
          this._triggerGameOver();
        }
      });

      // 3. 监听游戏结束事件（双重保障）
      this._subscribe('game:over', () => {
        this._triggerGameOver();
      });

    // 4. 监听网格变化事件 —— T-MRGDBST1 修复
      // 当 grid 数据发生变化时（如消除、重力下落、生成新块），
      // 重新渲染整个 DOM 网格以确保棋子显示正确
      // 交换操作的 grid:changed 由 GameLoop 手动控制重绘时机，
      // 避免与交换动画冲突。
      this._subscribe('grid:changed', (gridData) => {
        // 如果是交换操作触发的（isSwap 标记），跳过自动重绘
        // 让 _executeSwapAndEliminate 在动画完成后手动控制渲染
        if (gridData && gridData._isSwapChange) return;
        this._renderGrid();
      });

      // 5. 初始化输入处理器
      this._inputHandler = new InputHandler({
        gameState: this.gameState,
        gridEl: this.gridEl,
        onSwapValid: (blockA, blockB) => {
          this._executeSwapAndEliminate(blockA, blockB);
        },
        onSwapInvalid: () => {
          // 无效交换，不做额外处理
        },
        onGameOver: () => {
          this._triggerGameOver();
        },
        onMoveChanged: (movesLeft) => {
          if (this.movesDisplay) {
            this.movesDisplay.textContent = movesLeft;
          }
          if (movesLeft === 0) {
            this._triggerGameOver();
          }
        },
        selectBlockEl: (coords) => {
          if (this.getCellElement) {
            const el = this.getCellElement(coords);
            if (el) el.classList.add('selected');
          }
        },
        deselectBlockEl: (coords) => {
          if (this.getCellElement) {
            const el = this.getCellElement(coords);
            if (el) el.classList.remove('selected');
          }
        },
      });
    }

    /**
     * 订阅 GameState 事件
     * @param {string} event
     * @param {Function} handler
     * @returns {Function} 取消订阅函数
     * @private
     */
    _subscribe(event, handler) {
      const unsub = this.gameState.subscribe(event, handler);
      this._subscriptions.push(unsub);
      return unsub;
    }

    /**
     * 执行交换并启动连锁消除流程
     * @param {{y:number,x:number}} blockA
     * @param {{y:number,x:number}} blockB
     * @private
     */
    async _executeSwapAndEliminate(blockA, blockB) {
      // 设置动画锁
      this.gameState.setAnimating(true);

      // T-MRGDBST1 修复：先执行数据交换（带 isSwap 标记阻止自动重绘），
      // 再播放交换动画，最后执行消除。
      // 这样避免了 InputHandler 提前触发 grid:changed → _renderGrid 导致的
      // "先交换再交换回去再交换过来" 的重复动画问题。
      this.gameState.swapCells(blockA, blockB, { isSwap: true });

      // 1. 执行交换动画（此时数据已交换，但 DOM 未更新，动画正确展示交换过程）
      if (this._animationController) {
        await this._animationController.animateSwap(blockA, blockB);
      }

      // T-MRH7H9GA 修复：交换动画完成后，必须重新渲染网格以同步 DOM 与数据。
      // 之前的 grid:changed 订阅因 _isSwapChange 标记跳过了重绘，
      // 但动画结束后如果不重绘，CSS transform 被清除后棋子会视觉上"移回原位"，
      // 而数据层已经是交换后的状态，导致视觉与数据不一致（幽灵消除）。
      this._renderGrid();

      // 2. 执行连锁消除
      await this._runChainElimination();

      // 3. 动画锁释放
      this.gameState.setAnimating(false);
    }

    /**
     * 运行连锁消除流程
     * @private
     */
    async _runChainElimination() {
      if (!this._animationController) return;

      const engine = ChainReactionEngine.createEngine({
        gridSize: this.gameState.gridSize,
      });

      let chainCount = 0;

      while (true) {
        // 获取当前 grid
        const grid = this.gameState.grid;

        // 检测匹配
        const matches = MatchDetector.detectMatches(grid);
        if (matches.length === 0) break;

        chainCount++;

        // 提取被消除的格子
        const matchedCells = this._extractMatchedCells(matches);

        // 高亮匹配格子
        for (const cell of matchedCells) {
          const el = this.getCellElement ? this.getCellElement(cell) : null;
          if (el) {
            el.classList.add('match-highlight');
          }
        }

        // 等待高亮动画
        await this._wait(300);

        // 执行消除动画
        for (const cell of matchedCells) {
          const el = this.getCellElement ? this.getCellElement(cell) : null;
          if (el) {
            el.classList.remove('match-highlight');
            el.classList.add('eliminating');
          }
        }

        // 等待消除动画完成
        await this._wait(300);

        // 在 GameState 中标记消除
        this.gameState.flagCellsForRemoval(Array.from(matchedCells).map(k => {
          const [y, x] = k.split(',').map(Number);
          return { y, x };
        }));

        // 计算得分
        const score = this._calculateMatchScore(matches, chainCount);
        this.gameState.addScore(score);

        // 清理消除动画类
        for (const cell of matchedCells) {
          const el = this.getCellElement ? this.getCellElement(cell) : null;
          if (el) {
            el.classList.remove('eliminating');
          }
        }

        // 应用重力（在 grid 数据层面）
        engine.applyGravityToGameState(this.gameState);

        // 生成新元素
        engine.generateNewBlocks(this.gameState);

        // 等待重力/生成动画
        await this._wait(400);
      }

      // 检查是否没有可消除的方块了（死局）
      const finalGrid = this.gameState.grid;
      const finalMatches = MatchDetector.detectMatches(finalGrid);
      if (finalMatches.length === 0 && chainCount > 0) {
        // 连锁结束，检查是否还有可消除的
      }
    }

    /**
     * 从匹配组中提取被消除的格子（去重）
     * @param {Array} matches
     * @returns {Set<string>}
     * @private
     */
    _extractMatchedCells(matches) {
      const cells = new Set();
      for (const match of matches) {
        for (const cell of match.cells) {
          cells.add(`${cell.y},${cell.x}`);
        }
      }
      return cells;
    }

    /**
     * 计算匹配得分
     * @param {Array} matches
     * @param {number} chainDepth
     * @returns {number}
     * @private
     */
    _calculateMatchScore(matches, chainDepth) {
      let totalBlocks = 0;
      for (const match of matches) {
        totalBlocks += match.cells.length;
      }
      // 基础分：每个方块 10 分，连锁倍率
      const baseScore = totalBlocks * 10;
      const multiplier = chainDepth;
      return baseScore * multiplier;
    }

    /**
     * 等待指定毫秒数
     * @param {number} ms
     * @returns {Promise<void>}
     * @private
     */
    _wait(ms) {
      return new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        this._timers.push(timer);
      });
    }

    /**
     * 触发游戏结束流程
     * @private
     */
    _triggerGameOver() {
      // 防止重复触发
      if (this._gameOverTriggered) return;
      this._gameOverTriggered = true;

      // 显示模态框
      this.showGameOverModal();
    }

    /**
     * 显示游戏结束模态框
     */
    showGameOverModal() {
      if (!this._modal) {
        this._modal = new Modal({
          container: document.body,
          onRestart: () => this._restartGame(),
          onShare: () => this._shareGame(),
        });
      }

      this._modal.show({
        score: this.gameState.score,
        movesLeft: this.gameState.movesLeft,
      });
    }

    /**
     * 重新开始游戏
     * @private
     */
    _restartGame() {
      // 1. 隐藏模态框
      if (this._modal) {
        this._modal.hide();
      }

      // 2. 清理定时器
      this._clearTimers();

      // 3. 清理 RAF
      this._clearRafs();

      // 4. 重置 GameState
      this.gameState.reset();

      // 5. 清除动画队列
      if (this._animationController) {
        this._animationController.clearQueue();
      }

      // 6. 重置游戏结束标志
      this._gameOverTriggered = false;

      // 7. 重新生成初始盘面（调用 LevelGenerator）
      if (typeof LevelGenerator !== 'undefined') {
        const grid = LevelGenerator.generateGrid();
        this.gameState.fillGrid(grid);
      } else {
        // T-MRGDBST1 降级处理：如果 LevelGenerator 不可用，使用 fillRandom
        console.warn('[GameLoop] LevelGenerator 不可用，使用 fillRandom 替代');
        this.gameState.fillRandom(Math.random);
      }

      // 8. 刷新网格 DOM（通过 grid:changed 事件自动触发）
      // 由于 fillGrid 会触发 grid:changed 事件，_init 中的订阅会自动调用 _renderGrid
      // 但为了确保万无一失，手动再调用一次
      this._renderGrid();

      // 9. 重置 UI 显示
      if (this.scoreDisplay) {
        this.scoreDisplay.textContent = '0';
      }
      if (this.movesDisplay) {
        this.movesDisplay.textContent = this.gameState.movesLeft;
        if (this.movesDisplay.classList) {
          this.movesDisplay.classList.remove('low');
        }
      }

      // 10. 通知外部重置回调
      if (this.onReset) {
        this.onReset();
      }
    }

    /**
     * 模拟分享功能
     * @private
     */
    _shareGame() {
      if (this._modal && this._modal.onShare) {
        this._modal.onShare();
      } else {
        alert('分享成功');
      }
    }

    /**
     * 渲染网格 DOM
     * 修复 T-MRGDBST1: 确保所有格子都有正确的 data-type 属性和内联背景色
     * @private
     */
    _renderGrid() {
      if (!this.gridEl) return;

      // 清除现有网格
      this.gridEl.innerHTML = '';

      const gridSize = this.gameState.gridSize;
      const grid = this.gameState.grid;

      const CELL_COLORS = {
        '-1': '#1a1a40',
        '0':  '#e74c3c',
        '1':  '#3498db',
        '2':  '#2ecc71',
        '3':  '#f1c40f',
        '4':  '#9b59b6',
        '5':  '#e67e22',
      };

      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          const cell = document.createElement('div');
          cell.className = 'cell';
          cell.setAttribute('data-cell', 'true');
          cell.setAttribute('data-y', String(y));
          cell.setAttribute('data-x', String(x));

          const type = (grid[y] && grid[y][x] != null) ? grid[y][x] : -1;
          if (type >= 0) {
            cell.setAttribute('data-type', String(type));
          } else {
            cell.setAttribute('data-type', '-1');
          }

          // 🔧 T-MRGDBST1-v4: 添加内联背景色作为 CSS fallback
          const bgColor = CELL_COLORS[String(type)];
          if (bgColor) {
            cell.style.backgroundColor = bgColor;
          }

          this.gridEl.appendChild(cell);
        }
      }

      console.log('[GameLoop] 网格已渲染', gridSize, 'x', gridSize);
    }

    /**
     * 清理所有定时器
     * @private
     */
    _clearTimers() {
      for (const timer of this._timers) {
        clearTimeout(timer);
      }
      this._timers = [];
    }

    /**
     * 清理所有 RAF
     * @private
     */
    _clearRafs() {
      for (const id of this._rafIds) {
        cancelAnimationFrame(id);
      }
      this._rafIds = [];
    }

    /**
     * 销毁游戏循环，清理所有资源
     */
    destroy() {
      // 清理订阅
      for (const unsub of this._subscriptions) {
        try { unsub(); } catch (_) {}
      }
      this._subscriptions = [];

      // 清理定时器
      this._clearTimers();
      this._clearRafs();

      // 销毁输入处理器
      if (this._inputHandler && this._inputHandler.destroy) {
        this._inputHandler.destroy();
      }

      // 销毁动画控制器
      if (this._animationController) {
        this._animationController.clearQueue();
      }

      // 销毁模态框
      if (this._modal) {
        this._modal.destroy();
        this._modal = null;
      }

      // 重置标志
      this._gameOverTriggered = false;
    }
  }

  return { GameLoop };
});
