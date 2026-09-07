/**
 * 拆单方案分享模块 (Share Engine)
 * 1) 文字分享：一键复制「出票清单」纯文本
 * 2) 图片分享：Canvas 生成约 750x1000 深色竖版分享卡，PNG 本地下载（数据不上传）
 *
 * 说明：本文件只负责「读取当前测算台渲染出的结果」并生成分享产物，
 *       不改动 calculator.js 的配资算法；拼接 DOM 的动态文本一律过 esc()。
 */

// ======================= 工具函数 =======================

// 读取元素文本（容错）
function shareElText(id) {
    const el = document.getElementById(id);
    return el ? (el.textContent || '').trim() : '';
}

// 读取输入框值（容错）
function shareInputVal(id) {
    const el = document.getElementById(id);
    return el ? (el.value || '').trim() : '';
}

// 从当前已勾选的九宫格反查玩法 key 集合（已排序，便于与策略预设比对）
function shareSelectedKeys() {
    const keys = [];
    if (typeof OUTCOMES_META === 'undefined') return keys;
    Object.keys(OUTCOMES_META).forEach(k => {
        const chk = document.getElementById('chk_' + k);
        if (chk && chk.checked) keys.push(k);
    });
    return keys.sort();
}

// 识别当前方案对应的拆解目标方向：'h' | 'd' | 'a'（仅当勾选恰为某方向 3 项全包时命中）
function shareDetectTargetDir() {
    const sel = shareSelectedKeys();
    if (sel.length === 0 || typeof STRATEGY_PRESETS === 'undefined') return null;
    const dirPresetMap = { h: 'ft_home', d: 'ft_draw', a: 'ft_away' };
    const dirs = Object.keys(dirPresetMap);
    for (let i = 0; i < dirs.length; i++) {
        const preset = STRATEGY_PRESETS[dirPresetMap[dirs[i]]];
        if (!preset) continue;
        const presetSorted = preset.outcomes.slice().sort();
        const same = presetSorted.length === sel.length &&
            presetSorted.every((k, idx) => k === sel[idx]);
        if (same) return dirs[i];
    }
    return null;
}

// 从结果区出票方案卡片 (#planCardsContainer) 逐张解析各注：玩法/SP/注数/金额/命中返/攻守标签
function readShareLegs() {
    const container = document.getElementById('planCardsContainer');
    if (!container) return [];
    const legs = [];
    const cards = container.children;
    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        if (!card || !card.textContent) continue;
        const text = (card.textContent || '').replace(/\s+/g, ' ').trim();
        // 空态占位卡（“请勾选…”）不含 SP:，直接跳过
        if (text.indexOf('SP:') === -1) continue;

        // 安全提取玩法名称（使用通用语义类或第一个 span，杜绝 .py-0.5 无效选择器异常）
        let name = '';
        const nameEl = card.querySelector('.font-bold.font-mono.text-white') || card.querySelector('span');
        if (nameEl) {
            name = (nameEl.textContent || '').trim();
        }

        const mOdds = /SP:\s*([\d.]+)/.exec(text);
        const mUnits = /买入:\s*(\d+)\s*注/.exec(text);
        const mCost = /\(¥([\d.]+)\)/.exec(text);
        const mPay = /命中返:\s*¥([\d.]+)/.exec(text);
        const mRoi = /\(([+-]?[\d.]+)%\)/.exec(text);

        // 反向查玩法 key（用于 Canvas 配色）
        let key = null;
        if (name && typeof OUTCOMES_META !== 'undefined') {
            Object.keys(OUTCOMES_META).forEach(k => {
                if (OUTCOMES_META[k].name === name) key = k;
            });
        }

        legs.push({
            key: key,
            name: name,
            odds: mOdds ? parseFloat(mOdds[1]) : null,
            units: mUnits ? parseInt(mUnits[1], 10) : null,
            cost: mCost ? parseFloat(mCost[1]) : null,
            payout: mPay ? parseFloat(mPay[1]) : null,
            roi: mRoi ? parseFloat(mRoi[1]) : null,
            isDef: text.indexOf('防守保本') !== -1 || text.indexOf('次选保底') !== -1 || text.indexOf('保底回本') !== -1,
            isAtt: text.indexOf('核心主攻') !== -1
        });
    }
    return legs;
}

