# voxel-dda-lab

**一句话承诺**：3D 体素射线遍历做对——在本仓库的 48³ 网格、10,000 条射线语料（9,000 随机 + 1,000 整数格点角点并列）上，**全部 10,000 条**与暴力 oracle 逐格对照，共 **146,593 个真实相交体素**：supercover 遍历 **漏检 0、误报 0**；经典 Amanatides–Woo 单轴并列选边漏 **6,782 个（4.63%）**，固定步长 0.1 采样漏 **16,299 个（11.12%）**；且 supercover 每条射线 **4.19 µs**，只有 oracle 的 **1/2.78**（11.66 µs，见 `bench/result.json`）。

Upstream: none

> 本项目为原创工具，不含上游代码。所对照的经典遍历思路来自 Amanatides & Woo (1987) 的论文，不是仓库上游。

## 本轮创新

**B 档（新意）**：把「射线到底碰到了哪些体素」从算法实现变成一个**可被暴力 oracle 逐格裁决**的对象，并给出经典实现在**角点/棱并列**下的漏检计数与 witness。
和已有体素项目（`voxel-seal-lab` 做网格→体素化的保守覆盖）不同：这里判定的是**遍历算法本身的完备性**，输入是线段而不是网格；和教科书 AW 实现不同：并列时不选一根轴，而是**同时推进所有并列轴并发出共享该角点的 2^k−1 个格子**。
以前做不到的地方在于：角点并列是零测度事件，随机射线几乎测不到，所以「AW 漏体素」只停留在口头警告；本仓库用**整数格点射线语料**（1,000 条，起点在体素中心、方向为整数向量，端点仍落在体素中心）把这一维变成可复现的数字，并且页面与 node 跑的是同一个 `src/core.mjs`。

## 怎么跑（三条命令）

```bash
node tools/gen-sample.mjs        # 生成 data/rays.json + data/reference.json（确定性，固定种子）
node bench/verify.mjs            # 14 条断言，全部打印实测数字，失败则退出码 1
node bench/bench.mjs             # 1 次冷启动 + 1 次预热 + 7 次采样，写 bench/result.json
node baseline/classic-aw.mjs     # 对照基线 1：教科书 AW 单轴并列 → missed=6782 (4.63%)
node baseline/fixed-step.mjs 0.1 # 对照基线 2：固定步长采样 → missed=16299 (11.12%)
```

浏览器（可选，仅渲染与交互）：`python3 -m http.server 4173`，然后打开 `http://localhost:4173`（importmap 引 three@0.169.0 固定版本，无打包器、无 `node_modules`）。

## 证据（全部来自上面的命令，逐条可复跑）

`node bench/verify.mjs` → **14 passed / 0 failed**，关键行：

| 断言 | 实测 |
| --- | --- |
| 角点 witness（(0.5,0.5,0.5)→(3.5,3.5,3.5)） | oracle=**22**、supercover=**22**、经典 AW=**10**、0.5 采样=**4** |
| **全部 10,000 条射线** vs slab oracle（146,593 个 oracle 体素） | supercover 漏检 **0**、误报 **0** |
| 同上，经典 AW 单轴并列 | 漏检 **6,782 / 146,593 = 4.63%**（随机射线 0，全部来自整数格点语料） |
| 同上，固定步长 0.1 采样 | 漏检 **16,299 = 11.12%**（步长 0.5 时漏 34,959 = 23.85%） |
| 独立 oracle（Liang–Barsky 裁剪，自带容差 1e-9·bboxDiag） | **全部 10,000 条**射线 **0 集合差** |
| 尺度不变性 1e-9 / 1e-6 / 1e-3 / 1 / 1e3 / 1e6 / 1e9 | 7 个尺度上格子集合 **完全一致**，漏检/误报均 0 |
| 越界格子 | **0** |
| 连通性 | 经典链 face=132,485 / diag=**0**；supercover 主链 face=123,901 / diag=**3,798**（全部是角点块） |

