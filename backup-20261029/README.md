# Ozon 经营自动化原型与会话交接

中国货源经 OGL 嘉兴仓发货，按实际交易收入核算最低25%利润。项目仍在验证采集与核算，不是已完成的全自动经营系统。

**新会话先读 [HANDOFF.md](HANDOFF.md)，再读 [START_NEW_CHAT.txt](START_NEW_CHAT.txt)。** 经营规则见 `config/operating-policy.json`。

## 当前进度

- 云端 Python 核算、SKU匹配规则、Ozon买家导入和来源追溯；66项测试通过。
- 自有浏览器扩展支持商品采集、批量队列、遇验证暂停和JSON导出。
- 卖家网页只读查询能建立买家SKU与变体的精确对应，需要本地浏览器已登录后台。
- 一次明确授权的历史详情测试取得与第三方插件相同的尺寸重量，但触发保存的创建状态。**当前0.3.7不再调用该创建接口**，仅查询并复用本地缓存。
- 后台内部接口的包装语义和单位仍需独立核实，不能把字段同名当作证明。
- 下一步为5个同类商品批量采集覆盖率验证，包装缺失仍应标待核实，不自动创建记录补齐。

## 本地运行

```bash
python -m unittest discover -s tests -q
python -m ozon_operator import-buyer observations.json --output candidates.json
python -m ozon_operator import-html page.html --output observations.json
python -m ozon_operator rank-sources offers.json --output ranked.json
python -m ozon_operator validate candidates.json --output review.json
```

部分采集/图片功能需要 Pillow 或浏览器依赖；Playwright模拟检查另外需要Playwright和兼容Chromium。浏览器模拟测试不等于真实站点验证。安装扩展前先备份用户已有目录，不能认为仓库与用户逐轮打补丁后的电脑文件完全一致。

## 规则摘要

固定成本含采购、1688运费、OGL运费、每包裹贴单1元。
目标实际交易收入=固定成本/(1-25%-佣金率-2%末端预留-1.2%提现-3%汇率缓冲)。
广告及货损预留按用户要求为0。无已核实佣金或运费时不得当作0。
上架标价=目标实际交易价×2，按五折促销计划准备；佣金档位、物流、利润按目标实际交易价核算，活动资格另外核实。
具体一件起批、材质/结构/标签匹配、2%商品尺寸容差、包装体积及毛重取大规则见配置。

## 边界与资料

公开仓库不包含凭证、Cookie、浏览器存储、原始经营导出、店铺私有API快照或第三方插件源码。环境变量只使用名称 `OZON_CLIENT_ID`、`OZON_API_KEY`；新会话须重新检查是否配置，不能打印值。
`legacy/`和`seller-approved-detail.js`保留历史实现用于回归与交接，不是当前应执行的创建流程；manifest只加载只读`seller-runtime.js`。
尚未完成稳定的全云买家采集、自动图像/材质核验、全类目最新费率确认、图片生成或自动发布。此前没有已确认可发布的完整选品。

## 下载与继续

GitHub页面可选择 **Code → Download ZIP** 下载本仓库；新会话提供仓库链接并要求先读HANDOFF.md。浏览器登录态、插件本地执行标记与云端任务不会通过仓库迁移。

## 0.3.7筛选与币种更新

筛选竞品FBS、明确无品牌、滚动近30天销量>5。月度查询口径未核实或接口权限不足时为待核实，不拿评论数代销量。增加只读分析接口采集，但用户账号实际权限尚待测试。价格组件可保留CNY与RUB及近似折算说明；不能用CNY显示价直接作RUB参考价。包装详情创建请求继续禁用。