// 汇总当前可分享方案快照（一切取自已渲染 DOM，配资算法零改动）
function buildShareSnapshot() {
    const matchNum = shareInputVal('inputMatchNum');
    const home = shareInputVal('inputHomeTeam');
    const away = shareInputVal('inputAwayTeam');
    const spRaw = shareInputVal('inputSpHDA');

    // 官方胜平负 SP 三元组（解析失败则各为 null，折损率优雅降级为 --）
    const officialSp = { h: null, d: null, a: null };
    const spParts = spRaw.split('/').map(v => parseFloat(v));
    if (spParts.length >= 3 && spParts.every(v => !isNaN(v))) {
        officialSp.h = spParts[0];
        officialSp.d = spParts[1];
        officialSp.a = spParts[2];
    }

    // 用场次编号 + 队名反向补全联赛/开赛时间（用户手动改过队名则自然降级为空）
    let match = null;
    if (Array.isArray(matchesData)) {
        match = matchesData.find(m =>
            String(m.match_num_str) === String(matchNum) &&
            m.home_team === home && m.away_team === away) ||
            matchesData.find(m => String(m.match_num_str) === String(matchNum)) || null;
    }

    const synthTxt = shareElText('resSynthSp');
    const synthSp = synthTxt && synthTxt !== '--' ? parseFloat(synthTxt) : null;
    const totalCostTxt = shareElText('planTotalCost');
    const totalCost = parseFloat(String(totalCostTxt).replace('¥', '')) || 0;
    const totalUnits = parseInt(shareElText('planTotalUnits'), 10) || 0;

    const legs = readShareLegs();
    const dir = shareDetectTargetDir();
    const targetLabel = dir ? (dir === 'h' ? '全场主胜' : dir === 'd' ? '全场平局' : '全场客胜') : null;
    const targetComboLabel = dir
        ? (dir === 'h' ? '胜胜 + 平胜 + 负胜' : dir === 'd' ? '胜平 + 平平 + 负平' : '胜负 + 平负 + 负负')
        : null;

    // 折损率：合成单关 SP 相对官方该方向单关 SP 的偏差
    let shrink = null;
    if (dir && synthSp !== null && officialSp[dir] && officialSp[dir] > 0) {
        shrink = (synthSp / officialSp[dir] - 1) * 100;
    }

    return {
        matchNum: matchNum,
        home: home,
        away: away,
        match: match,
        officialSp: officialSp,
        dir: dir,
        targetLabel: targetLabel,
        targetComboLabel: targetComboLabel,
        legs: legs,
        synthSp: synthSp,
        totalCost: totalCost,
        totalUnits: totalUnits,
        roiSummary: shareElText('planRoiSummary'),
        breakEvenText: shareElText('resBreakEvenTag'),
        coverageType: shareElText('resCoverageType'),
        probSummary: shareElText('resProbSum'),
        shrink: shrink
    };
}

// 当前数据源标签（用于文案/分享图底部）
function shareDataSourceLabel() {
    if (typeof dataSourceState === 'undefined') return '竞彩网';
    if (dataSourceState === 'live') return '竞彩网';
    if (dataSourceState === 'snapshot') return '内置测试数据';
    return '加载中';
}

// 当前配资模式中文名
function shareAllocLabel() {
    if (typeof currentAllocMode === 'undefined') return '最优梯度配资';
    const map = {
        attack_defense: '最优梯度配资 (核心主攻 + 次选保底)',
        dutched: '纯利润平衡 (等额对冲)'
    };
    return map[currentAllocMode] || '最优梯度配资';
}

// 生成本地时间字符串
function shareNowStr() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ======================= 文字分享 =======================

