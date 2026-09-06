/**
 * 竞彩官方 API 实时数据交互模块 (API Engine)
 * 直连中国体彩官方中枢计算器接口，附带 CORS 代理容灾与离线降级机制
 *
 * 数据源状态机：'loading'(拉取中) → 'live'(竞彩网实时) | 'snapshot'(内置快照降级)
 * 页面打开默认自动静默拉取最新数据（成功才替换），双通道全失败才降级为内置测试数据。
 */

// ======================= 数据源全局状态 =======================

/** 数据源状态：'loading' | 'live' | 'snapshot'（供 app.js 渲染徽标 / 横幅） */
let dataSourceState = 'loading';

/** 最近一次成功拉取「竞彩网实时」数据的时间戳 (毫秒，供 UI 展示更新时间) */
let lastUpdatedAt = null;

/** 是否有刷新请求进行中（防止按钮 / 横幅重复点击造成并发拉取） */
let refreshInFlight = false;

/** 最近一次双通道拉取失败的时间戳(毫秒)；成功后重置为 0。
 *  供 app.js 每 5 分钟静默自动刷新判断：距上次失败 <60s 则跳过，避免高频请求官方接口 */
let lastDataFailAt = 0;

/** sessionStorage 缓存键名与 30s 节流窗口 */
const MATCH_CACHE_KEY = 'htft_calc_matches_cache_v1';
const MATCH_CACHE_TTL = 30 * 1000;

/** 竞彩官方接口地址（poolCode 已含半全场 hafu） */
const SPORTTERY_URL = 'https://webapi.sporttery.cn/gateway/jc/football/getMatchCalculatorV1.qry?poolCode=had,hhad,crs,ttg,hafu&channel=c';

/** 单通道请求硬超时（毫秒）：通道在 8–10s 内未返回即强制 abort / 竞速落定，避免无限挂起 */
const CHANNEL_TIMEOUT_MS = 10000;

/** 刷新结算绝对保险闸（毫秒）：refreshMatchData 启动后 ~16s 内任何路径未 finish()，由闸门强制按失败收尾 */
const REFRESH_GATE_TIMEOUT_MS = 16000;

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

// ======================= sessionStorage 缓存 (30s 节流) =======================

// 写入实时数据缓存（成功拉取后调用，供 30s 节流复用，避免高频请求官方接口）
function writeMatchesCache(list) {
    try {
        sessionStorage.setItem(MATCH_CACHE_KEY, JSON.stringify({ t: Date.now(), list }));
    } catch (e) {
        // 隐私模式等场景下写入可能被拒，忽略即可
        console.log('[数据源] sessionStorage 缓存写入失败（可忽略）:', e);
    }
}

// 读取实时数据缓存；无缓存或损坏时返回 null
function readMatchesCache() {
    try {
        const str = sessionStorage.getItem(MATCH_CACHE_KEY);
        if (!str) return null;
        const obj = JSON.parse(str);
        if (!obj || !Array.isArray(obj.list) || obj.list.length === 0) return null;
        return obj;
    } catch (e) {
        return null;
    }
}

// ======================= 纯请求：双通道容灾 =======================

/**
 * 单通道带硬超时的拉取任务（直连官方 / CORS 代理之一）。
 * @param {{name: string, url: string}} ch 通道描述
 * @returns {Promise<Array|null>} 成功返回非空比赛数组；失败 / 超时 / 空列表返回 null。
 *
 * 双重保险确保本通道「一定在 CHANNEL_TIMEOUT_MS 内返回」，绝不无限挂起：
 *  1) AbortController + setTimeout：到点 controller.abort() 强制取消 fetch 及响应体读取；
 *  2) Promise.race 竞速兜底：即便个别环境下 abort 未按预期生效、请求长期悬挂，
 *     竞速的超时任务也会在同一时刻以 null 结束本通道，阻塞的 fetch 自行在后台收敛。
 */
