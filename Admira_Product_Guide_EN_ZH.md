# Admira — Complete Product Guide / 产品完整指南

*A full, plain-language guide to what Admira is and everything it does. Written for someone who knows nothing
about the product. Bilingual: **Part 1 — English**, **Part 2 — 中文**.*

*Status note: Admira covers the United States and Canada. Features roll out behind controlled switches; the
**Money module (net price, merit, ROI)** is the last piece still in development. Everything else described
below is built.*

---
---

# PART 1 — ENGLISH

## 1. What Admira is, in one paragraph

Admira is a college-application intelligence platform for students applying to universities in the **United
States and Canada**. Instead of a single "chance calculator," it's a full copilot for the whole journey:
*where do I stand → how do I improve → what's my plan → here's my shareable report.* It gives you a bold,
confident admit-likelihood score for each school, shows how your profile compares to admitted students,
finds "students like you" and where they got in, builds you a balanced school list, lays out an action plan
to raise your odds, organizes every deadline and task, helps you sharpen your essays, maps majors to careers,
and ties it all together with a conversational assistant and a beautiful exportable report.

**Who it's for:** high-school students (and their families/counselors) applying to US and Canadian
universities — including international students applying to North America.

**The design philosophy:** *stunning surface, sound engine.* Every screen leads with one clear, confident
result, with the detail underneath. But the number behind that headline is built to be **actually correct** —
it traces to real data or a real model, it's reproducible, and it won't embarrass you on obvious cases.

---

## 2. The core idea: a real engine, not a black box

Most chancing tools give you a mysterious percentage. Admira is different in two ways:

1. **It's grounded in real data.** US numbers come from official sources (College Scorecard, IPEDS, the
   Common Data Set). Canadian numbers come from program admission averages, prerequisite lists, and
   entrance-scholarship thresholds. Every number you see traces back to a named source or a real model output
   — there are no made-up figures.

2. **It genuinely covers Canada.** Almost no consumer tool does US *and* Canada well. Canadian admissions
   (especially Ontario) are heavily numbers-driven, so Admira's read is often *more* precise there.

---

## 3. The features (everything Admira does)

### 3.1 Admit Intelligence — your headline likelihood score
The centerpiece. For each school you get:
- A bold **score from 0 to 100**.
- A **tier**: **Reach**, **Target**, **Likely**, or **Safety**.
- The **top drivers** behind the result (what's helping or hurting), drawn from the same model that produced
  the score — so the explanation never contradicts the number.
- A subtle **confidence** texture (how much certainty the data supports).

How the number is made:
- **US schools:** a statistical model (a calibrated logistic model with conformal uncertainty) trained on
  public school-level data — your academic position versus each school's published ranges, test policy,
  selectivity, etc.
- **Canadian programs:** a transparent, rules-based scorer driven by each program's **published admission
  cutoff band**, your **prerequisite match**, and whether the school uses **broad-based/holistic review**.
  It compares your average to the cutoff *in that program's own grading system* (percentage, 4.0 GPA, or
  Quebec CEGEP R-score) — it never sloppily converts between grading scales.

What the tiers mean (roughly): Reach = below ~30% modeled odds; Target = ~30–55%; Likely = ~55–80%; Safety =
~80%+. The same definitions are used everywhere in the app, so a school's tier is identical on its page, in
your list, and in your report.

### 3.2 Profile Studio — you vs. admitted students
A five-axis radar chart showing your strength on **Academics, Rigor, Test, Extracurricular Impact, and Fit**,
each on a 0–100 scale, placed next to a per-school reference (derived from that school's selectivity,
published mid-50% ranges, and stated priorities). It shows where you're strong and where you stretch. (Some
axes, like extracurriculars, are honest heuristics and are labeled as such.)

### 3.3 School & Program Universe — rich, beautiful pages
A comprehensive page for each school/program pulling everything into one place: admission stats, program
requirements, cost (published net price and sticker price), outcomes (median earnings, completion rate), and
"similar programs" found by semantic matching. Every figure is tagged with its source.

### 3.4 Smart List Builder — a balanced school list in one tap
From your profile and preferences (location, size, intended major, budget, ambition), Admira builds a
**balanced list** — by default about **3 reach / 4 target / 3 safety** — so you're not staring at ten
reaches. Each school comes with a **one-line rationale** built from its real fit, tier, and cost. It also
surfaces a **"schools you're overlooking"** row of strong, affordable, genuinely-fitting options you might
have missed. The ranking is transparent — fit and affordability only, with no hidden "sponsored" boosts.