// 构建纯文本出票清单
function buildShareText(s) {
    const L = [];
    L.push('📋 半全场拆单方案 · 出票清单');
    L.push('━━━━━━━━━━━━━━━━━━━━');
    if (s.matchNum) L.push(`场次　${s.matchNum}`);
    if (s.match && s.match.league_name) L.push(`联赛　${s.match.league_name}`);
    L.push(`对阵　${s.home} vs ${s.away}`);
    if (s.match && s.match.match_date) {
        const md = String(s.match.match_date).slice(5).replace('-', '/');
        const mt = String(s.match.match_time || '').slice(0, 5);
        L.push(`开赛　${md} ${mt}`);
    }
    if (s.targetLabel) L.push(`拆法　${s.targetLabel}（人造单关 · 3项全包）`);
    if (s.targetComboLabel) L.push(`组合　${s.targetComboLabel}`);
    if (s.dir && s.officialSp[s.dir]) L.push(`官方单关 SP　${s.officialSp[s.dir].toFixed(2)}`);
    if (s.synthSp !== null) L.push(`合成单关 SP　${s.synthSp.toFixed(4)}`);
    if (s.shrink !== null) {
        L.push(`折损率　${s.shrink >= 0 ? '+' : ''}${s.shrink.toFixed(2)}%（合成 SP vs 官方${s.targetLabel} SP）`);
    }
    L.push('━━━━━━━━━━━━━━━━━━━━');
    s.legs.forEach(leg => {
        const tag = leg.isDef ? '[次选保底]' : (leg.isAtt ? '[核心主攻]' : '');
        const spTxt = leg.odds !== null ? leg.odds.toFixed(2) : '--';
        const unitTxt = leg.units !== null ? `${leg.units} 注` : '--';
        const costTxt = leg.cost !== null ? `¥${leg.cost.toFixed(2)}` : '--';
        const payTxt = leg.payout !== null ? `¥${leg.payout.toFixed(2)}` : '--';
        const roiTxt = leg.roi !== null ? `${leg.roi >= 0 ? '+' : ''}${leg.roi.toFixed(1)}%` : '--';
        L.push(`${leg.name}${tag}　SP ${spTxt}｜买入 ${unitTxt}（${costTxt}）｜命中返 ${payTxt}（${roiTxt}）`);
    });
    L.push('━━━━━━━━━━━━━━━━━━━━');
    if (s.coverageType) L.push(`策略　${s.coverageType}`);
    if (s.probSummary) L.push(s.probSummary);
    if (s.totalCost > 0) L.push(`总投注　¥${s.totalCost}（共 ${s.totalUnits} 注）`);
    if (s.roiSummary) L.push(`命中任一盈亏　${s.roiSummary}`);
    if (s.breakEvenText) L.push(`对冲研判　${s.breakEvenText}`);
    L.push('━━━━━━━━━━━━━━━━━━━━');
    L.push('⚠️ 本方案由「半全场实战配资计算器」生成');
    L.push('仅供数学策略研究，理性购彩；禁止用于任何非法博彩活动。');
    L.push(`生成时间：${shareNowStr()}｜数据源：${shareDataSourceLabel()}`);
    return L.join('\n');
}

// 一键复制（优先 Clipboard API，兜底 execCommand）
function copyShareText() {
    const pre = document.getElementById('shareTextPreview');
    const btn = document.getElementById('btnCopyShareText');
    if (!pre || !pre.textContent) return;
    const text = pre.textContent;
    const done = () => {
        if (!btn) return;
        btn.textContent = '✅ 已复制';
        setTimeout(() => { btn.textContent = '一键复制'; }, 1800);
    };
    const fallback = () => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) { /* 忽略 */ }
        document.body.removeChild(ta);
        done();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else {
        fallback();
    }
}

// ======================= 图片分享 (Canvas 竖版分享卡) =======================

// 圆角矩形路径工具
function shareRoundPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}

function shareFillRound(ctx, x, y, w, h, r, color) {
    shareRoundPath(ctx, x, y, w, h, r);
    ctx.fillStyle = color;
    ctx.fill();
}

function shareStrokeRound(ctx, x, y, w, h, r, color, lw) {
    shareRoundPath(ctx, x, y, w, h, r);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw || 1;
    ctx.stroke();
}

// 氛围光晕（装饰）
function shareGlow(ctx, cx, cy, r, color) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}

