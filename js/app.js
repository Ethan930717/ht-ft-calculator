/**
 * 竞彩半全场 - 界面与用户交互控制器 (UI & App Controller)
 * 包含：响应式卡片/表格双模渲染、移动端分段切换器、赛事载入与联动
 */

let currentListTarget = 'h'; // 'h' (主胜) | 'd' (平局) | 'a' (客胜)
let currentMobileTab = 'calc'; // 'calc' | 'matches'

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
    const sortBy = sortSelect ? sortSelect.value : 'shrinkage_asc';
    const searchInput = document.getElementById('inputSearch');
    const searchKw = searchInput ? searchInput.value.trim().toLowerCase() : '';

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
    });

    // 1. 过滤
    let list = matchesData.filter(m => {
        if (hideSingle && m.single_had === 1) return false;
        if (searchKw) {
            const fullStr = `${m.league_name} ${m.home_team} ${m.away_team} ${m.match_num_str}`.toLowerCase();
            if (!fullStr.includes(searchKw)) return false;
        }
        return true;
    });

    // 2. 排序
    if (sortBy === 'shrinkage_asc') {
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
                tr.className = 'hover:bg-slate-800/40 transition group';

                let shrinkBadgeClass = 'bg-slate-800 text-slate-400 border-slate-700';
                if (m._curShrinkage >= -5.0) {
                    shrinkBadgeClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold';
                } else if (m._curShrinkage >= -8.0) {
                    shrinkBadgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold';
                }

                const singleBadge = m.single_had === 1
                    ? `<span class="px-2 py-0.5 rounded text-[10px] bg-red-500/20 text-red-300 border border-red-500/30 whitespace-nowrap">已开单关</span>`
                    : `<span class="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold whitespace-nowrap">未开单关⭐</span>`;

                tr.innerHTML = `
                    <td class="py-3 px-3 text-center font-mono text-slate-500">${idx + 1}</td>
                    <td class="py-3 px-3 whitespace-nowrap">
                        <div class="font-bold text-white font-mono">${m.match_num_str || ''}</div>
                        <div class="text-[11px] text-slate-400">${m.league_name || ''}</div>
                    </td>
                    <td class="py-3 px-3 whitespace-nowrap">
                        <div class="font-bold text-white">${m.home_team} <span class="text-slate-500 font-normal">vs</span> ${m.away_team}</div>
                    </td>
                    <td class="py-3 px-3 text-center font-mono text-slate-400 whitespace-nowrap">
                        ${(m.match_date || '').slice(5)} ${m.match_time || ''}
                    </td>
                    <td class="py-3 px-3 text-center whitespace-nowrap">${singleBadge}</td>
                    <td class="py-3 px-3 text-right font-mono font-bold text-amber-400 text-sm whitespace-nowrap" title="胜平负SP: 胜 ${m.sp_h || '--'} / 平 ${m.sp_d || '--'} / 负 ${m.sp_a || '--'}">
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
                        <span class="px-2 py-0.5 rounded-full text-xs border ${shrinkBadgeClass}">
                            ${m._curShrinkage >= 0 ? '+' : ''}${m._curShrinkage.toFixed(2)}%
                        </span>
                    </td>
                    <td class="py-3 px-3 text-center whitespace-nowrap min-w-[100px]">
                        <button onclick='loadMatchToCalc(${JSON.stringify(m)})' class="inline-flex items-center justify-center whitespace-nowrap px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-white border border-emerald-500/30 transition text-xs font-semibold active:scale-95 shadow-sm">
                            ⚡ 载入测算
                        </button>
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
                let shrinkBadgeClass = 'bg-slate-800 text-slate-400 border-slate-700';
                if (m._curShrinkage >= -5.0) {
                    shrinkBadgeClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold';
                } else if (m._curShrinkage >= -8.0) {
                    shrinkBadgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold';
                }

                const singleBadge = m.single_had === 1
                    ? `<span class="px-2 py-0.5 rounded text-[10px] bg-red-500/20 text-red-300 border border-red-500/30 whitespace-nowrap">已开单关</span>`
                    : `<span class="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold whitespace-nowrap">未开单关⭐</span>`;

                const card = document.createElement('div');
                card.className = 'mobile-match-card p-4 rounded-xl glass-card border border-slate-800/80 space-y-3';
                card.innerHTML = `
                    <div class="flex items-center justify-between text-xs pb-2 border-b border-white/5">
                        <div class="flex items-center space-x-2">
                            <span class="w-5 h-5 rounded bg-slate-800 text-slate-400 text-[11px] font-mono flex items-center justify-center">${idx + 1}</span>
                            <span class="font-bold text-white font-mono text-xs">${m.match_num_str || ''}</span>
                            <span class="text-slate-400 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px]">${m.league_name || ''}</span>
                        </div>
                        <div class="flex items-center space-x-2">
                            <span class="text-slate-400 font-mono text-[11px]">${(m.match_date || '').slice(5)} ${m.match_time || ''}</span>
                            ${singleBadge}
                        </div>
                    </div>

                    <div class="flex items-center justify-between">
                        <div class="font-bold text-white text-sm">
                            <span>${m.home_team}</span>
                            <span class="text-slate-500 font-normal mx-1 text-xs">vs</span>
                            <span>${m.away_team}</span>
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

                    <!-- 合成单关与折损率 + 一键载入 -->
                    <div class="flex items-center justify-between pt-1">
                        <div class="flex items-center space-x-2">
                            <div>
                                <span class="text-[11px] text-slate-400">等效合成: </span>
                                <span class="font-mono font-bold text-white text-xs">${m._curSynthSp ? m._curSynthSp.toFixed(4) : '--'}</span>
                            </div>
                            <span class="px-2 py-0.5 rounded-full text-[11px] border ${shrinkBadgeClass}">
                                ${m._curShrinkage >= 0 ? '+' : ''}${m._curShrinkage.toFixed(2)}%
                            </span>
                        </div>
                        <button onclick='loadMatchToCalc(${JSON.stringify(m)})' class="px-3.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-white border border-emerald-500/30 text-xs font-semibold active:scale-95 transition shadow-sm flex items-center gap-1">
                            <span>⚡</span>
                            <span>载入测算</span>
                        </button>
                    </div>
                `;
                cardsContainer.appendChild(card);
            });
        }
    }
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

    const matchTag = document.getElementById('currentLoadedMatchTag');
    if (matchTag) {
        matchTag.innerText = `${m.match_num_str || ''} ${m.home_team} vs ${m.away_team}`;
    }

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

// 切换原理弹窗
function toggleExplainModal() {
    const modal = document.getElementById('explainModal');
    if (modal) {
        modal.classList.toggle('hidden');
    }
}

// 页面初始化
document.addEventListener('DOMContentLoaded', () => {
    handleResize();
    renderMatchList();
    calculate();
});
