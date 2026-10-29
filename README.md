# Ozon项目当前备份入口

当前扩展版本：**0.5.6（试运行）**。先读 [START_HERE.md](START_HERE.md)、[最新交接](official-competitor/HANDOFF.md) 和 [最新使用说明](official-competitor/INTEGRATED_CAPTURE.md)。旧backup-20261029目录和旧安装脚本仅作历史参考。

当前只验证竞品采集，采集结束即停止，不发布商品。正常卖家流程：SKU搜索→添加→读取详细参数→返回→退出且不保存。已采SKU分阶段去重，销量/日期按用户指定插件相同正常卖家分析请求取字段；无权限不绕过。模拟测试通过，真实账号新流程仍待验证。

公开目录official-competitor包含当前可检查的源码、测试与交接。**完整工作区和已取得原始附件另有AES-256-GCM加密备份**，见 [backups/CURRENT.json](backups/CURRENT.json) 和 [恢复说明](backups/README.md)。恢复密钥单独交给用户，不在仓库。

仓库保存的是当前可取得文件及整理后的会话决策/状态，不是平台完整逐字聊天导出。电脑浏览器未导出的本地存储、运行环境密钥和浏览器登录资料不在备份中。
