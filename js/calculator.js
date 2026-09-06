/**
 * 竞彩半全场「多维变式 & 人造单关」实战配资计算引擎 (Calculator Engine)
 * 包含：荷兰式配资算法 (Dutching)、等额对冲、攻守兼备阶梯出票、均注模式
 */

// 9 项半全场元数据与颜色标记
const OUTCOMES_META = {
    'hh': { name: '胜胜', half: '胜', full: '胜', color: 'emerald' },
    'hd': { name: '胜平', half: '胜', full: '平', color: 'blue' },
    'ha': { name: '胜负', half: '胜', full: '负', color: 'purple' },
    'dh': { name: '平胜', half: '平', full: '胜', color: 'emerald' },
    'dd': { name: '平平', half: '平', full: '平', color: 'blue' },
    'da': { name: '平负', half: '平', full: '负', color: 'purple' },
    'ah': { name: '负胜', half: '负', full: '胜', color: 'emerald' },
    'ad': { name: '负平', half: '负', full: '平', color: 'blue' },
    'aa': { name: '负负', half: '负', full: '负', color: 'purple' },
};

// 预设变式策略集
const STRATEGY_PRESETS = {
    'ft_home': {
        name: '全场主胜 (3项)',
        desc: '覆盖全场主队获胜的全部半场走势，主胜100%有且仅有1张中奖（物理守恒）',
        outcomes: ['hh', 'dh', 'ah'],
        attack: ['hh', 'dh', 'ah'],
        defense: []
    },
    'ft_draw': {
        name: '全场平局 (3项)',
        desc: '覆盖全场双方打平的全部半场走势，打平100%有且仅有1张中奖（物理守恒）',
        outcomes: ['hd', 'dd', 'ad'],
        attack: ['hd', 'dd', 'ad'],
        defense: []
    },
    'ft_away': {
        name: '全场客胜 (3项)',
        desc: '覆盖全场客队获胜的全部半场走势，客胜100%有且仅有1张中奖（物理守恒）',
        outcomes: ['ha', 'da', 'aa'],
        attack: ['ha', 'da', 'aa'],
        defense: []
    },
    'ht_draw': {
        name: '锁定半场平 (3项)',
        desc: '锁定上半场打平 (0-0/1-1)，全包其后胜平负走势，只要半场打平100%中奖！',
        outcomes: ['dh', 'dd', 'da'],
        attack: ['dh', 'dd', 'da'],
        defense: []
    },
    'ht_home': {
        name: '锁定半场主领先 (3项)',
        desc: '锁定上半场主队打进第一球/半场领先，全包全场胜平负，半场主胜100%中奖！',
        outcomes: ['hh', 'hd', 'ha'],
        attack: ['hh', 'hd', 'ha'],
        defense: []
    },
    'ht_away': {
        name: '锁定半场客领先 (3项)',
        desc: '锁定上半场客队半场领先，全包全场胜平负，半场客胜100%中奖！',
        outcomes: ['ah', 'ad', 'aa'],
        attack: ['ah', 'ad', 'aa'],
        defense: []
    },
    'double_home_draw': {
        name: '主队不败 (胜+平 6项)',
        desc: '主胜或打平均中奖！只要客队不赢即可稳妥兑奖；支持“主攻胜+防守平保本”防冷！',
        outcomes: ['hh', 'dh', 'ah', 'hd', 'dd', 'ad'],
        attack: ['hh', 'dh', 'ah'],
        defense: ['hd', 'dd', 'ad']
    },
    'double_away_draw': {
        name: '客队不败 (平+负 6项)',
        desc: '客胜或打平均中奖！只要主队不赢即可兑奖；支持“主攻客胜+防守平保本”！',
        outcomes: ['hd', 'dd', 'ad', 'ha', 'da', 'aa'],
        attack: ['ha', 'da', 'aa'],
        defense: ['hd', 'dd', 'ad']
    },
    'double_decisive': {
        name: '决出胜负 (胜+负 6项)',
        desc: '大开大合两头通吃！只要全场不打平即可兑奖；排除无聊默契平局！',
        outcomes: ['hh', 'dh', 'ah', 'ha', 'da', 'aa'],
        attack: ['hh', 'dh', 'ah'],
        defense: ['ha', 'da', 'aa']
    },
    'double_ht_home_draw': {
        name: '主半场不败 (6项)',
        desc: '上半场主队领先或双方打平即可兑奖！锁定主队半场绝不落后！',
        outcomes: ['hh', 'hd', 'ha', 'dh', 'dd', 'da'],
        attack: ['hh', 'dh', 'dd'],
        defense: ['hd', 'ha', 'da']
    }
};