`node bench/bench.mjs`（10,000 条射线，1 冷启 + 1 预热 + 7 采样，中位数，`bench/result.json`）：

| 操作 | 冷启动 | 中位 | p95 | relSD |
| --- | --- | --- | --- | --- |
| supercover 10k 条 | 75.97 ms | **41.94 ms** | 42.37 | 0.8% |
| 经典 AW 10k 条 | 65.27 ms | 38.36 ms | 38.52 | 0.3% |
| 0.5 步长采样 10k 条 | 36.77 ms | 30.60 ms | 31.14 | 0.6% |
| 0.1 步长采样 10k 条 | 96.38 ms | 95.74 ms | 96.69 | 0.4% |
| oracle 250 条 | 9.05 ms | 2.89 ms | 2.97 | 2.0% |
| oracle 认证全部 10k 条 | 156.12 ms | 116.64 ms | 127.49 | 3.9% |

派生：supercover **4.19 µs/射线**，oracle **11.66 µs/射线**（全部 10k 条实测）= **2.78× 便宜**。冷启动是热态的 ~1.75×（JIT 编译），已在表中单列。

## 已知限制（不掩盖）

1. **容差是相对量**：`src/core.mjs` 的 `TOUCH_EPS = 1e-12` 乘以坐标幅值（体素单位下 ~48），并列判据用 t 空间的 1e-9 相对量。有效尺度实测 **1e-9 … 1e9**；超出该范围、或格子尺寸小到与浮点 ulp 同量级时，判定可能失真。独立 oracle 用的是**另一条**容差公式（1e-9·bboxDiag），两者在全部 10,000 条射线上一致，但这不构成对任意输入的一致性证明。
2. **oracle 是脚本里的暴力实现，不是外部库**：`oracleTraversal` 逐格做闭区间 slab 测试，复杂度 O(bbox 体积)，全量认证 10,000 条要 116.64 ms（中位，见 `bench/result.json`）；本仓库认证的是**自己的 oracle**，独立 oracle 只在“两套实现是否一致”这一维上提供交叉证据。
3. **supercover 定义含「只碰到角」的格子**：一个只在一瞬间接触角点的格子会被计入。若下游要的是「体素内部的线段长度 > 0」，需要把闭区间换成开区间，数值会变小；本仓库给出的是闭集语义。
4. **只处理轴对齐均匀网格**，不支持稀疏/多层网格、非均匀体素或世界变换；射线必须在网格内起始。
5. **经典 AW 漏检率依赖语料**：4.63% 是「10% 整数格点射线」语料的混合结果；纯随机射线上经典 AW 漏检为 **0**（角点并列是零测度）。这不是「经典实现有 5% 的 bug」，而是「只要出现并列，经典选边就漏格」。
6. **无头浏览器不可用**：没有 WebGL 截图。页面证据是 HTTP 200 + importmap 命中 + `main.js` 用与 node 相同的 core 重新遍历 48 条 viewer 射线（`bench/verify.mjs` 的 A12 断言 node 侧重算结果与 `data/rays.json` 中存储的格子逐一相同）。
7. 上游 PR：**0 个**。这是原创工具，没有「本该回投给上游的真修复」；按契约允许 0，未写 `state/upstream-pr.json`。

## 目录

- `src/core.mjs` —— 纯 ES module：oracle、supercover/经典遍历、采样基线、比较与连通性统计；不 import three、不碰 DOM
- `tools/gen-sample.mjs` —— 确定性语料生成（固定种子 20261117）
- `bench/verify.mjs` —— 14 条断言；`bench/bench.mjs` —— 计时；`bench/oracle-independent.mjs` —— 独立 oracle（Liang–Barsky，自带容差）
- `baseline/classic-aw.mjs`、`baseline/fixed-step.mjs` —— 上面两个对照基线，独立可跑
- `index.html` / `main.js` —— three@0.169.0 固定 importmap 的渲染层，只消费 core 的输出

MIT © 2026 llinok111
