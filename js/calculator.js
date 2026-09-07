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
        attack: ['hh', 'dh'],
        defense: ['ah']
    },
    'ft_draw': {
        name: '全场平局 (3项)',
        desc: '覆盖全场双方打平的全部半场走势，打平100%有且仅有1张中奖（物理守恒）',
        outcomes: ['hd', 'dd', 'ad'],
        attack: ['hd', 'dd'],
        defense: ['ad']
    },
    'ft_away': {
        name: '全场客胜 (3项)',
        desc: '覆盖全场客队获胜的全部半场走势，客胜100%有且仅有1张中奖（物理守恒）',
        outcomes: ['ha', 'da', 'aa'],
        attack: ['da', 'aa'],
        defense: ['ha']
    },
    'ht_draw': {
        name: '锁定半场平 (3项)',
        desc: '锁定上半场打平 (0-0/1-1)，全包其后胜平负走势，只要半场打平100%中奖！',
        outcomes: ['dh', 'dd', 'da'],
        attack: ['dh', 'dd'],
        defense: ['da']
    },
    'ht_home': {
        name: '锁定半场主领先 (3项)',
        desc: '锁定上半场主队打进第一球/半场领先，全包全场胜平负，半场主胜100%中奖！',
        outcomes: ['hh', 'hd', 'ha'],
        attack: ['hh'],
        defense: ['hd', 'ha']
    },
    'ht_away': {
        name: '锁定半场客领先 (3项)',
        desc: '锁定上半场客队半场领先，全包全场胜平负，半场客胜100%中奖！',
        outcomes: ['ah', 'ad', 'aa'],
        attack: ['aa'],
        defense: ['ah', 'ad']
    },
    'double_home_draw': {
        name: '主队不败 (胜+平 6项)',
        desc: '主胜或打平均中奖！只要客队不赢即可稳妥兑奖；支持“主攻胜+次选平保底”防冷！',
        outcomes: ['hh', 'dh', 'ah', 'hd', 'dd', 'ad'],
        attack: ['hh', 'dh', 'ah'],
        defense: ['hd', 'dd', 'ad']
    },
    'double_away_draw': {
        name: '客队不败 (平+负 6项)',
        desc: '客胜或打平均中奖！只要主队不赢即可兑奖；支持“主攻客胜+次选平保底”！',
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
let currentAllocMode = 'attack_defense'; // 默认主推：最优梯度配资 (核心主攻 + 次选保底)

// 设置配资模式 (最优梯度配资 vs 纯利润平衡)
function setAllocationMode(mode) {
    currentAllocMode = mode === 'dutched' ? 'dutched' : 'attack_defense';
    const btnD = document.getElementById('allocBtnDutched');
    const btnA = document.getElementById('allocBtnAttack');

    if (btnD && btnA) {
        [btnD, btnA].forEach(b => {
            b.classList.remove('bg-emerald-500', 'text-white', 'shadow-sm');
            b.classList.add('text-slate-400', 'hover:text-white');
        });
        const activeBtn = currentAllocMode === 'attack_defense' ? btnA : btnD;
        if (activeBtn) {
            activeBtn.classList.remove('text-slate-400', 'hover:text-white');
            activeBtn.classList.add('bg-emerald-500', 'text-white', 'shadow-sm');
        }

        const hintEl = document.getElementById('planModeHint');
        if (hintEl) {
            hintEl.innerText = currentAllocMode === 'attack_defense'
                ? '当前：最优梯度配资 (核心主攻 + 次选保底)'
                : '当前：纯利润平衡 (等额对冲 · 平滑收益)';
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

// 智能识别当前勾选的赛果组合策略与方向（彻底杜绝手动点选时策略预设与研判文本脱节的 Bug）
function detectActiveStrategy(selectedKeys) {
    const keys = (selectedKeys || []).slice().sort();
    const n = keys.length;

    // 1. 在预设库中进行精准集合比对
    for (const [pk, preset] of Object.entries(STRATEGY_PRESETS)) {
        const pSorted = preset.outcomes.slice().sort();
        if (pSorted.length === n && pSorted.every((k, idx) => k === keys[idx])) {
            let dirWord = '命中赛果';
            let targetDir = null;
            if (pk === 'ft_home') { dirWord = '主胜'; targetDir = 'h'; }
            else if (pk === 'ft_draw') { dirWord = '平局'; targetDir = 'd'; }
            else if (pk === 'ft_away') { dirWord = '客胜'; targetDir = 'a'; }
            else if (pk === 'double_home_draw') { dirWord = '主不败'; }
            else if (pk === 'double_away_draw') { dirWord = '客不败'; }
            else if (pk === 'double_decisive') { dirWord = '决出胜负'; }
            else if (pk === 'ht_draw') { dirWord = '半场平'; }
            else if (pk === 'ht_home') { dirWord = '半场主领先'; }
            else if (pk === 'ht_away') { dirWord = '半场客领先'; }
            else if (pk === 'double_ht_home_draw') { dirWord = '半场主不败'; }

            return {
                presetKey: pk,
                preset: preset,
                name: preset.name,
                desc: preset.desc,
                directionWord: dirWord,
                targetDir: targetDir,
                isFullCover: ['ft_home', 'ft_draw', 'ft_away'].includes(pk),
                attackKeys: (preset.attack || []).slice(),
                defenseKeys: (preset.defense || []).slice()
            };
        }
    }

    // 2. 自定义组合识别
    if (n === 0) {
        return {
            presetKey: null,
            preset: null,
            name: '未选择赛果',
            desc: '请在九宫格中勾选至少 1 项赛果',
            directionWord: '未选择',
            targetDir: null,
            isFullCover: false,
            attackKeys: [],
            defenseKeys: []
        };
    }

    const allEndH = keys.every(k => k.endsWith('h'));
    const allEndD = keys.every(k => k.endsWith('d'));
    const allEndA = keys.every(k => k.endsWith('a'));

    const allStartH = keys.every(k => k.startsWith('h'));
    const allStartD = keys.every(k => k.startsWith('d'));
    const allStartA = keys.every(k => k.startsWith('a'));

    let dirWord = '组合中奖';
    let name = `自定义组合 (${n}项)`;
    let desc = `自由点选 ${n} 项半全场赛果，自由配资对冲`;
    let targetDir = null;

    if (allEndH) {
        dirWord = '主胜';
        name = `主胜优选 (${n}项)`;
        desc = `精选覆盖主胜走势中的 ${n} 项分支，打出主胜对应赛果即获利`;
        targetDir = 'h';
    } else if (allEndA) {
        dirWord = '客胜';
        name = `客胜优选 (${n}项)`;
        desc = `精选覆盖客胜走势中的 ${n} 项分支，打出客胜对应赛果即获利`;
        targetDir = 'a';
    } else if (allEndD) {
        dirWord = '平局';
        name = `平局优选 (${n}项)`;
        desc = `精选覆盖平局走势中的 ${n} 项分支，打出平局对应赛果即获利`;
        targetDir = 'd';
    } else if (allStartD) {
        dirWord = '半场平';
        name = `半场平优选 (${n}项)`;
        desc = `半场平局打底，覆盖下半场对应演变走势`;
    } else if (allStartH) {
        dirWord = '半场主领先';
        name = `半场主领先优选 (${n}项)`;
        desc = `半场主领先打底，覆盖下半场对应演变走势`;
    } else if (allStartA) {
        dirWord = '半场客领先';
        name = `半场客领先优选 (${n}项)`;
        desc = `半场客领先打底，覆盖下半场对应演变走势`;
    }

    return {
        presetKey: null,
        preset: null,
        name: name,
        desc: desc,
        directionWord: dirWord,
        targetDir: targetDir,
        isFullCover: false,
        attackKeys: [],
        defenseKeys: []
    };
}

// 应用策略预设
function applyPreset(presetKey) {
    currentActivePreset = presetKey;
    const preset = STRATEGY_PRESETS[presetKey];
    if (!preset) return;

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

    // 智能识别当前策略预设与赛果走向（杜绝手动切换时研判方向不更新的 Bug）
    const strategy = detectActiveStrategy(selected.map(s => s.key));
    currentActivePreset = strategy.presetKey || 'custom';

    // 动态同步顶部预设按钮高亮状态
    Object.keys(STRATEGY_PRESETS).forEach(pk => {
        const btn = document.getElementById(`preset_${pk}`);
        if (btn) {
            btn.className = (strategy.presetKey === pk)
                ? 'px-2.5 py-1 rounded text-xs font-medium transition bg-emerald-500 text-white whitespace-nowrap shadow-sm'
                : 'px-2.5 py-1 rounded text-xs font-medium transition bg-slate-800 text-slate-300 hover:text-white whitespace-nowrap';
        }
    });

    // 动态更新策略说明文案
    const descEl = document.getElementById('strategyDescText');
    if (descEl) {
        descEl.innerHTML = `
            <span class="text-emerald-400 font-bold">当前策略: ${strategy.name}</span>
            <span class="text-slate-400 ml-1.5">${strategy.desc}</span>
        `;
    }

    if (selected.length === 0) {
        const synthSpEl = document.getElementById('resSynthSp');
        const synthSpUnitEl = document.getElementById('resSynthSpUnit');
        if (synthSpEl) {
            synthSpEl.innerText = '--';
            synthSpEl.className = 'text-xl sm:text-2xl font-black font-mono text-slate-400 tracking-tight';
            synthSpEl.removeAttribute('title');
        }
        if (synthSpUnitEl) {
            synthSpUnitEl.innerHTML = '<span class="text-slate-500">倍率</span>';
        }
        document.getElementById('resBreakEvenTag').innerHTML = '<span class="text-slate-500">未选择赛果</span>';
        const planCards = document.getElementById('planCardsContainer');
        if (planCards) {
            planCards.innerHTML = '<div class="py-6 text-center text-slate-500 text-xs">请勾选至少 1 项半全场赛果</div>';
        }
        // 无勾选时同时隐藏预算越界警示
        const warnEl = document.getElementById('budgetOverWarn');
        if (warnEl) warnEl.classList.add('hidden');
        return;
    }

    // 2. 组合合成单关 SP: 1 / sum(1 / odds)
    const sumInv = selected.reduce((acc, item) => acc + (1.0 / item.odds), 0);
    const synthSp = sumInv > 0 ? (1.0 / sumInv) : 0;
    const synthSpEl = document.getElementById('resSynthSp');
    const synthSpUnitEl = document.getElementById('resSynthSpUnit');
    if (synthSpEl) {
        synthSpEl.innerText = synthSp.toFixed(4);
        if (synthSp < 1.0) {
            // 合成单关 SP < 1.0 说明无论打出哪个选项返奖都低于总本金（必然亏损），以醒目警示红显示
            synthSpEl.className = 'text-xl sm:text-2xl font-black font-mono text-rose-500 tracking-tight';
            synthSpEl.title = '合成单关赔率 < 1.0，整体保本亏损（返奖低于本金）';
            if (synthSpUnitEl) {
                synthSpUnitEl.innerHTML = '<span class="text-rose-400 font-bold">倍率 <span class="text-[9px] px-1 py-0.2 rounded bg-rose-500/20 border border-rose-500/30 text-rose-300">亏损</span></span>';
            }
        } else {
            synthSpEl.className = 'text-xl sm:text-2xl font-black font-mono text-emerald-400 tracking-tight';
            synthSpEl.title = '合成单关倍率 ≥ 1.0，具备盈利或保本空间';
            if (synthSpUnitEl) {
                synthSpUnitEl.innerHTML = '<span class="text-slate-500">倍率</span>';
            }
        }
    }

    // 3. 无损对冲与折损研判
    const probSum = sumInv * 100;
    const probEl = document.getElementById('resProbSum');
    if (probEl) probEl.innerText = `隐含概率: ${probSum.toFixed(1)}%`;
    const tagEl = document.getElementById('resBreakEvenTag');

    // 解析官方 SP 用于对照研判
    let officialSp = null;
    const spRaw = (document.getElementById('inputSpHDA') ? document.getElementById('inputSpHDA').value : '') || '';
    const spParts = spRaw.split('/').map(v => parseFloat(v));
    if (spParts.length >= 3 && spParts.every(v => !isNaN(v) && v > 0)) {
        if (strategy.targetDir === 'h') officialSp = spParts[0];
        else if (strategy.targetDir === 'd') officialSp = spParts[1];
        else if (strategy.targetDir === 'a') officialSp = spParts[2];
    }

    if (tagEl) {
        const profitPct = ((synthSp - 1.0) * 100).toFixed(1);
        let compareBadge = '';
        if (officialSp !== null && officialSp > 0) {
            const diffPct = ((synthSp - officialSp) / officialSp * 100).toFixed(1);
            const diffSign = diffPct >= 0 ? '+' : '';
            compareBadge = `<span class="text-[11px] text-slate-400 font-normal ml-1.5 hidden xs:inline">（vs 官方${strategy.directionWord}SP ${officialSp.toFixed(2)}，折损 ${diffSign}${diffPct}%）</span>`;
        }

        if (synthSp >= 1.0) {
            tagEl.innerHTML = `<span class="text-emerald-400 font-bold">${strategy.directionWord}打出可盈利 (+${profitPct}%)</span>${compareBadge}`;
        } else if (synthSp >= 0.95) {
            tagEl.innerHTML = `<span class="text-amber-400 font-semibold">${strategy.directionWord}打出轻微折损 (${profitPct}%)</span>${compareBadge}`;
        } else {
            tagEl.innerHTML = `<span class="text-slate-400">${strategy.directionWord}打出综合折损 (${profitPct}%)</span>${compareBadge}`;
        }
    }

    // 覆盖类型提示
    const covTypeEl = document.getElementById('resCoverageType');
    const covDetailEl = document.getElementById('resCoverageDetail');
    if (covTypeEl && covDetailEl) {
        covTypeEl.innerText = strategy.name;
        if (strategy.isFullCover) {
            covDetailEl.innerText = `该${strategy.directionWord}方向100%有且仅有1张中奖（物理守恒）`;
        } else {
            covDetailEl.innerText = strategy.desc;
        }
    }

    // 4. 计算各注数 (¥2/注 整数)
    const totalTargetUnits = Math.max(selected.length, Math.round(budget / 2));
    const unitsMap = {};

    // 获取攻守分组（优先预设，自定义则按赔率智能划分：最低赔率项核心主攻，其余次选保底）
    let attKeys = (strategy.attackKeys || []).filter(k => selected.some(s => s.key === k));
    let defKeys = (strategy.defenseKeys || []).filter(k => selected.some(s => s.key === k));

    if (attKeys.length === 0 && defKeys.length === 0 && selected.length > 0) {
        const sorted = selected.slice().sort((a, b) => a.odds - b.odds);
        attKeys = [sorted[0].key];
        defKeys = sorted.slice(1).map(s => s.key);
    } else if (attKeys.length === 0 && selected.length > 0) {
        attKeys = [selected[0].key];
        defKeys = selected.slice(1).map(s => s.key);
    }

    const hasDefense = defKeys.length > 0;

    if (currentAllocMode === 'attack_defense' && hasDefense) {
        // 最优梯度配资模式：核心主攻 + 次选保底
        let defUnitsTotal = 0;
        defKeys.forEach(k => {
            const item = selected.find(s => s.key === k);
            if (item) {
                const u = Math.max(1, Math.ceil(budget / (2.0 * item.odds)));
                unitsMap[k] = u;
                defUnitsTotal += u;
            }
        });

        // 剩余注数倾斜给主攻项
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

    } else {
        // 经典荷兰式纯利润平衡 (按 1/odds 分配)
        selected.forEach(s => {
            const w = (1.0 / s.odds) / sumInv;
            unitsMap[s.key] = Math.max(1, Math.round(totalTargetUnits * w));
        });

        // 微调
        const curTotal = Object.values(unitsMap).reduce((a, b) => a + b, 0);
        const diff = totalTargetUnits - curTotal;
        if (diff !== 0 && selected.length > 0) {
            unitsMap[selected[0].key] = Math.max(1, (unitsMap[selected[0].key] || 1) + diff);
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

        const isDef = hasDefense && defKeys.includes(item.key);
        const isAtt = hasDefense && attKeys.includes(item.key);
        const tagLabel = isDef ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">次选保底</span>'
            : (isAtt ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">核心主攻</span>' : '');

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