// 生成 canvas 字体串
function shareFont(weight, px, mono) {
    const family = mono
        ? "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
        : "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Plus Jakarta Sans', system-ui, sans-serif";
    return `${weight} ${px}px ${family}`;
}

// 自动缩字号至能放进 maxW 宽，返回最终字号
function shareFitPx(ctx, text, maxW, weight, basePx, mono, minPx) {
    let px = basePx;
    const floor = minPx || 12;
    ctx.font = shareFont(weight, px, mono);
    while (ctx.measureText(text).width > maxW && px > floor) {
        px -= 1;
        ctx.font = shareFont(weight, px, mono);
    }
    return px;
}

// 玩法 key → canvas 色值（与页面配色一致：主胜绿 / 平蓝 / 负紫 语义略简化）
function shareOutcomeColor(key) {
    if (!key || typeof OUTCOMES_META === 'undefined') return '#e2e8f0';
    const meta = OUTCOMES_META[key];
    if (!meta) return '#e2e8f0';
    if (meta.color === 'blue') return '#60a5fa';
    if (meta.color === 'purple') return '#c084fc';
    return '#34d399';
}

// 居中绘制一行小标签（装饰角标）
function shareCenterTag(ctx, text, x, y, w, color, bg) {
    const h = 22;
    shareFillRound(ctx, x - w / 2, y - h / 2, w, h, 11, bg);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.font = shareFont('700', 12, false);
    ctx.fillText(text, x, y + 0.5);
}

