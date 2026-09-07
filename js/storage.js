/**
 * 方案收藏与本地存储模块 (Plan Storage Engine)
 * 1) 收藏：把当前测算台方案（场次 / 勾选赛果 / 配资模式 / 预算 / 结果摘要）存入 localStorage
 * 2) 我的方案：列表展示已存方案，支持「载入」恢复测算台 与「删除」
 *
 * 说明：键名 htft_saved_plans，上限 SAVED_PLANS_MAX(10) 条，超出提示不再写入；
 *      本文件只做「存 / 取 / 载 / 删」，不改动 calculator.js 的配资算法；
 *      拼接 DOM 的动态文本一律过 esc()；依赖 calculator.js / app.js 中已声明的全局函数。
 */

// ======================= 常量与基础读写 =======================

/** localStorage 存储键名（P3 约定） */
const SAVED_PLANS_KEY = 'htft_saved_plans';

/** 收藏方案上限 */
const SAVED_PLANS_MAX = 10;

// 读取全部已收藏方案（无 / 损坏时返回空数组）
function planReadAll() {
    try {
        const str = localStorage.getItem(SAVED_PLANS_KEY);
        if (!str) return [];
        const arr = JSON.parse(str);
        return Array.isArray(arr) ? arr : [];
    } catch (e) {
        return [];
    }
}

// 覆写全部收藏（隐私模式等写入失败时 Toast 提示）
function planWriteAll(list) {
    try {
        localStorage.setItem(SAVED_PLANS_KEY, JSON.stringify(list));
    } catch (e) {
        showToast('本地存储不可用（可能为隐私模式）', 'error');
    }
}

// ======================= 工具函数 =======================

// 当前九宫格已勾选赛果 key 集合（排序后返回）
function plansCurrentSelectedKeys() {
    const keys = [];
    if (typeof OUTCOMES_META === 'undefined') return keys;
    Object.keys(OUTCOMES_META).forEach(k => {
        const chk = document.getElementById('chk_' + k);
        if (chk && chk.checked) keys.push(k);
    });
    return keys.sort();
}

// 反向匹配当前勾选集合命中的策略预设 key（恰为某预设全包组合时命中，否则返回 null）
function plansFindPresetKey(selectedKeys) {
    if (!Array.isArray(selectedKeys) || selectedKeys.length === 0 || typeof STRATEGY_PRESETS === 'undefined') return null;
    const sel = selectedKeys.slice().sort();
    const keys = Object.keys(STRATEGY_PRESETS);
    for (let i = 0; i < keys.length; i++) {
        const preset = STRATEGY_PRESETS[keys[i]];
        const ps = preset.outcomes.slice().sort();
        if (ps.length === sel.length && ps.every((v, idx) => v === sel[idx])) return keys[i];
    }
    return null;
}