let currentActivePreset = 'ft_home';
let currentAllocMode = 'dutched'; // 'dutched' | 'attack_defense' | 'equal_units'

// 设置配资模式 (等额对冲 vs 攻守兼备 vs 均注)
function setAllocationMode(mode) {
    currentAllocMode = mode;
    const btnD = document.getElementById('allocBtnDutched');
    const btnA = document.getElementById('allocBtnAttack');
    const btnE = document.getElementById('allocBtnEqual');

    if (btnD && btnA && btnE) {
        // 用 classList 只切换激活态配色，保留 HTML 里的响应式基础类（如 flex-1 sm:flex-initial），
        // 避免 className= 整体覆盖导致窄屏配资模式按钮丢失等宽布局
        [btnD, btnA, btnE].forEach(b => {
            b.classList.remove('bg-emerald-500', 'text-white', 'shadow-sm');
            b.classList.add('text-slate-400', 'hover:text-white');
        });
        const activeBtn = mode === 'dutched' ? btnD : (mode === 'attack_defense' ? btnA : btnE);
        if (activeBtn) {
            activeBtn.classList.remove('text-slate-400', 'hover:text-white');
            activeBtn.classList.add('bg-emerald-500', 'text-white', 'shadow-sm');
        }

        const hintEl = document.getElementById('planModeHint');
        if (hintEl) {
            hintEl.innerText = mode === 'dutched' ? '当前：绝对等额对冲 (平滑保底)'
                : (mode === 'attack_defense' ? '当前：核心主攻 + 防守保本 (阶梯出票)' : '当前：均注搏冷 (1:1等注数)');
        }
    }
    calculate();
}

// 快捷预算
function setBudget(amt) {
    const input = document.getElementById('inputBudget');
    if (input) {
        input.value = amt;
    }
    calculate();
}

// 应用策略预设
function applyPreset(presetKey) {
    currentActivePreset = presetKey;
    const preset = STRATEGY_PRESETS[presetKey];
    if (!preset) return;

    // 更新预设按钮激活态样式
    Object.keys(STRATEGY_PRESETS).forEach(k => {
        const btn = document.getElementById(`preset_${k}`);
        if (btn) {
            btn.className = (k === presetKey)
                ? 'px-2.5 py-1 rounded text-xs font-medium transition bg-emerald-500 text-white whitespace-nowrap shadow-sm'
                : 'px-2.5 py-1 rounded text-xs font-medium transition bg-slate-800 text-slate-300 hover:text-white whitespace-nowrap';
        }
    });

    // 描述更新
    const descEl = document.getElementById('strategyDescText');
    if (descEl) {
        descEl.innerHTML = `
            <span class="text-emerald-400 font-bold">当前策略: ${preset.name}</span>
            <span class="text-slate-400 ml-1.5">${preset.desc}</span>
        `;
    }

    // 同步勾选九宫格
    syncOutcomeCheckboxes(preset.outcomes);

    calculate();
}

