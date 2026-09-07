/**
 * 竞彩半全场 - 界面与用户交互控制器 (UI & App Controller)
 * 包含：响应式卡片/表格双模渲染、移动端分段切换器、赛事载入与联动
 */

let currentListTarget = 'h'; // 'h' (主胜) | 'd' (平局) | 'a' (客胜)
let currentMobileTab = 'calc'; // 'calc' | 'matches'

// ======================= 最优拆单推荐元数据 =======================

// 三个「人造单关」拆解方向元数据：官方胜平负 SP 字段 + 半全场三项组合 key + 对应策略预设
// 供「🔥 最优拆单推荐」跨方向比价选优，复用 calculator.js 中已有预设与配资逻辑，不重复造轮子
const SPLIT_TARGET_DIRS = {
    h: { label: '全场主胜', officialKey: 'sp_h', outcomeKeys: ['hh', 'dh', 'ah'], preset: 'ft_home' },
    d: { label: '全场平局', officialKey: 'sp_d', outcomeKeys: ['hd', 'dd', 'ad'], preset: 'ft_draw' },
    a: { label: '全场客胜', officialKey: 'sp_a', outcomeKeys: ['ha', 'da', 'aa'], preset: 'ft_away' }
};

// 推荐折损率门槛：低于该值视为「折损较高」不推荐（与列表评级图例 <-8% 折损较高 对齐）
const REC_FLOOR_SHRINK = -8.0;
const REC_TOP_N = 3;

// 拆单推荐模式与阈值参数
let currentRecMode = 'steady'; // 'steady' (高胜率稳胆) | 'shrink' (极低折损)
const REC_STEADY_MIN_SYNTH = 1.05;  // 稳胆合成单关 SP 收益下限（确保盈利）
const REC_STEADY_MAX_SHRINK = -8.5; // 稳胆折损率容忍下限

// ======================= P2-a 折损率筛选与四档色阶 =======================

// 「适合拆单」筛选下限：折损率 ≥ -8% 即排除红色「折损较高」档（与底部图例 / 最优推荐 REC_FLOOR 对齐）
const SHRINK_FIT_FLOOR = -8.0;
// 「高性价比」：仅展示正溢价 / 接近 0（合成单关 SP ≥ 官方 SP）的最佳档
const SHRINK_PREMIUM_FLOOR = 0;

// 折损率四档色阶（P2-a 可视化）：返回徽标配色 class 与鼠标悬停 title 说明
// 档位：绿(≥0 正溢价) / 浅绿(0~-3%) / 琥珀(-3%~-8%) / 红(<-8%)
function shrinkTierInfo(shrink) {
    if (shrink >= 0) {
        return {
            cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold',
            title: '正溢价：合成单关 SP ≥ 官方 SP，拆单性价比最高'
        };
    }
    if (shrink >= -3) {
        return {
            cls: 'bg-teal-400/10 text-teal-300 border-teal-400/30 font-semibold',
            title: '浅绿：折损 0 ~ -3%，接近 0 性价比良好'
        };
    }
    if (shrink >= SHRINK_FIT_FLOOR) {
        return {
            cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold',
            title: '琥珀：折损 -3% ~ -8%，可接受范围'
        };
    }
    return {
        cls: 'bg-red-500/15 text-red-300 border-red-500/30',
        title: '红：折损低于 -8%，折损较高，建议谨慎拆单'
    };
}

// 「一键应用」事件委托注册表：数字 id → { match, dir }（沿用榜单 data-id 委托思路，避免内联 JSON）
const recApplyRegistry = new Map();
let recApplySeq = 0;

// ======================= 通用工具 =======================

// HTML 转义：凡来自远程 API / 用户输入的文本拼进 innerHTML 前必须先过此函数，防 XSS 与破版
function esc(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// 通用防抖：延迟 wait 毫秒执行，避免高频事件（如搜索输入）反复触发全量重绘
function debounce(fn, wait) {
    let timer = null;
    return function (...args) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            fn.apply(this, args);
        }, wait);
    };
}

// 轻提示 Toast（操作反馈，2.6s 自动消失；PC 端单行不换行，移动端自适应换行）
function showToast(msg, type) {
    const toast = document.createElement('div');
    const isErr = type === 'error';
    toast.className = 'fixed left-1/2 -translate-x-1/2 bottom-8 z-[70] px-4 py-2.5 rounded-xl text-xs font-bold shadow-2xl border pointer-events-none text-center ' +
        'whitespace-normal sm:whitespace-nowrap max-w-[90vw] sm:max-w-none ' +
        (isErr
            ? 'bg-red-500/20 text-red-200 border-red-500/40'
            : 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40');
    toast.style.backdropFilter = 'blur(8px)';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.transition = 'opacity .3s'; toast.style.opacity = '0'; }, 2300);
    setTimeout(() => toast.remove(), 2700);
}

// 「载入测算」点击事件委托注册表：为每场比赛分配稳定数字 id，杜绝在 onclick 中内联拼接 JSON
const matchLoadRegistry = new Map(); // 数字 id → 比赛对象
let matchLoadSeq = 0;

// 解析比赛开赛时间为本地时间戳（日期/时间缺失或格式非法时返回 null）
function matchKickoffTs(m) {
    const ds = m && m.match_date ? String(m.match_date) : '';
    const mt = m && m.match_time ? String(m.match_time) : '';
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ds);
    const tm = /^(\d{2}):(\d{2})/.exec(mt);
    if (!dm || !tm) return null;
    return new Date(+dm[1], +dm[2] - 1, +dm[3], +tm[1], +tm[2], 0).getTime();
}

// 移动端分段 Tab 切换
function switchMobileTab(tab) {
    currentMobileTab = tab;
    const tabCalc = document.getElementById('tabBtnCalc');
    const tabMatches = document.getElementById('tabBtnMatches');
    const calcSec = document.getElementById('calculatorSection');
    const matchSec = document.getElementById('matchListSection');

    if (tabCalc && tabMatches && calcSec && matchSec) {
        if (tab === 'calc') {
            tabCalc.className = 'flex-1 py-2 text-center text-xs font-bold rounded-lg bg-emerald-500 text-white shadow-sm transition';
            tabMatches.className = 'flex-1 py-2 text-center text-xs font-medium rounded-lg text-slate-400 hover:text-white transition';
            calcSec.classList.remove('hidden');
            matchSec.classList.add('hidden');
            matchSec.classList.remove('md:block'); // 恢复 md:block
            calcSec.classList.remove('md:block');
        } else {
            tabMatches.className = 'flex-1 py-2 text-center text-xs font-bold rounded-lg bg-emerald-500 text-white shadow-sm transition';
            tabCalc.className = 'flex-1 py-2 text-center text-xs font-medium rounded-lg text-slate-400 hover:text-white transition';
            calcSec.classList.add('hidden');
            matchSec.classList.remove('hidden');
        }
    }
}

// 检查屏幕尺寸变化时重置桌面端双模块显示
function handleResize() {
    const calcSec = document.getElementById('calculatorSection');
    const matchSec = document.getElementById('matchListSection');
    if (window.innerWidth >= 768) {
        if (calcSec) calcSec.classList.remove('hidden');
        if (matchSec) matchSec.classList.remove('hidden');
    } else {
        switchMobileTab(currentMobileTab);
    }
}
window.addEventListener('resize', handleResize);

