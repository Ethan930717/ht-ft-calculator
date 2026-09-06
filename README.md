# ⚽ 竞彩半全场实战配资计算器 (HT/FT Calculator)

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/)
[![Pure Frontend](https://img.shields.io/badge/Stack-Pure%20HTML%20%2B%20Tailwind-blue.svg)](./index.html)
[![Desktop Ready](https://img.shields.io/badge/Desktop-PyWebView%20%2F%20EXE-orange.svg)](./app.py)

> **基于荷兰式配资（Dutching）数学原理与竞彩半全场赔率矩阵的策略建模与实战配资工具。**  
> 帮助购彩者在未开胜平负单关的赛事中，科学、精算地拆单合成“人造单关”，或构建 6 组赛果防守策略，实现风险最小化与收益平衡。

---

## 📖 解决的痛点

在竞彩实战中，常常会遇到以下场景：
1. **想买单关却没有开**：看好某场冷门或强弱对话的主队赢球，但官方该场次**仅开售半全场单关，未开售胜平负单关**；
2. **盲目拆单导致亏损**：传统人工买入【胜胜】、【平胜】、【负胜】，由于缺乏精确资金加权，一旦打出平胜或负胜，往往无法覆盖本金；
3. **想防平或双选不败**：在“主队不败”或“半场不败”等多赛果组合下，不知如何按赔率权重精准分配 100 元或任意本金，以确保只要命中任一赛果即不亏钱。

**HT/FT Calculator** 正是为此而生：将专业博弈论中的 **荷兰式配资模型（Dutching）** 引入竞彩，提供一键预设、全景矩阵点选、合成 SP 与折损率实时计算、出票注数方案一键生成。

---

## ✨ 核心功能特性

- 🎯 **一键策略预设**：
  - **主队胜（人造单关）**：锁定【胜胜、平胜、负胜】3 项，物理全包主胜赛果；
  - **主队平**：锁定【胜平、平平、负平】3 项；
  - **客队胜**：锁定【胜负、平负、负负】3 项；
  - **锁定半场平局**：全包【平胜、平平、平负】3 项；
  - **主队不败防守**：全包【胜胜、平胜、负胜、胜平、平平、负平】6 项，极限对冲；
  - **半场不败防守**：全包【胜胜、胜平、胜负、平胜、平平、平负】6 项。
- 🧮 **三种专业配资模式**：
  - **纯利润平衡（Equal Profit）**：无论打出被选赛果中的哪一个，净收益金额完全一致；
  - **保本微利（Capital Preservation）**：防守赛果保本，主力赛果拿满超额盈余；
  - **原始赔率加权（Odds Weighted）**：按隐含概率线性分配。
- 📊 **合成 SP 与官方折损率实时研判**：
  - 毫秒级计算人工单关合成 SP：$S_{synth} = \frac{1}{\sum \frac{1}{O_i}}$；
  - 对比直接购买胜平负 SP，直观呈现折损率百分比，辅助筛选出“最适合拆单”的黄金赛事。
- 📡 **竞彩在售赛事智能雷达**：
  - 自动抓取中国竞彩网最新在售对阵及半全场/胜平负赔率；
  - 支持按“最适合拆单（折损率最低）”智能降序排列；
  - 提供“不显示胜平负已开单关的比赛”筛选，专注挖掘无单关赛事的价值；
  - 支持一键将整场比赛所有盘口参数载入上方工作台。
- 💻 **零依赖 · 多端开箱即用**：
  - **浏览器**：直接双击 `index.html` 即可运行；
  - **静态托管**：可一键部署至 GitHub Pages、Vercel、Cloudflare Pages；
  - **桌面端**：提供 Python 启动脚本，支持一键打包为无依赖的 Windows `.exe` 单文件。

---

## 📐 数学原理与配资公式

### 1. 荷兰式配资（Dutching）配额算法
假设用户总预算为 $B$，所选的 $n$ 个半全场赛果赔率分别为 $O_1, O_2, \dots, O_n$。  
目标是使每个赛果命中时的税前返奖金额 $R$ 恒定相等：

$$R = B_i \times O_i = \text{常数}$$

由此可得各选项的资金分配比例：

$$B_i = B \times \frac{\frac{1}{O_i}}{\sum_{k=1}^n \frac{1}{O_k}}$$

### 2. 合成单关 SP (Synthetic SP)
通过全包对应赛果所实现的等效单关固定奖金：

$$S_{synth} = \frac{1}{\sum_{i=1}^n \frac{1}{O_i}}$$

### 3. 合成折损率 (Shrinkage Rate)
体彩官方各玩法的返奖率与抽水比例不同。通过 3 个半全场拼出的人工单关，赔率面值相比直接开售的胜平负 SP 会自然缩水，其差额定义为折损率：

$$\text{折损率} = \frac{S_{synth} - S_{official}}{S_{official}} \times 100\%$$

折损率越接近 0%（甚至在部分冷门倒挂场次出现正溢价），说明该场次用半全场拆单的性价比越高。

---

## 🚀 快速上手

### 方式 A：纯前端直接使用 (最简单)
直接在本地双击打开 `index.html`，或用任意现代浏览器打开即可使用所有测算与在售刷新功能。

### 方式 B：本地开发预览
```bash
# 克隆仓库
git clone https://github.com/your-username/ht-ft-calculator.git
cd ht-ft-calculator

# 使用 npx 启动本地服务器
npm run serve
# 浏览器访问 http://localhost:3000
```

### 方式 C：桌面版运行与打包 EXE
```bash
# 1. 安装桌面运行与打包依赖
pip install -r requirements.txt

# 2. 以独立桌面窗口运行
python app.py

# 3. 一键编译打包为独立的 Windows .exe 单文件
npm run build:exe
# 或者直接执行 PyInstaller：
# pyinstaller -F -w -n "HtFtCalculator" --add-data "index.html;." app.py
```
编译完成后，可在 `dist/HtFtCalculator.exe` 找到独立的免安装执行文件。

---

## 📁 目录结构

```text
ht-ft-calculator/
├── index.html              # 核心应用：纯前端单文件版本 (HTML5 + Tailwind + 原生 JS)
├── app.py                  # Python 桌面启动器 (基于 pywebview，支持离线窗口)
├── requirements.txt        # Python 依赖清单
├── package.json            # npm 脚本与元数据
├── LICENSE                 # MIT 开源授权协议
├── .gitignore              # Git 忽略配置
├── README.md               # 项目主说明文档
└── docs/
    └── strategy_guide.md   # 实战多维变式与人造单关策略白皮书
```

---

## ⚠️ 免责声明 (Disclaimer)

1. 本项目为开源数字策略研究工具，**仅供编程学习交流与数学概率娱乐研判**，严禁用于任何商业用途或非法博彩活动；
2. 彩票投注存在固有风险，竞彩所有数据与玩法规则请以中国体育彩票官方发行机构发布的公告为准；
3. 请广大购彩者依法合规、保持理性、量力而行。