// 主函数：绘制 750 宽竖版深色分享卡
function drawShareCanvas(s) {
    const canvas = document.getElementById('shareCanvas');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const W = 750;
    const mx = 44;                 // 内容左右边距
    const ROW_H = 44;              // 表格行高
    const n = s.legs.length;
    const tableRowsTop = 452;      // 表格首行 y（与上方策略带留足空隙）
    const rowsBottom = tableRowsTop + n * ROW_H;
    const summaryTop = rowsBottom + 18;
    const summaryH = 132;
    const contentBottom = summaryTop + summaryH;
    // 高度：至少 1000，表格过长则按行数下探
    const H = Math.max(1000, contentBottom + 150);

    canvas.width = W;
    canvas.height = H;

    const COL = {
        emerald: '#34d399',
        green: '#6ee7b7',
        blue: '#60a5fa',
        purple: '#c084fc',
        amber: '#fbbf24',
        white: '#f8fafc',
        text: '#e2e8f0',
        slate300: '#cbd5e1',
        slate400: '#94a3b8',
        slate500: '#64748b',
        slate600: '#475569'
    };

    // ---- 1. 背景 ----
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#111827');
    bg.addColorStop(0.35, '#0d1420');
    bg.addColorStop(1, '#0b0f17');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    shareGlow(ctx, W * 0.9, 20, 190, 'rgba(16,185,129,0.13)');
    shareGlow(ctx, 40, H * 0.88, 250, 'rgba(245,158,11,0.08)');
    shareGlow(ctx, W / 2, H * 0.45, 300, 'rgba(56,189,248,0.04)');

    // 外圈细描边
    shareStrokeRound(ctx, 16, 16, W - 32, H - 32, 26, 'rgba(255,255,255,0.07)', 1);

    ctx.textBaseline = 'alphabetic';

    // ---- 2. 顶部品牌行 ----
    ctx.textAlign = 'left';
    ctx.font = shareFont('800', 19, false);
    ctx.fillStyle = COL.green;
    ctx.fillText('半全场实战配资计算器', mx, 62);
    ctx.textAlign = 'right';
    ctx.font = shareFont('500', 14, false);
    ctx.fillStyle = COL.slate500;
    ctx.fillText('By @大胡 · 人造单关研究', W - mx, 62);

    // 分隔线
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mx, 84);
    ctx.lineTo(W - mx, 84);
    ctx.stroke();

    // ---- 3. 标题 ----
    ctx.textAlign = 'left';
    const titleText = s.targetLabel ? `${s.targetLabel} · 人造单关拆单方案` : '半全场多维变式拆单方案';
    const tPx = shareFitPx(ctx, titleText, W - mx * 2, '800', 32, false, 24);
    ctx.font = shareFont('800', tPx, false);
    ctx.fillStyle = COL.white;
    ctx.fillText(titleText, mx, 140);

    // 副标题：配资模式 + ¥2/注 整数出票
    const allocTxt = shareAllocLabel() || '最优梯度配资';
    const subTxt = `配资模式：${allocTxt}　·　按 ¥2/注 整数出票`;
    const subPx = shareFitPx(ctx, subTxt, W - mx * 2, '500', 15, false, 12);
    ctx.font = shareFont('500', subPx, false);
    ctx.fillStyle = COL.slate400;
    ctx.fillText(subTxt, mx, 174);

    // ---- 4. 场次信息卡 ----
    const matchTop = 202;
    shareFillRound(ctx, mx, matchTop, W - mx * 2, 100, 18, 'rgba(30,41,59,0.5)');
    shareStrokeRound(ctx, mx, matchTop, W - mx * 2, 100, 18, 'rgba(255,255,255,0.08)', 1);

    // 上排：场次编号 + 联赛 / 右侧「未开单关」徽标
    ctx.textAlign = 'left';
    ctx.font = shareFont('800', 15, true);
    ctx.fillStyle = COL.white;
    const numText = s.matchNum ? ('#' + s.matchNum) : '#自定义';
    ctx.fillText(numText, mx + 18, matchTop + 36);
    const numW = ctx.measureText(numText).width;
    const leagueTxt = s.match && s.match.league_name ? ('｜ ' + s.match.league_name) : '';

    if (s.match && s.match.single_had === 0) {
        // 右对齐绘制「未开单关」标签，预留 18px 内边距，坚决杜绝溢出卡片右边界
        const tagW = 138;
        const tagH = 22;
        const tagX = (W - mx - 18) - tagW; // 右侧距卡片内边 18px
        shareFillRound(ctx, tagX, matchTop + 24, tagW, tagH, 11, 'rgba(16,185,129,0.15)');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = COL.green;
        ctx.font = shareFont('700', 11, false);
        ctx.fillText('未开单关 · 适合拆单', tagX + tagW / 2, matchTop + 35);

        // 联赛名称文本宽度自适应截断，防止与右侧标签重叠
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        const maxLeagueW = Math.max(60, tagX - (mx + 18 + numW + 12));
        const leaguePx = shareFitPx(ctx, leagueTxt, maxLeagueW, '500', 14, false, 11);
        ctx.font = shareFont('500', leaguePx, false);
        ctx.fillStyle = COL.slate400;
        ctx.fillText(leagueTxt, mx + 18 + numW + 4, matchTop + 36);
    } else {
        const leaguePx = shareFitPx(ctx, leagueTxt, W - mx * 2 - numW - 40, '500', 14, false, 11);
        ctx.font = shareFont('500', leaguePx, false);
        ctx.fillStyle = COL.slate400;
        ctx.fillText(leagueTxt, mx + 18 + numW + 4, matchTop + 36);
    }

    // 还原对齐
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // 下排：对阵（长队名自动缩字号）
    const teamsText = `${s.home || '--'} vs ${s.away || '--'}`;
    let tsize = 27;
    ctx.font = shareFont('800', tsize, false);
    while (ctx.measureText(teamsText).width > W - mx * 2 - 60 && tsize > 16) {
        tsize -= 1;
        ctx.font = shareFont('800', tsize, false);
    }
    const homeW = ctx.measureText(s.home || '--').width;
    const vsW = ctx.measureText(' vs ').width;
    ctx.fillStyle = COL.white;
    ctx.fillText(s.home || '--', mx + 18, matchTop + 82);
    ctx.fillStyle = COL.slate500;
    ctx.fillText(' vs ', mx + 18 + homeW, matchTop + 82);
    ctx.fillStyle = COL.white;
    ctx.fillText(s.away || '--', mx + 18 + homeW + vsW, matchTop + 82);

    // ---- 5. 策略/拆法带 ----
    const stTop = matchTop + 100 + 18;
    shareFillRound(ctx, mx, stTop, W - mx * 2, 82, 16, 'rgba(16,185,129,0.08)');
    shareStrokeRound(ctx, mx, stTop, W - mx * 2, 82, 16, 'rgba(52,211,153,0.28)', 1);

    const line1 = s.targetLabel ? `最优拆法｜${s.targetLabel}（3项全包）` : `赛果组合｜${s.coverageType || '自定义多选'}`;
    const l1Px = shareFitPx(ctx, line1, W - mx * 2 - 36, '800', 17, false, 13);
    ctx.font = shareFont('800', l1Px, false);
    ctx.fillStyle = s.targetLabel ? COL.emerald : COL.amber;
    ctx.fillText(line1, mx + 18, stTop + 34);

    // 第二行：具体半全场项与赔率
    const comboStr = s.targetLabel && s.targetComboLabel
        ? s.targetComboLabel
        : s.legs.map(l => l.name).join(' + ');
    const comboPx = shareFitPx(ctx, comboStr, W - mx * 2 - 36, '600', 14, false, 11);
    ctx.font = shareFont('600', comboPx, true);
    ctx.fillStyle = COL.text;
    ctx.fillText(comboStr, mx + 18, stTop + 62);

    // ---- 6. 出票表格 ----
    // 表头
    ctx.font = shareFont('700', 13, false);
    ctx.fillStyle = COL.slate500;
    ctx.textAlign = 'left';
    ctx.fillText('玩法', mx + 16, 436);
    ctx.textAlign = 'right';
    ctx.fillText('SP', 300, 436);
    ctx.fillText('注数', 372, 436);
    ctx.fillText('金额(¥)', 478, 436);
    ctx.fillText('命中返还(¥)', W - mx - 10, 436);

    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    ctx.moveTo(mx, 444);
    ctx.lineTo(W - mx, 444);
    ctx.stroke();

    // 表体
    s.legs.forEach((leg, i) => {
        const yTop = tableRowsTop + i * ROW_H;
        if (i % 2 === 1) {
            shareFillRound(ctx, mx, yTop, W - mx * 2, ROW_H, 10, 'rgba(255,255,255,0.03)');
        }
        const base = yTop + 30;

        // 玩法名 + 攻/守小角标
        let dx = mx + 16;
        ctx.textBaseline = 'alphabetic';
        if (leg.isDef || leg.isAtt) {
            const tagText = leg.isDef ? '守' : '攻';
            const tagColor = leg.isDef ? COL.amber : COL.emerald;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            shareFillRound(ctx, dx, base - 11, 18, 18, 5, 'rgba(255,255,255,0.06)');
            ctx.fillStyle = tagColor;
            ctx.font = shareFont('800', 12, false);
            ctx.fillText(tagText, dx + 9, base);
            ctx.textBaseline = 'alphabetic';
            dx += 26;
        }
        ctx.textAlign = 'left';
        const namePx = shareFitPx(ctx, leg.name, 200, '700', 15, false, 12);
        ctx.font = shareFont('700', namePx, false);
        ctx.fillStyle = shareOutcomeColor(leg.key);
        ctx.fillText(leg.name, dx, base);

        // 数值列
        ctx.font = shareFont('600', 14, true);
        ctx.textAlign = 'right';
        ctx.fillStyle = COL.text;
        ctx.fillText(leg.odds !== null ? leg.odds.toFixed(2) : '--', 300, base);
        ctx.fillText(leg.units !== null ? `${leg.units} 注` : '--', 372, base);
        ctx.fillStyle = COL.slate300;
        ctx.fillText(leg.cost !== null ? `¥${leg.cost.toFixed(2)}` : '--', 478, base);
        ctx.fillStyle = (leg.roi !== null && leg.roi >= 0) ? COL.green : (leg.roi !== null ? COL.amber : COL.text);
        ctx.fillText(leg.payout !== null ? `¥${leg.payout.toFixed(2)}` : '--', W - mx - 10, base);
    });

    // ---- 7. 汇总条 ----
    const sTop = summaryTop;
    shareFillRound(ctx, mx, sTop, W - mx * 2, summaryH, 18, 'rgba(16,185,129,0.08)');
    shareStrokeRound(ctx, mx, sTop, W - mx * 2, summaryH, 18, 'rgba(52,211,153,0.3)', 1);

    // 三列标签
    ctx.font = shareFont('700', 13, false);
    ctx.fillStyle = COL.slate500;
    ctx.textAlign = 'left';
    ctx.fillText('总投注', mx + 20, sTop + 34);
    ctx.textAlign = 'center';
    ctx.fillText('等效合成单关 SP', W / 2, sTop + 34);
    ctx.textAlign = 'right';
    ctx.fillText('命中任一盈亏', W - mx - 20, sTop + 34);

    // 三列主数值
    ctx.textAlign = 'left';
    ctx.font = shareFont('800', 30, true);
    ctx.fillStyle = COL.emerald;
    ctx.fillText(`¥${s.totalCost.toFixed(2)}`, mx + 20, sTop + 74);

    ctx.textAlign = 'center';
    ctx.font = shareFont('800', 26, true);
    ctx.fillStyle = (s.synthSp !== null && s.synthSp < 1.0) ? '#f43f5e' : COL.white;
    ctx.fillText(s.synthSp !== null ? s.synthSp.toFixed(4) : '--', W / 2, sTop + 74);

    ctx.textAlign = 'right';
    ctx.font = shareFont('800', 20, true);
    ctx.fillStyle = COL.amber;
    ctx.fillText(s.roiSummary || '--', W - mx - 20, sTop + 74);

    // 三列小注（总注数 / 折损率 / 对冲研判）
    ctx.textAlign = 'left';
    ctx.font = shareFont('500', 13, false);
    ctx.fillStyle = COL.slate400;
    ctx.fillText(`共 ${s.totalUnits} 注 · ¥2/注 整数出票`, mx + 20, sTop + 106);

    ctx.textAlign = 'center';
    if (s.shrink !== null) {
        const shrinkColor = s.shrink >= -5 ? COL.green : (s.shrink >= -8 ? COL.amber : '#f87171');
        ctx.font = shareFont('700', 14, true);
        ctx.fillStyle = shrinkColor;
        ctx.fillText(`折损率 ${s.shrink >= 0 ? '+' : ''}${s.shrink.toFixed(2)}%（vs 官方SP）`, W / 2, sTop + 106);
    } else {
        ctx.fillStyle = COL.slate600;
        ctx.fillText('组合无直接官方单关参照', W / 2, sTop + 106);
    }

    ctx.textAlign = 'right';
    const bePx = shareFitPx(ctx, s.breakEvenText || '', W * 0.34, '600', 13, false, 10);
    ctx.font = shareFont('600', bePx, false);
    ctx.fillStyle = COL.slate400;
    ctx.fillText(s.breakEvenText || '', W - mx - 20, sTop + 106);

    // ---- 8. 中部装饰铭言（填补大留白，仅在空间充足时绘制） ----
    const gapTop = contentBottom + 36;
    const gapBot = H - 140;
    if (gapBot - gapTop > 56) {
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(148,163,184,0.3)';
        ctx.font = shareFont('500', 13, false);
        const midY = Math.round((gapTop + gapBot) / 2) + 6;
        ctx.fillText('◆ 半全场多维变式 · 人造单关 · 荷兰式配资 ◆', W / 2, midY);
    }

    // ---- 9. 底部免责声明 ----
    const fy = H - 88;
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    ctx.moveTo(mx, H - 126);
    ctx.lineTo(W - mx, H - 126);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = shareFont('500', 15, false);
    ctx.fillStyle = COL.slate300;
    ctx.fillText('仅供数学策略研究 · 理性购彩', W / 2, fy);

    const genTxt = `禁止用于任何非法博彩活动｜数据源：${shareDataSourceLabel()}｜生成：${shareNowStr()}`;
    const genPx = shareFitPx(ctx, genTxt, W - mx * 2 - 40, '500', 12, false, 9);
    ctx.font = shareFont('500', genPx, false);
    ctx.fillStyle = 'rgba(100,116,139,0.9)';
    ctx.fillText(genTxt, W / 2, H - 58);

    return canvas;
}