// 将九宫格勾选同步为指定赛果 key 集合（更新 checkbox + 卡片选中态）
// 供 applyPreset 与「收藏方案载入」(storage.js) 复用，保证单元格视觉与勾选态一致
function syncOutcomeCheckboxes(selectedKeys) {
    const set = new Set(selectedKeys || []);
    Object.keys(OUTCOMES_META).forEach(k => {
        const isSelected = set.has(k);
        const chk = document.getElementById(`chk_${k}`);
        const cell = document.getElementById(`cell_${k}`);
        if (chk) chk.checked = isSelected;
        if (cell) {
            if (isSelected) {
                cell.classList.add('selected');
                cell.classList.remove('bg-slate-800/30', 'border-slate-800');
                cell.classList.add('bg-slate-800/60', 'border-slate-700');
            } else {
                cell.classList.remove('selected');
                cell.classList.add('bg-slate-800/30', 'border-slate-800');
                cell.classList.remove('bg-slate-800/60', 'border-slate-700');
            }
        }
    });
}

// 点击九宫格单元格增删
function toggleCell(key, event) {
    const chk = document.getElementById(`chk_${key}`);
    const cell = document.getElementById(`cell_${key}`);
    if (event && event.target !== chk) {
        chk.checked = !chk.checked;
    }
    if (cell && chk) {
        if (chk.checked) {
            cell.classList.add('selected');
            cell.classList.remove('bg-slate-800/30', 'border-slate-800');
            cell.classList.add('bg-slate-800/60', 'border-slate-700');
        } else {
            cell.classList.remove('selected');
            cell.classList.add('bg-slate-800/30', 'border-slate-800');
            cell.classList.remove('bg-slate-800/60', 'border-slate-700');
        }
    }
    calculate();
}

