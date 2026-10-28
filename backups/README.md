# 完整加密备份

CURRENT.json指向当前备份、265个文件、43份当前已取得附件、分片哈希与总密文SHA-256。分片是连续密文，必须按清单顺序拼接；不是可单独解压的ZIP。

范围：完整项目源码（含历史模块）、当前发布源码与检查、规则配置、已取得原始上传附件、任务调查代码与参考资料。排除环境变量密钥、.env、浏览器用户目录/登录状态、运行时缓存。原始逐字会话无法由本工具导出，关键决策、授权变化、已完成/待验证状态写在HANDOFF中。尚未下载或未由用户导出的外部文件不在本备份。

恢复（需Python与cryptography）：

```
python -m pip install cryptography
python official-competitor/backup-tools/join_restore.py --manifest backups/CURRENT.json --key-file /private/recovery-key.txt --output restored-project
```

恢复密钥为单独提供的64位十六进制字符串，保存到本地key文件；不要提交到仓库。输出目录必须尚不存在。恢复时先验证各分片和总密文SHA-256，再验证AES-GCM认证，最后逐文件比对清单SHA-256。篡改或不完整备份不会作为成功恢复。

恢复后：projects/operator-full为完整主工程，projects/official-release为发布工程，records/attachments保留同名附件的独立目录，references为费用与接口参考资料。历史目录中的文件名/注释不代表当前规则；先读当前公开HANDOFF。