// 生成下载文件名
function shareFileName(s) {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    const numPart = (s.matchNum || 'custom').replace(/[^0-9A-Za-z一-龥]/g, '') || 'plan';
    return `htft-${numPart}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.png`;
}

// 下载链接绑定 dataURL
function bindShareDownload(canvas, fileName) {
    const a = document.getElementById('btnDownloadSharePng');
    if (!a || !canvas) return;
    try {
        a.href = canvas.toDataURL('image/png');
        a.download = fileName;
    } catch (e) {
        // 个别浏览器/隐私模式导出失败：退化为提示
        a.removeAttribute('href');
        a.style.pointerEvents = 'none';
        a.style.opacity = '0.5';
    }
}

// 一键复制分享卡图片到剪贴板（基于 Canvas toBlob + Clipboard API，免去下载保存步骤）
async function copyShareImage() {
    const canvas = document.getElementById('shareCanvas');
    const btn = document.getElementById('btnCopyShareImg');
    const btnText = document.getElementById('copyImgBtnText');
    if (!canvas) return;

    if (!navigator.clipboard || typeof ClipboardItem === 'undefined' || !canvas.toBlob) {
        if (typeof showToast === 'function') {
            showToast('当前浏览器环境不支持直接复制图片，请点击「下载 PNG」', 'error');
        }
        return;
    }

    const resetBtn = (delay = 2000) => {
        setTimeout(() => {
            if (btnText) btnText.textContent = '复制图片';
            if (btn) btn.disabled = false;
        }, delay);
    };

    if (btn) btn.disabled = true;
    if (btnText) btnText.textContent = '生成中…';

    try {
        canvas.toBlob(async (blob) => {
            if (!blob) {
                if (typeof showToast === 'function') {
                    showToast('生成图片数据失败，请尝试「下载 PNG」', 'error');
                }
                resetBtn(500);
                return;
            }
            try {
                await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                ]);
                if (btnText) btnText.textContent = '✅ 已复制';
                if (typeof showToast === 'function') {
                    showToast('✅ 分享卡已复制到剪贴板，可直接粘贴 (Ctrl+V) 发送');
                }
                resetBtn(2200);
            } catch (clipErr) {
                console.warn('Clipboard write failed:', clipErr);
                if (typeof showToast === 'function') {
                    showToast('剪贴板未获授权或不受支持，请直接点击「下载 PNG」', 'error');
                }
                resetBtn(500);
            }
        }, 'image/png');
    } catch (e) {
        console.warn('copyShareImage error:', e);
        if (typeof showToast === 'function') {
            showToast('复制图片失败，请点击「下载 PNG」', 'error');
        }
        resetBtn(500);
    }
}