// 切换列表拆单目标方向 (主胜 / 平局 / 客胜)
function setListTargetOutcome(target) {
    currentListTarget = target;
    ['h', 'd', 'a'].forEach(t => {
        const btn = document.getElementById(`targetBtn_${t}`);
        if (btn) {
            if (t === target) {
                btn.className = 'px-2.5 py-1 rounded text-xs font-bold transition bg-emerald-500 text-white shadow-sm whitespace-nowrap';
            } else {
                btn.className = 'px-2.5 py-1 rounded text-xs font-medium transition text-slate-300 hover:text-white bg-slate-800/80 whitespace-nowrap';
            }
        }
    });

    // 更新表头与字段文本
    const thSp = document.getElementById('thTargetSp');
    const thCombo = document.getElementById('thTargetCombo');
    if (target === 'h') {
        if (thSp) thSp.innerText = '官方主胜SP';
        if (thCombo) thCombo.innerText = '半全场主胜 (胜胜 / 平胜 / 负胜)';
    } else if (target === 'd') {
        if (thSp) thSp.innerText = '官方平局SP';
        if (thCombo) thCombo.innerText = '半全场平局 (胜平 / 平平 / 负平)';
    } else if (target === 'a') {
        if (thSp) thSp.innerText = '官方客胜SP';
        if (thCombo) thCombo.innerText = '半全场客胜 (胜负 / 平负 / 负负)';
    }

    renderMatchList();
}