function fetchChannelWithTimeout(ch) {
    return Promise.race([
        // —— 主任务：真正发起请求并解析 ——
        (async () => {
            const controller = new AbortController();
            // 硬超时：到点即中止该通道（同一 signal 会连带打断下方 resp.json() 的响应体读取）
            const abortTimer = setTimeout(() => controller.abort(), CHANNEL_TIMEOUT_MS);
            try {
                const resp = await fetch(ch.url, { signal: controller.signal, cache: 'no-cache' });
                if (!resp.ok) {
                    console.log(`[数据源] ${ch.name} HTTP ${resp.status}，该通道失败。`);
                    return null;
                }
                const raw = await resp.json(); // 同一 signal：body 卡死同样会被 abort 打断
                const list = parseSportteryRawMatches(raw);
                if (list.length === 0) {
                    console.log(`[数据源] ${ch.name} 返回空列表，该通道失败。`);
                    return null;
                }
                return list;
            } catch (e) {
                if (e && e.name === 'AbortError') {
                    console.log(`[数据源] ${ch.name} 请求超时(${CHANNEL_TIMEOUT_MS / 1000}s)，已中止该通道。`);
                } else {
                    console.log(`[数据源] ${ch.name} 请求失败:`, e && e.message ? e.message : e);
                }
                return null;
            } finally {
                clearTimeout(abortTimer);
            }
        })(),
        // —— 竞速兜底任务：主任务因故迟迟不落定时，保证本通道以失败(null)准时收敛 ——
        new Promise(resolve => setTimeout(() => resolve(null), CHANNEL_TIMEOUT_MS))
    ]);
}

/**
 * 纯请求：双通道「并发」拉取竞彩官方在售比赛列表（直连官方接口 + CORS 代理）。
 * 两条通道各自受 CHANNEL_TIMEOUT_MS(~10s) 硬超时约束且并行发起，
 * 任一通道成功即整体返回；全部失败才返回 null —— 并发使整体耗时 ≈ 10s 而非串行累加 20s。
 */
async function fetchMatches() {
    const channels = [
        { name: '直连官方接口', url: SPORTTERY_URL },
        { name: 'CORS 代理', url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(SPORTTERY_URL) }
    ];

    // 双通道并行取「第一成功」：首个成功即 resolve；若全部失败（remaining 归零）才 resolve(null)
    return new Promise((resolve) => {
        let remaining = channels.length;
        channels.forEach(ch => {
            fetchChannelWithTimeout(ch).then((list) => {
                if (list && list.length > 0) {
                    resolve(list); // 第一个成功通道直接作为整体结果
                } else if (--remaining === 0) {
                    resolve(null); // 双通道均已失败 / 超时 → 由上层走降级分支
                }
            });
        });
    });
}

// ======================= 状态落地与 UI 编排 =======================

/**
 * 应用一次「实时拉取成功」的结果：置 live、更新 matchesData 与时间戳、写缓存并刷新界面
 * 注意：仅在拉取成功时才替换全局比赛数据；UI 结果一律通过状态徽标呈现，不再使用 alert
 */
function applyLiveData(list, ts) {
    matchesData = list;            // 成功才动 matchesData（替换为官方实时数据）
    dataSourceState = 'live';
    lastUpdatedAt = ts;
    lastDataFailAt = 0;            // 成功即重置失败时间戳（供自动刷新跳过判断）
    writeMatchesCache(list);       // 写入 sessionStorage 缓存做 30s 节流
    renderMatchList();             // 静默重绘列表（保留用户当前筛选/排序条件）
    renderDataSourceUI();          // 徽标 → 绿色「竞彩网实时 N场 · 时间」
    hideDataFallbackBanner();      // 成功即撤下降级横幅
}

/**
 * 数据刷新编排入口（顶部「刷新数据」按钮与降级横幅「重新拉取」均调用此函数）
 *
 * 「结算闸门」模式：函数内所有成功 / 失败 / 超时 / 异常路径一律只通过 finish() 收尾。
 * 并挂一个 REFRESH_GATE_TIMEOUT_MS(~16s) 的绝对保险闸 —— 即使 fetchMatches 各通道悬挂、
 * 即使 await 永不返回，闸门定时器也会在 ~16s 时独立强制 finish(false)，
 * 保证 refreshInFlight 必然复位、状态必然落定为 'live' 或 'snapshot'，绝不停留在 'loading'。
 *
 * @param {Object} opts
 *   opts.silent - true 为页面加载自动拉取（成功/失败均不打扰，静默替换/降级）
 *   opts.force  - true 跳过 30s 节流缓存，强制访问网络（页面首次自动拉取使用）
 */