// 时间戳 → MM-DD HH:MM 短串（用于列表「收藏于」展示）
function plansTimeShort(ts) {
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ======================= 收藏当前方案 =======================

// 收藏当前测算台方案（校验至少勾选 1 项有效赔率赛果；达上限提示不写入）
function saveCurrentPlan() {
    const selected = plansCurrentSelectedKeys();
    const validSelected = selected.filter(k => {
        const el = document.getElementById('odds_' + k);
        return el && (parseFloat(el.value) || 0) > 0;
    });
    if (validSelected.length === 0) {
        showToast('请先勾选至少 1 项带有效赔率的半全场赛果', 'error');
        return false;
    }

    const all = planReadAll();
    if (all.length >= SAVED_PLANS_MAX) {
        showToast(`收藏已达上限 ${SAVED_PLANS_MAX} 条，请先在「我的方案」中删除旧方案`, 'error');
        return false;
    }

    const numInput = document.getElementById('inputMatchNum');
    const homeInput = document.getElementById('inputHomeTeam');
    const awayInput = document.getElementById('inputAwayTeam');
    const spInput = document.getElementById('inputSpHDA');
    const budgetInput = document.getElementById('inputBudget');
    const costEl = document.getElementById('planTotalCost');
    const unitsEl = document.getElementById('planTotalUnits');

    // 快照当前 9 项赔率输入
    const odds = {};
    Object.keys(OUTCOMES_META).forEach(k => {
        const el = document.getElementById('odds_' + k);
        odds[k] = el ? (parseFloat(el.value) || 0) : 0;
    });

    // 名称 = 场次 + 策略摘要（命中预设则用策略名，否则按自定义项数）
    const presetKey = plansFindPresetKey(validSelected);
    const stratName = presetKey && STRATEGY_PRESETS[presetKey]
        ? STRATEGY_PRESETS[presetKey].name
        : `自定义 ${validSelected.length}项`;
    const home = (homeInput ? homeInput.value : '').trim();
    const away = (awayInput ? awayInput.value : '').trim();
    const matchNum = (numInput ? numInput.value : '').trim();
    const title = `${matchNum || '自定义'} · ${stratName}`;

    const legs = (typeof readShareLegs === 'function') ? readShareLegs() : [];
    const synthTxt = document.getElementById('resSynthSp') ? document.getElementById('resSynthSp').innerText : '';
    const breakEvenTxt = document.getElementById('resBreakEvenTag') ? document.getElementById('resBreakEvenTag').innerText : '';
    const covTypeTxt = document.getElementById('resCoverageType') ? document.getElementById('resCoverageType').innerText : '';
    const roiSummaryTxt = document.getElementById('planRoiSummary') ? document.getElementById('planRoiSummary').innerText : '';
    const probSumTxt = document.getElementById('resProbSum') ? document.getElementById('resProbSum').innerText : '';

    const plan = {
        id: Date.now(),
        savedAt: Date.now(),
        title: title,
        matchNum: matchNum,
        home: home,
        away: away,
        spHda: spInput ? spInput.value : '',
        presetKey: presetKey || (typeof currentActivePreset !== 'undefined' ? currentActivePreset : ''),
        allocMode: typeof currentAllocMode !== 'undefined' ? currentAllocMode : 'attack_defense',
        budget: budgetInput ? (parseFloat(budgetInput.value) || 100) : 100,
        selected: validSelected,
        odds: odds,
        totalCost: costEl ? (parseFloat(String(costEl.textContent).replace('¥', '')) || 0) : 0,
        totalUnits: unitsEl ? (parseInt(unitsEl.textContent, 10) || 0) : 0,
        synthSp: synthTxt,
        breakEvenText: breakEvenTxt,
        coverageType: covTypeTxt,
        roiSummary: roiSummaryTxt,
        probSummary: probSumTxt,
        legs: legs
    };

    all.unshift(plan); // 最新收藏放最前
    planWriteAll(all);
    showToast(`已收藏：${title}`);
    return true;
}

// ======================= 我的方案弹窗 =======================

// 渲染单个收藏方案的详细出票表格 HTML
function renderPlanDetailsHtml(plan) {
    let rowsHtml = '';
    if (Array.isArray(plan.legs) && plan.legs.length > 0) {
        rowsHtml = plan.legs.map(leg => {
            const tag = leg.isDef ? '<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px]">次选保底</span>'
                : (leg.isAtt ? '<span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px]">核心主攻</span>' : '');
            const roiText = leg.roi !== null ? `${leg.roi >= 0 ? '+' : ''}${Number(leg.roi).toFixed(1)}%` : '--';
            const roiColor = (leg.roi !== null && leg.roi >= 0) ? 'text-emerald-400' : 'text-amber-400';
            return `
                <tr class="border-b border-slate-800/80 text-slate-300">
                    <td class="py-1.5 font-bold font-mono text-white flex items-center gap-1">
                        <span>${esc(leg.name)}</span>
                        ${tag}
                    </td>
                    <td class="py-1.5 text-right font-mono">${leg.odds !== null ? Number(leg.odds).toFixed(2) : '--'}</td>
                    <td class="py-1.5 text-right font-mono font-bold text-white">${esc(String(leg.units || 0))} 注</td>
                    <td class="py-1.5 text-right font-mono text-slate-400">¥${esc(String(leg.cost || 0))}</td>
                    <td class="py-1.5 text-right font-mono text-white">¥${leg.payout !== null ? Number(leg.payout).toFixed(2) : '--'}</td>
                    <td class="py-1.5 text-right font-mono font-bold ${roiColor}">${roiText}</td>
                </tr>
            `;
        }).join('');
    } else if (Array.isArray(plan.selected)) {
        rowsHtml = plan.selected.map(k => {
            const name = (typeof OUTCOMES_META !== 'undefined' && OUTCOMES_META[k]) ? OUTCOMES_META[k].name : k;
            const odds = (plan.odds && plan.odds[k]) ? plan.odds[k] : '--';
            return `
                <tr class="border-b border-slate-800/80 text-slate-300">
                    <td class="py-1.5 font-bold font-mono text-white">${esc(name)}</td>
                    <td class="py-1.5 text-right font-mono">${odds}</td>
                    <td class="py-1.5 text-right font-mono text-slate-500" colspan="4">（点击载入到测算台重算各注详情）</td>
                </tr>
            `;
        }).join('');
    }

    return `
        <div class="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] space-y-2">
            <div class="flex flex-wrap items-center justify-between text-slate-400 border-b border-slate-800 pb-1.5 gap-1">
                <span>对阵: <strong class="text-white">${esc(plan.matchNum || '自定义')}</strong> ${esc(plan.home || '')} vs ${esc(plan.away || '')}</span>
                <span>模式: <strong class="text-emerald-400">${esc(plan.allocMode === 'attack_defense' ? '最优梯度配资' : '纯利润平衡')}</strong></span>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left font-mono">
                    <thead>
                        <tr class="text-slate-500 border-b border-slate-800/80 text-[10px]">
                            <th class="pb-1 font-medium">玩法</th>
                            <th class="pb-1 text-right font-medium">SP</th>
                            <th class="pb-1 text-right font-medium">买入</th>
                            <th class="pb-1 text-right font-medium">金额</th>
                            <th class="pb-1 text-right font-medium">命中返</th>
                            <th class="pb-1 text-right font-medium">盈亏率</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>
            <div class="flex flex-wrap items-center justify-between pt-1 text-slate-400 border-t border-slate-800/80 text-[10px]">
                <span>共 ${esc(String(plan.totalUnits || 0))} 注 · 总投入 ¥${esc(Number(plan.totalCost || 0).toFixed(0))}</span>
                <span class="text-emerald-400 font-bold">${esc(plan.roiSummary ? '命中任一: ' + plan.roiSummary : '')}</span>
            </div>
        </div>
    `;
}

// 打开 / 关闭「我的方案」弹窗（打开前刷新列表）
function togglePlansModal() {
    const modal = document.getElementById('plansModal');
    if (!modal) return;
    const willOpen = modal.classList.contains('hidden');
    if (willOpen) {
        renderPlansList();
        modal.classList.remove('hidden');
    } else {
        modal.classList.add('hidden');
    }
}

// 渲染已收藏方案列表（每次打开弹窗 / 增删后调用）
function renderPlansList() {
    const listEl = document.getElementById('savedPlansList');
    const emptyEl = document.getElementById('savedPlansEmpty');
    if (!listEl || !emptyEl) return;

    const plans = planReadAll();
    const hasPlans = plans.length > 0;
    emptyEl.classList.toggle('hidden', hasPlans);
    listEl.innerHTML = '';
    if (!hasPlans) return;

    plans.forEach(plan => {
        const item = document.createElement('div');
        item.className = 'flex flex-col gap-2 p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 hover:border-emerald-500/30 transition';
        item.innerHTML = `
            <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="min-w-0 flex-1">
                    <div class="font-bold text-white text-xs truncate">📋 ${esc(plan.title || '未命名方案')}</div>
                    <div class="text-[11px] text-slate-400 mt-0.5 font-mono">
                        ${esc(plan.home && plan.away ? plan.home + ' vs ' + plan.away + ' · ' : '')}
                        预算 ¥${esc(String(plan.budget || 0))} · ${esc(Array.isArray(plan.selected) ? plan.selected.length : 0)}项
                        · 总投 ¥${esc(Number(plan.totalCost || 0).toFixed(0))}
                        <span class="text-slate-500">(${esc(plan.allocMode === 'attack_defense' ? '最优梯度' : '纯利润平衡')})</span>
                    </div>
                </div>
                <div class="flex shrink-0 items-center gap-1.5 flex-wrap">
                    <button type="button" data-plan-action="toggle-details" data-plan-id="${esc(String(plan.id))}"
                        class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500 text-sky-300 hover:text-white border border-sky-500/30 transition text-[11px] font-semibold active:scale-95">
                        🔍 详情
                    </button>
                    <button type="button" data-plan-action="share" data-plan-id="${esc(String(plan.id))}"
                        class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500 text-cyan-300 hover:text-white border border-cyan-500/30 transition text-[11px] font-semibold active:scale-95">
                        📤 分享
                    </button>
                    <button type="button" data-plan-action="load" data-plan-id="${esc(String(plan.id))}"
                        class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500 text-emerald-300 hover:text-white border border-emerald-500/30 transition text-[11px] font-semibold active:scale-95">
                        ⚡ 载入
                    </button>
                    <button type="button" data-plan-action="delete" data-plan-id="${esc(String(plan.id))}"
                        class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/25 text-red-300 border border-red-500/30 transition text-[11px] font-semibold active:scale-95">
                        🗑️ 删除
                    </button>
                </div>
            </div>
            <!-- 方案各注详情展开容器 -->
            <div id="plan_details_${esc(String(plan.id))}" class="hidden pt-2 border-t border-slate-700/60">
                ${renderPlanDetailsHtml(plan)}
            </div>
        `;
        listEl.appendChild(item);
    });
}

// 事件委托：我的方案列表「详情 / 分享 / 载入 / 删除」
document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('[data-plan-action]') : null;
    if (!btn) return;
    const id = btn.getAttribute('data-plan-id');
    const action = btn.getAttribute('data-plan-action');
    if (!id) return;

    if (action === 'toggle-details') {
        const detailEl = document.getElementById('plan_details_' + id);
        if (detailEl) {
            const isHidden = detailEl.classList.contains('hidden');
            detailEl.classList.toggle('hidden', !isHidden);
            btn.innerHTML = isHidden ? '🔼 收起' : '🔍 详情';
        }
    } else if (action === 'share') {
        plansShareById(id);
    } else if (action === 'load') {
        plansLoadById(id);
    } else if (action === 'delete') {
        plansDeleteById(id);
    }
});

