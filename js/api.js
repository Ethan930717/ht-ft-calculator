/**
 * 竞彩官方 API 实时数据交互模块 (API Engine)
 * 直连中国体彩官方中枢计算器接口，附带 CORS 代理容灾与离线降级机制
 */

// 解析体彩官方接口原始 matchCalculator 数据
function parseSportteryRawMatches(raw) {
    if (!raw || !raw.success || !raw.value || !raw.value.matchInfoList) return [];
    const newMatches = [];
    raw.value.matchInfoList.forEach(g => {
        (g.subMatchList || []).forEach(m => {
            const had = m.had || {};
            const hafu = m.hafu || {};
            const hh = parseFloat(hafu.hh || 0);
            const dh = parseFloat(hafu.dh || 0);
            const ah = parseFloat(hafu.ah || 0);
            const sp_h = parseFloat(had.h || 0);

            if (hh > 0 && dh > 0 && ah > 0) {
                const synth_sp = Number((1.0 / (1.0 / hh + 1.0 / dh + 1.0 / ah)).toFixed(4));
                const shrinkage = sp_h > 0 ? Number(((synth_sp - sp_h) / sp_h * 100).toFixed(2)) : 0;
                newMatches.push({
                    match_id: String(m.matchId || ''),
                    match_num_str: m.matchNumStr || '',
                    league_name: m.leagueAllName || m.leagueAbbName || '',
                    home_team: m.homeTeamAllName || m.homeTeamAbbName || '',
                    away_team: m.awayTeamAllName || m.awayTeamAbbName || '',
                    match_date: m.matchDate || '',
                    match_time: m.matchTime || '',
                    sp_h: sp_h,
                    sp_d: parseFloat(had.d || 0),
                    sp_a: parseFloat(had.a || 0),
                    hafu_hh: hh,
                    hafu_hd: parseFloat(hafu.hd || 0),
                    hafu_ha: parseFloat(hafu.ha || 0),
                    hafu_dh: dh,
                    hafu_dd: parseFloat(hafu.dd || 0),
                    hafu_da: parseFloat(hafu.da || 0),
                    hafu_ah: ah,
                    hafu_ad: parseFloat(hafu.ad || 0),
                    hafu_aa: parseFloat(hafu.aa || 0),
                    single_had: parseInt(had.single || 0),
                    single_hafu: parseInt(hafu.single || 1),
                    synth_sp: synth_sp,
                    shrinkage: shrinkage
                });
            }
        });
    });
    return newMatches;
}

// 在线刷新在售比赛（纯前端直连竞彩官方 API，纯内存渲染，完全适配 GitHub Pages 静态托管）
async function refreshMatchData() {
    const btn = document.getElementById('btnRefresh');
    const icon = document.getElementById('refreshIcon');
    const badge = document.getElementById('dataSourceBadge');

    if (btn) btn.disabled = true;
    if (icon) icon.classList.add('animate-spin');

    let fetched = false;
    const sportteryUrl = 'https://webapi.sporttery.cn/gateway/jc/football/getMatchCalculatorV1.qry?poolCode=had,hhad,crs,ttg,hafu&channel=c';

    // 方案 1: 直接直连官方 API（官网接口原生开放 Access-Control-Allow-Origin: *）
    try {
        const resp = await fetch(sportteryUrl);
        if (resp.ok) {
            const raw = await resp.json();
            const list = parseSportteryRawMatches(raw);
            if (list.length > 0) {
                matchesData = list;
                if (badge) {
                    badge.innerText = `竞彩网实时 (${matchesData.length}场)`;
                    badge.className = 'text-emerald-400 font-medium font-mono';
                }
                fetched = true;
            }
        }
    } catch (e) {
        console.log('直连官方接口遇到网络波动，尝试备用 CORS 代理通道:', e);
    }

    // 方案 2: 若直接 fetch 遇到网络异常，平滑切换公共 CORS 代理
    if (!fetched) {
        try {
            const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(sportteryUrl);
            const resp = await fetch(proxyUrl, { cache: 'no-cache' });
            if (resp.ok) {
                const raw = await resp.json();
                const list = parseSportteryRawMatches(raw);
                if (list.length > 0) {
                    matchesData = list;
                    if (badge) {
                        badge.innerText = `竞彩网直连 (${matchesData.length}场)`;
                        badge.className = 'text-emerald-400 font-medium font-mono';
                    }
                    fetched = true;
                }
            }
        } catch (proxyErr) {
            console.log('CORS 代理请求略过:', proxyErr);
        }
    }

    setTimeout(() => {
        if (btn) btn.disabled = false;
        if (icon) icon.classList.remove('animate-spin');
        renderMatchList();
        if (fetched) {
            alert(`在售比赛刷新成功！当前已从官方实时载入 ${matchesData.length} 场比赛，已按最适合拆单重新排序。`);
        } else {
            alert('当前网络脱机或处于无网沙盒，已自动平滑启用最新内置在售数据！');
        }
    }, 500);
}