async function refreshMatchData(opts = {}) {
    if (refreshInFlight) return; // 已有拉取进行中，直接忽略本次重复点击
    refreshInFlight = true;

    const silent = !!opts.silent;
    const force = !!opts.force;
    const btn = document.getElementById('btnRefresh');
    const icon = document.getElementById('refreshIcon');

    if (btn) btn.disabled = true;
    if (icon) icon.classList.add('animate-spin');

    // —— 结算闸门：只允许结算一次；成功走 live、失败走 snapshot，统一在此收尾 ——
    let settled = false;          // 防重入：闸门 / 迟到的异步结果都只能结算一次
    let gateTimer = null;         // 绝对保险闸定时器（由 finish 或下方 setTimeout 管理）

    const finish = (ok, list, ts) => {
        if (settled) return;      // 已结算过（如保险闸先到 / 迟到成功）→ 直接忽略
        settled = true;
        if (gateTimer) clearTimeout(gateTimer); // 关掉保险闸，避免二次结算

        // 先复位并发锁与按钮态（无论后续成功 / 失败，都必须先放行下一次刷新）
        refreshInFlight = false;
        if (btn) btn.disabled = false;
        if (icon) icon.classList.remove('animate-spin');

        if (ok && list && list.length > 0) {
            // 成功收尾：置 live + 更新 matchesData + 时间戳 + 缓存 + 重绘 + 撤横幅（复用既有落地逻辑）
            applyLiveData(list, ts || Date.now());
            if (!silent) console.log(`[数据源] 实时拉取成功，已更新 ${list.length} 场比赛。`);
        } else {
            // 失败收尾：保持既有失败路径 —— 不动 matchesData、置 snapshot、弹降级横幅
            dataSourceState = 'snapshot';
            lastDataFailAt = Date.now(); // 记录失败时间（供 5 分钟静默自动刷新做 60s 跳过判断）
            renderDataSourceUI();        // 徽标 → 琥珀「获取失败·内置测试数据」
            showDataFallbackBanner();    // 弹出降级横幅（含文案与「重新拉取」入口）
            if (!silent) console.log('[数据源] 双通道拉取失败，已降级为内置测试数据。');
        }
    };

    // —— 绝对保险闸：启动 ~16s 后若仍未结算，强制按失败收尾 ——
    // 不依赖 Promise.race / 不依赖主流程 await 是否恢复：此定时器独立运行、直接调 finish()
    gateTimer = setTimeout(() => {
        if (!settled) {
            console.log('[数据源] 刷新超过 16s 保险闸，强制降级为内置测试数据。');
            finish(false, null);
        }
    }, REFRESH_GATE_TIMEOUT_MS);

    try {
        // 进入拉取态：徽标如实呈现「加载中…」（降级横幅是否保留由结果决定）
        dataSourceState = 'loading';
        renderDataSourceUI();

        // 30s 节流：非强制刷新且缓存仍新鲜时，直接复用缓存，避免高频请求官方接口
        if (!force) {
            const cached = readMatchesCache();
            if (cached && Array.isArray(cached.list) && cached.list.length > 0 &&
                (Date.now() - cached.t) < MATCH_CACHE_TTL) {
                if (!silent) console.log(`[数据源] ${MATCH_CACHE_TTL / 1000}s 节流窗口内，复用缓存实时数据 (${cached.list.length}场)。`);
                finish(true, cached.list, cached.t); // 走同一闸门收尾（ts 由缓存决定）
                return;
            }
        }

        // 双通道网络拉取（每通道自带 ~10s 硬超时；即便悬挂，16s 保险闸也会兜底强制收尾）
        const list = await fetchMatches();

        // 能走到这里说明 fetchMatches 已收敛；统一交闸门结算
        if (list && list.length > 0) {
            finish(true, list);
        } else {
            finish(false, null);
        }
    } catch (e) {
        // 兜底：任何未预期异常也绝不允许 refreshInFlight / 状态滞留在 loading —— 交闸门按失败结算
        console.log('[数据源] 刷新过程异常:', e && e.message ? e.message : e);
        finish(false, null);
    }
}