// 分享指定已收藏方案：载入并呼出分享弹窗
function plansShareById(id) {
    const plan = planReadAll().find(p => String(p.id) === String(id));
    if (!plan) {
        showToast('方案不存在', 'error');
        return;
    }
    plansLoadById(id, true); // 静默载入到工作台
    togglePlansModal();      // 关闭我的方案弹窗
    setTimeout(() => {
        toggleShareModal();  // 呼出分享弹窗，显示该方案的出票清单与卡片
    }, 150);
}

// ======================= 删除收藏 =======================

function plansDeleteById(id) {
    const all = planReadAll().filter(p => String(p.id) !== String(id));
    planWriteAll(all);
    renderPlansList(); // 若弹窗已打开则即时刷新
    showToast('已删除该收藏方案');
}

// ======================= 载入方案恢复到测算台 =======================

function plansLoadById(id, silent) {
    const plan = planReadAll().find(p => String(p.id) === String(id));
    if (!plan) {
        showToast('方案不存在或已被删除', 'error');
        renderPlansList();
        return;
    }

    // 1. 恢复场次头部信息
    const numInput = document.getElementById('inputMatchNum');
    const homeInput = document.getElementById('inputHomeTeam');
    const awayInput = document.getElementById('inputAwayTeam');
    const spInput = document.getElementById('inputSpHDA');
    if (numInput) numInput.value = plan.matchNum || '';
    if (homeInput) homeInput.value = plan.home || '';
    if (awayInput) awayInput.value = plan.away || '';
    if (spInput) spInput.value = plan.spHda || '';

    // 2. 恢复 9 项赔率
    if (plan.odds && typeof plan.odds === 'object') {
        Object.keys(OUTCOMES_META).forEach(k => {
            const el = document.getElementById('odds_' + k);
            const v = plan.odds[k];
            if (el && v) el.value = v;
        });
    }

    // 3. 恢复勾选赛果（命中策略预设则联动预设芯片/描述；自定义组合手动同步勾选态）
    const sel = Array.isArray(plan.selected) ? plan.selected.slice().sort() : [];
    if (sel.length === 0) {
        showToast('该方案未包含有效赛果勾选，无法载入', 'error');
        return;
    }
    const presetKey = plansFindPresetKey(sel);
    if (presetKey && typeof applyPreset === 'function') {
        applyPreset(presetKey); // 内部会同步九宫格并 calculate()
    } else {
        if (typeof syncOutcomeCheckboxes === 'function') syncOutcomeCheckboxes(sel);
        // 兜底设置 activePreset，保证「主攻+防守」标签分组仍按用户当时预设理解
        const pk = (plan.presetKey && typeof STRATEGY_PRESETS !== 'undefined' && STRATEGY_PRESETS[plan.presetKey])
            ? plan.presetKey
            : 'ft_home';
        currentActivePreset = pk;
        // 同步预设胶囊激活态 + 策略描述（复用 applyPreset 的类名规则，避免改动 calculator.js）
        Object.keys(STRATEGY_PRESETS).forEach(k => {
            const b = document.getElementById('preset_' + k);
            if (b) {
                b.className = (k === pk)
                    ? 'px-2.5 py-1 rounded text-xs font-medium transition bg-emerald-500 text-white whitespace-nowrap shadow-sm'
                    : 'px-2.5 py-1 rounded text-xs font-medium transition bg-slate-800 text-slate-300 hover:text-white whitespace-nowrap';
            }
        });
        const descEl = document.getElementById('strategyDescText');
        if (descEl && STRATEGY_PRESETS[pk]) {
            descEl.innerHTML = `
                <span class="text-emerald-400 font-bold">当前策略: ${esc(STRATEGY_PRESETS[pk].name)}</span>
                <span class="text-slate-400 ml-1.5">${esc(STRATEGY_PRESETS[pk].desc)}</span>
            `;
        }
    }

    // 4. 恢复预算 + 配资模式（setAllocationMode 内部会触发 calculate 重绘结果区）
    const budgetInput = document.getElementById('inputBudget');
    if (budgetInput) budgetInput.value = plan.budget || 100;
    if (typeof setAllocationMode === 'function') {
        setAllocationMode(plan.allocMode || 'dutched');
    } else {
        calculate();
    }


    // 6. 移动端切回测算台 + 平滑滚动聚焦
    if (window.innerWidth < 768 && typeof switchMobileTab === 'function') {
        switchMobileTab('calc');
    }
    const calcSec = document.getElementById('calculatorSection');
    if (calcSec) {
        calcSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        calcSec.classList.add('glass-card-active');
        setTimeout(() => calcSec.classList.remove('glass-card-active'), 1500);
    }

    if (!silent) {
        togglePlansModal(); // 载入成功后关闭弹窗
        showToast(`已载入方案：${plan.title || ''}`);
    }
}