// 核心配资计算引擎
function calculate() {
    const budgetInput = document.getElementById('inputBudget');
    const budget = budgetInput ? (parseFloat(budgetInput.value) || 100) : 100;

    // 1. 获取所有勾选的项与对应赔率
    const selected = [];
    Object.keys(OUTCOMES_META).forEach(k => {
        const chk = document.getElementById(`chk_${k}`);
        if (chk && chk.checked) {
            const oddsInput = document.getElementById(`odds_${k}`);
            const odds = oddsInput ? (parseFloat(oddsInput.value) || 0) : 0;
            if (odds > 0) {
                selected.push({ key: k, odds: odds, meta: OUTCOMES_META[k] });
            }
        }
    });

    const selBadge = document.getElementById('selectedCountBadge');
    if (selBadge) selBadge.innerText = `已选 ${selected.length} 项`;

    if (selected.length === 0) {
        document.getElementById('resSynthSp').innerText = '--';
        document.getElementById('resBreakEvenTag').innerHTML = '<span class="text-slate-500">未选择赛果</span>';
        const planCards = document.getElementById('planCardsContainer');
        if (planCards) {
            planCards.innerHTML = '<div class="py-6 text-center text-slate-500 text-xs">请勾选至少 1 项半全场赛果</div>';
        }
        // 无勾选时同时隐藏预算越界警示（避免残留旧状态）
        const warnEl = document.getElementById('budgetOverWarn');
        if (warnEl) warnEl.classList.add('hidden');
        return;
    }

    // 2. 组合合成单关 SP: 1 / sum(1 / odds)
    const sumInv = selected.reduce((acc, item) => acc + (1.0 / item.odds), 0);
    const synthSp = sumInv > 0 ? (1.0 / sumInv) : 0;
    const synthSpEl = document.getElementById('resSynthSp');
    if (synthSpEl) synthSpEl.innerText = synthSp.toFixed(4);

    // 3. 无损对冲与折损研判
    const probSum = sumInv * 100;
    const probEl = document.getElementById('resProbSum');
    if (probEl) probEl.innerText = `隐含概率: ${probSum.toFixed(1)}%`;
    const tagEl = document.getElementById('resBreakEvenTag');

    if (tagEl) {
        if (synthSp >= 1.0) {
            tagEl.innerHTML = `<span class="text-emerald-400 font-bold">可绝对保本盈利 (+${((synthSp - 1.0) * 100).toFixed(1)}%)</span>`;
        } else if (synthSp >= 0.95) {
            tagEl.innerHTML = `<span class="text-amber-400 font-semibold">微弱折损 (${((synthSp - 1.0) * 100).toFixed(1)}%)</span>`;
        } else {
            tagEl.innerHTML = `<span class="text-slate-400">综合折损 (${((synthSp - 1.0) * 100).toFixed(1)}%)</span>`;
        }
    }

    // 覆盖类型提示
    const covTypeEl = document.getElementById('resCoverageType');
    const covDetailEl = document.getElementById('resCoverageDetail');
    if (covTypeEl && covDetailEl) {
        if (selected.length === 3) {
            covTypeEl.innerText = '全景覆盖 (3项)';
            covDetailEl.innerText = '该赛果方向100%有且仅有1张中';
        } else if (selected.length === 6) {
            covTypeEl.innerText = '双选不败 (6项)';
            covDetailEl.innerText = '覆盖2种全场赛果，容错率极高';
        } else {
            covTypeEl.innerText = `自定义组合 (${selected.length}项)`;
            covDetailEl.innerText = '自由点选策略';
        }
    }

    // 4. 计算各注数 (实体店 2 元整数)
    const totalTargetUnits = Math.max(selected.length, Math.round(budget / 2));
    const unitsMap = {};

    // 获取当前策略的攻守分组
    const curPreset = STRATEGY_PRESETS[currentActivePreset];
    const hasDefense = curPreset && curPreset.defense && curPreset.defense.length > 0;

    if (currentAllocMode === 'attack_defense' && hasDefense) {
        // 核心主攻 + 防守保本模式
        const defKeys = curPreset.defense.filter(k => selected.some(s => s.key === k));
        const attKeys = curPreset.attack.filter(k => selected.some(s => s.key === k));

        let defUnitsTotal = 0;
        defKeys.forEach(k => {
            const item = selected.find(s => s.key === k);
            if (item) {
                const u = Math.max(1, Math.ceil(budget / (2.0 * item.odds)));
                unitsMap[k] = u;
                defUnitsTotal += u;
            }
        });

        // 剩余注数给主攻项
        const remainUnits = Math.max(attKeys.length, totalTargetUnits - defUnitsTotal);
        const attSumInv = attKeys.reduce((acc, k) => {
            const item = selected.find(s => s.key === k);
            return acc + (item ? (1.0 / item.odds) : 0);
        }, 0);

        attKeys.forEach(k => {
            const item = selected.find(s => s.key === k);
            if (item && attSumInv > 0) {
                const w = (1.0 / item.odds) / attSumInv;
                unitsMap[k] = Math.max(1, Math.round(remainUnits * w));
            } else {
                unitsMap[k] = 1;
            }
        });

        // 微调总注数匹配目标
        const curTotal = Object.values(unitsMap).reduce((a, b) => a + b, 0);
        const diff = totalTargetUnits - curTotal;
        if (diff !== 0 && attKeys.length > 0) {
            unitsMap[attKeys[0]] = Math.max(1, (unitsMap[attKeys[0]] || 1) + diff);
        }

    } else if (currentAllocMode === 'equal_units') {
        // 均注模式 1:1
        const each = Math.max(1, Math.floor(totalTargetUnits / selected.length));
        selected.forEach(s => unitsMap[s.key] = each);
        let rem = totalTargetUnits - (each * selected.length);
        if (rem > 0) {
            unitsMap[selected[0].key] += rem;
        }

    } else {
        // 经典荷兰式等额对冲 (按 1/odds 分配)
        selected.forEach(s => {
            const w = (1.0 / s.odds) / sumInv;
            unitsMap[s.key] = Math.max(1, Math.round(totalTargetUnits * w));
        });

        // 微调
        const curTotal = Object.values(unitsMap).reduce((a, b) => a + b, 0);
        const diff = totalTargetUnits - curTotal;
        if (diff !== 0) {
            unitsMap[selected[0].key] = Math.max(1, unitsMap[selected[0].key] + diff);
        }
    }

    // 5. 渲染出票方案卡片
    let totalCost = 0;
    let totalUnits = 0;
    const rois = [];

    const container = document.getElementById('planCardsContainer');
    if (container) container.innerHTML = '';

    selected.forEach(item => {
        const u = unitsMap[item.key] || 1;
        const cost = u * 2;
        const payout = cost * item.odds;
        totalCost += cost;
        totalUnits += u;

        const isDef = hasDefense && curPreset.defense.includes(item.key);
        const tagLabel = isDef ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">防守保本</span>'
            : (hasDefense ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">核心主攻</span>' : '');

        item.u = u;
        item.cost = cost;
        item.payout = payout;
        item.isDef = isDef;
        item.tagLabel = tagLabel;
    });

    selected.forEach(item => {
        const roi = ((item.payout - totalCost) / totalCost) * 100;
        rois.push(roi);

        let roiColorClass = 'text-emerald-400';
        let roiBgClass = 'border-emerald-500/20 bg-slate-800/70';
        if (roi < -5) {
            roiColorClass = 'text-red-400';
            roiBgClass = 'border-slate-700 bg-slate-800/40';
        } else if (roi <= 5) {
            roiColorClass = 'text-amber-400';
            roiBgClass = 'border-amber-500/20 bg-slate-800/70';
        }

        if (container) {
            const div = document.createElement('div');
            div.className = `p-2.5 rounded-lg border ${roiBgClass} flex flex-wrap items-center justify-between gap-2 text-xs transition`;
            div.innerHTML = `
                <div class="flex items-center space-x-2.5">
                    <span class="px-2 py-0.5 rounded bg-slate-900 font-bold font-mono text-white border border-slate-700">${item.meta.name}</span>
                    ${item.tagLabel}
                    <span class="text-slate-300">SP: <strong class="font-mono text-white">${item.odds.toFixed(2)}</strong></span>
                </div>
                <div class="flex items-center space-x-4">
                    <div>
                        <span class="text-slate-400">买入: </span>
                        <span class="font-bold text-white font-mono text-sm">${item.u}</span> 注
                        <span class="text-slate-400 font-mono">(¥${item.cost})</span>
                    </div>
                    <div class="text-right">
                        <span class="text-slate-400">命中返: </span>
                        <span class="font-bold text-white font-mono text-sm">¥${item.payout.toFixed(2)}</span>
                        <span class="text-[11px] font-mono ${roiColorClass} ml-1 font-bold">(${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%)</span>
                    </div>
                </div>
            `;
            container.appendChild(div);
        }
    });

    const costEl = document.getElementById('planTotalCost');
    if (costEl) costEl.innerText = `¥${totalCost}`;

    const unitsEl = document.getElementById('planTotalUnits');
    if (unitsEl) unitsEl.innerText = totalUnits;

    const roiSumEl = document.getElementById('planRoiSummary');
    if (roiSumEl && rois.length > 0) {
        const minRoi = Math.min(...rois);
        const maxRoi = Math.max(...rois);
        roiSumEl.innerText = `${minRoi >= 0 ? '+' : ''}${minRoi.toFixed(1)}% ~ ${maxRoi >= 0 ? '+' : ''}${maxRoi.toFixed(1)}%`;
    }

    // 预算越界提示：仅做醒目警示，不改变上方配资算法的资金分配逻辑
    const budgetWarn = document.getElementById('budgetOverWarn');
    const budgetWarnText = document.getElementById('budgetOverWarnText');
    if (budgetWarn) {
        if (totalCost > budget) {
            const over = totalCost - budget;
            budgetWarn.classList.remove('hidden');
            if (budgetWarnText) {
                budgetWarnText.innerText = `实际投注额 ¥${totalCost} 超出设定预算 ¥${budget}，超支 ¥${over.toFixed(0)}`;
            }
        } else {
            budgetWarn.classList.add('hidden');
        }
    }
}
