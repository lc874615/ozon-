# 竞品官方报表离线导入工具

只处理用户通过Ozon正常功能下载的竞品报表。不联网、不读取Cookie、不调用店铺接口，不创建、发布、修改或删除商品。

## 单商品流程

1. 在官方商品分析栏目选择28天，搜索一个目标SKU，使用页面提供的正常报表下载功能。账号栏目和字段可用性以真实界面为准。
2. 将原始XLSX或UTF-8 CSV交给本工具；只读取指定SKU，未知列名不猜测。
3. 核验FBS、明确无品牌、近28天售出数量>5。品牌空值不等于无品牌；订购件数与售出件数分别标记。重复SKU或未知周期进入待核实。

```bash
pip install -r requirements.txt
python -m unittest discover -s tests -q
python -m ozon_operator report.xlsx --sku 123 --output review.json
```

只有人工确认官方页面选择了28天，而报表列标题没有周期时，才加 `--confirmed-period-days 28`。123是示例SKU，需替换成实际目标。

## 包装资料边界

只解析报表实际存在、明确写明包装语义与单位的三边和毛重。不把商品尺寸、净重、体积推算或其他SKU参数当作包装数据。没有字段就记录缺失；目前没有核实到查询任意竞品完整包装参数的公开官方API。真实官方报表尚待验证，测试用例不代表实测成功。

若缺失，可继续核对竞品公开的对应SKU包装说明或正常取得的商家资料，不创建商品取数，也不借用自有店铺/货源参数冒充竞品。人民币核算；平台其他币种规则的换算应另留来源和日期。

## 本机插件0.4.0

浏览器目录中的插件仅保留本机历史资料导出，权限只有storage/downloads，无网站访问、Cookie、脚本注入或自动采集能力。覆盖安装到原插件目录后，重新加载并关闭旧Ozon标签页，以免保留旧页面脚本。不卸载或清除插件数据。当前代码变化不会自动更新其他电脑。

## 官方来源

- [官方商品分析与Excel导出说明](https://seller.ozon.ru/media/beginners/chto-prodavat-na-ozon-besplatnyj-instrument-analitiki-i-poiska-postavshikov/)
- [官方28天/7天统计说明](https://seller.ozon.ru/media/news/populyarnye-tovary-stali-udobnee/)

支持的是平台正常导出流程，本工具为自写离线解析器，不代表平台认证。