// 渲染在售比赛列表（桌面端表格 + 移动端卡片双模自适应渲染）
function renderMatchList() {
    const hideSingleInput = document.getElementById('filterHideSingle');
    const hideSingle = hideSingleInput ? hideSingleInput.checked : true;
    const sortSelect = document.getElementById('selectSort');
    const sortBy = sortSelect ? sortSelect.value : 'shrinkage_best';
    const searchInput = document.getElementById('inputSearch');
    const searchKw = searchInput ? searchInput.value.trim().toLowerCase() : '';
    // P2-a：折损率筛选控件（全部 / 适合拆单 / 高性价比）
    const shrinkFilterEl = document.getElementById('selectShrinkFilter');
    const shrinkMode = shrinkFilterEl ? shrinkFilterEl.value : 'all';

    // 为每场比赛动态计算当前选定赛果方向的合成赔率与折损率
    matchesData.forEach(m => {
        let targetSp = 0;
        let c1 = 0, c2 = 0, c3 = 0;
        let c1Name = '', c2Name = '', c3Name = '';

        if (currentListTarget === 'h') {
            targetSp = m.sp_h || 0;
            c1 = m.hafu_hh || 0; c2 = m.hafu_dh || 0; c3 = m.hafu_ah || 0;
            c1Name = '胜胜'; c2Name = '平胜'; c3Name = '负胜';
        } else if (currentListTarget === 'd') {
            targetSp = m.sp_d || 0;
            c1 = m.hafu_hd || 0; c2 = m.hafu_dd || 0; c3 = m.hafu_ad || 0;
            c1Name = '胜平'; c2Name = '平平'; c3Name = '负平';
        } else if (currentListTarget === 'a') {
            targetSp = m.sp_a || 0;
            c1 = m.hafu_ha || 0; c2 = m.hafu_da || 0; c3 = m.hafu_aa || 0;
            c1Name = '胜负'; c2Name = '平负'; c3Name = '负负';
        }

        let curSynth = 0;
        let curShrinkage = 0;
        if (c1 > 0 && c2 > 0 && c3 > 0) {
            const invSum = (1.0 / c1) + (1.0 / c2) + (1.0 / c3);
            curSynth = invSum > 0 ? Number((1.0 / invSum).toFixed(4)) : 0;
            curShrinkage = targetSp > 0 ? Number(((curSynth - targetSp) / targetSp * 100).toFixed(2)) : 0;
        }

        m._curTargetSp = targetSp;
        m._curSynthSp = curSynth;
        m._curShrinkage = curShrinkage;
        m._curCombo = [
            { name: c1Name, val: c1 },
            { name: c2Name, val: c2 },
            { name: c3Name, val: c3 }
        ];

        // 已开赛判定（开赛时间早于当前时间 → 列表视觉弱化，仍可点击载入）
        const kickoffTs = matchKickoffTs(m);
        m._kickedOff = kickoffTs !== null && kickoffTs <= Date.now();
    });

    // 1. 过滤
    let list = matchesData.filter(m => {
        if (hideSingle && m.single_had === 1) return false;
        if (searchKw) {
            const fullStr = `${m.league_name} ${m.home_team} ${m.away_team} ${m.match_num_str}`.toLowerCase();
            if (!fullStr.includes(searchKw)) return false;
        }
        // P2-a 折损率筛选（基于当前选定拆单方向动态算出的 _curShrinkage）
        if (shrinkMode === 'fit' && m._curShrinkage < SHRINK_FIT_FLOOR) return false;
        if (shrinkMode === 'premium' && m._curShrinkage < SHRINK_PREMIUM_FLOOR) return false;
        return true;
    });

    // 2. 排序
    // shrinkage_best / shrinkage_asc = 按折损率从优到劣（折损率越高越接近正溢价越靠前）
    if (sortBy === 'shrinkage_best' || sortBy === 'shrinkage_asc') {
        list.sort((a, b) => b._curShrinkage - a._curShrinkage);
    } else if (sortBy === 'time_asc') {
        list.sort((a, b) => (a.match_date + a.match_time).localeCompare(b.match_date + b.match_time));
    } else if (sortBy === 'sp_asc') {
        list.sort((a, b) => a._curTargetSp - b._curTargetSp);
    } else if (sortBy === 'sp_desc') {
        list.sort((a, b) => b._curTargetSp - a._curTargetSp);
    }

    const totalSuitable = matchesData.filter(m => m.single_had === 0).length;
    const targetLabel = currentListTarget === 'h' ? '主胜' : (currentListTarget === 'd' ? '平局' : '客胜');
    const countTextEl = document.getElementById('matchListCountText');
    if (countTextEl) {
        countTextEl.innerText = `(共 ${matchesData.length} 场，${totalSuitable} 场未开单关适合拆单 · 分析: ${targetLabel})`;
    }

    // 3. 渲染桌面端表格 (#matchTableBody)
    const tbody = document.getElementById('matchTableBody');
    if (tbody) {
        tbody.innerHTML = '';
        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" class="py-8 text-center text-slate-500 text-xs">没有匹配的在售比赛</td></tr>`;
        } else {
            list.forEach((m, idx) => {
                const tr = document.createElement('tr');
                // 已开赛场次整体视觉弱化（仍保留 hover，且可正常点击载入）
                tr.className = 'hover:bg-slate-800/40 transition group' + (m._kickedOff ? ' opacity-40' : '');

                // P2-a 折损率四档色阶：绿 / 浅绿 / 琥珀 / 红（title 悬停解释含义）
                const shrinkTier = shrinkTierInfo(m._curShrinkage);

                const singleBadge = m.single_had === 1
                    ? `<span class="px-2 py-0.5 rounded text-[10px] bg-red-500/20 text-red-300 border border-red-500/30 whitespace-nowrap">已开单关</span>`
                    : `<span class="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold whitespace-nowrap">未开单关⭐</span>`;

                // 已开赛标签
                const startedBadge = m._kickedOff
                    ? '<span class="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-700/50 text-slate-400 border border-slate-600/50 whitespace-nowrap">已开赛</span>'
                    : '';

                // 为每场比赛注册稳定的委托点击 id（不再把整场比赛 JSON 拼进 onclick）
                const loadId = m._loadId || (m._loadId = ++matchLoadSeq);
                matchLoadRegistry.set(loadId, m);

                tr.innerHTML = `
                    <td class="py-3 px-3 text-center font-mono text-slate-500">${idx + 1}</td>
                    <td class="py-3 px-3 whitespace-nowrap">
                        <div class="font-bold text-white font-mono">${esc(m.match_num_str)}</div>
                        <div class="text-[11px] text-slate-400">${esc(m.league_name)}</div>
                    </td>
                    <td class="py-3 px-3 whitespace-nowrap cursor-pointer group" data-analysis-id="${loadId}" title="点击查看对阵数据分析">
                        <div class="font-bold text-white group-hover:text-emerald-300 transition flex items-center gap-1.5">
                            <span>${esc(m.home_team)}</span>
                            <span class="text-slate-500 font-normal">vs</span>
                            <span>${esc(m.away_team)}</span>
                            <span class="text-[10px] opacity-0 group-hover:opacity-100 text-blue-400 font-normal transition">⚽</span>
                        </div>
                    </td>
                    <td class="py-3 px-3 text-center font-mono text-slate-400 whitespace-nowrap">
                        ${esc((m.match_date || '').slice(5))} ${esc(m.match_time)}${startedBadge}
                    </td>
                    <td class="py-3 px-3 text-center whitespace-nowrap">${singleBadge}</td>
                    <td class="py-3 px-3 text-right font-mono font-bold text-amber-400 text-sm whitespace-nowrap" title="胜平负SP: 胜 ${esc(m.sp_h || '--')} / 平 ${esc(m.sp_d || '--')} / 负 ${esc(m.sp_a || '--')}">
                        ${m._curTargetSp ? m._curTargetSp.toFixed(2) : '--'}
                    </td>
                    <td class="py-3 px-3 text-center font-mono text-xs whitespace-nowrap">
                        <span class="text-emerald-400 font-bold">${m._curCombo[0].val}</span> /
                        <span class="text-blue-400 font-bold">${m._curCombo[1].val}</span> /
                        <span class="text-purple-400 font-bold">${m._curCombo[2].val}</span>
                    </td>
                    <td class="py-3 px-3 text-right font-mono font-bold text-white text-sm whitespace-nowrap">
                        ${m._curSynthSp ? m._curSynthSp.toFixed(4) : '--'}
                    </td>
                    <td class="py-3 px-3 text-center font-mono whitespace-nowrap">
                        <span title="${shrinkTier.title}" class="px-2 py-0.5 rounded-full text-xs border cursor-help whitespace-nowrap ${shrinkTier.cls}">
                            ${m._curShrinkage >= 0 ? '+' : ''}${m._curShrinkage.toFixed(2)}%
                        </span>
                    </td>
                    <td class="py-3 px-3 text-center whitespace-nowrap min-w-[130px]">
                        <div class="inline-flex items-center space-x-1.5">
                            <button type="button" data-analysis-id="${loadId}" class="inline-flex items-center justify-center whitespace-nowrap px-2.5 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500 text-blue-300 hover:text-white border border-blue-500/30 transition text-xs font-semibold active:scale-95 shadow-sm" title="查看竞彩网官方赛事对阵与历史交锋">
                                ⚽ 分析
                            </button>
                            <button type="button" data-load-id="${loadId}" class="inline-flex items-center justify-center whitespace-nowrap px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-white border border-emerald-500/30 transition text-xs font-semibold active:scale-95 shadow-sm" title="载入此场赔率到顶部测算台">
                                ⚡ 测算
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    }

    // 4. 渲染移动端卡片流 (#matchCardsContainer)
    const cardsContainer = document.getElementById('matchCardsContainer');
    if (cardsContainer) {
        cardsContainer.innerHTML = '';
        if (list.length === 0) {
            cardsContainer.innerHTML = `<div class="py-10 text-center text-slate-500 text-xs">没有匹配的在售比赛</div>`;
        } else {
            const targetSpLabel = currentListTarget === 'h' ? '主胜' : (currentListTarget === 'd' ? '平局' : '客胜');
            list.forEach((m, idx) => {
                // P2-a 折损率四档色阶：绿 / 浅绿 / 琥珀 / 红（title 悬停解释含义）
                const shrinkTier = shrinkTierInfo(m._curShrinkage);

                const singleBadge = m.single_had === 1
                    ? `<span class="px-2 py-0.5 rounded text-[10px] bg-red-500/20 text-red-300 border border-red-500/30 whitespace-nowrap">已开单关</span>`
                    : `<span class="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold whitespace-nowrap">未开单关⭐</span>`;

                // 已开赛标签
                const startedBadge = m._kickedOff
                    ? '<span class="px-1.5 py-0.5 rounded text-[10px] bg-slate-700/50 text-slate-400 border border-slate-600/50 whitespace-nowrap">已开赛</span>'
                    : '';

                // 注册委托点击 id（避免在 onclick 内联拼 JSON）
                const loadId = m._loadId || (m._loadId = ++matchLoadSeq);
                matchLoadRegistry.set(loadId, m);

                const card = document.createElement('div');
                card.className = 'mobile-match-card p-4 rounded-xl glass-card border border-slate-800/80 space-y-3' + (m._kickedOff ? ' opacity-50' : '');
                card.innerHTML = `
                    <div class="flex items-center justify-between text-xs pb-2 border-b border-white/5">
                        <div class="flex items-center space-x-2">
                            <span class="w-5 h-5 rounded bg-slate-800 text-slate-400 text-[11px] font-mono flex items-center justify-center">${idx + 1}</span>
                            <span class="font-bold text-white font-mono text-xs">${esc(m.match_num_str)}</span>
                            <span class="text-slate-400 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px]">${esc(m.league_name)}</span>
                        </div>
                        <div class="flex items-center space-x-2">
                            <span class="text-slate-400 font-mono text-[11px]">${esc((m.match_date || '').slice(5))} ${esc(m.match_time)}</span>
                            ${startedBadge}
                            ${singleBadge}
                        </div>
                    </div>

                    <div class="flex items-center justify-between">
                        <div class="font-bold text-white text-sm">
                            <span>${esc(m.home_team)}</span>
                            <span class="text-slate-500 font-normal mx-1 text-xs">vs</span>
                            <span>${esc(m.away_team)}</span>
                        </div>
                        <div class="text-right">
                            <span class="text-[10px] text-slate-400">官方${targetSpLabel}SP: </span>
                            <span class="font-mono font-bold text-amber-400 text-sm">${m._curTargetSp ? m._curTargetSp.toFixed(2) : '--'}</span>
                        </div>
                    </div>

                    <!-- 半全场 3 项赔率组合胶囊 -->
                    <div class="grid grid-cols-3 gap-2 bg-slate-900/70 p-2 rounded-lg border border-slate-800/80 text-center">
                        <div>
                            <div class="text-[10px] text-slate-500">${m._curCombo[0].name}</div>
                            <div class="font-mono font-bold text-emerald-400 text-xs">${m._curCombo[0].val}</div>
                        </div>
                        <div>
                            <div class="text-[10px] text-slate-500">${m._curCombo[1].name}</div>
                            <div class="font-mono font-bold text-blue-400 text-xs">${m._curCombo[1].val}</div>
                        </div>
                        <div>
                            <div class="text-[10px] text-slate-500">${m._curCombo[2].name}</div>
                            <div class="font-mono font-bold text-purple-400 text-xs">${m._curCombo[2].val}</div>
                        </div>
                    </div>

                    <!-- 合成单关与折损率 + 一键载入与分析 -->
                    <div class="flex items-center justify-between pt-1">
                        <div class="flex items-center space-x-2">
                            <div>
                                <span class="text-[11px] text-slate-400">等效合成: </span>
                                <span class="font-mono font-bold text-white text-xs">${m._curSynthSp ? m._curSynthSp.toFixed(4) : '--'}</span>
                            </div>
                            <span title="${shrinkTier.title}" class="px-2 py-0.5 rounded-full text-[11px] border cursor-help whitespace-nowrap ${shrinkTier.cls}">
                                ${m._curShrinkage >= 0 ? '+' : ''}${m._curShrinkage.toFixed(2)}%
                            </span>
                        </div>
                        <div class="flex items-center space-x-1.5">
                            <button type="button" data-analysis-id="${loadId}" class="px-2.5 py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500 text-blue-300 hover:text-white border border-blue-500/30 text-xs font-semibold active:scale-95 transition shadow-sm flex items-center gap-1">
                                <span>⚽</span>
                                <span>分析</span>
                            </button>
                            <button type="button" data-load-id="${loadId}" class="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-white border border-emerald-500/30 text-xs font-semibold active:scale-95 transition shadow-sm flex items-center gap-1">
                                <span>⚡</span>
                                <span>载入测算</span>
                            </button>
                        </div>
                    </div>
                `;
                cardsContainer.appendChild(card);
            });
        }
    }

    // 数据重绘后同步刷新「🔥 最优拆单推荐」区（实时数据成功拉取后也经由本函数自动更新）
    renderOptimalRecs();
}

// 一键载入比赛数据到顶部测算器 (完整 9 项赔率灌入 + 联动预设 + 自动平滑切回测算台)
function loadMatchToCalc(m) {
    const numInput = document.getElementById('inputMatchNum');
    const homeInput = document.getElementById('inputHomeTeam');
    const awayInput = document.getElementById('inputAwayTeam');
    const spInput = document.getElementById('inputSpHDA');

    if (numInput) numInput.value = m.match_num_str || '';
    if (homeInput) homeInput.value = m.home_team || '';
    if (awayInput) awayInput.value = m.away_team || '';

    const spH = m.sp_h ? m.sp_h.toFixed(2) : '--';
    const spD = m.sp_d ? m.sp_d.toFixed(2) : '--';
    const spA = m.sp_a ? m.sp_a.toFixed(2) : '--';
    if (spInput) spInput.value = `${spH} / ${spD} / ${spA}`;

    // 写入 9 项赔率
    if (m.hafu_hh) document.getElementById('odds_hh').value = m.hafu_hh;
    if (m.hafu_hd) document.getElementById('odds_hd').value = m.hafu_hd;
    if (m.hafu_ha) document.getElementById('odds_ha').value = m.hafu_ha;
    if (m.hafu_dh) document.getElementById('odds_dh').value = m.hafu_dh;
    if (m.hafu_dd) document.getElementById('odds_dd').value = m.hafu_dd;
    if (m.hafu_da) document.getElementById('odds_da').value = m.hafu_da;
    if (m.hafu_ah) document.getElementById('odds_ah').value = m.hafu_ah;
    if (m.hafu_ad) document.getElementById('odds_ad').value = m.hafu_ad;
    if (m.hafu_aa) document.getElementById('odds_aa').value = m.hafu_aa;


    // 联动当前选定的拆单方向自动激活对应预设
    if (currentListTarget === 'd') {
        applyPreset('ft_draw');
    } else if (currentListTarget === 'a') {
        applyPreset('ft_away');
    } else {
        applyPreset('ft_home');
    }

    // 移动端若在榜单视图，自动平滑切回测算台
    if (window.innerWidth < 768) {
        switchMobileTab('calc');
    }

    // 平滑滚动至测算器
    const calcSection = document.getElementById('calculatorSection');
    if (calcSection) {
        calcSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        calcSection.classList.add('glass-card-active');
        setTimeout(() => {
            calcSection.classList.remove('glass-card-active');
        }, 1500);
    }
}

// ======================= 🔥 精选拆单推荐 (一键推荐最合适拆单模式) =======================

// 切换推荐模式：'steady'(高胜率稳胆) | 'shrink'(极低折损)
function setRecMode(mode) {
    currentRecMode = mode;
    const btnSteady = document.getElementById('recModeSteady');
    const btnShrink = document.getElementById('recModeShrink');
    if (btnSteady && btnShrink) {
        if (mode === 'steady') {
            btnSteady.className = 'px-2.5 py-1 rounded text-xs font-bold transition bg-emerald-500 text-white shadow-sm whitespace-nowrap';
            btnShrink.className = 'px-2.5 py-1 rounded text-xs font-medium transition text-slate-300 hover:text-white bg-slate-800/80 whitespace-nowrap';
        } else {
            btnSteady.className = 'px-2.5 py-1 rounded text-xs font-medium transition text-slate-300 hover:text-white bg-slate-800/80 whitespace-nowrap';
            btnShrink.className = 'px-2.5 py-1 rounded text-xs font-bold transition bg-emerald-500 text-white shadow-sm whitespace-nowrap';
        }
    }
    renderOptimalRecs();
}

// 计算单场在指定模式下的最优拆解（返回 null 表示无方向可拆或已开赛）
// mode: 'steady' (稳胆模式：仅测算主胜与客胜强队，找低折合赔率且有正收益场次)
//       'shrink' (极低折损模式：测算全方向，找折损率最小场次)
function analyzeBestSplitForMatch(m, mode = 'steady') {
    if (!m) return null;
    // 已开赛的比赛不再推荐（此时已无法下单）
    const kickoffTs = matchKickoffTs(m);
    if (kickoffTs !== null && kickoffTs <= Date.now()) return null;

    let best = null;
    // 稳胆模式仅推荐主胜 'h' 或客胜 'a'，排除高波动平局
    const targetDirs = mode === 'steady' ? ['h', 'a'] : Object.keys(SPLIT_TARGET_DIRS);

    targetDirs.forEach(dirKey => {
        const meta = SPLIT_TARGET_DIRS[dirKey];
        const officialSp = m[meta.officialKey] || 0;
        const odds = meta.outcomeKeys.map(k => m['hafu_' + k] || 0);
        // 官方 SP 非法或三个半全场组合赔率任一缺失 → 该方向不具备拆单条件
        if (officialSp <= 0 || odds.some(o => o <= 0)) return;

        const invSum = odds.reduce((acc, o) => acc + (1.0 / o), 0);
        const synthSp = invSum > 0 ? (1.0 / invSum) : 0;
        // 折损率 = (合成单关SP - 官方SP) / 官方SP
        const shrink = ((synthSp - officialSp) / officialSp) * 100;

        if (mode === 'steady') {
            // 稳胆门槛：必须保证正收益空间 (synthSp >= 1.05)，且折损在合理容忍范围内 (shrink >= -8.5%)
            if (synthSp < REC_STEADY_MIN_SYNTH) return;
            if (shrink < REC_STEADY_MAX_SHRINK) return;
            // 稳胆优选：折合赔率最低者（概率最高最稳），同赔率下选折损更优
            if (!best || synthSp < best.synthSp || (Math.abs(synthSp - best.synthSp) < 0.0001 && shrink > best.shrink)) {
                best = {
                    dir: dirKey,
                    label: meta.label,
                    presetKey: meta.preset,
                    officialSp: officialSp,
                    synthSp: synthSp,
                    shrink: shrink,
                    outcomeKeys: meta.outcomeKeys.slice(),
                    odds: odds
                };
            }
        } else {
            // 极低折损模式：要求合成 SP > 1.0 且折损不过高
            if (synthSp <= 1.0 || shrink < REC_FLOOR_SHRINK) return;
            if (!best || shrink > best.shrink) {
                best = {
                    dir: dirKey,
                    label: meta.label,
                    presetKey: meta.preset,
                    officialSp: officialSp,
                    synthSp: synthSp,
                    shrink: shrink,
                    outcomeKeys: meta.outcomeKeys.slice(),
                    odds: odds
                };
            }
        }
    });
    return best;
}

// 渲染「精选拆单推荐」卡片区（随 renderMatchList 一并重绘，实时数据刷新后自动更新）
function renderOptimalRecs() {
    const container = document.getElementById('optimalRecContainer');
    const badge = document.getElementById('recBadgeCount');
    if (!container) return;

    // 筛选「未开胜平负单关」(single_had === 0，适合人工拆单) 的场次
    const candidates = [];
    (Array.isArray(matchesData) ? matchesData : []).forEach(m => {
        if (m.single_had !== 0) return;
        const best = analyzeBestSplitForMatch(m, currentRecMode);
        if (!best) return;
        candidates.push({ match: m, best: best });
    });

    // 排序逻辑：
    // - 稳胆模式：按合成单关 SP 从低到高（最稳/概率最高），次级按折损率从优到劣
    // - 折损模式：按折损率从优到劣（差价最小），次级按合成单关 SP 从低到高
    if (currentRecMode === 'steady') {
        candidates.sort((a, b) => {
            if (Math.abs(a.best.synthSp - b.best.synthSp) > 0.0001) {
                return a.best.synthSp - b.best.synthSp;
            }
            return b.best.shrink - a.best.shrink;
        });
    } else {
        candidates.sort((a, b) => {
            if (Math.abs(a.best.shrink - b.best.shrink) > 0.01) {
                return b.best.shrink - a.best.shrink;
            }
            return a.best.synthSp - b.best.synthSp;
        });
    }

    const top = candidates.slice(0, REC_TOP_N);

    if (badge) {
        badge.innerText = top.length > 0 ? `Top ${top.length}` : '0 场可选';
    }

    // 无合适场次空态
    if (top.length === 0) {
        container.innerHTML = `
            <div class="md:col-span-3 py-8 text-center rounded-xl border border-dashed border-slate-700/70 bg-slate-900/30">
                <div class="text-2xl mb-1.5">🛋️</div>
                <div class="text-slate-300 font-semibold text-sm">暂无符合条件的拆单场次</div>
                <div class="text-[11px] text-slate-500 mt-1">可切换上方模式或点击右上角「刷新数据」</div>
            </div>`;
        return;
    }

    container.innerHTML = '';
    top.forEach((item, idx) => {
        const m = item.match;
        const b = item.best;
        const recId = ++recApplySeq;
        recApplyRegistry.set(recId, { match: m, dir: b.dir });

        const rank = idx + 1;
        // 排名徽标配色：TOP1 火焰金 / TOP2 翠绿 / TOP3 青蓝
        const rankClass = rank === 1
            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
            : (rank === 2 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40');

        // P2-a 四档色阶同样用于推荐卡，保持与列表图例一致
        const shrinkTier = shrinkTierInfo(b.shrink);

        // 组合展示文案：如「胜胜 17.5 / 平胜 23.0 / 负胜 65.0」
        const comboText = b.outcomeKeys.map((k, i) => `${OUTCOMES_META[k].name} ${b.odds[i]}`).join(' / ');
        const modeTitle = currentRecMode === 'steady' ? '🎯 稳胆拆法' : '📉 优选拆法';

        const card = document.createElement('div');
        card.className = 'rounded-xl glass-card border border-white/10 p-3.5 flex flex-col gap-2.5 relative overflow-hidden rec-card';
        card.innerHTML = `
            <div class="pointer-events-none absolute -top-8 -right-8 w-24 h-24 rounded-full ${rank === 1 ? 'bg-amber-500/10' : 'bg-emerald-500/10'} blur-2xl"></div>

            <!-- 排名 + 场次编号 / 联赛 -->
            <div class="flex items-center justify-between gap-2 relative">
                <span class="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-black border ${rankClass}">TOP${rank}</span>
                <span class="min-w-0 text-right leading-tight">
                    <span class="text-[11px] font-mono font-bold text-white block truncate">${esc(m.match_num_str)}</span>
                    <span class="text-[10px] text-slate-400 block truncate">${esc(m.league_name)}</span>
                </span>
            </div>

            <!-- 对阵球队与开赛时间 -->
            <div class="relative">
                <div class="text-sm font-bold text-white leading-snug">
                    <span>${esc(m.home_team)}</span>
                    <span class="text-slate-500 font-normal text-xs mx-1">vs</span>
                    <span>${esc(m.away_team)}</span>
                </div>
                <div class="text-[11px] text-slate-400 font-mono mt-0.5">${esc((m.match_date || '').slice(5))} ${esc((m.match_time || '').slice(0, 5))} 开赛</div>
            </div>

            <!-- 推荐拆法 -->
            <div class="rounded-lg bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-2 relative">
                <div class="flex items-center justify-between gap-1">
                    <span class="text-[10px] text-emerald-300 font-black tracking-wide">${modeTitle} · ${esc(b.label)}</span>
                    <span class="text-[10px] text-slate-400 font-mono shrink-0">3项全包</span>
                </div>
                <div class="font-mono text-[11px] text-slate-300 mt-1.5 leading-relaxed">${esc(comboText)}</div>
            </div>

            <!-- 等效合成单关 SP + 折损率 -->
            <div class="flex items-center justify-between gap-2 relative">
                <div>
                    <div class="text-[10px] text-slate-500">等效合成单关</div>
                    <div class="font-mono font-black text-white text-sm">${esc(b.synthSp.toFixed(4))}</div>
                </div>
                <span title="${shrinkTier.title}" class="px-2 py-1 rounded-full text-[11px] border whitespace-nowrap cursor-help ${shrinkTier.cls}">
                    折损 ${esc(b.shrink >= 0 ? '+' : '')}${esc(b.shrink.toFixed(2))}%
                </span>
            </div>

            <!-- 一键应用：载入测算台 + 自动勾选推荐组合 + 等额对冲配资 -->
            <button type="button" data-rec-id="${recId}"
                class="relative w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500/90 to-orange-500/90 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition active:scale-95">
                <span>⚡</span><span>一键应用</span>
            </button>
        `;
        container.appendChild(card);
    });
}

// 「一键应用」事件委托：从 data-rec-id 查注册表取 { match, dir }，避免把比赛 JSON 拼进 onclick
document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('[data-rec-id]') : null;
    if (!btn) return;
    const rec = recApplyRegistry.get(Number(btn.getAttribute('data-rec-id')));
    if (!rec) return;
    applyRecommendedSplit(rec.match, rec.dir);
});

// 应用推荐拆法：载入场次 → 勾选该方向 3 项全包预设 → 等额对冲(Equal Profit)均衡返还
function applyRecommendedSplit(m, dir) {
    loadMatchToCalc(m); // 灌入 9 项赔率，移动端自动切回测算台并平滑滚动
    const meta = SPLIT_TARGET_DIRS[dir];
    if (meta && STRATEGY_PRESETS[meta.preset]) {
        applyPreset(meta.preset); // 自动勾选推荐赛果组合（如 全场主胜 = HH+DH+AH）
    }
    setAllocationMode('dutched'); // 填入推荐预算分配模式：等额对冲（Equal Profit）
}

// 全局事件委托：榜单「载入测算」与「比赛分析」按钮
document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('[data-load-id]') : null;
    if (btn) {
        const match = matchLoadRegistry.get(Number(btn.getAttribute('data-load-id')));
        if (match) loadMatchToCalc(match);
        return;
    }
    const analysisBtn = e.target && e.target.closest ? e.target.closest('[data-analysis-id]') : null;
    if (analysisBtn) {
        const match = matchLoadRegistry.get(Number(analysisBtn.getAttribute('data-analysis-id')));
        if (match) openMatchAnalysisModal(match);
        return;
    }
});

// 切换原理弹窗（打开时自动调用 KaTeX 渲染 $${}$$ 与 $...$ 公式）
function toggleExplainModal() {
    const modal = document.getElementById('explainModal');
    if (modal) {
        const willOpen = modal.classList.contains('hidden');
        modal.classList.toggle('hidden');
        if (willOpen && typeof renderMathInElement === 'function') {
            try {
                renderMathInElement(modal, {
                    delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '$', right: '$', display: false }
                    ],
                    throwOnError: false
                });
            } catch (e) {
                console.warn('KaTeX render error:', e);
            }
        }
    }
}

// ======================= 数据源状态 UI（徽标 + 降级横幅） =======================

// 格式化毫秒时间戳为 HH:MM:SS 时钟串（用于徽标展示更新时间）
function formatClockTime(ts) {
    const d = new Date(ts);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// 按 dataSourceState 渲染顶部数据源状态徽标（loading / live / snapshot）
function renderDataSourceUI() {
    const badge = document.getElementById('dataSourceBadge');
    const dot = document.getElementById('dataSourceDot');
    const box = document.getElementById('dataSourceBox');

    let stateClass = 'loading';
    let text = '加载中…';

    if (dataSourceState === 'live') {
        const n = Array.isArray(matchesData) ? matchesData.length : 0;
        const tsStr = lastUpdatedAt ? ` · ${formatClockTime(lastUpdatedAt)} 更新` : '';
        text = `竞彩网实时 ${n}场${tsStr}`;
        stateClass = 'live';
    } else if (dataSourceState === 'snapshot') {
        text = '获取失败·内置测试数据';
        stateClass = 'snapshot';
    }

    if (badge) {
        badge.innerText = text;
        badge.classList.remove('ds-text-loading', 'ds-text-live', 'ds-text-snapshot');
        badge.classList.add('ds-text-' + stateClass);
    }
    if (dot) {
        dot.classList.remove('ds-dot-loading', 'ds-dot-live', 'ds-dot-snapshot');
        dot.classList.add('ds-dot-' + stateClass);
    }
    if (box) {
        box.classList.remove('ds-box-loading', 'ds-box-live', 'ds-box-snapshot');
        box.classList.add('ds-box-' + stateClass);
    }
}

// 显示降级警告横幅（竞彩网拉取失败 → 降级为内置快照时由 api.js 触发）
function showDataFallbackBanner() {
    const banner = document.getElementById('dataFallbackBanner');
    if (banner) banner.classList.remove('hidden');
}

// 隐藏降级警告横幅（横幅「×」关闭按钮 / 实时拉取成功后调用）
function hideDataFallbackBanner() {
    const banner = document.getElementById('dataFallbackBanner');
    if (banner) banner.classList.add('hidden');
}

// ======================= P2-b 数据时效自动刷新 =======================

const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 分钟
const AUTO_REFRESH_MIN_RETRY_AFTER_FAIL = 60 * 1000; // 拉取失败后 60s 内不重试

// 自动刷新心跳：页面隐藏时跳过；若上次双通道拉取失败距现在 <60s 也跳过（避免频繁请求官方接口）
function autoRefreshTick() {
    if (document.hidden) return; // 后台标签页跳过，回到可见时由 visibilitychange 补一次
    if (typeof lastDataFailAt === 'number' && lastDataFailAt &&
        (Date.now() - lastDataFailAt) < AUTO_REFRESH_MIN_RETRY_AFTER_FAIL) {
        return;
    }
    refreshMatchData({ silent: true }); // 复用 30s 节流缓存 + refreshInFlight 防并发锁
}

// 页面初始化
document.addEventListener('DOMContentLoaded', () => {
    // 搜索/筛选控件改为事件监听绑定（搜索带 300ms 防抖，不再依赖 HTML 内联 oninput/onchange）
    const searchInput = document.getElementById('inputSearch');
    if (searchInput) searchInput.addEventListener('input', debounce(renderMatchList, 300));
    const filterHideSingle = document.getElementById('filterHideSingle');
    if (filterHideSingle) filterHideSingle.addEventListener('change', renderMatchList);
    const sortSelect = document.getElementById('selectSort');
    if (sortSelect) sortSelect.addEventListener('change', renderMatchList);
    const shrinkFilterEl = document.getElementById('selectShrinkFilter');
    if (shrinkFilterEl) shrinkFilterEl.addEventListener('change', renderMatchList);

    initTheme();
    handleResize();
    renderMatchList();
    calculate();
    // 数据源状态徽标初始渲染（loading 态），随后自动静默拉取最新竞彩网数据（成功才替换）
    renderDataSourceUI();
    refreshMatchData({ silent: true, force: true });

    // P2-b：启动 5 分钟静默自动刷新；标签页从隐藏回到可见时也补刷一次
    setInterval(autoRefreshTick, AUTO_REFRESH_INTERVAL);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) autoRefreshTick();
    });

    // 监听 ESC 键关闭赛事分析弹窗及赞赏弹窗
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeMatchAnalysisModal();
            closeDonateModal();
        }
    });

    // 点击弹窗背景遮罩关闭
    const analysisModal = document.getElementById('matchAnalysisModal');
    if (analysisModal) {
        analysisModal.addEventListener('click', (e) => {
            if (e.target === analysisModal) {
                closeMatchAnalysisModal();
            }
        });
    }

    const donateModal = document.getElementById('donateModal');
    if (donateModal) {
        donateModal.addEventListener('click', (e) => {
            if (e.target === donateModal) {
                closeDonateModal();
            }
        });
    }
});

// ======================= 请我喝杯咖啡（赞赏支持）弹窗逻辑 =======================

function openDonateModal() {
    const modal = document.getElementById('donateModal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}

function closeDonateModal() {
    const modal = document.getElementById('donateModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function switchDonateChannel(channel) {
    const tabWechat = document.getElementById('donateTabWechat');
    const tabAlipay = document.getElementById('donateTabAlipay');
    const cardWechat = document.getElementById('donateCardWechat');
    const cardAlipay = document.getElementById('donateCardAlipay');

    if (!tabWechat || !tabAlipay || !cardWechat || !cardAlipay) return;

    if (channel === 'alipay') {
        tabWechat.className = 'flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all text-slate-400 hover:text-slate-200 border border-transparent cursor-pointer active:scale-95';
        tabAlipay.className = 'flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all bg-[#1677FF]/15 text-[#1677FF] border border-[#1677FF]/40 shadow-sm cursor-pointer active:scale-95';
        cardWechat.classList.add('hidden');
        cardAlipay.classList.remove('hidden');
    } else {
        tabWechat.className = 'flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all bg-[#07C160]/15 text-[#07C160] border border-[#07C160]/40 shadow-sm cursor-pointer active:scale-95';
        tabAlipay.className = 'flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all text-slate-400 hover:text-slate-200 border border-transparent cursor-pointer active:scale-95';
        cardWechat.classList.remove('hidden');
        cardAlipay.classList.add('hidden');
    }
}

// ======================= 明暗主题切换逻辑 (Theme Light / Dark) =======================

function initTheme() {
    let savedTheme = 'dark';
    try {
        // 优先读取用户显式偏好设置；若首次进入，则默认呈现暗黑科技模式 (Dark Mode)
        const v2Theme = localStorage.getItem('htft_theme_v2');
        if (v2Theme) {
            savedTheme = v2Theme;
        } else {
            savedTheme = 'dark';
        }
    } catch (e) {
        savedTheme = 'dark';
    }
    applyTheme(savedTheme, false);
}

function applyTheme(theme, persist = true) {
    const isLight = theme === 'light';
    if (isLight) {
        document.documentElement.classList.add('theme-light');
    } else {
        document.documentElement.classList.remove('theme-light');
    }

    const iconEl = document.getElementById('themeToggleIcon');
    const btnEl = document.getElementById('themeToggleBtn');

    if (iconEl) iconEl.textContent = isLight ? '🌙' : '☀️';
    if (btnEl) btnEl.title = isLight ? '当前为浅色主题，点击切换为深色' : '当前为深色主题，点击切换为浅色';

    if (persist) {
        try {
            const val = isLight ? 'light' : 'dark';
            localStorage.setItem('htft_theme_v2', val);
            localStorage.setItem('htft_theme', val);
        } catch (e) {}
    }
}

function toggleTheme() {
    const currentIsLight = document.documentElement.classList.contains('theme-light');
    const nextTheme = currentIsLight ? 'dark' : 'light';
    applyTheme(nextTheme, true);
    if (typeof showToast === 'function') {
        showToast(nextTheme === 'light' ? '☀️ 已切换至浅色明亮模式' : '🌙 已切换至深色暗黑模式');
    }
}

// ======================= 竞彩官方赛事数据分析弹窗逻辑 =======================

let currentAnalysisMatch = null;

function closeMatchAnalysisModal() {
    const modal = document.getElementById('matchAnalysisModal');
    if (modal) modal.classList.add('hidden');
}

async function openMatchAnalysisModal(m) {
    if (!m) return;
    currentAnalysisMatch = m;
    const modal = document.getElementById('matchAnalysisModal');
    if (!modal) return;

    modal.classList.remove('hidden');

    // 1. 设置基础头信息
    const titleEl = document.getElementById('analysisModalTitle');
    const leagueEl = document.getElementById('analysisLeagueBadge');
    const timeEl = document.getElementById('analysisMatchTime');
    const homeNameEl = document.getElementById('analysisHomeName');
    const awayNameEl = document.getElementById('analysisAwayName');
    const homeLogoEl = document.getElementById('analysisHomeLogo');
    const awayLogoEl = document.getElementById('analysisAwayLogo');
    const spHEl = document.getElementById('analysisSpH');
    const spDEl = document.getElementById('analysisSpD');
    const spAEl = document.getElementById('analysisSpA');
    const singleBadgeEl = document.getElementById('analysisSingleBadge');
    const officialLinkEl = document.getElementById('analysisOfficialLink');

    if (titleEl) titleEl.textContent = `${m.match_num_str} 对阵数据分析`;
    if (leagueEl) leagueEl.textContent = m.league_name || '竞彩赛事';
    if (timeEl) timeEl.textContent = `比赛时间：${m.match_date || ''} ${m.match_time || ''}`;
    if (homeNameEl) homeNameEl.textContent = m.home_team || '主队';
    if (awayNameEl) awayNameEl.textContent = m.away_team || '客队';
    if (homeLogoEl) homeLogoEl.src = 'https://static.sporttery.cn/res_1_0/jcw/images/fotBasbal_match/icon_zd.png';
    if (awayLogoEl) awayLogoEl.src = 'https://static.sporttery.cn/res_1_0/jcw/images/fotBasbal_match/icon_kd.png';

    if (spHEl) spHEl.textContent = m.sp_h ? m.sp_h.toFixed(2) : '--';
    if (spDEl) spDEl.textContent = m.sp_d ? m.sp_d.toFixed(2) : '--';
    if (spAEl) spAEl.textContent = m.sp_a ? m.sp_a.toFixed(2) : '--';

    if (singleBadgeEl) {
        if (m.single_had === 1) {
            singleBadgeEl.className = 'text-[10px] px-2 py-0.5 rounded font-semibold bg-red-500/20 text-red-300 border border-red-500/30';
            singleBadgeEl.textContent = '已开胜平负单关';
        } else {
            singleBadgeEl.className = 'text-[10px] px-2 py-0.5 rounded font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
            singleBadgeEl.textContent = '未开单关·适合半全场拆单';
        }
    }

    if (officialLinkEl) {
        officialLinkEl.href = `https://www.sporttery.cn/jc/zqdz/index.html?showType=2&mid=${m.match_id}`;
    }

    // 绑定载入测算台按钮
    const btnLoad = document.getElementById('analysisBtnLoadToCalc');
    const btnLoadM = document.getElementById('analysisBtnLoadToCalcMobile');
    const doLoad = () => {
        loadMatchToCalc(m);
        closeMatchAnalysisModal();
    };
    if (btnLoad) btnLoad.onclick = doLoad;
    if (btnLoadM) btnLoadM.onclick = doLoad;

    // 显示骨架屏加载动画
    const loadingEl = document.getElementById('analysisLoading');
    const contentEl = document.getElementById('analysisContent');
    const errorEl = document.getElementById('analysisError');
    if (loadingEl) loadingEl.classList.remove('hidden');
    if (contentEl) contentEl.classList.add('hidden');
    if (errorEl) errorEl.classList.add('hidden');

    try {
        const data = await fetchMatchAnalysis(m.match_id);
        if (!data || (!data.head && !data.history && !data.recent)) {
            if (loadingEl) loadingEl.classList.add('hidden');
            if (errorEl) errorEl.classList.remove('hidden');
            return;
        }

        const head = data.head || {};
        const history = data.history || {};
        const recent = data.recent || {};

        // 渲染徽标与排名
        if (head.homeTeamLogoPath && homeLogoEl) homeLogoEl.src = head.homeTeamLogoPath;
        if (head.awayTeamLogoPath && awayLogoEl) awayLogoEl.src = head.awayTeamLogoPath;

        const homeRankEl = document.getElementById('analysisHomeRank');
        const awayRankEl = document.getElementById('analysisAwayRank');
        const homeRank = head.wbsjStats?.home?.ranking;
        const awayRank = head.wbsjStats?.away?.ranking;
        if (homeRankEl) homeRankEl.textContent = homeRank ? `排名: 第${homeRank}名` : '排名: --';
        if (awayRankEl) awayRankEl.textContent = awayRank ? `排名: 第${awayRank}名` : '排名: --';

        // 渲染交锋历史
        const histStats = history.statistics || {};
        const histMatches = Array.isArray(history.matchList) ? history.matchList : [];
        const winCnt = Number(histStats.winGoalMatchCnt || 0);
        const drawCnt = Number(histStats.drawMatchCnt || 0);
        const lossCnt = Number(histStats.lossGoalMatchCnt || 0);
        const totalH2H = winCnt + drawCnt + lossCnt || histMatches.length || 1;

        const winPct = Math.round((winCnt / totalH2H) * 100);
        const drawPct = Math.round((drawCnt / totalH2H) * 100);
        const lossPct = Math.max(0, 100 - winPct - drawPct);

        const h2hSummaryEl = document.getElementById('analysisH2HSummary');
        if (h2hSummaryEl) {
            h2hSummaryEl.innerHTML = `(主队 <span class="text-emerald-400 font-bold">${winCnt}胜</span> <span class="text-blue-400 font-bold">${drawCnt}平</span> <span class="text-purple-400 font-bold">${lossCnt}负</span>)`;
        }

        const barWin = document.getElementById('analysisH2HBarWin');
        const barDraw = document.getElementById('analysisH2HBarDraw');
        const barLoss = document.getElementById('analysisH2HBarLoss');
        if (barWin) { barWin.style.width = `${winPct}%`; barWin.title = `主胜 ${winCnt}场 (${winPct}%)`; }
        if (barDraw) { barDraw.style.width = `${drawPct}%`; barDraw.title = `平局 ${drawCnt}场 (${drawPct}%)`; }
        if (barLoss) { barLoss.style.width = `${lossPct}%`; barLoss.title = `主负 ${lossCnt}场 (${lossPct}%)`; }

        const h2hTable = document.getElementById('analysisH2HTableBody');
        if (h2hTable) {
            h2hTable.innerHTML = '';
            if (histMatches.length === 0) {
                h2hTable.innerHTML = `<tr><td colspan="6" class="py-3 text-center text-slate-500">两队近期暂无直接交锋记录</td></tr>`;
            } else {
                histMatches.slice(0, 6).forEach(hm => {
                    const tr = document.createElement('tr');
                    tr.className = 'hover:bg-slate-800/30 transition';
                    const winTeam = hm.winningTeam; // 'home' | 'away' | 'draw'
                    let outcomeBadge = '<span class="text-slate-400">平</span>';
                    if (winTeam === 'home') outcomeBadge = '<span class="text-emerald-400 font-bold">胜</span>';
                    else if (winTeam === 'away') outcomeBadge = '<span class="text-purple-400 font-bold">负</span>';

                    tr.innerHTML = `
                        <td class="py-1.5 text-slate-400">${esc((hm.matchDate || '').slice(2))} <span class="text-slate-500">${esc(hm.tournamentShortName || '')}</span></td>
                        <td class="py-1.5 text-center text-white">${esc(hm.homeTeamShortName || '')}</td>
                        <td class="py-1.5 text-center font-bold text-amber-400">${esc(hm.fullCourtGoal || '--')}</td>
                        <td class="py-1.5 text-center text-slate-400">(${esc(hm.halfTimeGoal || '--')})</td>
                        <td class="py-1.5 text-center text-white">${esc(hm.awayTeamShortName || '')}</td>
                        <td class="py-1.5 text-right">${outcomeBadge}</td>
                    `;
                    h2hTable.appendChild(tr);
                });
            }
        }

        // 渲染主客队近期表现
        const homeRecent = recent.home || {};
        const awayRecent = recent.away || {};

        const renderTeamRecent = (teamData, titleElId, winRateElId, statsElId, listElId, defaultName) => {
            const teamTitle = document.getElementById(titleElId);
            const winRateEl = document.getElementById(winRateElId);
            const statsEl = document.getElementById(statsElId);
            const listEl = document.getElementById(listElId);

            const st = teamData.statistics || {};
            const matches = Array.isArray(teamData.matchList) ? teamData.matchList : [];

            if (teamTitle) teamTitle.textContent = `${st.teamShortName || defaultName} 近况`;
            if (winRateEl) winRateEl.textContent = `胜率: ${st.winProbability || '--'}`;

            if (statsEl) {
                const total = st.totalLegCnt || matches.length || 0;
                const w = st.winGoalMatchCnt || 0;
                const d = st.drawMatchCnt || 0;
                const l = st.lossGoalMatchCnt || 0;
                const goals = st.goalCnt ?? '--';
                const lossGoals = st.lossGoalCnt ?? '--';
                statsEl.innerHTML = `
                    <span>近${total}场: <b class="text-emerald-400">${w}胜</b> <b class="text-blue-400">${d}平</b> <b class="text-purple-400">${l}负</b></span>
                    <span>进${goals}/失${lossGoals}</span>
                `;
            }

            if (listEl) {
                listEl.innerHTML = '';
                if (matches.length === 0) {
                    listEl.innerHTML = `<div class="py-2 text-center text-slate-500">暂无近况战绩数据</div>`;
                } else {
                    matches.slice(0, 5).forEach(rm => {
                        const row = document.createElement('div');
                        row.className = 'flex items-center justify-between py-1 border-b border-slate-800/40 last:border-0';
                        const isHome = (rm.homeTeamShortName === (st.teamShortName || defaultName));
                        const opp = isHome ? rm.awayTeamShortName : rm.homeTeamShortName;
                        const score = rm.fullCourtGoal || '--';
                        let resBadge = '<span class="px-1 py-0.5 rounded bg-slate-800 text-slate-400">平</span>';
                        if (rm.winningTeam === 'home') {
                            resBadge = isHome
                                ? '<span class="px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300">胜</span>'
                                : '<span class="px-1 py-0.5 rounded bg-purple-500/20 text-purple-300">负</span>';
                        } else if (rm.winningTeam === 'away') {
                            resBadge = isHome
                                ? '<span class="px-1 py-0.5 rounded bg-purple-500/20 text-purple-300">负</span>'
                                : '<span class="px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300">胜</span>';
                        }
                        row.innerHTML = `
                            <span class="text-slate-400">${esc((rm.matchDate || '').slice(5))} ${esc(rm.tournamentShortName || '')}</span>
                            <span class="text-slate-300 truncate max-w-[90px]">${isHome ? '主' : '客'}vs ${esc(opp || '')}</span>
                            <span class="font-bold text-white">${esc(score)}</span>
                            ${resBadge}
                        `;
                        listEl.appendChild(row);
                    });
                }
            }
        };

        renderTeamRecent(homeRecent, 'analysisHomeRecentTitle', 'analysisHomeWinRate', 'analysisHomeRecentStats', 'analysisHomeRecentList', m.home_team);
        renderTeamRecent(awayRecent, 'analysisAwayRecentTitle', 'analysisAwayWinRate', 'analysisAwayRecentStats', 'analysisAwayRecentList', m.away_team);

        if (loadingEl) loadingEl.classList.add('hidden');
        if (contentEl) contentEl.classList.remove('hidden');
    } catch (e) {
        console.error('[赛事分析] 渲染失败:', e);
        if (loadingEl) loadingEl.classList.add('hidden');
        if (errorEl) errorEl.classList.remove('hidden');
    }
}