// 打开弹窗时刷新文字清单 + 绘制分享图（支持传入指定快照，如收藏方案）
function refreshSharePanel(customSnap) {
    const snap = customSnap || buildShareSnapshot();
    const emptyMsg = document.getElementById('shareEmptyMsg');
    const textPane = document.getElementById('shareTextPane');
    const imgPane = document.getElementById('shareImgPane');

    const hasPlan = snap && Array.isArray(snap.legs) && snap.legs.length > 0;
    if (emptyMsg) emptyMsg.classList.toggle('hidden', hasPlan);
    if (textPane) textPane.classList.toggle('hidden', !hasPlan);
    if (imgPane) imgPane.classList.toggle('hidden', !hasPlan);
    if (!hasPlan) return;

    // 文字清单
    const pre = document.getElementById('shareTextPreview');
    if (pre) pre.textContent = buildShareText(snap);

    // 分享图
    try {
        const canvas = drawShareCanvas(snap);
        if (canvas) {
            bindShareDownload(canvas, shareFileName(snap));
        }
    } catch (e) {
        console.warn('Canvas share drawing failed:', e);
    }
}

// 弹窗开关（全流程 try-catch 容错，确保弹窗正常展开与关闭）
function toggleShareModal(customSnap) {
    const modal = document.getElementById('shareModal');
    if (!modal) return;
    const willOpen = modal.classList.contains('hidden');
    if (willOpen) {
        try {
            refreshSharePanel(customSnap);
        } catch (e) {
            console.error('refreshSharePanel error:', e);
        }
        modal.classList.remove('hidden');
    } else {
        modal.classList.add('hidden');
    }
}