### 3.5 Students-Like-You — where similar applicants landed
The feature people fall in love with: enter a profile and see **cohorts of similar past applicants** and the
**admit / deny / waitlist breakdown** per school, plus "what the admits had in common." This is built with
strict privacy:
- **k-anonymity:** a cohort is shown only when it contains **at least 5** distinct people — otherwise you see
  an honest "not enough similar students yet," never a thin or identifiable group.
- **Consent-gated:** only data from people who consented to outcome modeling is ever used.
- **Anonymized:** values are shown in bands/aggregates; no personal identifiers, ever.

### 3.6 Climb Roadmap — your plan to raise the odds
A prioritized list of the **highest-impact moves** you can make (e.g., "submit a stronger test score,"
"one more rigorous course"), **each with a real projected score change** — computed by actually re-running the
admit model on the "what if" version of your profile, not a guessed "+2%." It's honest about what it can and
can't model: it won't promise an odds bump for things the model can't see (like essays or recommendations).
Your plan updates as your profile changes, with a history of versions.

### 3.7 Application Command Center — run the whole application
A calm operations desk auto-generated from your school list:
- **Requirement checklists** per school, built from real program requirements (one task per required item).
- **Deadlines** per school and application system (Common App, Coalition, OUAC, direct, Quebec CEGEP) — shown
  only when they trace to a real source; otherwise marked "not loaded" rather than guessed.
- **Tasks** with status tracking and a progress dashboard.
- A private **document vault** (your files are visible only to you).

### 3.8 Narrative & Essay Studio — sharpen your writing, in your voice
Essay and activity-list feedback that is **school-specific** (grounded in that school's stated priorities) and
**pattern-aware** (informed by what worked for similar admits). Crucially:
- **No ghostwriting.** It gives feedback and targeted suggestions about *your own* text; it never writes or
  rewrites your essay for you, and there's no "AI-detection-evasion" feature. It preserves your voice.
- It also optimizes activity-list entries (the short Common App / AIF descriptions) and checks coherence
  across your applications.

### 3.9 Major & Career Compass — connect majors to futures
Explore how **majors map to careers and earnings**, get major-fit recommendations, and see each major
connected back to your **real admit odds**. (The **ROI / cost** side of this arrives with the Money module —
until then it's clearly marked as coming, never faked.)

### 3.10 Admira Copilot — one assistant across everything
A single conversational assistant that knows your profile and can use every module: ask it questions ("what
are my cheapest targets," "add this school to my list," "what should I do next"), and it answers and takes
actions on your behalf. Every number it shows comes from the actual modules — it is built so it **cannot make
up figures**.

### 3.11 Stunning Reports — a shareable plan
Assembles your whole plan — profile, list, odds, roadmap — into a **branded web report and PDF** you can
export and share via a secure link. The numbers in the report exactly match the rest of the app, and shared
reports are access-controlled so your data stays yours.

### 3.12 Money (coming) — true cost, merit, and ROI
The final module in development: **true net price** (what you'll actually pay), a **merit-scholarship
predictor** (including formulaic Canadian entrance scholarships and US automatic-merit tiers), and **ROI**
(predicted earnings vs. cost). It is being built last, and deliberately ships **no invented numbers** before
the real, sourced data is in place.

---

## 4. United States and Canada — how coverage works

- **United States:** admission stats, score/GPA ranges, test policies, selectivity, and outcomes from public
  federal/standardized sources.
- **Canada:** program-level admission-average bands, prerequisite course lists, entrance-scholarship
  thresholds, application systems (e.g., OUAC for Ontario), and **broad-based/holistic review** flags
  (e.g., UBC, Waterloo, McGill personal-profile/AIF). Admira understands the different grading systems —
  **4.0 GPA, percentage (e.g., Ontario top-6), and Quebec CEGEP R-score** — and compares like-for-like.

---

## 5. Privacy, safety, and honesty (how Admira protects you)

- **Your consent controls your data.** Outcome data is only used if you consent, and you can **export, revoke,
  or delete** it. Consent is enforced at the database level, not just in the app.
- **Crowd features are k-anonymous.** "Students-Like-You" never shows a group smaller than 5, so no one is
  identifiable.
- **No sensitive attributes, ever.** Admira does not collect or model race/ethnicity (or similar protected
  attributes) anywhere.
- **Your private data is isolated.** Your tasks, documents, essays, and shared reports are accessible only to
  you, enforced by database-level access rules. Shared report links use secure, unguessable tokens.
- **No PII in the machinery.** Personal identifiers don't appear in the matching/embeddings, logs, or
  analytics.
- **The AI doesn't invent numbers.** In the essay studio, the compass, and the copilot, the language model
  produces words, not figures — every number you see comes from the real data/model layer, with safeguards
  that block fabricated numbers.
- **No ghostwriting.** The essay tools coach you; they don't write your application for you.

---

## 6. What makes Admira different

- **US + Canada done properly**, including Canada's stats-driven, program-level admissions.
- **A real, traceable engine** instead of a black-box percentage.
- **An interactive "students like you" tool**, not a static marketing case library.
- **A plan that updates** as your profile changes, with projected impacts that tie to the model.
- **One coherent copilot** across every module, so it never feels like ten disconnected tools.
- **A premium, shareable report** as the artifact you actually want to send to family.

---

## 7. Honest limitations

- The current admit model is **grounded in public, school-level data**; it tells you where you stand relative
  to a school's published bands and how much uncertainty remains — it is **not** a claim that anyone can
  perfectly predict an individual decision from public data.
- It models what data can see; it intentionally **does not fabricate** the impact of essays, recommendations,
  or interviews.
- Canadian and merit datasets grow over time; where a figure isn't yet loaded, Admira **says so** instead of
  guessing.
- The **Money module is not finished yet.**

---

## 8. Glossary

- **Tier:** Reach / Target / Likely / Safety — your admission likelihood band for a school.
- **Score:** a 0–100 headline derived from the modeled probability.
- **Confidence:** how much certainty the underlying data supports (a texture, not a separate prediction).
- **k-anonymity:** a privacy rule that hides any group smaller than k people (here, k = 5).
- **Broad-based / holistic review:** admissions that weigh more than grades (essays, profiles), common at
  schools like UBC and Waterloo.
- **CEGEP R-score:** Quebec's college ranking metric used for university admission.
- **Net price:** what you'd actually pay after aid (vs. the "sticker" published cost) — part of the upcoming
  Money module.

---
---

# 第二部分 — 中文

## 1. 一句话介绍 Admira

Admira 是一个面向申请**美国和加拿大**大学的升学智能平台。它不是单一的"录取概率计算器"，而是贯穿整个申请旅程的
智能副驾：*我现在处于什么位置 → 我该如何提升 → 我的行动计划是什么 → 这是我可分享的完整报告。* 它为每所学校给出
一个醒目、自信的录取可能性分数，展示你的背景与已录取学生的对比，找到"和你相似的学生"以及他们的录取去向，为你
生成一份均衡的选校清单，制定提高录取率的行动计划，整理每一个截止日期与任务，帮你打磨文书，把专业与职业相连接，
并通过一个对话式助手和一份精美可导出的报告把这一切串联起来。

**适合人群：** 申请美国和加拿大大学的高中生（及其家庭/顾问），包括申请北美的国际学生。

**设计理念：** *惊艳的界面，扎实的引擎。* 每个页面都先给出一个清晰自信的结果，细节放在下方。但这个醒目数字的背后
是**真正准确**的：它可以追溯到真实数据或真实模型，可复现，并且在显而易见的情形下不会出错。

---

## 2. 核心理念：真实的引擎，而非黑箱

大多数"概率工具"只给你一个莫名其妙的百分比。Admira 在两点上不同：

1. **以真实数据为基础。** 美国数据来自官方来源（College Scorecard、IPEDS、Common Data Set 通用数据集）；
   加拿大数据来自专业录取平均分、先修课程要求和入学奖学金门槛。你看到的每个数字都能追溯到具名来源或真实模型
   输出——没有任何编造的数字。

2. **真正覆盖加拿大。** 几乎没有面向大众的工具能同时把美国*和*加拿大都做好。加拿大（尤其是安省）的录取高度依赖
   分数，因此 Admira 在那里的判断往往*更*精准。

---

## 3. 功能详解（Admira 能做的一切）

### 3.1 录取智能（Admit Intelligence）——你的核心录取分数
平台的核心。对每所学校你会得到：
- 一个醒目的 **0 到 100 的分数**。
- 一个**档位**：**冲刺（Reach）、匹配（Target）、稳妥（Likely）、保底（Safety）**。
- 结果背后的**主要影响因素**（哪些在帮你、哪些在拖累），来自生成该分数的同一模型——所以解释永远不会与分数矛盾。
- 一个微妙的**置信度**质感（数据支持的确定性程度）。

分数如何得出：
- **美国学校：** 一个统计模型（带保形不确定性的校准逻辑回归），基于公开的学校层面数据训练——你的学术位置相对于
  各校公布区间、考试政策、选择性等。
- **加拿大专业：** 一个透明的、基于规则的评分器，由各专业**公布的录取分数段**、你的**先修课匹配度**，以及该校
  是否采用**综合/全面评估**驱动。它在该专业**自身的评分体系**（百分制、4.0 GPA 或魁北克 CEGEP R-score）下
  比较你的均分与门槛——绝不在不同评分体系之间草率换算。

档位含义（大致）：冲刺 = 模型概率低于约 30%；匹配 = 约 30–55%；稳妥 = 约 55–80%；保底 = 约 80% 以上。
全平台使用同一套定义，因此一所学校的档位在它的页面、你的清单和你的报告中完全一致。

### 3.2 背景画像工作室（Profile Studio）——你 vs. 已录取学生
一张五维雷达图，展示你在**学术、课程难度、标化、课外影响力、契合度**上的强度，各为 0–100 分，并与该校的参考线
对照（由该校选择性、公布的中间 50% 区间和录取偏好推导）。它显示你的强项与需要努力之处。（部分维度，如课外活动，
是诚实的启发式估计，并会如实标注。）

### 3.3 学校与专业全景（School & Program Universe）——丰富精美的页面
为每所学校/专业提供一个综合页面，把一切集中呈现：录取数据、专业要求、费用（公布的净价与标价）、产出（毕业生
中位收入、完成率），以及通过语义匹配找到的"相似专业"。每个数字都标注来源。

### 3.4 智能选校（Smart List Builder）——一键生成均衡清单
根据你的背景与偏好（地点、规模、意向专业、预算、目标高度），Admira 生成一份**均衡清单**——默认约
**3 冲刺 / 4 匹配 / 3 保底**——让你不再面对十所全是冲刺的学校。每所学校都附有一句**理由**，由其真实的契合度、
档位和费用生成。它还会给出一行**"你可能忽略的学校"**：强、可负担、且真正契合的备选。排序完全透明——只看契合度
与可负担性，没有任何隐藏的"赞助"加权。

### 3.5 和你相似的学生（Students-Like-You）——相似申请者的去向
最受喜爱的功能：输入一个背景，查看**相似往届申请者的群体**，以及每所学校的**录取/拒绝/候补分布**，外加"被录取者
的共同点"。它在严格的隐私保护下构建：
- **k-匿名：** 只有当群体包含**至少 5 人**时才会展示——否则你会看到诚实的"相似学生还不够"，绝不展示稀薄或
  可识别的群体。
- **基于同意：** 只使用同意进行结果建模的人的数据。
- **匿名化：** 数值以区间/汇总形式展示；绝不包含任何个人标识。

### 3.6 进阶路线图（Climb Roadmap）——提高录取率的计划
一份按优先级排列的**最具影响力行动**清单（例如"提交更高的标化分数""再修一门高难度课程"），**每一项都附带真实的
预计分数变化**——通过在你背景的"假设"版本上实际重新运行录取模型计算得出，而非凭空的"+2%"。它对自己能建模什么
保持诚实：对模型看不到的因素（如文书或推荐信）不会承诺概率提升。计划会随你背景的变化而更新，并保留版本历史。

### 3.7 申请指挥中心（Application Command Center）——管理整个申请
一个由你的选校清单自动生成的、井然有序的操作台：
- 每所学校的**要求清单**，由真实专业要求生成（每个必需项对应一个任务）。
- 按学校与申请系统（Common App、Coalition、OUAC、直接申请、魁北克 CEGEP）列出的**截止日期**——仅在能追溯到
  真实来源时显示，否则标注"未加载"，绝不猜测。
- 带状态追踪的**任务**与进度面板。
- 一个私密的**文件保险库**（你的文件只有你能看到）。

### 3.8 文书工作室（Narrative & Essay Studio）——用你自己的声音打磨写作
针对文书和活动列表的反馈，既**针对具体学校**（基于该校的录取偏好），又**了解成功模式**（参考相似录取者的有效做法）。
关键在于：
- **不代写。** 它针对*你自己的*文字给出反馈和有针对性的建议；绝不替你写或重写文书，也没有任何"规避 AI 检测"的功能。
  它保留你的声音。
- 它还会优化活动列表条目（Common App / AIF 的简短描述），并检查你各份申请之间的连贯性。

### 3.9 专业与职业罗盘（Major & Career Compass）——把专业与未来相连
探索**专业如何对应职业与收入**，获得专业契合度推荐，并看到每个专业与你**真实录取概率**的关联。（其中**投资回报
（ROI）/ 成本**部分将随 Money 模块推出——在那之前会明确标注"即将推出"，绝不伪造。）

### 3.10 Admira 副驾（Copilot）——贯穿一切的助手
一个了解你背景、能调用每一个模块的对话式助手：向它提问（"我最便宜的匹配校有哪些""把这所学校加入我的清单""我接下来
该做什么"），它会回答并代你执行操作。它展示的每个数字都来自真实模块——其设计使它**无法编造数字**。

### 3.11 精美报告（Stunning Reports）——可分享的完整方案
把你的整个方案——画像、清单、概率、路线图——整合成一份**带品牌的网页报告与 PDF**，可导出并通过安全链接分享。
报告中的数字与应用其余部分完全一致，且分享的报告有访问控制，确保你的数据归你所有。

### 3.12 Money（即将推出）——真实费用、奖学金与回报
仍在开发中的最后一个模块：**真实净价**（你实际要付多少）、**奖学金预测器**（包括公式化的加拿大入学奖学金与
美国自动奖学金档位），以及**投资回报（ROI）**（预计收入 vs. 成本）。它被安排在最后构建，并刻意在真实、有来源的
数据就位之前**不输出任何编造的数字**。

---

## 4. 美国与加拿大——覆盖方式

- **美国：** 录取数据、分数/GPA 区间、考试政策、选择性与产出，来自公开的联邦/标化来源。
- **加拿大：** 专业层面的录取平均分段、先修课程清单、入学奖学金门槛、申请系统（如安省的 OUAC），以及
  **综合/全面评估**标记（如 UBC、Waterloo、McGill 的个人档案/AIF）。Admira 理解不同的评分体系——
  **4.0 GPA、百分制（如安省 top-6）与魁北克 CEGEP R-score**——并进行同类对比。

---

## 5. 隐私、安全与诚实（Admira 如何保护你）

- **你的同意决定你的数据。** 结果数据只有在你同意后才会被使用，你可以**导出、撤回或删除**。同意在数据库层面强制
  执行，而不仅是应用层面。
- **群体功能符合 k-匿名。** "和你相似的学生"绝不展示少于 5 人的群体，因此无人可被识别。
- **绝不涉及敏感属性。** Admira 在任何地方都不收集或建模种族/族裔（或类似受保护属性）。
- **你的私密数据相互隔离。** 你的任务、文件、文书和分享的报告只有你能访问，由数据库层面的访问规则强制执行；
  分享报告的链接使用安全、不可猜测的令牌。
- **机器内部不含个人身份信息。** 个人标识不会出现在匹配/向量、日志或分析中。
- **AI 不编造数字。** 在文书工作室、罗盘和副驾中，语言模型只产出文字、不产出数字——你看到的每个数字都来自真实的
  数据/模型层，并有机制拦截伪造数字。
- **不代写。** 文书工具是辅导你，而不是替你写申请。

---

## 6. Admira 的差异化优势

- **真正做好美国 + 加拿大**，包括加拿大以分数驱动、按专业划分的录取。
- **真实、可追溯的引擎**，而非黑箱百分比。
- **可交互的"和你相似的学生"工具**，而非静态的营销案例库。
- **会随你背景更新的计划**，且预计影响与模型挂钩。
- **贯穿所有模块的统一副驾**，不会让人觉得是十个互不相干的工具。
- **高端、可分享的报告**，是你真正愿意发给家人的成果。

---

## 7. 诚实的局限

- 当前录取模型**基于公开的学校层面数据**；它告诉你相对于学校公布区间的位置以及剩余的不确定性——它**并不**声称
  任何人能仅凭公开数据完美预测某个个体的录取决定。
- 它只建模数据能看到的部分；它有意**不伪造**文书、推荐信或面试的影响。
- 加拿大与奖学金数据集会随时间增长；当某个数字尚未加载时，Admira 会**如实说明**而不是猜测。
- **Money 模块尚未完成。**

---

## 8. 术语表

- **档位（Tier）：** 冲刺 / 匹配 / 稳妥 / 保底——你对某校的录取可能性区间。
- **分数（Score）：** 由模型概率得出的 0–100 醒目数字。
- **置信度（Confidence）：** 底层数据支持的确定性程度（一种质感，而非单独的预测）。
- **k-匿名：** 一种隐私规则，隐藏任何少于 k 人的群体（此处 k = 5）。
- **综合/全面评估：** 不只看成绩（还看文书、个人档案）的录取方式，常见于 UBC、Waterloo 等校。
- **CEGEP R-score：** 魁北克用于大学录取的学院排名指标。
- **净价（Net price）：** 在资助之后你实际要付的费用（相对于公布的"标价"）——属于即将推出的 Money 模块。

---

*This guide reflects Admira's built features across its US + Canada platform. The Money module (net price,
merit, ROI) is the remaining piece in development. / 本指南反映 Admira 在美加平台上已构建的功能。Money 模块
（净价、奖学金、回报）是仍在开发中的最后一部分。*
